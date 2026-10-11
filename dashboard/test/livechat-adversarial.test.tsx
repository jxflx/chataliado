import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { useLiveChat, type UseLiveChatReturn, type EnrichedConversation } from '../src/hooks/use-live-chat';
import { soundAlerts } from '../src/lib/audio/sound-alerts';
import * as actions from '../src/app/(dashboard)/chats/actions';
import { type Conversation, type Message } from '../src/types/database';

// Mock Sound Alerts
vi.spyOn(soundAlerts, 'playNewMessageSound').mockImplementation(() => {});
vi.spyOn(soundAlerts, 'playHandoffAlertSound').mockImplementation(() => {});

// Mock Server Actions
vi.spyOn(actions, 'toggleConversationMode').mockResolvedValue({ success: true });
vi.spyOn(actions, 'toggleConversationStatus').mockResolvedValue({ success: true });
vi.spyOn(actions, 'sendHumanMessage').mockImplementation(async (params) => {
  return {
    success: true,
    data: {
      messageId: `real-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      message: {
        id: `real-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        restaurant_id: params.restaurantId,
        conversation_id: params.conversationId,
        role: 'human_agent',
        content: params.content,
        provider_message_id: 'prov-mock',
        metadata: {},
        created_at: new Date().toISOString(),
      },
    },
  };
});

// Mock Supabase Client & Realtime Channels
let realtimeCallbacks: {
  conversations?: (payload: any) => void;
  messages?: (payload: any) => void;
} = {};

const mockRemoveChannel = vi.fn();
let activeChannels: any[] = [];

const createMockChannel = (channelName: string) => {
  const channelObj = {
    name: channelName,
    on: vi.fn((type: string, filter: any, callback: (payload: any) => void) => {
      if (filter.table === 'conversations') {
        realtimeCallbacks.conversations = callback;
      } else if (filter.table === 'messages') {
        realtimeCallbacks.messages = callback;
      }
      return channelObj;
    }),
    subscribe: vi.fn(() => {
      activeChannels.push(channelObj);
      return channelObj;
    }),
  };
  return channelObj;
};

// Configurable DB query delay for race condition stress testing (0 by default for instant microtasks)
let dbQueryDelayMs = 0;
let mockDbConversations: any[] = [];
let mockDbMessages: Record<string, any[]> = {};

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'conversations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn((field: string, val: string) => ({
              order: vi.fn(async () => {
                if (dbQueryDelayMs > 0) {
                  await new Promise((resolve) => setTimeout(resolve, dbQueryDelayMs));
                }
                const filtered = mockDbConversations.filter((c) => c.restaurant_id === val);
                return { data: filtered, error: null };
              }),
            })),
          }),
        };
      }

      if (table === 'messages') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn((field1: string, restId: string) => ({
              in: vi.fn((field2: string, convoIds: string[]) => ({
                order: vi.fn(async () => {
                  if (dbQueryDelayMs > 0) {
                    await new Promise((resolve) => setTimeout(resolve, dbQueryDelayMs));
                  }
                  const res: any[] = [];
                  for (const cId of convoIds) {
                    if (mockDbMessages[cId]) {
                      res.push(...mockDbMessages[cId]);
                    }
                  }
                  return { data: res, error: null };
                }),
              })),
              eq: vi.fn((field2: string, convoId: string) => ({
                order: vi.fn(async () => {
                  if (dbQueryDelayMs > 0) {
                    await new Promise((resolve) => setTimeout(resolve, dbQueryDelayMs));
                  }
                  const msgs = mockDbMessages[convoId] || [];
                  return { data: msgs, error: null };
                }),
              })),
            })),
          }),
        };
      }

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    }),
    channel: vi.fn((channelName: string) => createMockChannel(channelName)),
    removeChannel: mockRemoveChannel.mockImplementation(async (ch) => {
      activeChannels = activeChannels.filter((c) => c !== ch);
    }),
  })),
}));

/**
 * Enhanced React 19 Hook Test Harness with Rerender and Lifecycle Cleanup
 */
class AdvancedHookHarness<TProps, TResult> {
  private hookFn: (props: TProps) => TResult;
  private props: TProps;
  private hookIndex = 0;
  private hooksState: any[] = [];
  private effectCleanups: Map<number, () => void> = new Map();
  private pendingEffects: { idx: number; effect: () => void | (() => void) }[] = [];
  public result!: TResult;

  constructor(hookFn: (props: TProps) => TResult, initialProps: TProps) {
    this.hookFn = hookFn;
    this.props = initialProps;
    this.render();
  }

  public rerender(newProps?: TProps): void {
    if (newProps !== undefined) {
      this.props = newProps;
    }
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
          // Execute previous cleanup if exists
          const oldCleanup = this.effectCleanups.get(idx);
          if (typeof oldCleanup === 'function') {
            try {
              oldCleanup();
            } catch {}
            this.effectCleanups.delete(idx);
          }
          this.hooksState[idx] = { deps, effect };
          this.pendingEffects.push({ idx, effect });
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

    // Flush pending effects
    const effectsToRun = [...this.pendingEffects];
    this.pendingEffects = [];
    for (const item of effectsToRun) {
      const cleanup = item.effect();
      if (typeof cleanup === 'function') {
        this.effectCleanups.set(item.idx, cleanup);
      }
    }
  }

  public unmount(): void {
    for (const cleanup of this.effectCleanups.values()) {
      try {
        cleanup();
      } catch {}
    }
    this.effectCleanups.clear();
  }
}

function renderHook<TProps, TResult>(hookFn: (props: TProps) => TResult, initialProps: TProps) {
  const harness = new AdvancedHookHarness(hookFn, initialProps);
  return {
    get current() {
      return harness.result;
    },
    rerender: (newProps?: TProps) => harness.rerender(newProps),
    unmount: () => harness.unmount(),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('⚔️ ADVERSARIAL STRESS & OFFENSIVE CONCURRENCY SUITE — useLiveChat Hook ⚔️', () => {
  const tenantA = '11111111-1111-4111-8111-111111111111';
  const tenantB_Victim = '99999999-9999-4999-8999-999999999999';

  beforeEach(() => {
    vi.clearAllMocks();
    realtimeCallbacks = {};
    activeChannels = [];
    dbQueryDelayMs = 0;

    // Reset default mock DB
    mockDbConversations = [
      {
        id: 'convo-tenant-a-1',
        restaurant_id: tenantA,
        customer_id: 'cust-1',
        status: 'open',
        mode: 'ai',
        created_at: '2026-08-31T10:00:00Z',
        updated_at: '2026-08-31T10:05:00Z',
        customers: {
          id: 'cust-1',
          name: 'Alice Customer',
          phone: '+5215511111111',
          notes_md: '',
        },
      },
      {
        id: 'convo-tenant-a-2',
        restaurant_id: tenantA,
        customer_id: 'cust-2',
        status: 'open',
        mode: 'human',
        created_at: '2026-08-31T09:00:00Z',
        updated_at: '2026-08-31T09:30:00Z',
        customers: {
          id: 'cust-2',
          name: 'Bob Customer',
          phone: '+5215522222222',
          notes_md: '',
        },
      },
      {
        id: 'convo-tenant-b-victim',
        restaurant_id: tenantB_Victim,
        customer_id: 'cust-victim',
        status: 'open',
        mode: 'human',
        created_at: '2026-08-31T08:00:00Z',
        updated_at: '2026-08-31T08:30:00Z',
        customers: {
          id: 'cust-victim',
          name: 'Victim Customer',
          phone: '+5215599999999',
          notes_md: '',
        },
      },
    ];

    mockDbMessages = {
      'convo-tenant-a-1': [
        {
          id: 'msg-a-1',
          restaurant_id: tenantA,
          conversation_id: 'convo-tenant-a-1',
          role: 'user',
          content: 'Mensaje 1 de Alice',
          created_at: '2026-08-31T10:01:00Z',
        },
        {
          id: 'msg-a-2',
          restaurant_id: tenantA,
          conversation_id: 'convo-tenant-a-1',
          role: 'assistant',
          content: 'Respuesta del bot',
          created_at: '2026-08-31T10:02:00Z',
        },
      ],
      'convo-tenant-a-2': [
        {
          id: 'msg-a-3',
          restaurant_id: tenantA,
          conversation_id: 'convo-tenant-a-2',
          role: 'user',
          content: 'Mensaje 1 de Bob',
          created_at: '2026-08-31T09:01:00Z',
        },
      ],
      'convo-tenant-b-victim': [
        {
          id: 'msg-victim-1',
          restaurant_id: tenantB_Victim,
          conversation_id: 'convo-tenant-b-victim',
          role: 'user',
          content: 'Datos ultra confidenciales de Tenant B',
          created_at: '2026-08-31T08:01:00Z',
        },
      ],
    };
  });

  // =========================================================================
  // 1. MULTI-TENANT ISOLATION & REALTIME INJECTION ATTACKS
  // =========================================================================
  describe('1. Multi-Tenant Isolation & Realtime Injection Attacks', () => {
    it('debe descartar mensajes Realtime de otros restaurantes (Cross-Tenant Realtime Injection)', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: tenantA, autoSelectFirst: true });
      await sleep(25);

      expect(hook.current.conversations.length).toBe(2);
      expect(hook.current.activeConversationId).toBe('convo-tenant-a-1');
      expect(realtimeCallbacks.messages).toBeDefined();

      // Intento de inyección: un evento Realtime con restaurant_id ajeno llega al canal
      realtimeCallbacks.messages!({
        eventType: 'INSERT',
        new: {
          id: 'malicious-injected-msg',
          restaurant_id: tenantB_Victim, // TENANT DIFERENTE
          conversation_id: 'convo-tenant-a-1',
          role: 'user',
          content: 'Ataque de inyección de mensaje entre tenants',
          created_at: '2026-08-31T10:10:00Z',
        },
      });

      // NO debe agregarse a los mensajes de la conversación activa
      expect(hook.current.messages.some((m) => m.id === 'malicious-injected-msg')).toBe(false);
      // NO debe sonar la alerta sonora
      expect(soundAlerts.playNewMessageSound).not.toHaveBeenCalled();
      hook.unmount();
    });

    it('debe descartar conversaciones Realtime de otros restaurantes en INSERT y UPDATE', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: tenantA });
      await sleep(25);

      // Inyección de conversación ajena
      realtimeCallbacks.conversations!({
        eventType: 'INSERT',
        new: {
          id: 'malicious-convo-foreign',
          restaurant_id: tenantB_Victim,
          customer_id: 'foreign-cust',
          status: 'open',
          mode: 'ai',
          created_at: '2026-08-31T11:00:00Z',
          updated_at: '2026-08-31T11:00:00Z',
        },
      });

      expect(hook.current.conversations.some((c) => c.id === 'malicious-convo-foreign')).toBe(false);

      // Inyección de UPDATE en conversación ajena
      realtimeCallbacks.conversations!({
        eventType: 'UPDATE',
        new: {
          id: 'convo-tenant-b-victim',
          restaurant_id: tenantB_Victim,
          customer_id: 'foreign-cust',
          status: 'open',
          mode: 'human', // Intento de disparar alerta de handoff
          created_at: '2026-08-31T08:00:00Z',
          updated_at: '2026-08-31T11:05:00Z',
        },
      });

      expect(soundAlerts.playHandoffAlertSound).not.toHaveBeenCalled();
      hook.unmount();
    });

    it('debe aislar y limpiar inmediatamente el estado al cambiar de restaurantId (Tenant Switch)', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: tenantA, autoSelectFirst: true });
      await sleep(25);

      expect(hook.current.activeConversationId).toBe('convo-tenant-a-1');
      expect(hook.current.messages.length).toBe(2);

      // Cambiamos el restaurante activo a Tenant B
      hook.rerender({ restaurantId: tenantB_Victim, autoSelectFirst: true });

      // Verificamos que activeConversationId y messages no retienen datos de Tenant A
      expect(hook.current.messages).toEqual([]);

      await sleep(25);

      // Ahora debe haber cargado solo los datos de Tenant B
      expect(hook.current.conversations.length).toBe(1);
      expect(hook.current.conversations[0]?.id).toBe('convo-tenant-b-victim');
      hook.unmount();
    });

    it('debe soportar 5 cambios rápidos sucesivos de Tenant sin fugas ni mezcla de datos', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: tenantA, autoSelectFirst: true });
      await sleep(25);

      hook.rerender({ restaurantId: tenantB_Victim, autoSelectFirst: true });
      hook.rerender({ restaurantId: tenantA, autoSelectFirst: true });
      hook.rerender({ restaurantId: tenantB_Victim, autoSelectFirst: true });
      hook.rerender({ restaurantId: tenantA, autoSelectFirst: true });

      await sleep(35);

      expect(hook.current.conversations.every((c) => c.restaurant_id === tenantA)).toBe(true);
      expect(hook.current.messages.every((m) => m.restaurant_id === tenantA)).toBe(true);
      hook.unmount();
    });
  });

  // =========================================================================
  // 2. CONCURRENCY & RAPID CONVERSATION SWITCHING RACE CONDITIONS
  // =========================================================================
  describe('2. Rapid Active Conversation Switching & Race Conditions', () => {
    it('debe manejar cambios rápidos de conversación sin mostrar datos de conversaciones anteriores', async () => {
      dbQueryDelayMs = 20; // Latencia simulada en la base de datos
      const hook = renderHook(useLiveChat, { restaurantId: tenantA });
      await sleep(35);

      // Cambio rápido 1: selecciona convo-tenant-a-1
      hook.current.selectConversation('convo-tenant-a-1');
      // Inmediatamente cambia a convo-tenant-a-2 antes de que resuelva el primero
      hook.current.selectConversation('convo-tenant-a-2');

      await sleep(60);

      expect(hook.current.activeConversationId).toBe('convo-tenant-a-2');
      expect(hook.current.messages.length).toBe(1);
      expect(hook.current.messages[0]?.id).toBe('msg-a-3');
      expect(hook.current.messages.some((m) => m.id === 'msg-a-1')).toBe(false);
      hook.unmount();
    });

    it('no debe perder mensajes Realtime que llegan mientras se cargan los mensajes iniciales', async () => {
      dbQueryDelayMs = 35;
      const hook = renderHook(useLiveChat, { restaurantId: tenantA });
      await sleep(45);

      // Selecciona conversación (inicia fetch con 35ms de latencia)
      hook.current.selectConversation('convo-tenant-a-1');

      // A los 10ms (fetch aún en vuelo), llega un mensaje por Realtime
      await sleep(10);
      realtimeCallbacks.messages!({
        eventType: 'INSERT',
        new: {
          id: 'realtime-in-flight-msg',
          restaurant_id: tenantA,
          conversation_id: 'convo-tenant-a-1',
          role: 'user',
          content: 'Mensaje llegado durante la carga inicial',
          created_at: '2026-08-31T10:03:00Z',
        },
      });

      // Esperamos que termine el fetch inicial
      await sleep(60);

      // El mensaje Realtime DEBE preservarse y combinarse con los datos del fetch
      expect(hook.current.messages.some((m) => m.id === 'realtime-in-flight-msg')).toBe(true);
      expect(hook.current.messages.length).toBe(3); // 2 de DB + 1 de Realtime
      hook.unmount();
    });

    it('debe mantener orden cronológico estricto ante mensajes Realtime fuera de orden', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: tenantA, autoSelectFirst: true });
      await sleep(25);

      // Inyectamos mensaje con timestamp posterior
      realtimeCallbacks.messages!({
        eventType: 'INSERT',
        new: {
          id: 'msg-later',
          restaurant_id: tenantA,
          conversation_id: 'convo-tenant-a-1',
          role: 'user',
          content: 'Mensaje posterior',
          created_at: '2026-08-31T10:10:00Z',
        },
      });

      // Inyectamos mensaje que llegó desordenado con timestamp anterior
      realtimeCallbacks.messages!({
        eventType: 'INSERT',
        new: {
          id: 'msg-earlier',
          restaurant_id: tenantA,
          conversation_id: 'convo-tenant-a-1',
          role: 'user',
          content: 'Mensaje retrasado en la red',
          created_at: '2026-08-31T10:05:00Z',
        },
      });

      const msgIds = hook.current.messages.map((m) => m.id);
      expect(msgIds.indexOf('msg-earlier')).toBeLessThan(msgIds.indexOf('msg-later'));
      expect(hook.current.conversations[0]?.last_message?.id).toBe('msg-later');
      hook.unmount();
    });
  });

  // =========================================================================
  // 3. HIGH-CONCURRENCY OPTIMISTIC SENDS (sendMessage Ráfagas)
  // =========================================================================
  describe('3. High-Concurrency Optimistic Send Stress', () => {
    it('debe soportar 10 envíos concurrentes rápidos (sendMessage) sin colisiones de IDs ni duplicados', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: tenantA, autoSelectFirst: true });
      await sleep(25);

      const sendPromises = Array.from({ length: 10 }).map((_, i) =>
        hook.current.sendMessage(`Mensaje concurrente #${i + 1}`)
      );

      const results = await Promise.all(sendPromises);

      for (const res of results) {
        expect(res.success).toBe(true);
      }

      // No debe haber ningún ID temporal remanente tras la resolución
      const hasTempIds = hook.current.messages.some((m) => m.id.startsWith('temp-'));
      expect(hasTempIds).toBe(false);

      // Deben existir todos los 10 mensajes más los 2 iniciales
      expect(hook.current.messages.length).toBe(12);

      // Verificamos que la conversación tenga un last_message con ID real
      expect(hook.current.conversations[0]?.last_message?.id.startsWith('temp-')).toBe(false);
      hook.unmount();
    });

    it('debe revertir limpiamente el estado en messages y conversations si sendMessage falla', async () => {
      vi.mocked(actions.sendHumanMessage).mockRejectedValueOnce(new Error('Network Crash'));

      const hook = renderHook(useLiveChat, { restaurantId: tenantA, autoSelectFirst: true });
      await sleep(25);

      const previousLastMessageId = hook.current.conversations[0]?.last_message?.id;

      const res = await hook.current.sendMessage('Este mensaje va a fallar');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Network Crash');

      // El mensaje temporal debe ser eliminado de messages
      expect(hook.current.messages.some((m) => m.content === 'Este mensaje va a fallar')).toBe(false);

      // El last_message de conversations debe restaurarse a su valor previo
      expect(hook.current.conversations[0]?.last_message?.id).toBe(previousLastMessageId);
      hook.unmount();
    });

    it('debe manejar ráfagas de 20 mensajes concurrentes con fallos mixtos simulados', async () => {
      vi.mocked(actions.sendHumanMessage).mockImplementation(async (params) => {
        if (params.content.includes('FALLA')) {
          return { success: false, error: 'Simulated Network Failure' };
        }
        return {
          success: true,
          data: {
            messageId: `real-mixed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            message: {
              id: `real-mixed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              restaurant_id: params.restaurantId,
              conversation_id: params.conversationId,
              role: 'human_agent',
              content: params.content,
              provider_message_id: 'prov-mixed',
              metadata: {},
              created_at: new Date().toISOString(),
            },
          },
        };
      });

      const hook = renderHook(useLiveChat, { restaurantId: tenantA, autoSelectFirst: true });
      await sleep(25);

      const promises = Array.from({ length: 20 }).map((_, i) =>
        hook.current.sendMessage(i % 2 === 0 ? `Mensaje OK #${i}` : `Mensaje FALLA #${i}`)
      );

      const results = await Promise.all(promises);

      const successes = results.filter((r) => r.success).length;
      const failures = results.filter((r) => !r.success).length;

      expect(successes).toBe(10);
      expect(failures).toBe(10);

      // Ningún mensaje temporal remanente
      expect(hook.current.messages.some((m) => m.id.startsWith('temp-'))).toBe(false);
      // Solo 2 iniciales + 10 exitosos = 12 mensajes
      expect(hook.current.messages.length).toBe(12);
      hook.unmount();
    });
  });

  // =========================================================================
  // 4. REALTIME DEDUPLICATION & REPLAY ATTACKS
  // =========================================================================
  describe('4. Realtime Deduplication, Replay & Flooding Attacks', () => {
    it('debe deduplicar 10 eventos INSERT idénticos en messages y disparar la alerta sonora exactamente 1 vez', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: tenantA, autoSelectFirst: true });
      await sleep(25);

      const duplicatePayload = {
        eventType: 'INSERT',
        new: {
          id: 'duplicate-message-attack-id',
          restaurant_id: tenantA,
          conversation_id: 'convo-tenant-a-1',
          role: 'user',
          content: 'Ataque de repetición Realtime',
          created_at: '2026-08-31T10:20:00Z',
        },
      };

      // Disparamos 10 ráfagas con el mismo mensaje
      for (let i = 0; i < 10; i++) {
        realtimeCallbacks.messages!(duplicatePayload);
      }

      const matchingMessages = hook.current.messages.filter((m) => m.id === 'duplicate-message-attack-id');
      expect(matchingMessages.length).toBe(1);

      // La alerta sonora solo debe ejecutarse 1 vez
      expect(soundAlerts.playNewMessageSound).toHaveBeenCalledTimes(1);
      hook.unmount();
    });

    it('debe deduplicar 10 eventos INSERT idénticos en conversations', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: tenantA });
      await sleep(25);

      const duplicateConvoPayload = {
        eventType: 'INSERT',
        new: {
          id: 'convo-replayed-insert',
          restaurant_id: tenantA,
          customer_id: 'cust-dup',
          status: 'open',
          mode: 'ai',
          created_at: '2026-08-31T11:00:00Z',
          updated_at: '2026-08-31T11:00:00Z',
        },
      };

      for (let i = 0; i < 10; i++) {
        realtimeCallbacks.conversations!(duplicateConvoPayload);
      }

      const matching = hook.current.conversations.filter((c) => c.id === 'convo-replayed-insert');
      expect(matching.length).toBe(1);
      hook.unmount();
    });
  });

  // =========================================================================
  // 5. DESTRUCTIVE, MALFORMED & INJECTION RESILIENCE
  // =========================================================================
  describe('5. Destructive & Malformed Realtime Event Resilience', () => {
    it('debe eliminar la conversación y limpiar activeConversationId y messages ante DELETE', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: tenantA, autoSelectFirst: true });
      await sleep(25);

      expect(hook.current.activeConversationId).toBe('convo-tenant-a-1');
      expect(hook.current.messages.length).toBe(2);

      // Evento DELETE para la conversación activa
      realtimeCallbacks.conversations!({
        eventType: 'DELETE',
        old: { id: 'convo-tenant-a-1' },
      });

      expect(hook.current.conversations.some((c) => c.id === 'convo-tenant-a-1')).toBe(false);
      expect(hook.current.activeConversationId).toBeNull();
      expect(hook.current.messages).toEqual([]);
      hook.unmount();
    });

    it('debe tolerar eventos DELETE con payload malformado o null sin lanzar excepciones', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: tenantA });
      await sleep(25);

      expect(() => {
        realtimeCallbacks.conversations!({
          eventType: 'DELETE',
          old: null, // Payload malformado
        });

        realtimeCallbacks.conversations!({
          eventType: 'DELETE',
          old: {}, // Sin id
        });
      }).not.toThrow();

      hook.unmount();
    });

    it('debe tolerar eventos Realtime con campos vacíos o nulos', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: tenantA, autoSelectFirst: true });
      await sleep(25);

      expect(() => {
        realtimeCallbacks.messages!({
          eventType: 'INSERT',
          new: {
            id: 'msg-empty-nulls',
            restaurant_id: tenantA,
            conversation_id: 'convo-tenant-a-1',
            role: 'assistant',
            content: '',
            created_at: new Date().toISOString(),
          },
        });
      }).not.toThrow();

      hook.unmount();
    });

    it('debe filtrar de forma segura ante búsquedas con metacaracteres de expresiones regulares', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: tenantA });
      await sleep(25);

      const regexInjections = ['[.*+?^${}()|[\\]\\]', '.*', '(?=.*a)', '\\d+', 'null', 'undefined', '()'];

      for (const injection of regexInjections) {
        expect(() => {
          hook.current.setSearchQuery(injection);
        }).not.toThrow();
        expect(Array.isArray(hook.current.filteredConversations)).toBe(true);
      }
      hook.unmount();
    });
  });

  // =========================================================================
  // 6. SUBSCRIPTION CLEANUP & CONCURRENCY ON REFRESH
  // =========================================================================
  describe('6. Subscription Cleanup & Concurrency on Refresh', () => {
    it('debe cancelar y desuscribir canales al desmontar sin fugas de suscripción', () => {
      const hook = renderHook(useLiveChat, { restaurantId: tenantA });
      expect(activeChannels.length).toBe(1);

      hook.unmount();
      expect(mockRemoveChannel).toHaveBeenCalled();
    });

    it('debe manejar múltiples refresh() concurrentes y resolver siempre el estado más reciente', async () => {
      dbQueryDelayMs = 15;
      const hook = renderHook(useLiveChat, { restaurantId: tenantA });
      await sleep(25);

      // Lanzamos 5 refresh en paralelo
      const refreshPromises = [
        hook.current.refresh(),
        hook.current.refresh(),
        hook.current.refresh(),
        hook.current.refresh(),
      ];

      await Promise.all(refreshPromises);

      expect(hook.current.conversations.length).toBe(2);
      expect(hook.current.loading).toBe(false);
      hook.unmount();
    });
  });
});
