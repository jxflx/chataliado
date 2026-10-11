import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { useLiveChat, type UseLiveChatReturn, type EnrichedConversation } from '../src/hooks/use-live-chat';
import { soundAlerts } from '../src/lib/audio/sound-alerts';
import * as actions from '../src/app/(dashboard)/chats/actions';

// Mock Sound Alerts
vi.spyOn(soundAlerts, 'playNewMessageSound').mockImplementation(() => {});
vi.spyOn(soundAlerts, 'playHandoffAlertSound').mockImplementation(() => {});

// Mock Server Actions
vi.spyOn(actions, 'toggleConversationMode').mockResolvedValue({ success: true });
vi.spyOn(actions, 'toggleConversationStatus').mockResolvedValue({ success: true });
vi.spyOn(actions, 'sendHumanMessage').mockResolvedValue({
  success: true,
  data: {
    messageId: 'real-msg-id-123',
    message: {
      id: 'real-msg-id-123',
      restaurant_id: 'rest-1',
      conversation_id: 'convo-1',
      role: 'human_agent',
      content: 'Respuesta del operador',
      provider_message_id: 'prov-123',
      metadata: {},
      created_at: new Date().toISOString(),
    },
  },
});

// Mock Supabase Client
let realtimeCallbacks: {
  conversations?: (payload: any) => void;
  messages?: (payload: any) => void;
} = {};

const mockRemoveChannel = vi.fn();

const mockChannel = {
  on: vi.fn((type: string, filter: any, callback: (payload: any) => void) => {
    if (filter.table === 'conversations') {
      realtimeCallbacks.conversations = callback;
    } else if (filter.table === 'messages') {
      realtimeCallbacks.messages = callback;
    }
    return mockChannel;
  }),
  subscribe: vi.fn(() => mockChannel),
};

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'conversations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'convo-1',
                    restaurant_id: 'rest-1',
                    customer_id: 'cust-1',
                    status: 'open',
                    mode: 'ai',
                    created_at: '2026-08-31T10:00:00Z',
                    updated_at: '2026-08-31T10:05:00Z',
                    customers: {
                      id: 'cust-1',
                      name: 'Juan Perez',
                      phone: '5215512345678',
                      notes_md: '# Notas Juan',
                    },
                  },
                  {
                    id: 'convo-2',
                    restaurant_id: 'rest-1',
                    customer_id: 'cust-2',
                    status: 'closed',
                    mode: 'human',
                    created_at: '2026-08-31T09:00:00Z',
                    updated_at: '2026-08-31T09:30:00Z',
                    customers: {
                      id: 'cust-2',
                      name: 'Maria Lopez',
                      phone: '5215598765432',
                      notes_md: '',
                    },
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'messages') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'msg-1',
                      restaurant_id: 'rest-1',
                      conversation_id: 'convo-1',
                      role: 'user',
                      content: 'Quiero una pizza pepperoni',
                      provider_message_id: 'wamid-1',
                      metadata: {},
                      created_at: '2026-08-31T10:05:00Z',
                    },
                    {
                      id: 'msg-2',
                      restaurant_id: 'rest-1',
                      conversation_id: 'convo-2',
                      role: 'assistant',
                      content: 'Pedido entregado, gracias',
                      provider_message_id: 'wamid-2',
                      metadata: {},
                      created_at: '2026-08-31T09:30:00Z',
                    },
                  ],
                  error: null,
                }),
              }),
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'msg-1',
                      restaurant_id: 'rest-1',
                      conversation_id: 'convo-1',
                      role: 'user',
                      content: 'Quiero una pizza pepperoni',
                      provider_message_id: 'wamid-1',
                      metadata: {},
                      created_at: '2026-08-31T10:05:00Z',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    }),
    channel: vi.fn(() => mockChannel),
    removeChannel: mockRemoveChannel,
  })),
}));

/**
 * Universal React 19 Hook Harness for Node.js
 */
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

    // Flush pending effects
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

describe('useLiveChat Hook — Realtime Store & Reactive Chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeCallbacks = {};
  });

  describe('1. Carga Inicial y Estado Reactivo', () => {
    it('debe inicializarse con estado vacío si no se provee restaurantId', () => {
      const hook = renderHook(useLiveChat, { restaurantId: null });
      expect(hook.current.conversations).toEqual([]);
      expect(hook.current.loading).toBe(false);
      hook.unmount();
    });

    it('debe cargar conversaciones enriquecidas con datos de cliente y último mensaje', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: 'rest-1' });
      await sleep(15);

      expect(hook.current.conversations.length).toBe(2);
      expect(hook.current.conversations[0]?.id).toBe('convo-1');
      expect(hook.current.conversations[0]?.customer?.name).toBe('Juan Perez');
      expect(hook.current.conversations[0]?.last_message?.content).toBe('Quiero una pizza pepperoni');
      expect(hook.current.loading).toBe(false);
      hook.unmount();
    });

    it('debe auto-seleccionar la primera conversación si autoSelectFirst es true', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: 'rest-1', autoSelectFirst: true });
      await sleep(15);

      expect(hook.current.activeConversationId).toBe('convo-1');
      expect(hook.current.activeConversation?.customer?.name).toBe('Juan Perez');
      hook.unmount();
    });
  });

  describe('2. Selección de Conversación y Carga de Mensajes', () => {
    it('debe cargar mensajes al seleccionar una conversación', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: 'rest-1' });
      await sleep(15);

      hook.current.selectConversation('convo-1');
      await sleep(15);

      expect(hook.current.activeConversationId).toBe('convo-1');
      expect(hook.current.messages.length).toBe(1);
      expect(hook.current.messages[0]?.content).toBe('Quiero una pizza pepperoni');
      hook.unmount();
    });

    it('debe vaciar mensajes si se deselecciona la conversación', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: 'rest-1', autoSelectFirst: true });
      await sleep(15);

      hook.current.selectConversation(null);
      await sleep(15);

      expect(hook.current.activeConversationId).toBeNull();
      expect(hook.current.messages).toEqual([]);
      hook.unmount();
    });
  });

  describe('3. Filtrado Reactivo en Memoria', () => {
    it('debe filtrar por estado (open / closed)', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: 'rest-1' });
      await sleep(15);

      hook.current.setStatusFilter('open');
      expect(hook.current.filteredConversations.length).toBe(1);
      expect(hook.current.filteredConversations[0]?.id).toBe('convo-1');

      hook.current.setStatusFilter('closed');
      expect(hook.current.filteredConversations.length).toBe(1);
      expect(hook.current.filteredConversations[0]?.id).toBe('convo-2');

      hook.current.setStatusFilter('all');
      expect(hook.current.filteredConversations.length).toBe(2);
      hook.unmount();
    });

    it('debe filtrar por modo (ai / human)', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: 'rest-1' });
      await sleep(15);

      hook.current.setModeFilter('ai');
      expect(hook.current.filteredConversations.length).toBe(1);
      expect(hook.current.filteredConversations[0]?.id).toBe('convo-1');

      hook.current.setModeFilter('human');
      expect(hook.current.filteredConversations.length).toBe(1);
      expect(hook.current.filteredConversations[0]?.id).toBe('convo-2');
      hook.unmount();
    });

    it('debe buscar por nombre de cliente, teléfono o contenido de mensaje', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: 'rest-1' });
      await sleep(15);

      // Búsqueda por nombre
      hook.current.setSearchQuery('maria');
      expect(hook.current.filteredConversations.length).toBe(1);
      expect(hook.current.filteredConversations[0]?.customer?.name).toBe('Maria Lopez');

      // Búsqueda por teléfono
      hook.current.setSearchQuery('551234');
      expect(hook.current.filteredConversations.length).toBe(1);
      expect(hook.current.filteredConversations[0]?.customer?.phone).toBe('5215512345678');

      // Búsqueda por último mensaje
      hook.current.setSearchQuery('pepperoni');
      expect(hook.current.filteredConversations.length).toBe(1);
      expect(hook.current.filteredConversations[0]?.id).toBe('convo-1');
      hook.unmount();
    });
  });

  describe('4. Eventos Supabase Realtime & Alertas Sonoras', () => {
    it('debe agregar nuevas conversaciones ante eventos Realtime INSERT', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: 'rest-1' });
      await sleep(15);

      expect(realtimeCallbacks.conversations).toBeDefined();

      realtimeCallbacks.conversations!({
        eventType: 'INSERT',
        new: {
          id: 'convo-3',
          restaurant_id: 'rest-1',
          customer_id: 'cust-3',
          status: 'open',
          mode: 'ai',
          created_at: '2026-08-31T11:00:00Z',
          updated_at: '2026-08-31T11:00:00Z',
        },
      });

      expect(hook.current.conversations.length).toBe(3);
      expect(hook.current.conversations[0]?.id).toBe('convo-3');
      hook.unmount();
    });

    it('debe disparar alerta de handoff cuando el modo cambia a human en UPDATE', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: 'rest-1' });
      await sleep(15);

      realtimeCallbacks.conversations!({
        eventType: 'UPDATE',
        new: {
          id: 'convo-1',
          restaurant_id: 'rest-1',
          customer_id: 'cust-1',
          status: 'open',
          mode: 'human',
          created_at: '2026-08-31T10:00:00Z',
          updated_at: '2026-08-31T10:10:00Z',
        },
      });

      expect(soundAlerts.playHandoffAlertSound).toHaveBeenCalledTimes(1);
      expect(hook.current.conversations.find((c: any) => c.id === 'convo-1')?.mode).toBe('human');
      hook.unmount();
    });

    it('debe disparar chime sonoro y actualizar mensajes ante Realtime INSERT en messages', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: 'rest-1', autoSelectFirst: true });
      await sleep(15);

      expect(realtimeCallbacks.messages).toBeDefined();

      realtimeCallbacks.messages!({
        eventType: 'INSERT',
        new: {
          id: 'msg-new-99',
          restaurant_id: 'rest-1',
          conversation_id: 'convo-1',
          role: 'user',
          content: '¿Cuánto tiempo tarda la entrega?',
          provider_message_id: 'wamid-99',
          metadata: {},
          created_at: '2026-08-31T10:15:00Z',
        },
      });

      expect(soundAlerts.playNewMessageSound).toHaveBeenCalledTimes(1);
      expect(hook.current.messages.some((m: any) => m.id === 'msg-new-99')).toBe(true);
      expect(hook.current.conversations[0]?.last_message?.content).toBe('¿Cuánto tiempo tarda la entrega?');
      hook.unmount();
    });
  });

  describe('5. Acciones Optimistas (sendMessage, setMode, setStatus)', () => {
    it('debe realizar inserción optimista y reemplazar con mensaje real al enviar', async () => {
      const hook = renderHook(useLiveChat, { restaurantId: 'rest-1', autoSelectFirst: true });
      await sleep(15);

      const sendResult = await hook.current.sendMessage('Hola, tu pizza sale en 10 min');

      expect(sendResult.success).toBe(true);
      expect(actions.sendHumanMessage).toHaveBeenCalledWith({
        restaurantId: 'rest-1',
        conversationId: 'convo-1',
        phone: '5215512345678',
        content: 'Hola, tu pizza sale en 10 min',
      });

      expect(hook.current.messages.some((m: any) => m.id === 'real-msg-id-123')).toBe(true);
      hook.unmount();
    });

    it('debe revertir el mensaje optimista si sendHumanMessage falla', async () => {
      vi.mocked(actions.sendHumanMessage).mockResolvedValueOnce({
        success: false,
        error: 'Error de conexión con WhatsApp',
      });

      const hook = renderHook(useLiveChat, { restaurantId: 'rest-1', autoSelectFirst: true });
      await sleep(15);

      const sendResult = await hook.current.sendMessage('Mensaje que fallará');

      expect(sendResult.success).toBe(false);
      expect(sendResult.error).toContain('Error de conexión');
      expect(hook.current.messages.some((m: any) => m.content === 'Mensaje que fallará')).toBe(false);
      hook.unmount();
    });

    it('debe alternar modo optimísticamente y revertir en caso de error', async () => {
      vi.mocked(actions.toggleConversationMode).mockResolvedValueOnce({
        success: false,
        error: 'Forbidden',
      });

      const hook = renderHook(useLiveChat, { restaurantId: 'rest-1', autoSelectFirst: true });
      await sleep(15);

      const res = await hook.current.setMode('human');

      expect(res.success).toBe(false);
      expect(hook.current.conversations.find((c: any) => c.id === 'convo-1')?.mode).toBe('ai');
      hook.unmount();
    });

    it('debe alternar estado optimísticamente y revertir en caso de error', async () => {
      vi.mocked(actions.toggleConversationStatus).mockResolvedValueOnce({
        success: false,
        error: 'Network timeout',
      });

      const hook = renderHook(useLiveChat, { restaurantId: 'rest-1', autoSelectFirst: true });
      await sleep(15);

      const res = await hook.current.setStatus('closed');

      expect(res.success).toBe(false);
      expect(hook.current.conversations.find((c: any) => c.id === 'convo-1')?.status).toBe('open');
      hook.unmount();
    });
  });

  describe('6. Controles de Audio y Limpieza', () => {
    it('debe permitir alternar el estado del sonido con toggleSound', () => {
      const hook = renderHook(useLiveChat, { restaurantId: 'rest-1' });
      const initial = hook.current.soundEnabled;

      hook.current.toggleSound();

      expect(hook.current.soundEnabled).toBe(!initial);
      hook.unmount();
    });

    it('debe desuscribirse del canal Realtime al desmontar', () => {
      const hook = renderHook(useLiveChat, { restaurantId: 'rest-1' });
      hook.unmount();
      expect(mockRemoveChannel).toHaveBeenCalled();
    });
  });
});
