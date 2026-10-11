import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database, type Restaurant, type Customer, type Conversation, type Message } from '../src/types/database';
import { type Env } from '../src/types/env';
import { type LLMProvider } from '../src/providers/llm/interface';
import { type WhatsAppProvider } from '../src/providers/whatsapp/interface';
import { MessageRepository } from '../src/services/db/message-repository';
import { AgentOrchestrator } from '../src/services/agent/orchestrator';
import { handleChatwootWebhook } from '../src/webhooks/chatwoot/handler';
import { ConversationRepository } from '../src/services/db/conversation-repository';
import { RestaurantRepository } from '../src/services/db/restaurant-repository';
import { WorkerError } from '../src/utils/errors';
import { ZodError } from 'zod';

/**
 * Mock helper configurable para emular el encadenamiento de consultas PostgREST de Supabase
 * y registrar el historial completo de llamadas para verificar aislamiento multi-tenant.
 */
function createMockSupabase(overrides?: Record<string, unknown>): {
  client: SupabaseClient<Database>;
  queryHistory: Array<{ table: string; method: string; args: unknown[] }>;
} {
  const queryHistory: Array<{ table: string; method: string; args: unknown[] }> = [];

  const createBuilder = (table: string): Record<string, unknown> => {
    const builder: Record<string, unknown> = {
      select: vi.fn((...args: unknown[]) => {
        queryHistory.push({ table, method: 'select', args });
        return builder;
      }),
      insert: vi.fn((...args: unknown[]) => {
        queryHistory.push({ table, method: 'insert', args });
        return builder;
      }),
      update: vi.fn((...args: unknown[]) => {
        queryHistory.push({ table, method: 'update', args });
        return builder;
      }),
      delete: vi.fn((...args: unknown[]) => {
        queryHistory.push({ table, method: 'delete', args });
        return builder;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        queryHistory.push({ table, method: 'eq', args: [column, value] });
        return builder;
      }),
      order: vi.fn((column: string, opts: unknown) => {
        queryHistory.push({ table, method: 'order', args: [column, opts] });
        return builder;
      }),
      limit: vi.fn((count: number) => {
        queryHistory.push({ table, method: 'limit', args: [count] });
        return builder;
      }),
      single: vi.fn(async () => {
        queryHistory.push({ table, method: 'single', args: [] });
        const mockError = overrides?.[`${table}:error`] ?? null;
        const mockData = overrides?.[`${table}:single`] ?? overrides?.[table] ?? null;
        return { data: mockData, error: mockError };
      }),
      maybeSingle: vi.fn(async () => {
        queryHistory.push({ table, method: 'maybeSingle', args: [] });
        const mockError = overrides?.[`${table}:error`] ?? null;
        const mockData = overrides?.[`${table}:maybeSingle`] ?? overrides?.[table] ?? null;
        return { data: mockData, error: mockError };
      }),
      then: (resolve: (val: unknown) => unknown) => {
        const mockError = overrides?.[`${table}:error`] ?? null;
        const mockData = overrides?.[table] ?? [];
        return Promise.resolve(resolve({ data: mockData, error: mockError }));
      },
    };
    return builder;
  };

  const client = {
    from: vi.fn((table: string) => {
      queryHistory.push({ table, method: 'from', args: [table] });
      return createBuilder(table);
    }),
  } as unknown as SupabaseClient<Database>;

  return { client, queryHistory };
}

describe('WhatsApp Delivery Tracking & Resilience (R4)', () => {
  const restaurantId = 'a0000000-0000-0000-0000-000000000001';
  const otherRestaurantId = 'a0000000-0000-0000-0000-000000000099';
  const conversationId = 'c1000000-0000-0000-0000-000000000001';
  const messageId = 'b0000000-0000-0000-0000-000000000001';

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

  const mockRestaurant: Restaurant = {
    id: restaurantId,
    name: 'Pizzería Bella Napoli',
    slug: 'bella-napoli',
    phone: '5215512345678',
    address: 'Av. Insurgentes Sur #1234',
    timezone: 'America/Mexico_City',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const mockCustomer: Customer = {
    id: 'd0000000-0000-0000-0000-000000000001',
    restaurant_id: restaurantId,
    phone: '5215598765432',
    name: 'Carlos Mendoza',
    address_default: 'Calle Roble #45',
    notes_md: '',
    created_at: '2026-02-01T10:00:00Z',
    updated_at: '2026-02-01T10:00:00Z',
  };

  /* -------------------------------------------------------------------------- */
  /* 1. Unit Tests: MessageRepository.updateDeliveryStatus                      */
  /* -------------------------------------------------------------------------- */
  describe('MessageRepository.updateDeliveryStatus', () => {
    it('debe actualizar delivery_status a "sent", guardar provider_message_id y preservar metadata existente', async () => {
      const existingMessage: Message = {
        id: messageId,
        restaurant_id: restaurantId,
        conversation_id: conversationId,
        role: 'assistant',
        content: 'Tu pizza estará lista en 20 minutos',
        provider_message_id: null,
        metadata: { usage: { prompt_tokens: 20, total_tokens: 30 }, initial_tag: 'test' },
        created_at: '2026-08-26T20:00:00Z',
      };

      const updatedMessage: Message = {
        ...existingMessage,
        provider_message_id: 'wamid.HBgLMzgx...',
        metadata: {
          usage: { prompt_tokens: 20, total_tokens: 30 },
          initial_tag: 'test',
          delivery_status: 'sent',
          delivery_updated_at: '2026-08-26T20:00:01Z',
        },
      };

      const { client, queryHistory } = createMockSupabase({
        'messages:single': updatedMessage,
      });

      const repo = new MessageRepository(client);
      const result = await repo.updateDeliveryStatus(restaurantId, {
        messageId,
        status: 'sent',
        providerMessageId: 'wamid.HBgLMzgx...',
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe(messageId);
      expect(result?.provider_message_id).toBe('wamid.HBgLMzgx...');

      // Verificar aislamiento multi-tenant estricto en select y update
      const tenantFilters = queryHistory.filter(
        (q) => q.table === 'messages' && q.method === 'eq' && q.args[0] === 'restaurant_id'
      );
      expect(tenantFilters.length).toBeGreaterThanOrEqual(1);
      for (const filter of tenantFilters) {
        expect(filter.args[1]).toBe(restaurantId);
      }

      // Verificar que el payload de update incluya metadata fusionada y provider_message_id
      const updateCall = queryHistory.find((q) => q.table === 'messages' && q.method === 'update');
      expect(updateCall).toBeDefined();
      const updateArgs = updateCall?.args[0] as Record<string, unknown>;
      expect(updateArgs.provider_message_id).toBe('wamid.HBgLMzgx...');
      expect(updateArgs.metadata).toMatchObject({
        delivery_status: 'sent',
      });
    });

    it('debe actualizar delivery_status a "failed" e incluir delivery_error en metadata', async () => {
      const existingMessage: Message = {
        id: messageId,
        restaurant_id: restaurantId,
        conversation_id: conversationId,
        role: 'assistant',
        content: 'Hola',
        provider_message_id: null,
        metadata: { delivery_status: 'pending' },
        created_at: '2026-08-26T20:00:00Z',
      };

      const updatedMessage: Message = {
        ...existingMessage,
        metadata: {
          delivery_status: 'failed',
          delivery_error: 'Evolution API unreachable: HTTP 503',
          delivery_updated_at: '2026-08-26T20:00:02Z',
        },
      };

      const { client, queryHistory } = createMockSupabase({
        'messages:single': updatedMessage,
      });

      const repo = new MessageRepository(client);
      const result = await repo.updateDeliveryStatus(restaurantId, {
        messageId,
        status: 'failed',
        error: 'Evolution API unreachable: HTTP 503',
      });

      expect(result).not.toBeNull();
      const updateCall = queryHistory.find((q) => q.table === 'messages' && q.method === 'update');
      const updateArgs = updateCall?.args[0] as Record<string, unknown>;
      expect(updateArgs.metadata).toMatchObject({
        delivery_status: 'failed',
        delivery_error: 'Evolution API unreachable: HTTP 503',
      });
    });

    it('debe retornar null cuando el mensaje no existe o pertenece a otro tenant (PGRST116 / null)', async () => {
      const { client } = createMockSupabase({
        'messages:error': { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
      });

      const repo = new MessageRepository(client);
      const result = await repo.updateDeliveryStatus(otherRestaurantId, {
        messageId,
        status: 'sent',
      });

      expect(result).toBeNull();
    });

    it('debe rechazar con ZodError si el restaurantId o messageId no son UUID válidos', async () => {
      const { client } = createMockSupabase();
      const repo = new MessageRepository(client);

      await expect(
        repo.updateDeliveryStatus('invalid-uuid', {
          messageId,
          status: 'sent',
        })
      ).rejects.toThrow(ZodError);

      await expect(
        repo.updateDeliveryStatus(restaurantId, {
          messageId: 'not-a-uuid',
          status: 'sent',
        })
      ).rejects.toThrow(ZodError);
    });

    it('debe lanzar WorkerError(500) si la consulta de actualización falla en Supabase', async () => {
      const existingMessage: Message = {
        id: messageId,
        restaurant_id: restaurantId,
        conversation_id: conversationId,
        role: 'assistant',
        content: 'Hola',
        provider_message_id: null,
        metadata: {},
        created_at: '2026-08-26T20:00:00Z',
      };

      // Primer select devuelve existingMessage, pero luego update falla
      let callCount = 0;
      const client = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn(async () => {
            callCount++;
            if (callCount === 1) {
              return { data: existingMessage, error: null };
            }
            return { data: null, error: { message: 'DB connection dead' } };
          }),
          update: vi.fn().mockReturnThis(),
        })),
      } as unknown as SupabaseClient<Database>;

      const repo = new MessageRepository(client);
      await expect(
        repo.updateDeliveryStatus(restaurantId, {
          messageId,
          status: 'sent',
        })
      ).rejects.toThrow(WorkerError);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. Integration Tests: AgentOrchestrator Delivery Tracking                  */
  /* -------------------------------------------------------------------------- */
  describe('AgentOrchestrator Delivery Tracking Integration', () => {
    let mockDb: SupabaseClient<Database>;
    let mockLLMProvider: LLMProvider;
    let mockWhatsAppProvider: WhatsAppProvider;
    let savedMessages: Array<Record<string, unknown>>;
    let deliveryStatusUpdates: Array<{ restaurantId: string; input: unknown }>;

    beforeEach(() => {
      savedMessages = [];
      deliveryStatusUpdates = [];

      const activeConvo: Conversation = {
        id: conversationId,
        restaurant_id: restaurantId,
        customer_id: mockCustomer.id,
        mode: 'ai',
        status: 'open',
        created_at: '2026-08-21T10:00:00Z',
        updated_at: '2026-08-21T10:00:00Z',
      };

      const createDbBuilder = (table: string): Record<string, unknown> => {
        const builder: Record<string, unknown> = {
          select: vi.fn(() => builder),
          insert: vi.fn((payload: unknown) => {
            if (table === 'messages') {
              const inserted = {
                id: messageId,
                ...(typeof payload === 'object' && payload ? payload : {}),
                created_at: new Date().toISOString(),
              };
              savedMessages.push(inserted);
            }
            return builder;
          }),
          update: vi.fn((payload: Record<string, unknown>) => {
            if (table === 'messages') {
              const last = savedMessages[savedMessages.length - 1];
              if (last) Object.assign(last, payload);
            }
            return builder;
          }),
          delete: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          in: vi.fn(() => builder),
          order: vi.fn(() => builder),
          limit: vi.fn(() => builder),
          single: vi.fn(async () => {
            if (table === 'conversations') return { data: activeConvo, error: null };
            if (table === 'messages') return { data: savedMessages[savedMessages.length - 1], error: null };
            return { data: null, error: null };
          }),
          maybeSingle: vi.fn(async () => {
            if (table === 'conversations') return { data: activeConvo, error: null };
            if (table === 'restaurants') return { data: mockRestaurant, error: null };
            if (table === 'customers') return { data: mockCustomer, error: null };
            if (table === 'messages') return { data: savedMessages[savedMessages.length - 1] ?? null, error: null };
            if (table === 'agent_configs') {
              return {
                data: {
                  id: 'cfg-1',
                  restaurant_id: restaurantId,
                  system_prompt: 'Eres Don Giovanni.',
                  business_rules: '',
                  operating_hours: {},
                  handoff_triggers: [],
                  created_at: '2026-01-01T00:00:00Z',
                  updated_at: '2026-01-01T00:00:00Z',
                },
                error: null,
              };
            }
            return { data: null, error: null };
          }),
          then: (resolve: (val: unknown) => unknown) => {
            if (table === 'messages') return Promise.resolve(resolve({ data: savedMessages, error: null }));
            return Promise.resolve(resolve({ data: [], error: null }));
          },
        };
        return builder;
      };

      mockDb = {
        from: vi.fn((table: string) => createDbBuilder(table)),
      } as unknown as SupabaseClient<Database>;

      mockWhatsAppProvider = {
        sendTextMessage: vi.fn(async () => ({ success: true, messageId: 'wa-msg-confirmed-101' })),
        sendMediaMessage: vi.fn(async () => ({ success: true, messageId: 'wa-media-101' })),
        markAsRead: vi.fn(async () => true),
      };
    });

    it('debe registrar status "sent" y providerMessageId al enviar respuesta de asistente con éxito', async () => {
      mockLLMProvider = {
        chat: vi.fn(async () => ({
          content: '¡Hola! Claro que sí, tenemos Pizza Margarita y Pepperoni.',
          usage: { prompt_tokens: 30, completion_tokens: 15, total_tokens: 45 },
        })),
      };

      const orchestrator = new AgentOrchestrator({
        db: mockDb,
        env: mockEnv,
        llmProvider: mockLLMProvider,
        whatsAppProvider: mockWhatsAppProvider,
      });

      const result = await orchestrator.processIncomingMessage({
        restaurant: mockRestaurant,
        customer: mockCustomer,
        messageText: 'Hola, ¿qué pizzas tienen?',
      });

      expect(result.status).toBe('responded');
      expect(mockWhatsAppProvider.sendTextMessage).toHaveBeenCalledWith(
        mockRestaurant.slug,
        mockCustomer.phone,
        '¡Hola! Claro que sí, tenemos Pizza Margarita y Pepperoni.'
      );

      // Verificar que el mensaje de asistente guardó inicialmente delivery_status: pending
      const assistantMsg = savedMessages.find((m) => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();

      // Verificar que el update final a Supabase incluyó provider_message_id
      expect(assistantMsg?.provider_message_id).toBe('wa-msg-confirmed-101');
      expect(assistantMsg?.metadata).toMatchObject({
        delivery_status: 'sent',
      });
    });

    it('debe registrar status "failed" y capturar el error cuando el envío a WhatsApp lanza excepción', async () => {
      mockLLMProvider = {
        chat: vi.fn(async () => ({
          content: 'Respuesta con error de WhatsApp simulado',
        })),
      };

      mockWhatsAppProvider = {
        sendTextMessage: vi.fn(async () => {
          throw new Error('Evolution API network timeout (504)');
        }),
        sendMediaMessage: vi.fn(),
        markAsRead: vi.fn(),
      };

      const orchestrator = new AgentOrchestrator({
        db: mockDb,
        env: mockEnv,
        llmProvider: mockLLMProvider,
        whatsAppProvider: mockWhatsAppProvider,
      });

      const result = await orchestrator.processIncomingMessage({
        restaurant: mockRestaurant,
        customer: mockCustomer,
        messageText: 'Hola',
      });

      // El orquestador no colapsa y retorna la respuesta generada
      expect(result.status).toBe('responded');

      const assistantMsg = savedMessages.find((m) => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg?.metadata).toMatchObject({
        delivery_status: 'failed',
        delivery_error: expect.stringContaining('network timeout'),
      });
    });

    it('debe registrar status "failed" si WhatsAppProvider retorna success: false', async () => {
      mockLLMProvider = {
        chat: vi.fn(async () => ({
          content: 'Respuesta rechazada por WhatsApp',
        })),
      };

      mockWhatsAppProvider = {
        sendTextMessage: vi.fn(async () => ({
          success: false,
          rawResponse: { error: 'Recipient phone not on WhatsApp' },
        })),
        sendMediaMessage: vi.fn(),
        markAsRead: vi.fn(),
      };

      const orchestrator = new AgentOrchestrator({
        db: mockDb,
        env: mockEnv,
        llmProvider: mockLLMProvider,
        whatsAppProvider: mockWhatsAppProvider,
      });

      const result = await orchestrator.processIncomingMessage({
        restaurant: mockRestaurant,
        customer: mockCustomer,
        messageText: 'Hola',
      });

      expect(result.status).toBe('responded');

      const assistantMsg = savedMessages.find((m) => m.role === 'assistant');
      expect(assistantMsg?.metadata).toMatchObject({
        delivery_status: 'failed',
      });
    });

    it('debe rastrear delivery_status en mensaje de fallback cuando se alcanza el límite de iteraciones', async () => {
      // LLM ciclando indefinidamente con tool_calls
      mockLLMProvider = {
        chat: vi.fn(async () => ({
          content: null,
          tool_calls: [
            {
              id: 'call-loop',
              type: 'function' as const,
              function: { name: 'get_menu', arguments: '{}' },
            },
          ],
        })),
      };

      const orchestrator = new AgentOrchestrator({
        db: mockDb,
        env: mockEnv,
        llmProvider: mockLLMProvider,
        whatsAppProvider: mockWhatsAppProvider,
      });

      const result = await orchestrator.processIncomingMessage({
        restaurant: mockRestaurant,
        customer: mockCustomer,
        messageText: 'Quiero ordenar algo',
      });

      expect(result.status).toBe('max_iterations_reached');
      const fallbackMsg = savedMessages.find(
        (m) => (m.metadata as Record<string, unknown>)?.fallback_reason === 'max_iterations_reached'
      );
      expect(fallbackMsg).toBeDefined();
      expect(fallbackMsg?.provider_message_id).toBe('wa-msg-confirmed-101');
      expect(fallbackMsg?.metadata).toMatchObject({
        delivery_status: 'sent',
      });
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. Integration Tests: handleChatwootWebhook Delivery Tracking              */
  /* -------------------------------------------------------------------------- */
  describe('handleChatwootWebhook Delivery Tracking Integration', () => {
    let mockWhatsAppProvider: WhatsAppProvider;
    let savedMessages: Array<Record<string, unknown>>;
    let updatedDeliveryStatuses: Array<{ restaurantId: string; input: unknown }>;

    beforeEach(() => {
      savedMessages = [];
      updatedDeliveryStatuses = [];

      mockWhatsAppProvider = {
        sendTextMessage: vi.fn().mockResolvedValue({
          success: true,
          messageId: 'wa-chatwoot-outbound-999',
        }),
        sendMediaMessage: vi.fn(),
        markAsRead: vi.fn(),
      };
    });

    const mockConvoRepo = {
      setMode: vi.fn(),
      getOrCreateActiveConversation: vi.fn(),
      getById: vi.fn(),
      setStatus: vi.fn(),
    } as unknown as ConversationRepository;

    const mockRestaurantRepo = {
      getByIdOrSlug: vi.fn(async () => mockRestaurant),
      getAgentConfig: vi.fn(),
      getLastCompletedOrder: vi.fn(),
    } as unknown as RestaurantRepository;

    it('debe registrar status "sent" y providerMessageId al despachar mensaje de agente humano a WhatsApp', async () => {
      const mockMsgRepo = {
        saveMessage: vi.fn(async (restId: string, data: Record<string, unknown>) => {
          const msg = {
            id: 'b0000000-0000-0000-0000-000000000002',
            restaurant_id: restId,
            ...data,
            created_at: new Date().toISOString(),
          };
          savedMessages.push(msg);
          return msg;
        }),
        updateDeliveryStatus: vi.fn(async (restId: string, input: unknown) => {
          updatedDeliveryStatuses.push({ restaurantId: restId, input });
          return null;
        }),
      } as unknown as MessageRepository;

      const payload = {
        event: 'message_created',
        id: 888,
        content: '¡Hola! Ya va en camino tu pedido con el repartidor.',
        private: false,
        message_type: 'outgoing',
        sender: { id: 5, name: 'Lucía (Atención)', type: 'user' },
        contact: { id: 44, phone_number: '+5215598765432' },
        conversation: {
          id: 70,
          custom_attributes: {
            restaurant_id: restaurantId,
            conversation_id: conversationId,
          },
        },
      };

      const request = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': 'secret-chatwoot-webhook-token-456',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const response = await handleChatwootWebhook(request, mockEnv, undefined, {
        customProvider: mockWhatsAppProvider,
        customConversationRepo: mockConvoRepo,
        customMessageRepo: mockMsgRepo,
        customRestaurantRepo: mockRestaurantRepo,
      });

      expect(response.status).toBe(200);

      // Verificar que el mensaje se guardó con role: 'human_agent' y delivery_status: 'pending'
      expect(mockMsgRepo.saveMessage).toHaveBeenCalledWith(
        restaurantId,
        expect.objectContaining({
          role: 'human_agent',
          metadata: expect.objectContaining({
            delivery_status: 'pending',
            chatwoot_message_id: '888',
          }),
        })
      );

      // Verificar que se actualizó el estado a 'sent' con el ID retornado por WhatsAppProvider
      expect(mockMsgRepo.updateDeliveryStatus).toHaveBeenCalledWith(restaurantId, {
        messageId: 'b0000000-0000-0000-0000-000000000002',
        status: 'sent',
        providerMessageId: 'wa-chatwoot-outbound-999',
        rawResponse: undefined,
      });
    });

    it('debe registrar status "failed" cuando falla el envío de mensaje de agente humano a WhatsApp', async () => {
      mockWhatsAppProvider.sendTextMessage = vi.fn().mockRejectedValue(new Error('WhatsApp service down (502)'));

      const mockMsgRepo = {
        saveMessage: vi.fn(async (restId: string, data: Record<string, unknown>) => {
          const msg = {
            id: 'b0000000-0000-0000-0000-000000000003',
            restaurant_id: restId,
            ...data,
            created_at: new Date().toISOString(),
          };
          savedMessages.push(msg);
          return msg;
        }),
        updateDeliveryStatus: vi.fn(async (restId: string, input: unknown) => {
          updatedDeliveryStatuses.push({ restaurantId: restId, input });
          return null;
        }),
      } as unknown as MessageRepository;

      const payload = {
        event: 'message_created',
        id: 889,
        content: 'Mensaje que fallará al despachar',
        private: false,
        message_type: 'outgoing',
        sender: { id: 5, name: 'Lucía', type: 'user' },
        contact: { id: 44, phone_number: '+5215598765432' },
        conversation: {
          id: 70,
          custom_attributes: {
            restaurant_id: restaurantId,
            conversation_id: conversationId,
          },
        },
      };

      const request = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': 'secret-chatwoot-webhook-token-456',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const response = await handleChatwootWebhook(request, mockEnv, undefined, {
        customProvider: mockWhatsAppProvider,
        customConversationRepo: mockConvoRepo,
        customMessageRepo: mockMsgRepo,
        customRestaurantRepo: mockRestaurantRepo,
      });

      expect(response.status).toBe(200);

      // Verificar que se actualizó el estado a 'failed' con el mensaje de error
      expect(mockMsgRepo.updateDeliveryStatus).toHaveBeenCalledWith(restaurantId, {
        messageId: 'b0000000-0000-0000-0000-000000000003',
        status: 'failed',
        error: expect.stringContaining('WhatsApp service down'),
      });
    });

    it('no debe realizar llamadas de delivery tracking para eventos descartados (notas privadas)', async () => {
      const mockMsgRepo = {
        saveMessage: vi.fn(),
        updateDeliveryStatus: vi.fn(),
      } as unknown as MessageRepository;

      const payload = {
        event: 'message_created',
        id: 990,
        content: 'Nota interna: verificar dirección del cliente',
        private: true,
        message_type: 'outgoing',
        conversation: {
          id: 70,
          custom_attributes: { restaurant_id: restaurantId },
        },
      };

      const request = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': 'secret-chatwoot-webhook-token-456',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const response = await handleChatwootWebhook(request, mockEnv, undefined, {
        customProvider: mockWhatsAppProvider,
        customConversationRepo: mockConvoRepo,
        customMessageRepo: mockMsgRepo,
        customRestaurantRepo: mockRestaurantRepo,
      });

      expect(response.status).toBe(200);
      expect(mockWhatsAppProvider.sendTextMessage).not.toHaveBeenCalled();
      expect(mockMsgRepo.saveMessage).not.toHaveBeenCalled();
      expect(mockMsgRepo.updateDeliveryStatus).not.toHaveBeenCalled();
    });
  });
});
