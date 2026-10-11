import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type SupabaseClient } from '@supabase/supabase-js';
import {
  type Database,
  type Restaurant,
  type Customer,
  type Conversation,
} from '../src/types/database';
import { type Env } from '../src/types/env';
import { type LLMProvider, type LLMResponse } from '../src/providers/llm/interface';
import { type WhatsAppProvider } from '../src/providers/whatsapp/interface';
import { type ChatwootProvider } from '../src/providers/chatwoot/interface';
import { ChatwootHttpClient, ChatwootProviderError } from '../src/providers/chatwoot/client';
import { AgentOrchestrator } from '../src/services/agent/orchestrator';
import { ConversationRepository } from '../src/services/db/conversation-repository';
import { MessageRepository } from '../src/services/db/message-repository';
import { RestaurantRepository } from '../src/services/db/restaurant-repository';
import { CustomerRepository } from '../src/services/db/customer-repository';
import { OrderRepository } from '../src/services/db/order-repository';
import { handoffToHumanTool } from '../src/tools/escalation/handoff-to-human';
import { handleChatwootWebhook } from '../src/webhooks/chatwoot/handler';
import { parseChatwootWebhook } from '../src/webhooks/chatwoot/parser';

describe('CHALLENGER-2 ADVERSARIAL STRESS SUITE: Chatwoot Handoff & Multi-Tenancy', () => {
  const mockEnv: Env = {
    EVOLUTION_API_URL: 'https://evo.test.com',
    EVOLUTION_API_KEY: 'test-evo-key',
    WEBHOOK_VERIFY_TOKEN: 'test-verify-token',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    LLM_API_KEY: 'test-llm-key',
    LLM_MODEL: 'gpt-4o-mini',
    LLM_BASE_URL: 'https://api.openai.com/v1',
    CHATWOOT_BASE_URL: 'https://chatwoot.test.com',
    CHATWOOT_API_TOKEN: 'test-cw-token',
    CHATWOOT_ACCOUNT_ID: '1',
    CHATWOOT_INBOX_ID: '1',
    CHATWOOT_WEBHOOK_TOKEN: 'secret-chatwoot-webhook-token-456',
  };

  const tenantA: Restaurant = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Pizzería Napoli (Tenant A)',
    slug: 'pizzeria-napoli',
    phone: '5215511111111',
    address: 'Av Reforma 123',
    timezone: 'America/Mexico_City',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const tenantB: Restaurant = {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Tacos El Pastor (Tenant B)',
    slug: 'tacos-el-pastor',
    phone: '5215522222222',
    address: 'Calle Luna 456',
    timezone: 'America/Mexico_City',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const customerA: Customer = {
    id: '00000000-0000-0000-0000-000000000011',
    restaurant_id: tenantA.id,
    phone: '+5215599999999',
    name: 'Diner Tenant A',
    address_default: 'Calle 10 #20',
    notes_md: '- Alérgico a champiñones',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const customerB: Customer = {
    id: '00000000-0000-0000-0000-000000000022',
    restaurant_id: tenantB.id,
    phone: '+5215599999999', // Mismo número de teléfono en otro restaurante
    name: 'Diner Tenant B',
    address_default: 'Calle 30 #40',
    notes_md: '- Mucha salsa',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  // ==========================================================================
  // SECTION 1: STATE MACHINE CYCLING & MULTI-TURN RESILIENCE
  // ==========================================================================
  describe('1. State Machine Cycling: Repeated AI <-> Human Transitions', () => {
    let conversationA: Conversation;
    let messageStore: Array<Record<string, unknown>>;
    let mockLLM: LLMProvider;
    let mockWhatsApp: WhatsAppProvider;
    let mockChatwoot: ChatwootProvider;

    beforeEach(() => {
      messageStore = [];
      conversationA = {
        id: '11111111-1111-1111-1111-111111111111',
        restaurant_id: tenantA.id,
        customer_id: customerA.id,
        mode: 'ai',
        status: 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockLLM = {
        chat: vi.fn(),
      };

      mockWhatsApp = {
        sendTextMessage: vi.fn().mockResolvedValue({ success: true, messageId: 'wa-msg-1' }),
        sendMediaMessage: vi.fn(),
        markAsRead: vi.fn(),
      };

      mockChatwoot = {
        findOrCreateContact: vi.fn().mockResolvedValue({ id: 101, name: customerA.name, phone: customerA.phone }),
        findOrCreateConversation: vi.fn().mockResolvedValue({ id: 501, status: 'open' }),
        postPrivateNote: vi.fn().mockResolvedValue({ id: 901, content: 'Handoff note' }),
        forwardIncomingMessage: vi.fn().mockResolvedValue({ id: 902, content: 'Forwarded' }),
        toggleStatus: vi.fn().mockResolvedValue({ success: true, current_status: 'resolved' }),
      };
    });

    const createOrchestratorWithStore = () => {
      const mockConvoRepo = {
        getById: vi.fn().mockImplementation((rId, cId) => {
          if (rId === tenantA.id && cId === conversationA.id) {
            return Promise.resolve({ ...conversationA });
          }
          return Promise.resolve(null);
        }),
        getOrCreateActiveConversation: vi.fn().mockImplementation((rId, custId) => {
          if (rId === tenantA.id && custId === customerA.id) {
            return Promise.resolve(conversationA);
          }
          throw new Error('Not found');
        }),
        setMode: vi.fn().mockImplementation((rId, cId, mode) => {
          if (rId === tenantA.id && cId === conversationA.id) {
            conversationA.mode = mode;
            return Promise.resolve({ ...conversationA });
          }
          throw new Error('Tenant mismatch or not found');
        }),
      } as unknown as ConversationRepository;

      const mockMsgRepo = {
        saveMessage: vi.fn().mockImplementation((rId, data: Record<string, unknown>) => {
          const msg = {
            id: `msg-${messageStore.length + 1}`,
            restaurant_id: rId,
            conversation_id: data.conversationId ?? data.conversation_id,
            role: data.role,
            content: data.content,
            metadata: data.metadata ?? {},
            created_at: new Date().toISOString(),
          };
          messageStore.push(msg);
          return Promise.resolve(msg);
        }),
        getRecentMessages: vi.fn().mockImplementation((rId, cId, limit) => {
          const filtered = messageStore
            .filter((m) => m.restaurant_id === rId && m.conversation_id === cId)
            .slice(-limit);
          return Promise.resolve(filtered);
        }),
      } as unknown as MessageRepository;

      const mockRestRepo = {
        getByIdOrSlug: vi.fn().mockResolvedValue(tenantA),
        getAgentConfig: vi.fn().mockResolvedValue(null),
        getLastCompletedOrder: vi.fn().mockResolvedValue(null),
      } as unknown as RestaurantRepository;

      const mockCustRepo = {
        getByPhone: vi.fn().mockResolvedValue(customerA),
        upsert: vi.fn().mockResolvedValue(customerA),
      } as unknown as CustomerRepository;

      const mockOrderRepo = {
        getActiveDraftOrder: vi.fn().mockResolvedValue(null),
      } as unknown as OrderRepository;

      const mockDb = {
        from: vi.fn((table: string) => {
          if (table === 'conversations') {
            return {
              update: vi.fn((payload: Record<string, unknown>) => {
                if (payload.mode) {
                  conversationA.mode = payload.mode as 'ai' | 'human';
                }
                return {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      select: vi.fn(() => ({
                        single: vi.fn().mockResolvedValue({
                          data: {
                            id: conversationA.id,
                            restaurant_id: tenantA.id,
                            mode: conversationA.mode,
                            status: 'open',
                          },
                          error: null,
                        }),
                      })),
                    })),
                  })),
                };
              }),
            };
          }
          if (table === 'messages') {
            return {
              insert: vi.fn((payload: Record<string, unknown>) => {
                messageStore.push({ ...payload, id: `msg-${messageStore.length + 1}` });
                return {
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({
                      data: { id: `msg-${messageStore.length}`, ...payload },
                      error: null,
                    }),
                  })),
                };
              }),
            };
          }
          if (table === 'customers') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: customerA, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === 'restaurants') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: tenantA, error: null }),
                }),
              }),
            };
          }
          if (table === 'orders') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      order: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
      } as unknown as SupabaseClient<Database>;

      const orchestrator = new AgentOrchestrator({
        db: mockDb,
        env: mockEnv,
        llmProvider: mockLLM,
        whatsAppProvider: mockWhatsApp,
        chatwootProvider: mockChatwoot,
        conversationRepo: mockConvoRepo,
        messageRepo: mockMsgRepo,
        restaurantRepo: mockRestRepo,
        customerRepo: mockCustRepo,
        orderRepo: mockOrderRepo,
      });

      return { orchestrator, mockConvoRepo, mockMsgRepo, mockRestRepo, mockCustRepo };
    };

    it('debe ejecutar un ciclo completo de 8 pasos: ai -> human -> user forwarding -> human agent reply -> resolved (ai) -> ai resumption -> second handoff -> second resolved', async () => {
      const { orchestrator, mockConvoRepo, mockMsgRepo, mockRestRepo, mockCustRepo } =
        createOrchestratorWithStore();

      // ======================================================================
      // PASO 1: Turno normal en Modo AI
      // ======================================================================
      vi.mocked(mockLLM.chat).mockResolvedValueOnce({
        content: '¡Hola! Bienvenido a Pizzería Napoli. ¿Qué se te antoja hoy?',
      });

      const res1 = await orchestrator.processIncomingMessage({
        restaurant: tenantA,
        customer: customerA,
        conversationId: conversationA.id,
        messageText: 'Hola buenas tardes',
      });

      expect(res1.status).toBe('responded');
      expect(conversationA.mode).toBe('ai');
      expect(mockWhatsApp.sendTextMessage).toHaveBeenCalledWith(
        tenantA.slug,
        customerA.phone,
        '¡Hola! Bienvenido a Pizzería Napoli. ¿Qué se te antoja hoy?'
      );

      // ======================================================================
      // PASO 2: El comensal pide operador humano -> LLM ejecuta tool handoff_to_human
      // ======================================================================
      vi.mocked(mockLLM.chat).mockResolvedValueOnce({
        content: null,
        tool_calls: [
          {
            id: 'call_handoff_1',
            type: 'function',
            function: {
              name: 'handoff_to_human',
              arguments: JSON.stringify({ reason: 'El cliente solicita hablar con el dueño' }),
            },
          },
        ],
      });

      const fetchCalls: Array<{ url: string; method: string; body: unknown }> = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : undefined;
        fetchCalls.push({ url, method: init?.method ?? 'GET', body });

        if (url.includes('/contacts/search')) {
          return new Response(JSON.stringify({ payload: [] }), { status: 200 });
        }
        if (url.endsWith('/contacts')) {
          return new Response(
            JSON.stringify({
              payload: { contact: { id: 101, name: customerA.name, phone_number: customerA.phone } },
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/conversations')) {
          return new Response(JSON.stringify({ id: 501, status: 'open' }), { status: 200 });
        }
        if (url.includes('/messages')) {
          return new Response(
            JSON.stringify({ id: 901, content: (body as Record<string, string>)?.content }),
            { status: 200 }
          );
        }
        return new Response('Not Found', { status: 404 });
      }) as unknown as typeof fetch;

      try {
        const res2 = await orchestrator.processIncomingMessage({
          restaurant: tenantA,
          customer: customerA,
          conversationId: conversationA.id,
          messageText: 'Por favor comunícame con una persona',
        });

        expect(res2.status).toBe('responded');
        // La conversación en la BD cambió a 'human'
        expect(conversationA.mode).toBe('human');
        // Se sincronizó con Chatwoot vía REST API
        const noteCall = fetchCalls.find((c) => c.url.includes('/messages'));
        expect(noteCall).toBeDefined();
      } finally {
        globalThis.fetch = originalFetch;
      }

      // ======================================================================
      // PASO 3: Mensaje adicional del comensal mientras está en modo humano (Bot Silenciado)
      // ======================================================================
      vi.mocked(mockLLM.chat).mockClear();

      const res3 = await orchestrator.processIncomingMessage({
        restaurant: tenantA,
        customer: customerA,
        conversationId: conversationA.id,
        messageText: '¿Hay alguien ahí?',
      });

      expect(res3.status).toBe('silenced_human_mode');
      // El LLM NUNCA fue llamado
      expect(mockLLM.chat).not.toHaveBeenCalled();
      // El mensaje se reenvió a Chatwoot
      expect(mockChatwoot.forwardIncomingMessage).toHaveBeenCalledWith({
        conversationId: 501,
        messageText: '¿Hay alguien ahí?',
      });

      // ======================================================================
      // PASO 4: Asesor humano responde desde Chatwoot (Webhook message_created)
      // ======================================================================
      const chatwootAgentMsgPayload = {
        event: 'message_created',
        id: 8881,
        content: 'Hola, soy Roberto el encargado. ¿En qué puedo ayudarte?',
        private: false,
        message_type: 'outgoing',
        sender: { id: 10, name: 'Roberto Encargado', type: 'user' },
        contact: { id: 101, phone_number: customerA.phone },
        conversation: {
          id: 501,
          custom_attributes: {
            restaurant_id: tenantA.id,
            conversation_id: conversationA.id,
          },
        },
      };

      const reqAgentMsg = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': mockEnv.CHATWOOT_WEBHOOK_TOKEN!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chatwootAgentMsgPayload),
      });

      const resWebhookAgent = await handleChatwootWebhook(reqAgentMsg, mockEnv, undefined, {
        customProvider: mockWhatsApp,
        customConversationRepo: mockConvoRepo,
        customMessageRepo: mockMsgRepo,
        customRestaurantRepo: mockRestRepo,
        customCustomerRepo: mockCustRepo,
      });

      expect(resWebhookAgent.status).toBe(200);
      const jsonWebhookAgent = await resWebhookAgent.json<{ status: string }>();
      expect(jsonWebhookAgent.status).toBe('dispatched_to_whatsapp');

      // WhatsApp despachado al cliente
      expect(mockWhatsApp.sendTextMessage).toHaveBeenCalledWith(
        tenantA.slug,
        customerA.phone,
        'Hola, soy Roberto el encargado. ¿En qué puedo ayudarte?'
      );

      // Verificamos que el mensaje del operador se persistió con role: 'human_agent'
      const humanAgentMsgInStore = messageStore.find((m) => m.role === 'human_agent');
      expect(humanAgentMsgInStore).toBeDefined();
      expect(humanAgentMsgInStore?.content).toBe('Hola, soy Roberto el encargado. ¿En qué puedo ayudarte?');

      // ======================================================================
      // PASO 5: Asesor humano resuelve ticket en Chatwoot (Webhook conversation_status_changed)
      // ======================================================================
      const chatwootResolvedPayload = {
        event: 'conversation_status_changed',
        id: 501,
        status: 'resolved',
        conversation: {
          id: 501,
          status: 'resolved',
          custom_attributes: {
            restaurant_id: tenantA.id,
            conversation_id: conversationA.id,
          },
        },
      };

      const reqResolved = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': mockEnv.CHATWOOT_WEBHOOK_TOKEN!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chatwootResolvedPayload),
      });

      const resWebhookResolved = await handleChatwootWebhook(reqResolved, mockEnv, undefined, {
        customProvider: mockWhatsApp,
        customConversationRepo: mockConvoRepo,
        customMessageRepo: mockMsgRepo,
        customRestaurantRepo: mockRestRepo,
        customCustomerRepo: mockCustRepo,
      });

      expect(resWebhookResolved.status).toBe(200);
      expect(conversationA.mode).toBe('ai');

      // ======================================================================
      // PASO 6: El comensal vuelve a escribir -> Bot IA reanuda con historial completo
      // ======================================================================
      vi.mocked(mockLLM.chat).mockImplementationOnce(async (history) => {
        // Verificamos que el historial entregado al LLM incluye el turno del agente humano
        const hasHumanAgentMsg = history.some(
          (h) => h.role === 'user' && typeof h.content === 'string' && h.content.includes('[Agente Humano]:')
        );
        expect(hasHumanAgentMsg).toBe(true);

        return {
          content: '¡Con gusto! Roberto ya atendió tu duda. ¿Deseas agregar alguna pizza a tu orden?',
        };
      });

      const res6 = await orchestrator.processIncomingMessage({
        restaurant: tenantA,
        customer: customerA,
        conversationId: conversationA.id,
        messageText: 'Gracias Roberto, todo claro.',
      });

      expect(res6.status).toBe('responded');
      expect(conversationA.mode).toBe('ai');
      expect(mockLLM.chat).toHaveBeenCalledTimes(1);

      // ======================================================================
      // PASO 7: Segundo Handoff (Ciclo 2: AI -> Human)
      // ======================================================================
      vi.mocked(mockLLM.chat).mockResolvedValueOnce({
        content: null,
        tool_calls: [
          {
            id: 'call_handoff_2',
            type: 'function',
            function: {
              name: 'handoff_to_human',
              arguments: JSON.stringify({ reason: 'Duda sobre facturación' }),
            },
          },
        ],
      });

      const originalFetch2 = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : undefined;
        if (url.includes('/contacts/search')) {
          return new Response(JSON.stringify({ payload: [] }), { status: 200 });
        }
        if (url.endsWith('/contacts')) {
          return new Response(
            JSON.stringify({
              payload: { contact: { id: 101, name: customerA.name, phone_number: customerA.phone } },
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/conversations')) {
          return new Response(JSON.stringify({ id: 501, status: 'open' }), { status: 200 });
        }
        if (url.includes('/messages')) {
          return new Response(
            JSON.stringify({ id: 902, content: (body as Record<string, string>)?.content }),
            { status: 200 }
          );
        }
        return new Response('Not Found', { status: 404 });
      }) as unknown as typeof fetch;

      try {
        const res7 = await orchestrator.processIncomingMessage({
          restaurant: tenantA,
          customer: customerA,
          conversationId: conversationA.id,
          messageText: 'Oye, necesito factura, pásame a administración',
        });

        expect(res7.status).toBe('responded');
        expect(conversationA.mode).toBe('human');
      } finally {
        globalThis.fetch = originalFetch2;
      }

      // ======================================================================
      // PASO 8: Segunda Resolución (Ciclo 2: Human -> AI)
      // ======================================================================
      const reqResolved2 = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': mockEnv.CHATWOOT_WEBHOOK_TOKEN!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chatwootResolvedPayload),
      });

      await handleChatwootWebhook(reqResolved2, mockEnv, undefined, {
        customProvider: mockWhatsApp,
        customConversationRepo: mockConvoRepo,
        customMessageRepo: mockMsgRepo,
        customRestaurantRepo: mockRestRepo,
        customCustomerRepo: mockCustRepo,
      });

      expect(conversationA.mode).toBe('ai');
    });
  });

  // ==========================================================================
  // SECTION 2: DEGRADATION, ERROR RESILIENCE & TIMEOUTS
  // ==========================================================================
  describe('2. Degradation & Graceful Fallback on External Failures', () => {
    it('handoffToHumanTool: debe cambiar modo a "human" en Supabase incluso si Chatwoot API arroja Timeout (504) o 500', async () => {
      let updatedMode = 'ai';

      const mockDb = {
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: customerA.id, phone: customerA.phone } }),
          update: vi.fn((payload: Record<string, unknown>) => {
            if (table === 'conversations') {
              updatedMode = payload.mode as string;
            }
            return {
              eq: vi.fn().mockReturnThis(),
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { id: '11111111-1111-1111-1111-111111111111', restaurant_id: tenantA.id, mode: updatedMode },
                error: null,
              }),
            };
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'msg-sys-1' }, error: null }),
            }),
          }),
        })),
      } as unknown as SupabaseClient<Database>;

      // Forzar cliente Chatwoot a fallar por timeout
      const failingFetch = vi.fn().mockRejectedValue(new Error('AbortError: Timeout of 10000ms exceeded'));

      const failingEnv: Env = {
        ...mockEnv,
        CHATWOOT_BASE_URL: 'https://broken-chatwoot.com',
        CHATWOOT_API_TOKEN: 'invalid-token',
      };

      // Mockeamos globalThis.fetch para el test de handoff
      const originalFetch = globalThis.fetch;
      globalThis.fetch = failingFetch as unknown as typeof fetch;

      try {
        const result = await handoffToHumanTool.execute(
          { reason: 'Falla técnica del proveedor externo' },
          {
            restaurantId: tenantA.id,
            customerId: customerA.id,
            conversationId: '11111111-1111-1111-1111-111111111111',
            db: mockDb,
            env: failingEnv,
          }
        );

        // 1. La tool retorna éxito para no romper la conversación del comensal
        expect(result.success).toBe(true);
        expect(result.mode).toBe('human');
        // 2. La base de datos local SÍ fue actualizada a 'human' (aislamiento y defensa)
        expect(updatedMode).toBe('human');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('AgentOrchestrator: en modo humano, si Chatwoot forwarding falla, el mensaje se persiste y no lanza excepción', async () => {
      const mockChatwootFailing: ChatwootProvider = {
        findOrCreateContact: vi.fn().mockRejectedValue(new ChatwootProviderError('Chatwoot 502 Bad Gateway', 502)),
        findOrCreateConversation: vi.fn(),
        postPrivateNote: vi.fn(),
        forwardIncomingMessage: vi.fn(),
        toggleStatus: vi.fn(),
      };

      const savedMsgs: Array<Record<string, unknown>> = [];
      const mockMsgRepo = {
        saveMessage: vi.fn().mockImplementation((rId, data) => {
          savedMsgs.push(data);
          return Promise.resolve({ id: 'msg-saved-1', ...data });
        }),
      } as unknown as MessageRepository;

      const mockConvoRepo = {
        getById: vi.fn().mockResolvedValue({
          id: '11111111-1111-1111-1111-111111111111',
          restaurant_id: tenantA.id,
          mode: 'human',
          status: 'open',
        }),
      } as unknown as ConversationRepository;

      const mockLLM = { chat: vi.fn() } as unknown as LLMProvider;

      const orchestrator = new AgentOrchestrator({
        db: {} as SupabaseClient<Database>,
        env: mockEnv,
        llmProvider: mockLLM,
        chatwootProvider: mockChatwootFailing,
        conversationRepo: mockConvoRepo,
        messageRepo: mockMsgRepo,
      });

      const res = await orchestrator.processIncomingMessage({
        restaurant: tenantA,
        customer: customerA,
        conversationId: '11111111-1111-1111-1111-111111111111',
        messageText: 'Hola auxilio',
      });

      // No truena el Worker
      expect(res.status).toBe('silenced_human_mode');
      // Mensaje persistido en Supabase
      expect(savedMsgs.length).toBe(1);
      expect(savedMsgs[0]?.content).toBe('Hola auxilio');
      // LLM nunca llamado
      expect(mockLLM.chat).not.toHaveBeenCalled();
    });

    it('handleChatwootWebhook: si WhatsAppProvider falla al despachar mensaje de asesor, no lanza 500 y persiste mensaje', async () => {
      const failingWhatsAppProvider: WhatsAppProvider = {
        sendTextMessage: vi.fn().mockRejectedValue(new Error('WhatsApp socket timeout')),
        sendMediaMessage: vi.fn(),
        markAsRead: vi.fn(),
      };

      const savedMsgs: Array<Record<string, unknown>> = [];
      const mockMsgRepo = {
        saveMessage: vi.fn().mockImplementation((rId, data) => {
          savedMsgs.push(data);
          return Promise.resolve({ id: 'msg-saved-2', ...data });
        }),
      } as unknown as MessageRepository;

      const mockRestRepo = {
        getByIdOrSlug: vi.fn().mockResolvedValue(tenantA),
      } as unknown as RestaurantRepository;

      const payload = {
        event: 'message_created',
        id: 9999,
        content: 'Mensaje que fallará al salir a WhatsApp',
        private: false,
        message_type: 'outgoing',
        sender: { id: 1, name: 'Operador', type: 'user' },
        contact: { id: 101, phone_number: customerA.phone },
        conversation: {
          id: 501,
          custom_attributes: {
            restaurant_id: tenantA.id,
            conversation_id: '11111111-1111-1111-1111-111111111111',
          },
        },
      };

      const req = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': mockEnv.CHATWOOT_WEBHOOK_TOKEN!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const response = await handleChatwootWebhook(req, mockEnv, undefined, {
        customProvider: failingWhatsAppProvider,
        customMessageRepo: mockMsgRepo,
        customRestaurantRepo: mockRestRepo,
      });

      // El webhook responde HTTP 200 a Chatwoot (acknowledgement)
      expect(response.status).toBe(200);
      // El mensaje se persistió en la BD antes del fallo de red
      expect(savedMsgs.length).toBe(1);
      expect(savedMsgs[0]?.role).toBe('human_agent');
    });
  });

  // ==========================================================================
  // SECTION 3: MULTI-TENANT ISOLATION & BOUNDARY DEFENSE
  // ==========================================================================
  describe('3. Multi-Tenant Isolation & Cross-Tenant Boundary Defense', () => {
    it('debe impedir que un webhook con restaurant_id de Tenant A altere una conversación o mensaje de Tenant B', async () => {
      let tenantBMode = 'human';

      // Mock repos con aislamiento real
      const mockConvoRepo = {
        setMode: vi.fn(async (restaurantId: string, convId: string, mode: 'ai' | 'human') => {
          // Si intentan modificar la conversación de Tenant B usando las credenciales de Tenant A
          if (restaurantId === tenantA.id && convId === '22222222-2222-2222-2222-222222222222') {
            throw new Error('Conversación no encontrada o no pertenece a este restaurante');
          }
          if (restaurantId === tenantB.id && convId === '22222222-2222-2222-2222-222222222222') {
            tenantBMode = mode;
            return { id: convId, restaurant_id: restaurantId, mode };
          }
          throw new Error('Not found');
        }),
      } as unknown as ConversationRepository;

      // Paylod malicioso / cruzado: envía restaurant_id de Tenant A pero conversation_id de Tenant B
      const maliciousPayload = {
        event: 'conversation_status_changed',
        id: 999,
        status: 'resolved',
        conversation: {
          id: 999,
          status: 'resolved',
          custom_attributes: {
            restaurant_id: tenantA.id, // Tenant A
            conversation_id: '22222222-2222-2222-2222-222222222222', // Conversation belonging to Tenant B!
          },
        },
      };

      const req = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': mockEnv.CHATWOOT_WEBHOOK_TOKEN!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(maliciousPayload),
      });

      const response = await handleChatwootWebhook(req, mockEnv, undefined, {
        customConversationRepo: mockConvoRepo,
      });

      expect(response.status).toBe(200);
      // El estado de la conversación de Tenant B permanece intacto ('human')
      expect(tenantBMode).toBe('human');
    });

    it('debe descartar de inmediato cualquier webhook sin restaurant_id sin tocar la base de datos', async () => {
      const payloadWithoutTenant = {
        event: 'message_created',
        id: 1234,
        content: 'Hola sin tenant',
        private: false,
        message_type: 'outgoing',
        sender: { id: 1, name: 'Admin', type: 'user' },
        contact: { id: 1, phone_number: '+5215512345678' },
        conversation: {
          id: 1,
          custom_attributes: {}, // VACÍO - sin restaurant_id
        },
      };

      const parsed = parseChatwootWebhook(payloadWithoutTenant);
      expect(parsed.kind).toBe('discarded');
      if (parsed.kind === 'discarded') {
        expect(parsed.reason).toBe('missing_tenant_id');
      }

      const req = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': mockEnv.CHATWOOT_WEBHOOK_TOKEN!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payloadWithoutTenant),
      });

      const mockDb = {
        from: vi.fn(),
      } as unknown as SupabaseClient<Database>;

      const response = await handleChatwootWebhook(req, mockEnv, undefined, {
        customDb: mockDb,
      });

      expect(response.status).toBe(200);
      const json = await response.json<{ status: string; reason: string }>();
      expect(json.status).toBe('discarded');
      expect(json.reason).toBe('missing_tenant_id');
      // Ninguna consulta a BD ejecutada
      expect(mockDb.from).not.toHaveBeenCalled();
    });

    it('ChatwootHttpClient: findOrCreateContact y findOrCreateConversation deben incluir obligatoriamente restaurant_id en custom_attributes', async () => {
      let contactRequestBody: Record<string, unknown> | null = null;
      let convoRequestBody: Record<string, unknown> | null = null;

      const mockFetch = vi.fn().mockImplementation((url: string, init: RequestInit) => {
        const body = init.body ? JSON.parse(init.body as string) : {};

        if (url.includes('/contacts/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ payload: [] }),
          });
        }
        if (url.includes('/contacts')) {
          contactRequestBody = body;
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                payload: {
                  contact: { id: 777, phone_number: body.phone_number, name: body.name },
                },
              }),
          });
        }
        if (url.includes('/conversations')) {
          convoRequestBody = body;
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                id: 888,
                status: 'open',
              }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      const client = new ChatwootHttpClient({
        baseUrl: 'https://cw.test.com',
        apiToken: 'token',
        accountId: '1',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      // 1. Crear contacto
      await client.findOrCreateContact({
        phone: customerA.phone,
        name: customerA.name,
        restaurantId: tenantA.id,
        restaurantSlug: tenantA.slug,
      });

      expect(contactRequestBody).toBeDefined();
      expect((contactRequestBody as any).custom_attributes.restaurant_id).toBe(tenantA.id);
      expect((contactRequestBody as any).custom_attributes.restaurant_slug).toBe(tenantA.slug);

      // 2. Crear conversación
      await client.findOrCreateConversation({
        contactId: 777,
        restaurantId: tenantA.id,
        restaurantSlug: tenantA.slug,
        conversationId: '11111111-1111-1111-1111-111111111111',
        customerPhone: customerA.phone,
        reason: 'Handoff test',
      });

      expect(convoRequestBody).toBeDefined();
      expect((convoRequestBody as any).custom_attributes.restaurant_id).toBe(tenantA.id);
      expect((convoRequestBody as any).custom_attributes.conversation_id).toBe('11111111-1111-1111-1111-111111111111');
      expect((convoRequestBody as any).custom_attributes.customer_phone).toBe(customerA.phone);
    });

    it('Cross-tenant phone collision: webhook con teléfono común a dos tenants solo consulta al cliente del tenant emisor', async () => {
      const getByPhoneCalls: Array<{ restaurantId: string; phone: string }> = [];

      const mockCustomerRepo = {
        getByPhone: vi.fn(async (rId: string, phone: string) => {
          getByPhoneCalls.push({ restaurantId: rId, phone });
          if (rId === tenantA.id) return customerA;
          if (rId === tenantB.id) return customerB;
          return null;
        }),
      } as unknown as CustomerRepository;

      const mockConvoRepo = {
        getOrCreateActiveConversation: vi.fn(async (rId: string, custId: string) => ({
          id: 'conv-active-1',
          restaurant_id: rId,
          customer_id: custId,
          mode: 'human' as const,
          status: 'open' as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })),
        setMode: vi.fn().mockResolvedValue({ id: 'conv-active-1', mode: 'ai' }),
      } as unknown as ConversationRepository;

      const mockMsgRepo = {
        saveMessage: vi.fn().mockResolvedValue({ id: 'msg-sys' }),
      } as unknown as MessageRepository;

      // Webhook para Tenant A resolviendo por teléfono
      const payload = {
        event: 'conversation_status_changed',
        id: 1234,
        status: 'resolved',
        contact: { phone_number: '+5215599999999' },
        conversation: {
          id: 1234,
          status: 'resolved',
          custom_attributes: {
            restaurant_id: tenantA.id,
            // conversation_id ausente a propósito para forzar búsqueda por teléfono
          },
        },
      };

      const req = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': mockEnv.CHATWOOT_WEBHOOK_TOKEN!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      await handleChatwootWebhook(req, mockEnv, undefined, {
        customCustomerRepo: mockCustomerRepo,
        customConversationRepo: mockConvoRepo,
        customMessageRepo: mockMsgRepo,
      });

      // Se consultó EXCLUSIVAMENTE a Tenant A
      expect(getByPhoneCalls.length).toBe(1);
      expect(getByPhoneCalls[0]?.restaurantId).toBe(tenantA.id);
      expect(getByPhoneCalls[0]?.phone).toBe('+5215599999999');
      // SetMode llamado con Tenant A
      expect(mockConvoRepo.setMode).toHaveBeenCalledWith(tenantA.id, 'conv-active-1', 'ai');
    });
  });

  // ==========================================================================
  // SECTION 4: CONCURRENCY, TOKEN SECURITY & STATUS EDGE CASES
  // ==========================================================================
  describe('4. Concurrency, Token Security & Status Edge Cases', () => {
    it('Status Snoozed / Pending: no debe reactivar el modo IA si el estado en Chatwoot no es "resolved"', async () => {
      const payloadPending = {
        event: 'conversation_status_changed',
        id: 777,
        status: 'pending', // No es resolved
        conversation: {
          id: 777,
          status: 'pending',
          custom_attributes: {
            restaurant_id: tenantA.id,
            conversation_id: '11111111-1111-1111-1111-111111111111',
          },
        },
      };

      const parsed = parseChatwootWebhook(payloadPending);
      expect(parsed.kind).toBe('discarded');

      const req = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': mockEnv.CHATWOOT_WEBHOOK_TOKEN!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payloadPending),
      });

      const mockConvoRepo = { setMode: vi.fn() } as unknown as ConversationRepository;

      const res = await handleChatwootWebhook(req, mockEnv, undefined, {
        customConversationRepo: mockConvoRepo,
      });

      expect(res.status).toBe(200);
      const json = await res.json<{ status: string }>();
      expect(json.status).toBe('discarded');
      expect(mockConvoRepo.setMode).not.toHaveBeenCalled();
    });

    it('Idempotent Resolution: recibir múltiples webhooks de resolved consecutivos no corrompe el estado ni arroja error', async () => {
      let currentMode: 'ai' | 'human' = 'human';
      const mockConvoRepo = {
        setMode: vi.fn(async (rId, cId, mode) => {
          currentMode = mode;
          return { id: cId, restaurant_id: rId, mode };
        }),
      } as unknown as ConversationRepository;

      const mockMsgRepo = {
        saveMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
      } as unknown as MessageRepository;

      const payload = {
        event: 'conversation_status_changed',
        id: 501,
        status: 'resolved',
        conversation: {
          id: 501,
          status: 'resolved',
          custom_attributes: {
            restaurant_id: tenantA.id,
            conversation_id: '11111111-1111-1111-1111-111111111111',
          },
        },
      };

      // Disparar 3 veces consecutivas el webhook (simulando reintentos de red de Chatwoot)
      for (let i = 0; i < 3; i++) {
        const req = new Request('http://localhost/webhook/chatwoot', {
          method: 'POST',
          headers: {
            'x-webhook-token': mockEnv.CHATWOOT_WEBHOOK_TOKEN!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const res = await handleChatwootWebhook(req, mockEnv, undefined, {
          customConversationRepo: mockConvoRepo,
          customMessageRepo: mockMsgRepo,
        });

        expect(res.status).toBe(200);
        expect(currentMode).toBe('ai');
      }

      expect(mockConvoRepo.setMode).toHaveBeenCalledTimes(3);
    });

    it('Seguridad de Webhooks: timingSafeEqual rechaza tokens de longitud diferente o con 1 carácter cambiado', async () => {
      const invalidTokens = [
        'secret-chatwoot-webhook-token-45', // Más corto
        'secret-chatwoot-webhook-token-4567', // Más largo
        'secret-chatwoot-webhook-token-457', // Mismo largo, 1 char diff
        '',
        'Bearer wrong',
      ];

      for (const token of invalidTokens) {
        const req = new Request('http://localhost/webhook/chatwoot', {
          method: 'POST',
          headers: {
            'x-webhook-token': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ event: 'message_created' }),
        });

        await expect(handleChatwootWebhook(req, mockEnv)).rejects.toThrow();
      }
    });
  });
});
