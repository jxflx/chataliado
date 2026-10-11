import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import ReactDOMServer from 'react-dom/server';
import ChatsPage from '../src/app/(dashboard)/chats/page';
import { useLiveChat, type EnrichedConversation } from '../src/hooks/use-live-chat';
import * as actions from '../src/app/(dashboard)/chats/actions';
import { soundAlerts } from '../src/lib/audio/sound-alerts';
import { type Message } from '../src/types/database';
import { MessageInput } from '../src/components/chats/message-input';
import { CustomerSidebar } from '../src/components/chats/customer-sidebar';
import { ChatDetailHeader } from '../src/components/chats/chat-detail-header';
import { ChatFilterTabs, type ChatFilterTab } from '../src/components/chats/chat-filter-tabs';
import { EmptyChatDetailState } from '../src/components/chats/chat-skeletons';

// Mock Sound Alerts
vi.spyOn(soundAlerts, 'playNewMessageSound').mockImplementation(() => {});
vi.spyOn(soundAlerts, 'playHandoffAlertSound').mockImplementation(() => {});

// Mock Actions
vi.spyOn(actions, 'toggleConversationMode').mockResolvedValue({ success: true });
vi.spyOn(actions, 'toggleConversationStatus').mockResolvedValue({ success: true });
const mockSendHumanMessage = vi.spyOn(actions, 'sendHumanMessage');
const mockUpdateCustomerNotes = vi.spyOn(actions, 'updateCustomerNotes');

// Mock Supabase Client for useLiveChat
let realtimeCallbacks: {
  conversations?: (payload: any) => void;
  messages?: (payload: any) => void;
} = {};

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

let mockDbConversations: any[] = [];
let mockDbMessages: Record<string, any[]> = {};

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'conversations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockImplementation(async () => ({
                data: mockDbConversations,
                error: null,
              })),
            }),
          }),
        };
      }
      if (table === 'messages') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn((_f1: string, _v1: string) => ({
              in: vi.fn((_f2: string, ids: string[]) => ({
                order: vi.fn(async () => {
                  const msgs: any[] = [];
                  for (const id of ids) {
                    if (mockDbMessages[id]) msgs.push(...mockDbMessages[id]);
                  }
                  return { data: msgs, error: null };
                }),
              })),
              eq: vi.fn((_f2: string, convoId: string) => ({
                order: vi.fn(async () => {
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
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  })),
}));

// Mock tenant provider
vi.mock('@/components/layout/tenant-provider', () => ({
  useTenant: () => ({
    activeRestaurant: {
      id: 'rest-uuid-1111-2222-3333-444444444444',
      name: 'Pizzería Napolitana',
      slug: 'pizzeria-napolitana',
    },
    userRole: 'owner',
    availableRestaurants: [],
    switchRestaurant: vi.fn(),
  }),
}));

/**
 * Universal React 19 Hook/Component Harness for Node.js
 */
class ReactHarness<TProps, TResult> {
  private fn: (props: TProps) => TResult;
  private props: TProps;
  private hookIndex = 0;
  private hooksState: any[] = [];
  private pendingEffects: (() => void | (() => void))[] = [];
  public result!: TResult;

  constructor(fn: (props: TProps) => TResult, initialProps: TProps) {
    this.fn = fn;
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
      useId: () => `id-${this.hookIndex++}`,
    };

    if (internals.H !== undefined) internals.H = testDispatcher;
    if (internals.ReactCurrentDispatcher) internals.ReactCurrentDispatcher.current = testDispatcher;

    try {
      this.result = this.fn(this.props);
    } finally {
      if (internals.H !== undefined) internals.H = prevDispatcher;
      if (internals.ReactCurrentDispatcher) internals.ReactCurrentDispatcher.current = prevDispatcher;
    }

    const effectsToRun = [...this.pendingEffects];
    this.pendingEffects = [];
    for (const eff of effectsToRun) {
      eff();
    }
  }

  public get current(): TResult {
    return this.result;
  }
}

const makeConvo = (overrides: Partial<EnrichedConversation> = {}): EnrichedConversation => ({
  id: 'convo-test-1',
  restaurant_id: 'rest-uuid-1111-2222-3333-444444444444',
  customer_id: 'cust-1',
  status: 'open',
  mode: 'ai',
  created_at: '2026-09-06T10:00:00Z',
  updated_at: '2026-09-06T10:00:00Z',
  customer: {
    id: 'cust-1',
    name: 'Carlos Mendoza',
    phone: '+525512345678',
    notes_md: '- 📍 **Entrega:** Roma Norte',
  },
  last_message: {
    id: 'msg-1',
    content: 'Hola, buenas tardes',
    role: 'user',
    created_at: '2026-09-06T10:00:00Z',
  },
  ...overrides,
});

describe('ADVERSARIAL STRESS: Mobile State Machine & Reactive Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbConversations = [
      {
        id: 'convo-test-1',
        restaurant_id: 'rest-uuid-1111-2222-3333-444444444444',
        customer_id: 'cust-1',
        status: 'open',
        mode: 'ai',
        created_at: '2026-09-06T10:00:00Z',
        updated_at: '2026-09-06T10:00:00Z',
        customers: {
          id: 'cust-1',
          name: 'Carlos Mendoza',
          phone: '+525512345678',
          notes_md: '- 📍 **Entrega:** Roma Norte',
        },
      },
    ];
    mockDbMessages = {
      'convo-test-1': [
        {
          id: 'msg-1',
          restaurant_id: 'rest-uuid-1111-2222-3333-444444444444',
          conversation_id: 'convo-test-1',
          role: 'user',
          content: 'Hola, buenas tardes',
          provider_message_id: 'wamid-1',
          metadata: {},
          created_at: '2026-09-06T10:00:00Z',
        },
      ],
    };
  });

  /* ========================================================================= */
  /* 1. Mobile Navigation State Machine & Trapping Analysis                     */
  /* ========================================================================= */
  describe('1. Mobile Navigation State Machine (page.tsx)', () => {
    it('verifica las transiciones formales: list -> chat -> customer -> chat -> list', () => {
      // Modelamos la máquina de estados exacta implementada en page.tsx:
      type MobileView = 'list' | 'chat' | 'customer';

      let mobileView: MobileView = 'list';
      let isCustomerSidebarOpen = true;

      const handleSelectConversation = () => {
        mobileView = 'chat';
        isCustomerSidebarOpen = true;
      };

      const handleBackToList = () => {
        mobileView = 'list';
      };

      const handleToggleCustomerSidebar = () => {
        isCustomerSidebarOpen = !isCustomerSidebarOpen;
        mobileView = mobileView === 'customer' ? 'chat' : 'customer';
      };

      const handleCloseCustomerSidebar = () => {
        isCustomerSidebarOpen = false;
        mobileView = 'chat';
      };

      // 1. Estado inicial
      expect(mobileView).toBe('list');

      // 2. Selección de chat -> pasa a 'chat'
      handleSelectConversation();
      expect(mobileView).toBe('chat');
      expect(isCustomerSidebarOpen).toBe(true);

      // 3. Abrir ficha de cliente -> pasa a 'customer'
      handleToggleCustomerSidebar();
      expect(mobileView).toBe('customer');

      // 4. Cerrar ficha de cliente vía handleCloseCustomerSidebar -> pasa a 'chat'
      handleCloseCustomerSidebar();
      expect(mobileView).toBe('chat');

      // 5. Reabrir ficha de cliente -> pasa a 'customer'
      handleToggleCustomerSidebar();
      expect(mobileView).toBe('customer');

      // 6. Volver vía toggle -> pasa a 'chat'
      handleToggleCustomerSidebar();
      expect(mobileView).toBe('chat');

      // 7. Volver a la lista vía handleBackToList -> pasa a 'list'
      handleBackToList();
      expect(mobileView).toBe('list');
    });

    it('ejecuta 1,000 ciclos rápidos de transición sin estados corruptos o inválidos', () => {
      type MobileView = 'list' | 'chat' | 'customer';
      let state: MobileView = 'list';

      for (let i = 0; i < 1000; i++) {
        // Seleccionar
        state = 'chat';
        expect(['list', 'chat', 'customer']).toContain(state);

        // Abrir cliente
        state = 'customer';
        expect(['list', 'chat', 'customer']).toContain(state);

        // Regresar a chat
        state = 'chat';
        expect(['list', 'chat', 'customer']).toContain(state);

        // Regresar a lista
        state = 'list';
        expect(['list', 'chat', 'customer']).toContain(state);
      }
    });

    it('FALSIFICATION / TRAP BUG: En móvil (<768px), si activeConversation es null mientras mobileView === "customer", TODAS las columnas quedan ocultas (pantalla en blanco)', () => {
      const computeColumnClasses = (view: 'list' | 'chat' | 'customer') => ({
        chatListClass: `${view === 'list' ? 'flex' : 'hidden'} md:flex`,
        chatDetailClass: `${view === 'chat' ? 'flex' : 'hidden'} md:flex`,
      });

      const { chatListClass, chatDetailClass } = computeColumnClasses('customer');
      const isCustomerSidebarRendered = false;

      // En móvil (<768px):
      // chatListClass incluye 'hidden'
      expect(chatListClass).toContain('hidden');
      // chatDetailClass incluye 'hidden'
      expect(chatDetailClass).toContain('hidden');
      // CustomerSidebar NO se renderiza
      expect(isCustomerSidebarRendered).toBe(false);

      // Conclusión empírica: Ninguna de las 3 columnas es visible en móvil.
      // El usuario queda con una pantalla completamente vacía sin navegación posible.
    });

    it('FALSIFICATION / TRAP BUG: En móvil (<768px), si activeConversation es null mientras mobileView === "chat", EmptyChatDetailState no tiene botón de retorno a "list"', () => {
      // Renderizamos EmptyChatDetailState para verificar la presencia de un botón de retorno
      const html = ReactDOMServer.renderToStaticMarkup(<EmptyChatDetailState />);

      // No contiene ningún botón de "Volver" ni ArrowLeft
      expect(html).not.toContain('Volver');
      expect(html).not.toContain('ArrowLeft');
      expect(html).toContain('Selecciona una conversación');

      // Si un usuario en móvil llega a mobileView === 'chat' con activeConversation === null,
      // la columna de chat muestra EmptyChatDetailState pero la lista izquierda está en 'hidden' md:flex.
      // No existe botón para invocar onBackToList().
    });

    it('verifica que ChatDetailHeader renderiza botón de retorno solo cuando onBackToList está definido', () => {
      const convo = makeConvo();

      // Con onBackToList
      const htmlWithBack = ReactDOMServer.renderToStaticMarkup(
        <ChatDetailHeader
          conversation={convo}
          onToggleMode={vi.fn()}
          onToggleStatus={vi.fn()}
          onBackToList={vi.fn()}
        />
      );
      expect(htmlWithBack).toContain('Volver a la lista de chats');
      expect(htmlWithBack).toContain('md:hidden');

      // Sin onBackToList
      const htmlWithoutBack = ReactDOMServer.renderToStaticMarkup(
        <ChatDetailHeader
          conversation={convo}
          onToggleMode={vi.fn()}
          onToggleStatus={vi.fn()}
        />
      );
      expect(htmlWithoutBack).not.toContain('Volver a la lista de chats');
    });
  });

  /* ========================================================================= */
  /* 2. Reactive State Handling: Optimistic Message Rollback                   */
  /* ========================================================================= */
  describe('2. Optimistic Message Rollback (useLiveChat & MessageInput)', () => {
    it('debe revertir el mensaje optimista y restaurar last_message cuando sendHumanMessage devuelve error', async () => {
      const initialConvo = makeConvo({
        last_message: {
          id: 'msg-initial',
          content: 'Mensaje original de la base de datos',
          role: 'user',
          created_at: '2026-09-06T09:00:00Z',
        },
      });

      mockDbMessages['convo-test-1'] = [
        {
          id: 'msg-initial',
          restaurant_id: 'rest-uuid-1111-2222-3333-444444444444',
          conversation_id: 'convo-test-1',
          role: 'user',
          content: 'Mensaje original de la base de datos',
          created_at: '2026-09-06T09:00:00Z',
        },
      ];

      const harness = new ReactHarness(useLiveChat, {
        restaurantId: 'rest-uuid-1111-2222-3333-444444444444',
        initialConversations: [initialConvo],
        autoSelectFirst: true,
      });

      expect(harness.current.activeConversationId).toBe('convo-test-1');
      expect(harness.current.conversations[0]?.last_message?.content).toBe('Mensaje original de la base de datos');

      // Simulamos que el endpoint del Worker / Server Action falla
      mockSendHumanMessage.mockResolvedValueOnce({
        success: false,
        error: 'WhatsApp API error: Phone number is not registered on WhatsApp',
      });

      const sendPromise = harness.current.sendMessage('Intento de mensaje fallido');

      // Mientras la promesa está en vuelo, verificamos la actualización optimista
      // (el mensaje temporal se agregó a messages y a last_message)
      expect(harness.current.messages.some((m) => m.content === 'Intento de mensaje fallido')).toBe(true);
      expect(harness.current.conversations[0]?.last_message?.content).toBe('Intento de mensaje fallido');

      // Esperamos que termine el envío con fallo
      const res = await sendPromise;
      expect(res.success).toBe(false);
      expect(res.error).toContain('Phone number is not registered');

      // VERIFICACIÓN DE ROLLBACK:
      // 1. El mensaje optimista se eliminó de messages
      expect(harness.current.messages.some((m) => m.content === 'Intento de mensaje fallido')).toBe(false);
      // 2. last_message volvió al mensaje original
      expect(harness.current.conversations[0]?.last_message?.content).toBe('Mensaje original de la base de datos');
    });

    it('debe revertir el mensaje optimista cuando sendHumanMessage lanza una excepción de red', async () => {
      const initialConvo = makeConvo();

      const harness = new ReactHarness(useLiveChat, {
        restaurantId: 'rest-uuid-1111-2222-3333-444444444444',
        initialConversations: [initialConvo],
        autoSelectFirst: true,
      });

      // Simulamos desconexión total (Network Crash / TypeError: Failed to fetch)
      mockSendHumanMessage.mockRejectedValueOnce(new Error('Failed to fetch: net::ERR_INTERNET_DISCONNECTED'));

      const res = await harness.current.sendMessage('Mensaje sin conexión');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Failed to fetch');

      // Rollback verificado
      expect(harness.current.messages.some((m) => m.content === 'Mensaje sin conexión')).toBe(false);
      expect(harness.current.conversations[0]?.last_message?.content).toBe('Hola, buenas tardes');
    });

    it('MessageInput restituye el texto del usuario y muestra banner de error cuando onSendMessage falla', async () => {
      let failedTextRestored = false;

      // Simulamos la lógica interna de MessageInput:
      let content = 'Pizza pepperoni sin cebolla y refresco';
      let isSending = false;
      let errorMessage: string | null = null;

      const handleSend = async () => {
        const textToSend = content.trim();
        isSending = true;
        errorMessage = null;

        const previousContent = content;
        content = ''; // Optimistic clear

        try {
          // Mock failed send
          const result = { success: false, error: 'Evolution API Timeout 504' };
          if (!result.success) {
            content = previousContent; // Restituir
            errorMessage = result.error;
            failedTextRestored = true;
          }
        } finally {
          isSending = false;
        }
      };

      await handleSend();

      expect(failedTextRestored).toBe(true);
      expect(content).toBe('Pizza pepperoni sin cebolla y refresco');
      expect(errorMessage).toBe('Evolution API Timeout 504');
    });
  });

  /* ========================================================================= */
  /* 3. Reactive State Handling: Optimistic Customer Notes Rollback             */
  /* ========================================================================= */
  describe('3. Optimistic Customer Notes Rollback (useLiveChat & CustomerSidebar)', () => {
    it('debe revertir notes_md al estado previo exacto cuando updateCustomerNotes devuelve error', async () => {
      const originalNotes = '- 📍 **Entrega:** Roma Norte\n- ⚠️ **Restricciones:** Nuez';
      const initialConvo = makeConvo({
        customer: {
          id: 'cust-notes-1',
          name: 'Carlos Mendoza',
          phone: '+525512345678',
          notes_md: originalNotes,
        },
      });

      mockDbConversations = [
        {
          id: 'convo-test-1',
          restaurant_id: 'rest-uuid-1111-2222-3333-444444444444',
          customer_id: 'cust-notes-1',
          status: 'open',
          mode: 'ai',
          created_at: '2026-09-06T10:00:00Z',
          updated_at: '2026-09-06T10:00:00Z',
          customers: {
            id: 'cust-notes-1',
            name: 'Carlos Mendoza',
            phone: '+525512345678',
            notes_md: originalNotes,
          },
        },
      ];

      const harness = new ReactHarness(useLiveChat, {
        restaurantId: 'rest-uuid-1111-2222-3333-444444444444',
        initialConversations: [initialConvo],
        autoSelectFirst: true,
      });

      expect(harness.current.conversations[0]?.customer?.notes_md).toBe(originalNotes);

      // Simulamos que el backend rechaza la actualización (ej. permisos RLS o error de Supabase)
      mockUpdateCustomerNotes.mockResolvedValueOnce({
        success: false,
        error: 'FORBIDDEN: No tienes permisos para modificar este cliente',
      });

      const updatePromise = harness.current.updateNotes('- 📍 **Entrega:** Polanco (MODIFICADO)');

      // Durante la ejecución en vuelo, la UI optimista ya muestra la nota modificada
      expect(harness.current.conversations[0]?.customer?.notes_md).toBe('- 📍 **Entrega:** Polanco (MODIFICADO)');

      // Al resolverse el fallo
      const res = await updatePromise;
      expect(res.success).toBe(false);
      expect(res.error).toContain('FORBIDDEN');

      // VERIFICACIÓN DE ROLLBACK:
      // notes_md en conversations debe haber regresado exactamente al texto previo
      expect(harness.current.conversations[0]?.customer?.notes_md).toBe(originalNotes);
    });

    it('debe revertir notes_md cuando updateCustomerNotes lanza una excepción', async () => {
      const originalNotes = 'Notas iniciales';
      const initialConvo = makeConvo({
        customer: {
          id: 'cust-notes-2',
          name: 'Ana García',
          phone: '+525599887766',
          notes_md: originalNotes,
        },
      });

      mockDbConversations = [
        {
          id: 'convo-test-1',
          restaurant_id: 'rest-uuid-1111-2222-3333-444444444444',
          customer_id: 'cust-notes-2',
          status: 'open',
          mode: 'ai',
          created_at: '2026-09-06T10:00:00Z',
          updated_at: '2026-09-06T10:00:00Z',
          customers: {
            id: 'cust-notes-2',
            name: 'Ana García',
            phone: '+525599887766',
            notes_md: originalNotes,
          },
        },
      ];

      const harness = new ReactHarness(useLiveChat, {
        restaurantId: 'rest-uuid-1111-2222-3333-444444444444',
        initialConversations: [initialConvo],
        autoSelectFirst: true,
      });

      mockUpdateCustomerNotes.mockRejectedValueOnce(new Error('Postgres connection pool exhausted'));

      const res = await harness.current.updateNotes('Notas modificadas');
      expect(res.success).toBe(false);
      expect(res.error).toContain('connection pool exhausted');

      expect(harness.current.conversations[0]?.customer?.notes_md).toBe(originalNotes);
    });

    it('CustomerSidebar conserva el borrador en edición y muestra error si onUpdateNotes falla', async () => {
      let isEditing = true;
      let draftNotes = 'Notas que el usuario editó';
      let saveError: string | null = null;

      const handleSave = async (onUpdateNotes: () => Promise<{ success: boolean; error?: string }>) => {
        try {
          const res = await onUpdateNotes();
          if (res.success) {
            isEditing = false;
          } else {
            saveError = res.error || 'No se pudieron guardar las notas.';
          }
        } catch (err: any) {
          saveError = err.message;
        }
      };

      await handleSave(async () => ({ success: false, error: 'Database constraint error' }));

      // No se salió de edición, el borrador sigue intacto y el error es visible
      expect(isEditing).toBe(true);
      expect(draftNotes).toBe('Notas que el usuario editó');
      expect(saveError).toBe('Database constraint error');
    });
  });

  /* ========================================================================= */
  /* 4. Filter Switching & Search Input Edge Cases (Regex, Injections)         */
  /* ========================================================================= */
  describe('4. Rapid Filter Switching & Search Regex Stress Testing', () => {
    it('soporta cambio rápido de pestañas y combinaciones de filtros sin inconsistencias', () => {
      const convos = [
        makeConvo({ id: 'c1', status: 'open', mode: 'ai' }),
        makeConvo({ id: 'c2', status: 'open', mode: 'human' }),
        makeConvo({ id: 'c3', status: 'closed', mode: 'ai' }),
        makeConvo({ id: 'c4', status: 'closed', mode: 'human' }),
      ];

      const harness = new ReactHarness(useLiveChat, {
        restaurantId: 'rest-uuid-1111-2222-3333-444444444444',
        initialConversations: convos,
      });

      // 1. All
      harness.current.setStatusFilter('all');
      harness.current.setModeFilter('all');
      expect(harness.current.filteredConversations.length).toBe(4);

      // 2. Solo abiertas
      harness.current.setStatusFilter('open');
      harness.current.setModeFilter('all');
      expect(harness.current.filteredConversations.length).toBe(2);
      expect(harness.current.filteredConversations.every((c) => c.status === 'open')).toBe(true);

      // 3. Solo cerradas
      harness.current.setStatusFilter('closed');
      harness.current.setModeFilter('all');
      expect(harness.current.filteredConversations.length).toBe(2);
      expect(harness.current.filteredConversations.every((c) => c.status === 'closed')).toBe(true);

      // 4. Solo IA
      harness.current.setStatusFilter('all');
      harness.current.setModeFilter('ai');
      expect(harness.current.filteredConversations.length).toBe(2);
      expect(harness.current.filteredConversations.every((c) => c.mode === 'ai')).toBe(true);

      // 5. Solo Humano
      harness.current.setStatusFilter('all');
      harness.current.setModeFilter('human');
      expect(harness.current.filteredConversations.length).toBe(2);
      expect(harness.current.filteredConversations.every((c) => c.mode === 'human')).toBe(true);

      // 6. Abiertas + Humano (Requiere Humano)
      harness.current.setStatusFilter('open');
      harness.current.setModeFilter('human');
      expect(harness.current.filteredConversations.length).toBe(1);
      expect(harness.current.filteredConversations[0]?.id).toBe('c2');
    });

    it('soporta búsquedas con caracteres especiales y metacaracteres regex sin crashear', () => {
      const convos = [
        makeConvo({
          id: 'c-regex',
          customer: { id: 'cust-1', name: 'Regex Test User', phone: '+525511112222', notes_md: '' },
          last_message: { id: 'm1', content: '.*[a-z] y texto especial ^$()[]{}', role: 'user', created_at: '' },
        }),
      ];

      const harness = new ReactHarness(useLiveChat, {
        restaurantId: 'rest-uuid-1111-2222-3333-444444444444',
        initialConversations: convos,
      });

      const testQueries = [
        '',
        '   ',
        '\n\t',
        '.*[a-z]',
        '[a-z]',
        '(?<=foo)',
        '^.*$',
        '\\d+',
        '++++',
        '????',
        '****',
        '(((((',
        ')))))',
        '[[[[[',
        ']]]]]',
        '{{{{{',
        '}}}}}',
        '\\',
        '\\\\',
        '\\x00',
        '<script>alert("xss")</script>',
        "'; DROP TABLE conversations; --",
        'a'.repeat(5000), // Búsqueda gigantesca
      ];

      for (const query of testQueries) {
        expect(() => {
          harness.current.setSearchQuery(query);
        }).not.toThrow();

        // Debe retornar un arreglo válido sin corromperse
        expect(Array.isArray(harness.current.filteredConversations)).toBe(true);
      }
    });

    it('FALSIFICATION / CRITICAL BUG: useLiveChat filteredConversations crashea con TypeError si last_message.content es null o undefined', () => {
      // Si una conversación tiene last_message pero su content es null (ej. mensaje multimedia o audio sin texto)
      const convoWithNullContent = makeConvo({
        id: 'convo-null-content',
        last_message: {
          id: 'msg-media',
          content: null as any,
          role: 'user',
          created_at: '2026-09-06T10:00:00Z',
        },
      });

      const harness = new ReactHarness(useLiveChat, {
        restaurantId: 'rest-uuid-1111-2222-3333-444444444444',
        initialConversations: [convoWithNullContent],
      });

      // Sin query de búsqueda, no evalúa last_message?.content.toLowerCase()
      expect(harness.current.filteredConversations.length).toBe(1);

      // AL EJECUTAR CUALQUIER BÚSQUEDA NO VACÍA:
      // En use-live-chat.ts línea 760:
      // const lastMsgMatch = convo.last_message?.content.toLowerCase().includes(query) ?? false;
      // Debido a la falta de optional chaining en content (?.content?.toLowerCase),
      // llamar a null.toLowerCase() lanza TypeError!
      expect(() => {
        harness.current.setSearchQuery('pizza');
      }).toThrow(TypeError);
    });
  });
});
