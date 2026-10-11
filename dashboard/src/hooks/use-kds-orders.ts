'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { soundAlerts } from '@/lib/audio/sound-alerts';
import { advanceOrderStatus, recallOrderStatus } from '@/app/(dashboard)/kds/actions';
import { type Order, type OrderItem, type OrderStatus } from '@/types/database';

export interface KDSOrderItem {
  id: string;
  qty: number;
  name: string;
  mod?: string;
  done: boolean;
}

export interface KDSOrder {
  id: string;
  restaurant_id: string;
  conversation_id?: string | null;
  name: string;
  phone: string;
  channel: 'Domicilio' | 'Mesa' | 'Llevar';
  channelBadge: string;
  address: string;
  elapsedSeconds: number;
  paid: boolean;
  total: string;
  rawTotal: number;
  status: OrderStatus;
  stage: 'new' | 'prep' | 'ready';
  notes?: string;
  items: KDSOrderItem[];
  created_at: string;
  updated_at: string;
}

export type KDSChannelFilter = 'all' | 'Domicilio' | 'Mesa' | 'Llevar';

export interface UseKDSOrdersOptions {
  restaurantId: string | null | undefined;
  initialOrders?: KDSOrder[];
  autoPlaySound?: boolean;
}

export interface UseKDSOrdersReturn {
  orders: KDSOrder[];
  filteredOrders: KDSOrder[];
  recallStack: KDSOrder[];
  loading: boolean;
  error: string | null;
  channelFilter: KDSChannelFilter;
  setChannelFilter: (filter: KDSChannelFilter) => void;
  bumpOrder: (orderId: string) => Promise<{ success: boolean; error?: string; conflict?: boolean }>;
  recallLastOrder: () => Promise<{ success: boolean; error?: string }>;
  toggleItemDone: (orderId: string, itemIdx: number) => void;
  refresh: () => Promise<void>;
}

// 3 Horas en milisegundos para auto-archivado de órdenes despachadas
const DELIVERED_RETENTION_MS = 3 * 60 * 60 * 1000;
// Intervalo de sondeo en segundo plano (45s) ante intermitencias de Wi-Fi de cocina
const POLLING_INTERVAL_MS = 45 * 1000;
// Límite de espera para acciones de comanda en el cliente antes de rollback
const CLIENT_ACTION_TIMEOUT_MS = 10 * 1000;

async function raceTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutErrorMsg: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutErrorMsg));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Infiere el canal operativo de comanda a partir de la dirección de entrega.
 */
export function inferOrderChannel(deliveryAddress: string | null | undefined): {
  channel: 'Domicilio' | 'Mesa' | 'Llevar';
  channelBadge: string;
} {
  if (!deliveryAddress) {
    return { channel: 'Llevar', channelBadge: 'Para Llevar' };
  }
  const lower = deliveryAddress.toLowerCase().trim();
  if (lower.startsWith('mesa') || lower.includes('comedor') || lower.includes('terraza')) {
    const match = deliveryAddress.match(/mesa\s*(\w+)/i);
    const badge = match ? `Mesa ${match[1]}` : 'Mesa';
    return { channel: 'Mesa', channelBadge: badge };
  }
  if (lower.includes('llevar') || lower.includes('mostrador') || lower.includes('recoger')) {
    return { channel: 'Llevar', channelBadge: 'Para Llevar' };
  }
  return { channel: 'Domicilio', channelBadge: 'Domicilio' };
}

/**
 * Transforma un registro de orden de base de datos a formato KDSOrder.
 */
function mapDBOrderToKDSOrder(
  dbOrder: any,
  existingItemsDoneState?: Map<string, boolean>
): KDSOrder {
  const { channel, channelBadge } = inferOrderChannel(dbOrder.delivery_address);

  const rawItems = (dbOrder.order_items as any[]) || [];
  const items: KDSOrderItem[] = rawItems.map((item, idx) => {
    let mod = '';
    if (item.options_selected) {
      if (Array.isArray(item.options_selected)) {
        mod = item.options_selected
          .map((opt: any) => {
            if (!opt) return '';
            if (typeof opt === 'string') return opt;
            return (
              opt.choice_label ||
              opt.label ||
              opt.name ||
              opt.notes ||
              opt.special_instructions ||
              ''
            );
          })
          .filter(Boolean)
          .join(', ');
      } else if (typeof item.options_selected === 'object') {
        mod = Object.values(item.options_selected)
          .map((val: any) => {
            if (!val) return '';
            if (typeof val === 'string') return val;
            if (typeof val === 'object') {
              return (
                val.choice_label ||
                val.label ||
                val.name ||
                val.notes ||
                val.special_instructions ||
                ''
              );
            }
            return String(val);
          })
          .filter(Boolean)
          .join(', ');
      } else if (typeof item.options_selected === 'string') {
        mod = item.options_selected;
      }
    }

    const itemNotes = item.notes || item.special_instructions || item.instructions;
    if (itemNotes) {
      mod = mod ? `${mod} • ${itemNotes}` : String(itemNotes);
    }

    const rawItemId = item.id !== undefined && item.id !== null ? String(item.id) : `${dbOrder.id}-${idx}`;
    const itemKey = rawItemId.startsWith(`${dbOrder.id}-`) ? rawItemId : `${dbOrder.id}-${rawItemId}`;
    const done = existingItemsDoneState ? existingItemsDoneState.get(itemKey) ?? false : false;

    return {
      id: rawItemId,
      qty: item.quantity || 1,
      name: item.menu_items?.name || item.name || 'Producto',
      mod: mod || undefined,
      done,
    };
  });

  const createdDate = new Date(dbOrder.created_at);
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - (isNaN(createdDate.getTime()) ? Date.now() : createdDate.getTime())) / 1000)
  );

  const stage =
    dbOrder.status === 'confirmed' ? 'new' : dbOrder.status === 'preparing' ? 'prep' : 'ready';

  const isPaid =
    dbOrder.payment_method !== null &&
    dbOrder.payment_method !== 'pending' &&
    dbOrder.payment_method !== 'cash';

  const customerName = dbOrder.customers?.name || 'Cliente WhatsApp';
  const customerPhone = dbOrder.customers?.phone || '';
  const customerNotes =
    dbOrder.notes ||
    dbOrder.special_instructions ||
    dbOrder.customers?.notes_md ||
    undefined;

  return {
    id: dbOrder.id,
    restaurant_id: dbOrder.restaurant_id,
    conversation_id: dbOrder.conversation_id || null,
    name: customerName,
    phone: customerPhone,
    channel,
    channelBadge,
    address: dbOrder.delivery_address || 'Pasa a mostrador',
    elapsedSeconds,
    paid: isPaid,
    total: `$${Number(dbOrder.total || 0).toFixed(0)}`,
    rawTotal: Number(dbOrder.total || 0),
    status: dbOrder.status as OrderStatus,
    stage,
    notes: customerNotes,
    items,
    created_at: dbOrder.created_at,
    updated_at: dbOrder.updated_at,
  };
}

/**
 * Hook reactivo de gestión de órdenes de Cocina (KDS) en tiempo real.
 * Suscrito a Supabase Realtime con aislamiento estricto multi-tenant y resiliencia híbrida.
 */
export function useKDSOrders({
  restaurantId,
  initialOrders = [],
  autoPlaySound = true,
}: UseKDSOrdersOptions): UseKDSOrdersReturn {
  const [orders, setOrders] = useState<KDSOrder[]>(initialOrders);
  const [recallStack, setRecallStack] = useState<KDSOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(!initialOrders.length);
  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<KDSChannelFilter>('all');

  // Referencias para evitar estados obsoletos en callbacks asíncronos y Realtime
  const ordersRef = useRef<KDSOrder[]>(orders);
  ordersRef.current = orders;

  const recallStackRef = useRef<KDSOrder[]>(recallStack);
  recallStackRef.current = recallStack;

  const itemsDoneMapRef = useRef<Map<string, boolean>>(new Map());
  const alertedOrderIdsRef = useRef<Set<string>>(new Set());
  const initialLoadCompletedRef = useRef<boolean>(false);
  const requestCounterRef = useRef<number>(0);
  const inFlightBumpsRef = useRef<Set<string>>(new Set());
  const inFlightRecallRef = useRef<boolean>(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevRestaurantIdRef = useRef<string | null | undefined>(restaurantId);

  // 1. Cronómetro en vivo libre de deriva: sincroniza según created_at
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setOrders((prev) =>
        prev.map((o) => {
          const createdTime = new Date(o.created_at).getTime();
          const elapsed = isNaN(createdTime)
            ? o.elapsedSeconds + 1
            : Math.max(0, Math.floor((now - createdTime) / 1000));
          return {
            ...o,
            elapsedSeconds: elapsed,
          };
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Limpieza de estado al cambiar de restaurante en sesión multi-tenant
  useEffect(() => {
    if (prevRestaurantIdRef.current !== undefined && prevRestaurantIdRef.current !== restaurantId) {
      setOrders([]);
      ordersRef.current = [];
      initialLoadCompletedRef.current = false;
      alertedOrderIdsRef.current.clear();
      itemsDoneMapRef.current.clear();
      inFlightBumpsRef.current.clear();
      inFlightRecallRef.current = false;
      setRecallStack([]);
      recallStackRef.current = [];
      setError(null);
    }
    prevRestaurantIdRef.current = restaurantId;
  }, [restaurantId]);

  // Limpieza de temporizador anti-rebote al desmontar el componente
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // 2. Fetch principal con soporte de auto-archivado (> 3h) y filtrado de borradores (draft)
  const fetchOrders = useCallback(
    async (isBackgroundSync = false) => {
      if (!restaurantId) {
        setOrders([]);
        setLoading(false);
        return;
      }

      const requestId = ++requestCounterRef.current;
      if (!isBackgroundSync) {
        setLoading(true);
      }

      try {
        const supabase = createClient();

        // Consultamos órdenes activas y entregadas recientemente para la pila de recall
        const { data, error: fetchErr } = await supabase
          .from('orders')
          .select(`
            id,
            restaurant_id,
            customer_id,
            conversation_id,
            status,
            subtotal,
            delivery_fee,
            discount,
            total,
            delivery_address,
            payment_method,
            created_at,
            updated_at,
            customers (
              id,
              name,
              phone,
              notes_md
            ),
            order_items (
              id,
              order_id,
              product_id,
              quantity,
              unit_price,
              options_selected,
              subtotal,
              menu_items (
                name
              )
            )
          `)
          .eq('restaurant_id', restaurantId)
          .in('status', ['confirmed', 'preparing', 'ready', 'delivered'])
          .order('created_at', { ascending: true });

        if (fetchErr) {
          throw new Error(fetchErr.message);
        }

        if (requestId !== requestCounterRef.current) return;

        const now = Date.now();
        const activeList: KDSOrder[] = [];
        const deliveredRecent: KDSOrder[] = [];

        ((data as any[]) || []).forEach((row) => {
          // Descarte estricto multi-tenant
          if (row.restaurant_id !== restaurantId) return;
          // Descarte absoluto de órdenes en borrador
          if (row.status === 'draft') return;

          const kdsOrder = mapDBOrderToKDSOrder(row, itemsDoneMapRef.current);

          if (row.status === 'delivered') {
            // Auto-archivado: descartar entregados de más de 3 horas
            const deliveredTime = new Date(row.updated_at).getTime();
            if (!isNaN(deliveredTime) && now - deliveredTime <= DELIVERED_RETENTION_MS) {
              deliveredRecent.push(kdsOrder);
            }
          } else {
            activeList.push(kdsOrder);
          }
        });

        // Ordenar entregados recientes en orden LIFO (más recientemente despachada primero)
        deliveredRecent.sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );

        // Si ya pasó la carga inicial, detectar si llegaron nuevas órdenes confirmed
        // que no hayan sido alertadas previamente (recuperación de cortes temporales de Wi-Fi)
        if (initialLoadCompletedRef.current) {
          activeList.forEach((order) => {
            if (order.status === 'confirmed' && !alertedOrderIdsRef.current.has(order.id)) {
              alertedOrderIdsRef.current.add(order.id);
              if (autoPlaySound) {
                soundAlerts.playNewOrderSound();
              }
            }
          });
        } else {
          // Poblado inicial de IDs para no disparar alertas masivas al abrir la pantalla
          activeList.forEach((o) => alertedOrderIdsRef.current.add(o.id));
          initialLoadCompletedRef.current = true;
        }

        setOrders(activeList);

        // Actualizar pila de recall: orden LIFO estricto y depuración de órdenes > 3h
        setRecallStack((prev) => {
          const activeIds = new Set(activeList.map((a) => a.id));
          const orderMap = new Map<string, KDSOrder>();

          // 1. Nuevas órdenes entregadas desde DB (ordenadas desc)
          deliveredRecent.forEach((d) => {
            if (!activeIds.has(d.id)) {
              orderMap.set(d.id, d);
            }
          });

          // 2. Órdenes existentes en la pila si siguen dentro de la ventana de 3 horas
          prev.forEach((p) => {
            if (!activeIds.has(p.id) && !orderMap.has(p.id)) {
              const pTime = new Date(p.updated_at).getTime();
              if (
                p.status === 'delivered' &&
                !isNaN(pTime) &&
                now - pTime <= DELIVERED_RETENTION_MS
              ) {
                orderMap.set(p.id, p);
              }
            }
          });

          const combined = Array.from(orderMap.values());
          combined.sort(
            (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          );
          return combined;
        });

        setError(null);
      } catch (err: unknown) {
        if (requestId === requestCounterRef.current) {
          const msg = err instanceof Error ? err.message : 'Error al cargar comandas de cocina';
          console.error('[useKDSOrders] fetchOrders error:', err);
          setError(msg);
        }
      } finally {
        if (requestId === requestCounterRef.current && !isBackgroundSync) {
          setLoading(false);
        }
      }
    },
    [restaurantId, autoPlaySound]
  );

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  // Sincronización en segundo plano con coalescencia anti-rebote (debounce 100ms)
  const triggerBackgroundSync = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      void fetchOrders(true);
    }, 100);
  }, [fetchOrders]);

  // 3. Resiliencia Híbrida: Polling cada 45s y re-sincronización en 'online' y 'focus'
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const interval = setInterval(() => {
      void fetchOrders(true);
    }, POLLING_INTERVAL_MS);

    const handleReconnect = () => {
      triggerBackgroundSync();
    };

    window.addEventListener('online', handleReconnect);
    window.addEventListener('focus', handleReconnect);

    return () => {
      clearInterval(interval);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      window.removeEventListener('online', handleReconnect);
      window.removeEventListener('focus', handleReconnect);
    };
  }, [fetchOrders, triggerBackgroundSync]);

  // 4. Suscripción a Supabase Realtime con Canal `orders-realtime-${restaurantId}`
  useEffect(() => {
    if (!restaurantId) return;

    const supabase = createClient();
    const channelName = `orders-realtime-${restaurantId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const eventType = payload.eventType;
          const newRow = payload.new as Order | null;
          const oldRow = payload.old as Partial<Order> | null;

          // BLINDAJE MULTI-TENANT ESTRICTO: descartar eventos de otro tenant
          if (newRow && newRow.restaurant_id && newRow.restaurant_id !== restaurantId) {
            return;
          }

          if (eventType === 'INSERT') {
            if (!newRow || !newRow.id) return;
            // Descartar pedidos en borrador
            if (newRow.status === 'draft') return;

            // Alerta sonora procedural para nuevas comandas confirmadas (con deduplicación estricta)
            if (newRow.status === 'confirmed' && !alertedOrderIdsRef.current.has(newRow.id)) {
              alertedOrderIdsRef.current.add(newRow.id);
              if (autoPlaySound) {
                soundAlerts.playNewOrderSound();
              }
            }

            // Refrescar para obtener datos relacionales de cliente e ítems
            triggerBackgroundSync();
          } else if (eventType === 'UPDATE') {
            if (!newRow || !newRow.id) return;

            // Si pasó de draft a confirmed por WhatsApp, reproducir chime y actualizar
            if (newRow.status === 'confirmed' && !alertedOrderIdsRef.current.has(newRow.id)) {
              alertedOrderIdsRef.current.add(newRow.id);
              if (autoPlaySound) {
                soundAlerts.playNewOrderSound();
              }
            }

            if (newRow.status === 'draft' || newRow.status === 'cancelled') {
              // Remover del tablero si cambió a borrador o cancelado
              setOrders((prev) => prev.filter((o) => o.id !== newRow.id));
            } else if (newRow.status === 'delivered') {
              // Remover del tablero activo y archivar en recallStack
              setOrders((prev) => {
                const finished = prev.find((o) => o.id === newRow.id);
                if (finished) {
                  const updatedFinished = {
                    ...finished,
                    status: 'delivered' as OrderStatus,
                    updated_at: newRow.updated_at || new Date().toISOString(),
                  };
                  setRecallStack((r) => [
                    updatedFinished,
                    ...r.filter((item) => item.id !== newRow.id),
                  ]);
                }
                return prev.filter((o) => o.id !== newRow.id);
              });
            } else {
              // Si la orden no existía en el tablero activo, sincronizar en background
              const existsInActive = ordersRef.current.some((o) => o.id === newRow.id);
              if (!existsInActive) {
                triggerBackgroundSync();
              } else {
                // Actualizar orden en estado activo (confirmed, preparing, ready) de forma pura
                let shouldSyncBackground = false;
                setOrders((prev) =>
                  prev.map((o) => {
                    if (o.id !== newRow.id) return o;
                    const stage =
                      newRow.status === 'confirmed'
                        ? 'new'
                        : newRow.status === 'preparing'
                        ? 'prep'
                        : 'ready';

                    const { channel, channelBadge } =
                      newRow.delivery_address !== undefined
                        ? inferOrderChannel(newRow.delivery_address)
                        : { channel: o.channel, channelBadge: o.channelBadge };

                    const isPaid =
                      newRow.payment_method !== undefined
                        ? newRow.payment_method !== null &&
                          newRow.payment_method !== 'pending' &&
                          newRow.payment_method !== 'cash'
                        : o.paid;

                    const newRawTotal =
                      newRow.total !== undefined ? Number(newRow.total || 0) : o.rawTotal;

                    // Si el total cambió, los ítems o precios pudieron haber cambiado
                    if (newRawTotal !== o.rawTotal) {
                      shouldSyncBackground = true;
                    }

                    return {
                      ...o,
                      status: newRow.status,
                      stage,
                      channel,
                      channelBadge,
                      address:
                        newRow.delivery_address !== undefined
                          ? newRow.delivery_address || 'Pasa a mostrador'
                          : o.address,
                      paid: isPaid,
                      total: `$${newRawTotal.toFixed(0)}`,
                      rawTotal: newRawTotal,
                      updated_at: newRow.updated_at,
                    };
                  })
                );

                if (shouldSyncBackground) {
                  triggerBackgroundSync();
                }
              }
            }
          } else if (eventType === 'DELETE') {
            if (!oldRow || !oldRow.id) return;
            setOrders((prev) => prev.filter((o) => o.id !== oldRow.id));
            setRecallStack((prev) => prev.filter((o) => o.id !== oldRow.id));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_items',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const newRow = payload?.new as any;
          if (newRow && newRow.restaurant_id && newRow.restaurant_id !== restaurantId) {
            return;
          }
          // Si cambian ítems de la orden, sincronizar en background coalesciendo llamadas
          triggerBackgroundSync();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [restaurantId, autoPlaySound, triggerBackgroundSync]);

  // 5. Tachar / desmarcar ítem de la comanda en preparación (local en cocina)
  const toggleItemDone = useCallback((orderId: string, itemIdx: number) => {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const newItems = [...order.items];
        const currentItem = newItems[itemIdx];
        if (!currentItem) return order;
        const newDone = !currentItem.done;
        newItems[itemIdx] = { ...currentItem, done: newDone };

        const currentId = String(currentItem.id);
        const itemKey = currentId.startsWith(`${order.id}-`)
          ? currentId
          : `${order.id}-${currentId}`;
        itemsDoneMapRef.current.set(itemKey, newDone);

        return { ...order, items: newItems };
      })
    );
  }, []);

  // 6. Despachar comanda (Bump) con Optimistic UI, Rollback Quirúrgico y Bloqueo In-Flight
  const bumpOrder = useCallback(
    async (orderId: string): Promise<{ success: boolean; error?: string; conflict?: boolean }> => {
      if (!restaurantId) return { success: false, error: 'Sin restaurante seleccionado' };

      // Prevenir doble toque rápido en la misma comanda
      if (inFlightBumpsRef.current.has(orderId)) {
        return { success: false, error: 'Acción en progreso para esta comanda' };
      }

      inFlightBumpsRef.current.add(orderId);

      try {
        const currentOrder = ordersRef.current.find((o) => o.id === orderId);
        if (!currentOrder) return { success: false, error: 'Orden no encontrada en tablero' };

        // Máquina de estados: confirmed -> preparing -> ready -> delivered
        let nextStatus: OrderStatus;
        if (currentOrder.status === 'confirmed') {
          nextStatus = 'preparing';
        } else if (currentOrder.status === 'preparing') {
          nextStatus = 'ready';
        } else if (currentOrder.status === 'ready') {
          nextStatus = 'delivered';
        } else {
          return {
            success: false,
            error: `No se puede avanzar orden en estado ${currentOrder.status}`,
          };
        }

        // Optimistic UI update
        if (nextStatus === 'delivered') {
          const updatedDelivered = {
            ...currentOrder,
            status: 'delivered' as OrderStatus,
            updated_at: new Date().toISOString(),
          };
          setOrders((prev) => prev.filter((o) => o.id !== orderId));
          ordersRef.current = ordersRef.current.filter((o) => o.id !== orderId);
          setRecallStack((r) => [updatedDelivered, ...r]);
          recallStackRef.current = [updatedDelivered, ...recallStackRef.current];
        } else {
          const stage = nextStatus === 'preparing' ? 'prep' : 'ready';
          setOrders((prev) =>
            prev.map((o) => {
              if (o.id !== orderId) return o;
              return { ...o, status: nextStatus, stage };
            })
          );
          ordersRef.current = ordersRef.current.map((o) =>
            o.id === orderId ? { ...o, status: nextStatus, stage } : o
          );
        }

        // Llamada atómica a la Server Action conectada al RPC PostgreSQL con límite de tiempo
        let res: { success: boolean; error?: string; conflict?: boolean };
        try {
          res = await raceTimeout(
            advanceOrderStatus(
              restaurantId,
              orderId,
              currentOrder.status,
              nextStatus
            ),
            CLIENT_ACTION_TIMEOUT_MS,
            'La operación de comanda tardó demasiado tiempo en responder'
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Fallo en la comunicación con cocina';
          res = { success: false, error: message };
        }

        if (!res.success) {
          // Rollback quirúrgico: solo restaurar la orden afectada sin sobreescribir concurrentes
          if (nextStatus === 'delivered') {
            setRecallStack((r) => r.filter((item) => item.id !== orderId));
            recallStackRef.current = recallStackRef.current.filter((item) => item.id !== orderId);
            setOrders((prev) => {
              const alreadyPresent = prev.some((o) => o.id === orderId);
              if (alreadyPresent) return prev;
              return [currentOrder, ...prev];
            });
            if (!ordersRef.current.some((o) => o.id === orderId)) {
              ordersRef.current = [currentOrder, ...ordersRef.current];
            }
          } else {
            setOrders((prev) =>
              prev.map((o) =>
                o.id === orderId
                  ? { ...o, status: currentOrder.status, stage: currentOrder.stage }
                  : o
              )
            );
            ordersRef.current = ordersRef.current.map((o) =>
              o.id === orderId
                ? { ...o, status: currentOrder.status, stage: currentOrder.stage }
                : o
            );
          }

          // Si fue un conflicto concurrente (otra pantalla modificó la orden),
          // sincronizar inmediatamente con el estado real del servidor
          if (res.conflict) {
            triggerBackgroundSync();
          }

          return {
            success: false,
            error: res.error || 'Error al despachar orden',
            conflict: res.conflict,
          };
        }

        return { success: true };
      } finally {
        inFlightBumpsRef.current.delete(orderId);
      }
    },
    [restaurantId, triggerBackgroundSync]
  );

  // 7. Deshacer último despacho (Recall) de comanda con Bloqueo In-Flight y Rollback Quirúrgico
  const recallLastOrder = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!restaurantId) return { success: false, error: 'Sin restaurante seleccionado' };
    if (inFlightRecallRef.current) {
      return { success: false, error: 'Reversión en progreso' };
    }

    const now = Date.now();
    // Depurar de la pila cualquier comanda expirada (> 3h)
    const validStack = recallStackRef.current.filter((o) => {
      const uTime = new Date(o.updated_at).getTime();
      return isNaN(uTime) || now - uTime <= DELIVERED_RETENTION_MS;
    });

    if (validStack.length === 0) {
      setRecallStack([]);
      return { success: false, error: 'Pila de recall vacía o expirada (> 3 horas)' };
    }

    const orderToRecall = validStack[0];
    if (!orderToRecall) return { success: false, error: 'Orden no disponible para recall' };

    // Determinamos el estado anterior al que revertir
    let targetStatus: OrderStatus;
    if (orderToRecall.status === 'delivered') {
      targetStatus = 'ready';
    } else if (orderToRecall.status === 'ready') {
      targetStatus = 'preparing';
    } else if (orderToRecall.status === 'preparing') {
      targetStatus = 'confirmed';
    } else {
      return {
        success: false,
        error: `No se puede revertir comanda en estado ${orderToRecall.status}`,
      };
    }

    inFlightRecallRef.current = true;

    try {
      // Optimistic UI: quitar de recallStack y retornar a la vista activa
      setRecallStack((r) => r.filter((item) => item.id !== orderToRecall.id));
      recallStackRef.current = recallStackRef.current.filter((item) => item.id !== orderToRecall.id);
      const stage: 'new' | 'prep' | 'ready' =
        targetStatus === 'confirmed'
          ? 'new'
          : targetStatus === 'preparing'
          ? 'prep'
          : 'ready';
      const restoredOrder: KDSOrder = { ...orderToRecall, status: targetStatus, stage };
      setOrders((prev) => [restoredOrder, ...prev]);
      ordersRef.current = [restoredOrder, ...ordersRef.current.filter((o) => o.id !== orderToRecall.id)];

      let res: { success: boolean; error?: string; conflict?: boolean };
      try {
        res = await raceTimeout(
          recallOrderStatus(
            restaurantId,
            orderToRecall.id,
            orderToRecall.status,
            targetStatus
          ),
          CLIENT_ACTION_TIMEOUT_MS,
          'La operación de reversión tardó demasiado tiempo en responder'
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Fallo de red al revertir comanda';
        res = { success: false, error: message };
      }

      if (!res.success) {
        // Rollback quirúrgico: quitar de active orders y devolver a la cima de recallStack
        setOrders((prev) => prev.filter((o) => o.id !== orderToRecall.id));
        ordersRef.current = ordersRef.current.filter((o) => o.id !== orderToRecall.id);
        setRecallStack((r) => [orderToRecall, ...r.filter((item) => item.id !== orderToRecall.id)]);
        recallStackRef.current = [
          orderToRecall,
          ...recallStackRef.current.filter((item) => item.id !== orderToRecall.id),
        ];

        if (res.conflict) {
          triggerBackgroundSync();
        }

        return { success: false, error: res.error || 'Error al revertir orden' };
      }

      return { success: true };
    } finally {
      inFlightRecallRef.current = false;
    }
  }, [restaurantId, triggerBackgroundSync]);

  // 8. Filtrado memoizado por canal
  const filteredOrders = useMemo(() => {
    if (channelFilter === 'all') return orders;
    return orders.filter((o) => o.channel === channelFilter);
  }, [orders, channelFilter]);

  return {
    orders,
    filteredOrders,
    recallStack,
    loading,
    error,
    channelFilter,
    setChannelFilter,
    bumpOrder,
    recallLastOrder,
    toggleItemDone,
    refresh: () => fetchOrders(false),
  };
}