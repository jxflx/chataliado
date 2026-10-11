import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import ReactDOMServer from 'react-dom/server';
import { useKDSOrders, type KDSOrder } from '../src/hooks/use-kds-orders';
import { useWakeLock } from '../src/hooks/use-wake-lock';
import { soundAlerts } from '../src/lib/audio/sound-alerts';
import * as actions from '../src/app/(dashboard)/kds/actions';
import KDSPage from '../src/app/(dashboard)/kds/page';

// Mock Window & Event listeners
const mockWindowListeners: Record<string, Function[]> = {};
const mockWindow = {
  addEventListener: vi.fn((event: string, cb: Function) => {
    mockWindowListeners[event] = mockWindowListeners[event] || [];
    mockWindowListeners[event].push(cb);
  }),
  removeEventListener: vi.fn((event: string, cb: Function) => {
    if (mockWindowListeners[event]) {
      mockWindowListeners[event] = mockWindowListeners[event].filter((f) => f !== cb);
    }
  }),
  dispatchEvent: (event: any) => {
    const eventName = typeof event === 'string' ? event : event?.type || 'unknown';
    const cbs = mockWindowListeners[eventName] || [];
    cbs.forEach((cb) => cb(event));
    return true;
  },
};

(global as any).window = mockWindow;
if (typeof (global as any).Event === 'undefined') {
  (global as any).Event = class Event {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  };
}

// Mock Sound Alerts
const playNewOrderSoundSpy = vi.spyOn(soundAlerts, 'playNewOrderSound').mockImplementation(() => {});

// Mock Server Actions
vi.spyOn(actions, 'advanceOrderStatus').mockResolvedValue({
  success: true,
  data: { orderId: 'ord-1', previousStatus: 'confirmed', newStatus: 'preparing' },
});

vi.spyOn(actions, 'recallOrderStatus').mockResolvedValue({
  success: true,
  data: { orderId: 'ord-1', previousStatus: 'delivered', newStatus: 'ready' },
});

// Mock Tenant Provider
vi.mock('@/components/layout/tenant-provider', () => ({
  useTenant: () => ({
    activeRestaurant: { id: 'rest-adversarial-1', name: 'Pizzería Test' },
    userRole: 'owner',
  }),
}));

// Realtime & Supabase Mocks
let realtimeCallbacks: {
  orders?: (payload: any) => void;
  order_items?: (payload: any) => void;
} = {};

let fetchOrdersCallCount = 0;
let currentDBOrders: any[] = [];

const mockChannel = {
  on: vi.fn((type: string, filter: any, callback: (payload: any) => void) => {
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

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn(() => mockChannel),
    removeChannel: mockRemoveChannel,
    from: vi.fn((table: string) => {
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockImplementation(() => {
                  fetchOrdersCallCount++;
                  return Promise.resolve({
                    data: currentDBOrders,
                    error: null,
                  });
                }),
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

    const internals =
      (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
      (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

    const prevDispatcher =
      internals.H !== undefined ? internals.H : internals.ReactCurrentDispatcher?.current;

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

  public rerender(newProps: TProps): void {
    this.props = newProps;
    this.render();
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
    rerender: (newProps: TProps) => harness.rerender(newProps),
    unmount: () => harness.unmount(),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('⚔️ KDS ADVERSARIAL STRESS & RESILIENCE SUITE ⚔️', () => {
  const restaurantId = 'rest-adversarial-1';

  beforeEach(() => {
    vi.clearAllMocks();
    fetchOrdersCallCount = 0;
    realtimeCallbacks = {};
    currentDBOrders = [];
    for (const key of Object.keys(mockWindowListeners)) {
      delete mockWindowListeners[key];
    }
  });

  describe('1. Adversarial Concurrent Bumps Between Two Tablets', () => {
    it('debe revertir optimist UI, reportar conflict=true y resincronizar cuando otra tablet adelantó la comanda', async () => {
      const initialOrder = {
        id: 'ord-concurrent-1',
        restaurant_id: restaurantId,
        customer_id: 'cust-1',
        status: 'confirmed',
        subtotal: 300,
        total: 300,
        delivery_address: 'Mesa 1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        customers: { name: 'Comensal Concurrente', phone: '+525511112222' },
        order_items: [{ id: 'it-1', quantity: 1, unit_price: 300, menu_items: { name: 'Pizza Boneless' } }],
      };
      currentDBOrders = [initialOrder];

      const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
      await sleep(20);

      expect(hook.current.orders[0]?.status).toBe('confirmed');

      // Simular que Tablet 2 intenta hacer bump de confirmed -> preparing,
      // pero Tablet 1 ya lo hizo en la base de datos milisegundos antes
      vi.mocked(actions.advanceOrderStatus).mockResolvedValueOnce({
        success: false,
        conflict: true,
        error: 'Conflicto: La orden ya fue actualizada por otra pantalla de cocina',
      });

      // La base de datos ahora ya tiene preparing (actualizado por Tablet 1)
      currentDBOrders = [{ ...initialOrder, status: 'preparing', updated_at: new Date().toISOString() }];

      const res = await hook.current.bumpOrder('ord-concurrent-1');

      // Conflicto detectado limpiamente
      expect(res.success).toBe(false);
      expect(res.conflict).toBe(true);
      expect(res.error).toContain('Conflicto');

      // Esperar sincronización automática posconflicto (debounce 100ms)
      await sleep(150);

      // El estado del tablero se actualizó al estado real del servidor sin quedar corrupto
      expect(hook.current.orders[0]?.status).toBe('preparing');
    });

    it('debe prevenir doble toque simultáneo (double-tap race condition) en la misma tablet', async () => {
      const initialOrder = {
        id: 'ord-double-tap',
        restaurant_id: restaurantId,
        customer_id: 'cust-1',
        status: 'confirmed',
        subtotal: 250,
        total: 250,
        delivery_address: 'Para Llevar',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        customers: { name: 'Chef Apurado', phone: '+525533334444' },
        order_items: [],
      };
      currentDBOrders = [initialOrder];

      // Hacemos que la llamada tarde 80ms para simular latencia de red
      vi.mocked(actions.advanceOrderStatus).mockImplementationOnce(async () => {
        await sleep(80);
        return { success: true, data: { orderId: 'ord-double-tap', previousStatus: 'confirmed', newStatus: 'preparing' } };
      });

      const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
      await sleep(20);

      // Disparar dos bumps simultáneos sobre la misma comanda
      const p1 = hook.current.bumpOrder('ord-double-tap');
      const p2 = hook.current.bumpOrder('ord-double-tap');

      const [res1, res2] = await Promise.all([p1, p2]);

      // Una de las llamadas fue aceptada y la otra fue rechazada inmediatamente por bloqueo in-flight
      expect(res1.success || res2.success).toBe(true);
      expect(res1.error === 'Acción en progreso para esta comanda' || res2.error === 'Acción en progreso para esta comanda').toBe(true);
    });

    it('debe prevenir doble toque simultáneo al hacer Recall', async () => {
      const hook = renderHook(() => useKDSOrders({
        restaurantId,
        initialOrders: [],
      }), {});

      // Simular que recallOrderStatus tarda 80ms
      vi.mocked(actions.recallOrderStatus).mockImplementationOnce(async () => {
        await sleep(80);
        return { success: true, data: { orderId: 'ord-rec', previousStatus: 'delivered', newStatus: 'ready' } };
      });

      // Inyectar orden en recallStack mediante bump hasta delivered
      hook.current.orders.push({
        id: 'ord-rec',
        restaurant_id: restaurantId,
        name: 'Cliente Recall',
        phone: '123',
        channel: 'Llevar',
        channelBadge: 'Llevar',
        address: 'Mostrador',
        elapsedSeconds: 10,
        paid: true,
        total: '$100',
        rawTotal: 100,
        status: 'ready',
        stage: 'ready',
        items: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await hook.current.bumpOrder('ord-rec'); // ready -> delivered
      expect(hook.current.recallStack).toHaveLength(1);

      // Disparar dos recalls simultáneos
      const p1 = hook.current.recallLastOrder();
      const p2 = hook.current.recallLastOrder();

      const [res1, res2] = await Promise.all([p1, p2]);

      expect(res1.success || res2.success).toBe(true);
      expect(res1.error === 'Reversión en progreso' || res2.error === 'Reversión en progreso').toBe(true);
    });
  });

  describe('2. Network Resilience: Wi-Fi Reconnect Coalescing & Recovery Sound', () => {
    it('debe coalescer múltiples eventos rápidos de reconnect y focus en una sola petición a la base de datos', async () => {
      const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
      await sleep(20);

      const initialCount = fetchOrdersCallCount;

      // Simular reconexión violenta de Wi-Fi: múltiples eventos online y focus en 30ms
      mockWindow.dispatchEvent(new Event('online'));
      mockWindow.dispatchEvent(new Event('focus'));
      mockWindow.dispatchEvent(new Event('online'));
      mockWindow.dispatchEvent(new Event('focus'));

      // También llegan 4 eventos realtime de ítems
      realtimeCallbacks.order_items?.({});
      realtimeCallbacks.order_items?.({});
      realtimeCallbacks.order_items?.({});

      // Antes del debounce (50ms), no se deben haber disparado peticiones adicionales
      await sleep(40);
      expect(fetchOrdersCallCount).toBe(initialCount);

      // Tras el debounce de 100ms, exactamente 1 petición coalescida se ejecuta
      await sleep(130);
      expect(fetchOrdersCallCount).toBe(initialCount + 1);
    });

    it('debe reproducir sonido de alerta al reconectar si llegó una nueva orden confirmada durante la desconexión', async () => {
      currentDBOrders = [
        {
          id: 'ord-initial',
          restaurant_id: restaurantId,
          status: 'confirmed',
          subtotal: 100,
          total: 100,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          order_items: [],
        },
      ];

      const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
      await sleep(20);

      // La carga inicial no debe disparar sonido (ya existentes)
      expect(soundAlerts.playNewOrderSound).not.toHaveBeenCalled();

      // Durante la desconexión, entra una orden confirmada en la BD
      currentDBOrders.push({
        id: 'ord-missed-during-disconnect',
        restaurant_id: restaurantId,
        status: 'confirmed',
        subtotal: 200,
        total: 200,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        order_items: [],
      });

      // Wi-Fi vuelve y dispara reconexión
      mockWindow.dispatchEvent(new Event('online'));
      await sleep(150);

      // Detectó la orden confirmada y tocó la campana de comanda
      expect(soundAlerts.playNewOrderSound).toHaveBeenCalledTimes(1);

      // Siguiente reconexión sin nuevas órdenes no vuelve a sonar
      mockWindow.dispatchEvent(new Event('focus'));
      await sleep(150);
      expect(soundAlerts.playNewOrderSound).toHaveBeenCalledTimes(1);
    });

    it('debe deduplicar rigurosamente el sonido ante tormentas de eventos Realtime para la misma orden', async () => {
      const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
      await sleep(20);

      // Ráfaga masiva de eventos para la misma orden recién confirmada
      const targetId = 'ord-rapid-fire-wa';

      realtimeCallbacks.orders?.({
        eventType: 'INSERT',
        new: { id: targetId, restaurant_id: restaurantId, status: 'confirmed' },
      });

      for (let i = 0; i < 10; i++) {
        realtimeCallbacks.orders?.({
          eventType: 'UPDATE',
          new: { id: targetId, restaurant_id: restaurantId, status: 'confirmed' },
        });
      }

      await sleep(50);

      // El chime sonó exactamente una vez, nunca 11 veces
      expect(soundAlerts.playNewOrderSound).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. Auto-Archival & Strict LIFO Recall Stack Integrity', () => {
    it('debe mantener la pila de recall en orden LIFO estricto (última despachada primero) y depurar mayores a 3h', async () => {
      const now = Date.now();
      const twoHoursAgo = new Date(now - 2 * 3600 * 1000).toISOString();
      const fiveMinsAgo = new Date(now - 5 * 60 * 1000).toISOString();
      const fourHoursAgo = new Date(now - 4 * 3600 * 1000).toISOString();

      currentDBOrders = [
        {
          id: 'ord-delivered-2h',
          restaurant_id: restaurantId,
          status: 'delivered',
          subtotal: 150,
          total: 150,
          created_at: twoHoursAgo,
          updated_at: twoHoursAgo, // Entregada hace 2h (válida para recall)
          order_items: [],
        },
        {
          id: 'ord-delivered-5m',
          restaurant_id: restaurantId,
          status: 'delivered',
          subtotal: 200,
          total: 200,
          created_at: twoHoursAgo,
          updated_at: fiveMinsAgo, // Entregada hace 5 min (debe ser la primera en recall)
          order_items: [],
        },
        {
          id: 'ord-delivered-4h',
          restaurant_id: restaurantId,
          status: 'delivered',
          subtotal: 100,
          total: 100,
          created_at: fourHoursAgo,
          updated_at: fourHoursAgo, // Entregada hace 4h (>3h, debe ser purgada)
          order_items: [],
        },
      ];

      const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
      await sleep(20);

      // 1. La orden de 4h fue descartada por auto-archivado
      expect(hook.current.recallStack.some((o) => o.id === 'ord-delivered-4h')).toBe(false);

      // 2. Quedan 2 órdenes en recallStack
      expect(hook.current.recallStack).toHaveLength(2);

      // 3. Orden LIFO estricto: la más recientemente despachada (5m ago) debe estar en el tope (index 0)
      expect(hook.current.recallStack[0]?.id).toBe('ord-delivered-5m');
      expect(hook.current.recallStack[1]?.id).toBe('ord-delivered-2h');

      // 4. Recall devuelve la orden de 5 minutos ago al tablero
      const res = await hook.current.recallLastOrder();
      expect(res.success).toBe(true);
      expect(actions.recallOrderStatus).toHaveBeenCalledWith(
        restaurantId,
        'ord-delivered-5m',
        'delivered',
        'ready'
      );

      // ord-delivered-5m ya no está en recallStack y volvió a orders activa
      expect(hook.current.orders.some((o) => o.id === 'ord-delivered-5m')).toBe(true);
      expect(hook.current.recallStack.some((o) => o.id === 'ord-delivered-5m')).toBe(false);
      expect(hook.current.recallStack[0]?.id).toBe('ord-delivered-2h');
    });
  });

  describe('4. Hardware Ergonomics: Wake Lock in Background Tabs & Autoplay Policy', () => {
    it('debe abortar la solicitud de Wake Lock de forma segura si la pestaña no es visible', async () => {
      const mockRequest = vi.fn();
      Object.defineProperty(global, 'navigator', {
        value: { wakeLock: { request: mockRequest } },
        configurable: true,
      });

      const mockDoc = {
        visibilityState: 'hidden',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };
      (global as any).document = mockDoc;

      const hook = renderHook(() => useWakeLock({ enabled: true }), {});

      const success = await hook.current.request();
      expect(success).toBe(false);
      expect(mockRequest).not.toHaveBeenCalled();
    });

    it('desbloquea AudioContext mediante listeners pasivos en el primer gesto del usuario', () => {
      // Simular AudioContext suspendido
      const mockResume = vi.fn().mockResolvedValue(undefined);
      const mockAudioCtx = {
        state: 'suspended',
        resume: mockResume,
      };

      (soundAlerts as any).audioCtx = mockAudioCtx;
      soundAlerts.setupGestureUnlock();

      // Simular click del usuario
      mockWindow.dispatchEvent(new Event('click'));

      expect(mockResume).toHaveBeenCalled();
    });
  });

  describe('5. UI All-Day Totals Dynamic Calculation', () => {
    it('debe renderizar la cabecera All-Day Totals correctamente', () => {
      const html = ReactDOMServer.renderToString(<KDSPage />);
      expect(html).toContain('TOTALES ALL DAY:');
    });
  });

  describe('6. Advanced Adversarial Tests (Surgical Rollback, Timeout & Realtime Hardening)', () => {
    it('debe realizar rollback quirúrgico sin borrar órdenes concurrentes recibidas durante la llamada in-flight', async () => {
      const orderA = {
        id: 'ord-surgical-a',
        restaurant_id: restaurantId,
        status: 'confirmed',
        subtotal: 200,
        total: 200,
        delivery_address: 'Mesa 1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        order_items: [],
      };

      currentDBOrders = [orderA];
      const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
      await sleep(20);

      expect(hook.current.orders).toHaveLength(1);
      expect(hook.current.orders[0]?.id).toBe('ord-surgical-a');

      // Simulamos que advanceOrderStatus tarda y luego falla (falla de red o timeout)
      let resolveAdvance: any;
      vi.mocked(actions.advanceOrderStatus).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveAdvance = resolve;
          })
      );

      // Despachar orden A (pasa a preparing optimistamente)
      const bumpPromise = hook.current.bumpOrder('ord-surgical-a');
      expect(hook.current.orders[0]?.status).toBe('preparing');

      // Mientras la llamada está en vuelo, llega concurrentemente la orden B por Realtime
      const orderB = {
        id: 'ord-surgical-b',
        restaurant_id: restaurantId,
        status: 'confirmed',
        subtotal: 150,
        total: 150,
        delivery_address: 'Mesa 2',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        order_items: [],
      };
      currentDBOrders.push(orderB);

      realtimeCallbacks.orders?.({
        eventType: 'INSERT',
        new: { id: 'ord-surgical-b', restaurant_id: restaurantId, status: 'confirmed' },
      });

      // Esperar que transcurra el debounce del sync en background
      await sleep(150);

      // Ambas órdenes deben estar presentes en el tablero
      expect(hook.current.orders.some((o) => o.id === 'ord-surgical-b')).toBe(true);

      // Ahora la Server Action de la orden A falla
      resolveAdvance({ success: false, error: 'Network timeout / connection lost' });
      const bumpResult = await bumpPromise;

      expect(bumpResult.success).toBe(false);
      // ROLLBACK QUIRÚRGICO: la orden A revierte a 'confirmed'
      const restoredA = hook.current.orders.find((o) => o.id === 'ord-surgical-a');
      expect(restoredA?.status).toBe('confirmed');

      // LA ORDEN B CONCURRENTE SIGUE PRESENTE (no fue borrada por un snapshot obsoleto)
      const keptB = hook.current.orders.find((o) => o.id === 'ord-surgical-b');
      expect(keptB).toBeDefined();
      expect(keptB?.id).toBe('ord-surgical-b');
    });

    it('debe manejar timeout de red y liberar el bloqueo in-flight para permitir reintentos', async () => {
      const order = {
        id: 'ord-timeout-test',
        restaurant_id: restaurantId,
        status: 'confirmed',
        subtotal: 120,
        total: 120,
        delivery_address: 'Para Llevar',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        order_items: [],
      };

      currentDBOrders = [order];
      const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
      await sleep(20);

      // Simular que advanceOrderStatus arroja un timeout
      vi.mocked(actions.advanceOrderStatus).mockRejectedValueOnce(
        new Error('TIMEOUT: El servidor tardó demasiado en responder al despachar comanda')
      );

      const res = await hook.current.bumpOrder('ord-timeout-test');
      expect(res.success).toBe(false);
      expect(res.error).toContain('TIMEOUT');

      // Estado revertido a confirmed
      expect(hook.current.orders[0]?.status).toBe('confirmed');

      // El bloqueo in-flight fue liberado: un segundo toque no es bloqueado con "Acción en progreso"
      vi.mocked(actions.advanceOrderStatus).mockResolvedValueOnce({
        success: true,
        data: { orderId: 'ord-timeout-test', previousStatus: 'confirmed', newStatus: 'preparing' },
      });

      const retryRes = await hook.current.bumpOrder('ord-timeout-test');
      expect(retryRes.success).toBe(true);
      expect(hook.current.orders[0]?.status).toBe('preparing');
    });

    it('debe rechazar transiciones de estado ilícitas de forma temprana sin llamar al servidor', async () => {
      const deliveredOrder = {
        id: 'ord-already-delivered',
        restaurant_id: restaurantId,
        status: 'delivered' as const,
        subtotal: 100,
        total: 100,
        delivery_address: 'Mesa 5',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        order_items: [],
      };

      // Inyectar orden entregada en orders activo directamente
      const hook = renderHook(
        () => useKDSOrders({ restaurantId, initialOrders: [deliveredOrder as any] }),
        {}
      );

      const res = await hook.current.bumpOrder('ord-already-delivered');
      expect(res.success).toBe(false);
      expect(res.error).toContain('No se puede avanzar orden en estado delivered');
      expect(actions.advanceOrderStatus).not.toHaveBeenCalled();
    });

    it('debe depurar y rechazar el recall de órdenes con más de 3 horas de antigüedad', async () => {
      const fourHoursAgo = new Date(Date.now() - 4 * 3600 * 1000).toISOString();
      const expiredDelivered = {
        id: 'ord-expired-delivered',
        restaurant_id: restaurantId,
        status: 'delivered',
        subtotal: 100,
        total: 100,
        created_at: fourHoursAgo,
        updated_at: fourHoursAgo,
        order_items: [],
      };

      currentDBOrders = [expiredDelivered];
      const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
      await sleep(20);

      // Pila de recall vacía tras auto-archivado
      expect(hook.current.recallStack).toHaveLength(0);

      const res = await hook.current.recallLastOrder();
      expect(res.success).toBe(false);
      expect(res.error).toContain('expirada');
      expect(actions.recallOrderStatus).not.toHaveBeenCalled();
    });

    it('debe actualizar canal, badge y dirección en tiempo real ante un evento UPDATE en orders', async () => {
      const initialOrder = {
        id: 'ord-address-change',
        restaurant_id: restaurantId,
        status: 'confirmed',
        subtotal: 250,
        total: 250,
        delivery_address: 'Pasa a mostrador', // Llevar
        payment_method: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        order_items: [],
      };

      currentDBOrders = [initialOrder];
      const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
      await sleep(20);

      expect(hook.current.orders[0]?.channel).toBe('Llevar');
      expect(hook.current.orders[0]?.paid).toBe(false);

      // Evento UPDATE en Realtime: el comensal indica mesa y paga con tarjeta
      realtimeCallbacks.orders?.({
        eventType: 'UPDATE',
        new: {
          id: 'ord-address-change',
          restaurant_id: restaurantId,
          status: 'confirmed',
          delivery_address: 'Mesa 8',
          payment_method: 'card',
          total: 250,
          updated_at: new Date().toISOString(),
        },
      });

      const updated = hook.current.orders.find((o) => o.id === 'ord-address-change');
      expect(updated?.channel).toBe('Mesa');
      expect(updated?.channelBadge).toBe('Mesa 8');
      expect(updated?.address).toBe('Mesa 8');
      expect(updated?.paid).toBe(true);
    });

    it('debe descartar eventos de order_items de otro tenant para blindaje multi-tenant', async () => {
      currentDBOrders = [];
      const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
      await sleep(20);

      const prevCallCount = fetchOrdersCallCount;

      // Evento de otro restaurante
      realtimeCallbacks.order_items?.({
        eventType: 'INSERT',
        new: {
          id: 'item-foreign',
          restaurant_id: 'alien-restaurant-999',
          order_id: 'ord-foreign',
        },
      });

      await sleep(150);

      // No debe haberse disparado ninguna sincronización adicional
      expect(fetchOrdersCallCount).toBe(prevCallCount);
    });

    it('debe limpiar caché, recall stack y alerted IDs al cambiar de restaurantId', async () => {
      const orderTenant1 = {
        id: 'ord-tenant-1',
        restaurant_id: 'tenant-1',
        status: 'confirmed',
        subtotal: 100,
        total: 100,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        order_items: [],
      };

      currentDBOrders = [orderTenant1];
      const hook = renderHook(
        ({ rId }: { rId: string }) => useKDSOrders({ restaurantId: rId }),
        { rId: 'tenant-1' }
      );
      await sleep(20);

      expect(hook.current.orders).toHaveLength(1);

      // Cambiar de tenant en la sesión
      currentDBOrders = [];
      hook.rerender({ rId: 'tenant-2' });
      await sleep(20);

      expect(hook.current.recallStack).toHaveLength(0);
      expect(hook.current.orders).toHaveLength(0);
    });
  });

  // ============================================================================
  // BLOQUE 7: ADVERSARIAL EDGE CASES (Modifiers, Special Instructions & Ref Sync)
  // ============================================================================
  describe('7. Modifiers, Special Instructions & Synchronous Ref Sync Hardening', () => {
    it('debe mapear correctamente modificadores de ítems desde array, objeto, string e instrucciones especiales', async () => {
      const orderWithRichModifiers = {
        id: 'ord-rich-mods',
        restaurant_id: restaurantId,
        status: 'confirmed',
        subtotal: 350,
        total: 350,
        delivery_address: 'Mesa 4',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        notes: 'Sin picante en ningún platillo',
        order_items: [
          {
            id: 'item-arr',
            quantity: 1,
            name: 'Pizza Personal',
            options_selected: [
              { choice_label: 'Orilla Rellena' },
              { name: 'Extra Queso' },
            ],
            notes: 'Masa crujiente',
          },
          {
            id: 'item-obj',
            quantity: 2,
            name: 'Tacos de Asada',
            options_selected: {
              tortilla: { label: 'Maíz' },
              cebolla: { choice_label: 'Cebolla asada' },
            },
            special_instructions: 'Salsa aparte',
          },
          {
            id: 'item-str',
            quantity: 1,
            name: 'Refresco',
            options_selected: 'Bien frío',
          },
        ],
      };

      currentDBOrders = [orderWithRichModifiers];
      const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
      await sleep(20);

      const parsedOrder = hook.current.orders.find((o) => o.id === 'ord-rich-mods');
      expect(parsedOrder).toBeDefined();
      expect(parsedOrder?.notes).toBe('Sin picante en ningún platillo');

      const items = parsedOrder?.items || [];
      expect(items).toHaveLength(3);

      // Item 1 (Array + item.notes)
      expect(items[0]?.mod).toContain('Orilla Rellena');
      expect(items[0]?.mod).toContain('Extra Queso');
      expect(items[0]?.mod).toContain('Masa crujiente');

      // Item 2 (Object + item.special_instructions)
      expect(items[1]?.mod).toContain('Maíz');
      expect(items[1]?.mod).toContain('Cebolla asada');
      expect(items[1]?.mod).toContain('Salsa aparte');

      // Item 3 (String)
      expect(items[2]?.mod).toBe('Bien frío');
    });

    it('debe mantener sincronizados ordersRef y recallStackRef síncronamente ante operaciones consecutivas', async () => {
      const orderA = {
        id: 'ord-sync-a',
        restaurant_id: restaurantId,
        status: 'ready',
        subtotal: 150,
        total: 150,
        delivery_address: 'Para Llevar',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        order_items: [],
      };

      currentDBOrders = [orderA];
      const hook = renderHook(() => useKDSOrders({ restaurantId }), {});
      await sleep(20);

      vi.mocked(actions.advanceOrderStatus).mockResolvedValueOnce({
        success: true,
        data: { orderId: 'ord-sync-a', previousStatus: 'ready', newStatus: 'delivered' },
      });

      // Bumping ord-sync-a a delivered
      const bumpRes = await hook.current.bumpOrder('ord-sync-a');
      expect(bumpRes.success).toBe(true);

      // recallStack debe contener inmediatamente la orden despachada
      expect(hook.current.recallStack).toHaveLength(1);
      expect(hook.current.recallStack[0]?.id).toBe('ord-sync-a');

      vi.mocked(actions.recallOrderStatus).mockResolvedValueOnce({
        success: true,
        data: { orderId: 'ord-sync-a', previousStatus: 'delivered', newStatus: 'ready' },
      });

      // Inmediatamente revertir (Recall)
      const recallRes = await hook.current.recallLastOrder();
      expect(recallRes.success).toBe(true);

      // orders debe contener de nuevo la orden restaurada en estado 'ready'
      const restored = hook.current.orders.find((o) => o.id === 'ord-sync-a');
      expect(restored).toBeDefined();
      expect(restored?.status).toBe('ready');
      expect(restored?.stage).toBe('ready');
    });
  });
});
