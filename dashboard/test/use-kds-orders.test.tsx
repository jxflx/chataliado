import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { useKDSOrders, inferOrderChannel, type KDSOrder } from '../src/hooks/use-kds-orders';
import { soundAlerts } from '../src/lib/audio/sound-alerts';
import * as actions from '../src/app/(dashboard)/kds/actions';

// Mock Sound Alerts
vi.spyOn(soundAlerts, 'playNewOrderSound').mockImplementation(() => {});

// Mock Server Actions
vi.spyOn(actions, 'advanceOrderStatus').mockResolvedValue({
  success: true,
  data: { orderId: 'ord-1', previousStatus: 'confirmed', newStatus: 'preparing' },
});

vi.spyOn(actions, 'recallOrderStatus').mockResolvedValue({
  success: true,
  data: { orderId: 'ord-1', previousStatus: 'delivered', newStatus: 'ready' },
});

// Mock Supabase
let realtimeCallbacks: {
  orders?: (payload: any) => void;
  order_items?: (payload: any) => void;
} = {};

let subscribedChannelName: string | null = null;
let subscribedFilters: any[] = [];

const mockChannel = {
  on: vi.fn((type: string, filter: any, callback: (payload: any) => void) => {
    subscribedFilters.push(filter);
    if (filter.table === 'orders') {
      realtimeCallbacks.orders = callback;
    } else if (filter.table === 'order_items') {
      realtimeCallbacks.order_items = callback;
    }
    return mockChannel;
  }),
  subscribe: vi.fn(() => mockChannel),
};

const mockRemoveChannel = vi.fn();

const defaultDBOrders = [
  {
    id: 'ord-1',
    restaurant_id: 'rest-1',
    customer_id: 'cust-1',
    conversation_id: 'convo-1',
    status: 'confirmed',
    subtotal: 200,
    delivery_fee: 30,
    discount: 0,
    total: 230,
    delivery_address: 'Av. Hidalgo 123, Col. Centro',
    payment_method: 'card',
    created_at: new Date(Date.now() - 300 * 1000).toISOString(), // 5 min ago
    updated_at: new Date(Date.now() - 300 * 1000).toISOString(),
    customers: {
      id: 'cust-1',
      name: 'Mario Rossi',
      phone: '+525512345678',
      notes_md: 'Tocar timbre',
    },
    order_items: [
      {
        id: 'item-1',
        order_id: 'ord-1',
        product_id: 'prod-1',
        quantity: 1,
        unit_price: 200,
        options_selected: [{ choice_label: 'Grande' }],
        subtotal: 200,
        menu_items: { name: 'Pizza Margherita' },
      },
    ],
  },
  {
    id: 'ord-2',
    restaurant_id: 'rest-1',
    customer_id: 'cust-2',
    conversation_id: 'convo-2',
    status: 'preparing',
    subtotal: 150,
    delivery_fee: 0,
    discount: 0,
    total: 150,
    delivery_address: 'Mesa 4',
    payment_method: 'cash',
    created_at: new Date(Date.now() - 600 * 1000).toISOString(), // 10 min ago
    updated_at: new Date(Date.now() - 600 * 1000).toISOString(),
    customers: {
      id: 'cust-2',
      name: 'Lucia Diaz',
      phone: '+525587654321',
      notes_md: '',
    },
    order_items: [
      {
        id: 'item-2',
        order_id: 'ord-2',
        product_id: 'prod-2',
        quantity: 2,
        unit_price: 75,
        options_selected: [],
        subtotal: 150,
        menu_items: { name: 'Cerveza' },
      },
    ],
  },
  {
    id: 'ord-draft',
    restaurant_id: 'rest-1',
    customer_id: 'cust-3',
    status: 'draft',
    subtotal: 100,
    total: 100,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'ord-delivered-old',
    restaurant_id: 'rest-1',
    customer_id: 'cust-4',
    status: 'delivered',
    subtotal: 100,
    total: 100,
    created_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), // 5h ago
    updated_at: new Date(Date.now() - 4 * 3600 * 1000).toISOString(), // 4h ago (>3h)
  },
];

let currentDBOrders = [...defaultDBOrders];

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn((name: string) => {
      subscribedChannelName = name;
      return mockChannel;
    }),
    removeChannel: mockRemoveChannel,
    from: vi.fn((table: string) => {
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockImplementation(() =>
                  Promise.resolve({
                    data: currentDBOrders,
                    error: null,
                  })
                ),
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };
    }),
  })),
}));

class HookHarness<TProps, TResult> {
  private hookFn: (props: TProps) => TResult;
  private props: TProps;
  private hookIndex = 0;
  private hooksState: any[] = [];
  private effectCleanups: (() => void)[] = [];
  private pendingEffects: (() => void | (() => void))[] = [];
  public result!: TResult;

  constructor(hookFn: (props: TProps) => TResult, initialProps: TProps) {
    this.hookFn = hookFn;
    this.props = initialProps;
    this.render();
  }

  public render(): void {
    this.hookIndex = 0;

    const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
                      (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

    const prevDispatcher = internals.H !== undefined ? internals.H : internals.ReactCurrentDispatcher?.current;

    const testDispatcher = {
      useState: (initial: any) => {
        const idx = this.hookIndex++;
        if (this.hooksState[idx] === undefined) {
          this.hooksState[idx] = typeof initial === 'function' ? initial() : initial;
        }
        const setState = (action: any) => {
          const next = typeof action === 'function' ? action(this.hooksState[idx]) : action;
          if (next !== this.hooksState[idx]) {
            this.hooksState[idx] = next;
            this.render();
          }
        };
        return [this.hooksState[idx], setState];
      },
      useRef: (initial: any) => {
        const idx = this.hookIndex++;
        if (this.hooksState[idx] === undefined) {
          this.hooksState[idx] = { current: initial };
        }
        return this.hooksState[idx];
      },
      useMemo: (factory: () => any, deps?: any[]) => {
        const idx = this.hookIndex++;
        const prev = this.hooksState[idx];
        if (!prev || !deps || deps.some((d, i) => d !== prev.deps[i])) {
          const value = factory();
          this.hooksState[idx] = { value, deps };
          return value;
        }
        return prev.value;
      },
      useCallback: (fn: any, deps: any[]) => {
        const idx = this.hookIndex++;
        const prev = this.hooksState[idx];
        if (!prev || !deps || deps.some((d, i) => d !== prev.deps[i])) {
          this.hooksState[idx] = { fn, deps };
          return fn;
        }
        return prev.fn;
      },
      useEffect: (effect: () => void | (() => void), deps?: any[]) => {
        const idx = this.hookIndex++;
        const prev = this.hooksState[idx];
        if (!prev || !deps || deps.some((d, i) => d !== prev.deps[i])) {
          this.hooksState[idx] = { deps, effect };
          this.pendingEffects.push(effect);
        }
      },
    };

    if (internals.H !== undefined) internals.H = testDispatcher;
    if (internals.ReactCurrentDispatcher) internals.ReactCurrentDispatcher.current = testDispatcher;

    try {
      this.result = this.hookFn(this.props);
    } finally {
      if (internals.H !== undefined) internals.H = prevDispatcher;
      if (internals.ReactCurrentDispatcher) internals.ReactCurrentDispatcher.current = prevDispatcher;
    }

    const effectsToRun = [...this.pendingEffects];
    this.pendingEffects = [];
    for (const effect of effectsToRun) {
      const cleanup = effect();
      if (typeof cleanup === 'function') {
        this.effectCleanups.push(cleanup);
      }
    }
  }

  public unmount(): void {
    for (const cleanup of this.effectCleanups) {
      try {
        cleanup();
      } catch {}
    }
    this.effectCleanups = [];
  }
}

function renderHook<TProps, TResult>(hookFn: (props: TProps) => TResult, initialProps: TProps) {
  const harness = new HookHarness(hookFn, initialProps);
  return {
    get current() {
      return harness.result;
    },
    unmount: () => harness.unmount(),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('useKDSOrders Hook (Realtime, Multi-Tenant Isolation & Ergonomics)', () => {
  const restaurantId = 'rest-1';

  beforeEach(() => {
    vi.clearAllMocks();
    realtimeCallbacks = {};
    subscribedFilters = [];
    subscribedChannelName = null;
    currentDBOrders = [...defaultDBOrders];
  });

  it('debe suscribirse al canal con nombre orders-realtime-${restaurantId} y filtros por tenant', async () => {
    renderHook(() => useKDSOrders({ restaurantId }), {});

    expect(subscribedChannelName).toBe(`orders-realtime-${restaurantId}`);
    expect(subscribedFilters).toContainEqual(
      expect.objectContaining({
        table: 'orders',
        filter: `restaurant_id=eq.${restaurantId}`,
      })
    );
    expect(subscribedFilters).toContainEqual(
      expect.objectContaining({
        table: 'order_items',
        filter: `restaurant_id=eq.${restaurantId}`,
      })
    );
  });

  it('debe cargar órdenes activas en el montaje y excluir absolutamente las órdenes draft', async () => {
    const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
    await sleep(20);

    expect(hook.current.orders).toHaveLength(2);
    expect(hook.current.orders.some((o) => o.status === 'draft')).toBe(false);
    expect(hook.current.orders.some((o) => o.id === 'ord-1')).toBe(true);
    expect(hook.current.orders.some((o) => o.id === 'ord-2')).toBe(true);
  });

  it('debe auto-archivar órdenes entregadas mayores a 3 horas', async () => {
    const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
    await sleep(20);

    // ord-delivered-old (4h de entregada) no debe estar en active view ni en recallStack
    expect(hook.current.orders.some((o) => o.id === 'ord-delivered-old')).toBe(false);
    expect(hook.current.recallStack.some((o) => o.id === 'ord-delivered-old')).toBe(false);
  });

  it('debe inferir y filtrar canales correctamente (Domicilio, Mesa, Llevar)', async () => {
    expect(inferOrderChannel('Av. Revolución 340')).toEqual({
      channel: 'Domicilio',
      channelBadge: 'Domicilio',
    });
    expect(inferOrderChannel('Mesa 5')).toEqual({
      channel: 'Mesa',
      channelBadge: 'Mesa 5',
    });
    expect(inferOrderChannel('Para Llevar / Mostrador')).toEqual({
      channel: 'Llevar',
      channelBadge: 'Para Llevar',
    });
    expect(inferOrderChannel(null)).toEqual({
      channel: 'Llevar',
      channelBadge: 'Para Llevar',
    });

    const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
    await sleep(20);

    // Filtro Mesa
    hook.current.setChannelFilter('Mesa');
    expect(hook.current.filteredOrders).toHaveLength(1);
    expect(hook.current.filteredOrders[0]?.id).toBe('ord-2');

    // Filtro Domicilio
    hook.current.setChannelFilter('Domicilio');
    expect(hook.current.filteredOrders).toHaveLength(1);
    expect(hook.current.filteredOrders[0]?.id).toBe('ord-1');

    // Filtro Llevar (vacío)
    hook.current.setChannelFilter('Llevar');
    expect(hook.current.filteredOrders).toHaveLength(0);

    // Todos
    hook.current.setChannelFilter('all');
    expect(hook.current.filteredOrders).toHaveLength(2);
  });

  it('debe descartar eventos Realtime de otro restaurante (Blindaje Multi-Tenant)', async () => {
    const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
    await sleep(20);

    realtimeCallbacks.orders?.({
      eventType: 'INSERT',
      new: {
        id: 'alien-order',
        restaurant_id: 'other-tenant-999',
        status: 'confirmed',
      },
    });

    expect(hook.current.orders.some((o) => o.id === 'alien-order')).toBe(false);
    expect(soundAlerts.playNewOrderSound).not.toHaveBeenCalled();
  });

  it('debe descartar eventos INSERT con estado draft (no se muestran en cocina)', async () => {
    const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
    await sleep(20);

    realtimeCallbacks.orders?.({
      eventType: 'INSERT',
      new: {
        id: 'new-draft',
        restaurant_id: restaurantId,
        status: 'draft',
      },
    });

    expect(hook.current.orders.some((o) => o.id === 'new-draft')).toBe(false);
    expect(soundAlerts.playNewOrderSound).not.toHaveBeenCalled();
  });

  it('debe reproducir sonido con deduplicación ante una nueva orden confirmed por WhatsApp', async () => {
    const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
    await sleep(20);

    currentDBOrders.push({
      id: 'ord-new-wa',
      restaurant_id: restaurantId,
      customer_id: 'cust-wa',
      conversation_id: 'convo-wa',
      status: 'confirmed',
      subtotal: 350,
      delivery_fee: 0,
      discount: 0,
      total: 350,
      delivery_address: 'Calle Juárez 10',
      payment_method: 'transfer',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      customers: { id: 'cust-wa', name: 'Nuevo Comensal', phone: '+525500000000', notes_md: '' },
      order_items: [],
    });

    realtimeCallbacks.orders?.({
      eventType: 'INSERT',
      new: {
        id: 'ord-new-wa',
        restaurant_id: restaurantId,
        status: 'confirmed',
      },
    });
    await sleep(20);

    expect(soundAlerts.playNewOrderSound).toHaveBeenCalledTimes(1);

    // Evento repetido para el mismo ID no debe disparar el chime una segunda vez
    realtimeCallbacks.orders?.({
      eventType: 'UPDATE',
      new: {
        id: 'ord-new-wa',
        restaurant_id: restaurantId,
        status: 'confirmed',
      },
    });
    await sleep(20);

    expect(soundAlerts.playNewOrderSound).toHaveBeenCalledTimes(1);
  });

  it('debe avanzar atómicamente la comanda (Bump) con Optimistic UI y transición de estados', async () => {
    const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
    await sleep(20);

    // ord-1 está en confirmed -> bump avanza a preparing
    const res1 = await hook.current.bumpOrder('ord-1');
    expect(res1.success).toBe(true);

    expect(actions.advanceOrderStatus).toHaveBeenCalledWith(
      restaurantId,
      'ord-1',
      'confirmed',
      'preparing'
    );
    expect(hook.current.orders.find((o) => o.id === 'ord-1')?.status).toBe('preparing');

    // Siguiente bump: preparing -> ready
    const res2 = await hook.current.bumpOrder('ord-1');
    expect(res2.success).toBe(true);

    expect(actions.advanceOrderStatus).toHaveBeenCalledWith(
      restaurantId,
      'ord-1',
      'preparing',
      'ready'
    );
    expect(hook.current.orders.find((o) => o.id === 'ord-1')?.status).toBe('ready');

    // Último bump: ready -> delivered (sale del tablero y entra a recallStack)
    const res3 = await hook.current.bumpOrder('ord-1');
    expect(res3.success).toBe(true);

    expect(actions.advanceOrderStatus).toHaveBeenCalledWith(
      restaurantId,
      'ord-1',
      'ready',
      'delivered'
    );
    expect(hook.current.orders.some((o) => o.id === 'ord-1')).toBe(false);
    expect(hook.current.recallStack.some((o) => o.id === 'ord-1')).toBe(true);
  });

  it('debe realizar rollback inmediato si falla la Server Action al despachar', async () => {
    vi.mocked(actions.advanceOrderStatus).mockResolvedValueOnce({
      success: false,
      error: 'Error de conexión de base de datos',
    });

    const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
    await sleep(20);

    const res = await hook.current.bumpOrder('ord-1');
    expect(res.success).toBe(false);
    expect(res.error).toContain('Error de conexión');

    // Estado revertido al original
    expect(hook.current.orders.find((o) => o.id === 'ord-1')?.status).toBe('confirmed');
  });

  it('debe permitir recuperar comandas despachadas por error (Recall)', async () => {
    const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
    await sleep(20);

    // Despachar ord-2 hasta delivered
    await hook.current.bumpOrder('ord-2'); // preparing -> ready
    await hook.current.bumpOrder('ord-2'); // ready -> delivered

    expect(hook.current.orders.some((o) => o.id === 'ord-2')).toBe(false);
    expect(hook.current.recallStack[0]?.id).toBe('ord-2');

    // Ejecutar Recall
    const res = await hook.current.recallLastOrder();
    expect(res.success).toBe(true);

    expect(actions.recallOrderStatus).toHaveBeenCalledWith(
      restaurantId,
      'ord-2',
      'delivered',
      'ready'
    );
    // Vuelve al tablero activo
    expect(hook.current.orders.some((o) => o.id === 'ord-2')).toBe(true);
  });

  it('debe permitir tachar y desmarcar platillos de la comanda (item-done)', async () => {
    const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
    await sleep(20);

    expect(hook.current.orders[0]?.items[0]?.done).toBe(false);

    hook.current.toggleItemDone('ord-1', 0);
    expect(hook.current.orders[0]?.items[0]?.done).toBe(true);

    hook.current.toggleItemDone('ord-1', 0);
    expect(hook.current.orders[0]?.items[0]?.done).toBe(false);
  });

  it('debe sincronizar ante eventos DELETE removiendo la orden del tablero', async () => {
    const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
    await sleep(20);

    expect(hook.current.orders.some((o) => o.id === 'ord-1')).toBe(true);

    realtimeCallbacks.orders?.({
      eventType: 'DELETE',
      old: { id: 'ord-1' },
    });

    expect(hook.current.orders.some((o) => o.id === 'ord-1')).toBe(false);
  });
});