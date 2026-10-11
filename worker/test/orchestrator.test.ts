import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database, type Restaurant, type Customer, type Conversation, type Message } from '../src/types/database';
import { type Env } from '../src/types/env';
import { type LLMProvider, type LLMMessage, type LLMResponse, type LLMToolDefinition } from '../src/providers/llm/interface';
import { type WhatsAppProvider } from '../src/providers/whatsapp/interface';
import { AgentOrchestrator } from '../src/services/agent/orchestrator';
import { ConversationRepository } from '../src/services/db/conversation-repository';
import { MessageRepository } from '../src/services/db/message-repository';
import { RestaurantRepository } from '../src/services/db/restaurant-repository';
import { CustomerRepository } from '../src/services/db/customer-repository';
import { OrderRepository } from '../src/services/db/order-repository';
import { LLMProviderError } from '../src/utils/errors';

describe('AgentOrchestrator — Bounded Tool Calling & Conversational Loop', () => {
  const mockEnv: Env = {
    EVOLUTION_API_URL: 'http://mock-evolution',
    EVOLUTION_API_KEY: 'mock-key',
    WEBHOOK_VERIFY_TOKEN: 'mock-token',
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_ANON_KEY: 'mock-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service',
    LLM_API_KEY: 'mock-llm-key',
    LLM_MODEL: 'gpt-4o-mini',
    LLM_BASE_URL: 'https://api.openai.com/v1',
  };

  const mockRestaurant: Restaurant = {
    id: '11111111-1111-1111-1111-111111111111',
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
    id: '22222222-2222-2222-2222-222222222222',
    restaurant_id: mockRestaurant.id,
    phone: '5215598765432',
    name: 'Carlos Mendoza',
    address_default: 'Calle Roble #45',
    notes_md: '- Masa delgada',
    created_at: '2026-02-01T10:00:00Z',
    updated_at: '2026-02-01T10:00:00Z',
  };

  let mockDb: SupabaseClient<Database>;
  let mockLLMProvider: LLMProvider;
  let mockWhatsAppProvider: WhatsAppProvider;

  // In-memory mock repositories
  let savedMessages: Array<Record<string, unknown>>;
  let activeConversation: Conversation;
  let activeOrderData: Record<string, unknown> | null;

  beforeEach(() => {
    savedMessages = [];
    activeOrderData = null;
    activeConversation = {
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      restaurant_id: mockRestaurant.id,
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
              id: `msg-${savedMessages.length + 1}`,
              ...(typeof payload === 'object' && payload ? payload : {}),
              created_at: new Date().toISOString(),
            };
            savedMessages.push(inserted);
          }
          if (table === 'orders') {
            activeOrderData = {
              id: 'order-uuid-999',
              restaurant_id: mockRestaurant.id,
              customer_id: mockCustomer.id,
              status: 'draft',
              subtotal: 0,
              delivery_fee: 0,
              discount: 0,
              total: 0,
              ...(typeof payload === 'object' && payload ? payload : {}),
              created_at: new Date().toISOString(),
            };
          }
          return builder;
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          if (table === 'conversations' && payload.mode) {
            activeConversation.mode = payload.mode as 'ai' | 'human';
          }
          if (table === 'orders' && activeOrderData) {
            Object.assign(activeOrderData, payload);
          }
          return builder;
        }),
        delete: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        in: vi.fn(() => builder),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        single: vi.fn(async () => {
          if (table === 'conversations') return { data: activeConversation, error: null };
          if (table === 'messages') return { data: savedMessages[savedMessages.length - 1], error: null };
          if (table === 'orders') return { data: activeOrderData, error: null };
          return { data: null, error: null };
        }),
        maybeSingle: vi.fn(async () => {
          if (table === 'conversations') return { data: activeConversation, error: null };
          if (table === 'restaurants') return { data: mockRestaurant, error: null };
          if (table === 'customers') return { data: mockCustomer, error: null };
          if (table === 'orders') return { data: activeOrderData, error: null };
          if (table === 'menu_items') {
            return {
              data: {
                id: 'e1111111-1111-1111-1111-111111111111',
                restaurant_id: mockRestaurant.id,
                name: 'Pizza Pepperoni',
                price: 189.0,
                is_available: true,
              },
              error: null,
            };
          }
          if (table === 'agent_configs') {
            return {
              data: {
                id: 'config-1',
                restaurant_id: mockRestaurant.id,
                system_prompt: 'Eres Don Mario.',
                business_rules: 'Envíos $30.',
                operating_hours: { friday: { open: '10:00', close: '23:00' } },
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
          if (table === 'menu_categories') {
            return Promise.resolve(resolve({ data: [{ id: 'cat-1', name: 'Pizzas', sort_order: 1, is_active: true }], error: null }));
          }
          if (table === 'menu_items') {
            return Promise.resolve(
              resolve({
                data: [
                  {
                    id: 'e1111111-1111-1111-1111-111111111111',
                    restaurant_id: mockRestaurant.id,
                    name: 'Pizza Pepperoni',
                    description: 'Pepperoni artesanal',
                    price: 189.0,
                    options_schema: [],
                    is_available: true,
                  },
                ],
                error: null,
              })
            );
          }
          if (table === 'messages') {
            return Promise.resolve(resolve({ data: savedMessages, error: null }));
          }
          return Promise.resolve(resolve({ data: [], error: null }));
        },
      };
      return builder;
    };

    mockDb = {
      from: vi.fn((table: string) => createDbBuilder(table)),
    } as unknown as SupabaseClient<Database>;

    mockWhatsAppProvider = {
      sendTextMessage: vi.fn(async () => ({ success: true, messageId: 'wa-msg-1' })),
      sendMediaMessage: vi.fn(async () => ({ success: true, messageId: 'wa-media-1' })),
      markAsRead: vi.fn(async () => true),
    };
  });

  describe('Human Mode Silencing (R6)', () => {
    it('debe silenciar al bot y NO llamar al LLM si la conversación está en mode = "human"', async () => {
      activeConversation.mode = 'human';

      const chatMock = vi.fn();
      mockLLMProvider = { chat: chatMock };

      const orchestrator = new AgentOrchestrator({
        db: mockDb,
        env: mockEnv,
        llmProvider: mockLLMProvider,
        whatsAppProvider: mockWhatsAppProvider,
      });

      const result = await orchestrator.processIncomingMessage({
        restaurant: mockRestaurant,
        customer: mockCustomer,
        messageText: 'Hola, ¿sigue alguien ahí?',
        providerMessageId: 'prov-msg-101',
      });

      expect(result.status).toBe('silenced_human_mode');
      expect(result.conversationId).toBe(activeConversation.id);
      expect(chatMock).not.toHaveBeenCalled();
      expect(mockWhatsAppProvider.sendTextMessage).not.toHaveBeenCalled();

      expect(savedMessages.length).toBe(1);
      expect(savedMessages[0]?.role).toBe('user');
      expect(savedMessages[0]?.content).toBe('Hola, ¿sigue alguien ahí?');
    });
  });

  describe('Text-Only Response Flow', () => {
    it('debe procesar un mensaje simple de texto sin tools, guardar turno de asistente y responder', async () => {
      const mockLLMReply = '¡Hola Carlos! Bienvenido a Pizzería Bella Napoli. ¿Qué te gustaría ordenar hoy?';

      mockLLMProvider = {
        chat: vi.fn(async () => ({
          content: mockLLMReply,
          usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
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
        messageText: 'Hola buenas tardes',
        providerMessageId: 'prov-msg-102',
      });

      expect(result.status).toBe('responded');
      if (result.status === 'responded') {
        expect(result.replyText).toBe(mockLLMReply);
        expect(result.toolCallsExecuted).toBe(0);
      }

      expect(mockLLMProvider.chat).toHaveBeenCalledTimes(1);
      expect(mockWhatsAppProvider.sendTextMessage).toHaveBeenCalledWith(
        mockRestaurant.slug,
        mockCustomer.phone,
        mockLLMReply
      );

      expect(savedMessages.length).toBe(2);
      expect(savedMessages[0]?.role).toBe('user');
      expect(savedMessages[0]?.content).toBe('Hola buenas tardes');
      expect(savedMessages[1]?.role).toBe('assistant');
      expect(savedMessages[1]?.content).toBe(mockLLMReply);
    });

    it('debe funcionar correctamente sin WhatsAppProvider (modo testing / headless)', async () => {
      const mockLLMReply = 'Respuesta sin WhatsApp provider';

      mockLLMProvider = {
        chat: vi.fn(async () => ({
          content: mockLLMReply,
        })),
      };

      const orchestrator = new AgentOrchestrator({
        db: mockDb,
        env: mockEnv,
        llmProvider: mockLLMProvider,
      });

      const result = await orchestrator.processIncomingMessage({
        restaurant: mockRestaurant,
        customer: mockCustomer,
        messageText: 'Test sin whatsAppProvider',
      });

      expect(result.status).toBe('responded');
      if (result.status === 'responded') {
        expect(result.replyText).toBe(mockLLMReply);
      }
    });

    it('debe ser resiliente si WhatsAppProvider falla arrojando un error', async () => {
      const failingWhatsApp: WhatsAppProvider = {
        sendTextMessage: vi.fn(async () => {
          throw new Error('WhatsApp Network Socket Error');
        }),
        sendMediaMessage: vi.fn(async () => ({ success: false })),
        markAsRead: vi.fn(async () => false),
      };

      mockLLMProvider = {
        chat: vi.fn(async () => ({
          content: 'Mensaje que intenta enviarse por WhatsApp',
        })),
      };

      const orchestrator = new AgentOrchestrator({
        db: mockDb,
        env: mockEnv,
        llmProvider: mockLLMProvider,
        whatsAppProvider: failingWhatsApp,
      });

      const result = await orchestrator.processIncomingMessage({
        restaurant: mockRestaurant,
        customer: mockCustomer,
        messageText: 'Test fallo whatsapp',
      });

      expect(result.status).toBe('responded');
      if (result.status === 'responded') {
        expect(result.replyText).toBe('Mensaje que intenta enviarse por WhatsApp');
      }
    });
  });

  describe('Single-Step & Multi-Step Tool Calling Loop (R4, R6)', () => {
    it('debe ejecutar una herramienta (get_menu) y retornar la respuesta final en la 2da iteración', async () => {
      let callCount = 0;
      mockLLMProvider = {
        chat: vi.fn(async (_msgs: LLMMessage[], _tools?: LLMToolDefinition[]): Promise<LLMResponse> => {
          callCount++;
          if (callCount === 1) {
            return {
              content: null,
              tool_calls: [
                {
                  id: 'call_menu_1',
                  type: 'function',
                  function: {
                    name: 'get_menu',
                    arguments: '{}',
                  },
                },
              ],
            };
          }
          return {
            content: 'Tenemos Pizza Pepperoni por $189.00.',
            usage: { prompt_tokens: 100, completion_tokens: 15, total_tokens: 115 },
          };
        }),
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
        messageText: '¿Qué pizzas tienen?',
      });

      expect(result.status).toBe('responded');
      if (result.status === 'responded') {
        expect(result.replyText).toBe('Tenemos Pizza Pepperoni por $189.00.');
        expect(result.toolCallsExecuted).toBe(1);
      }

      expect(mockLLMProvider.chat).toHaveBeenCalledTimes(2);

      // 4 mensajes persistidos: user -> assistant (tool_calls) -> tool (result) -> assistant (final)
      expect(savedMessages.length).toBe(4);
      expect(savedMessages[0]?.role).toBe('user');
      expect(savedMessages[1]?.role).toBe('assistant');
      expect(savedMessages[2]?.role).toBe('tool');
      expect(savedMessages[3]?.role).toBe('assistant');
      expect(savedMessages[3]?.content).toBe('Tenemos Pizza Pepperoni por $189.00.');
    });

    it('debe soportar múltiples tool_calls en un solo turno del LLM', async () => {
      let callCount = 0;
      mockLLMProvider = {
        chat: vi.fn(async (): Promise<LLMResponse> => {
          callCount++;
          if (callCount === 1) {
            return {
              content: null,
              tool_calls: [
                {
                  id: 'call_customer_1',
                  type: 'function',
                  function: {
                    name: 'get_customer',
                    arguments: '{}',
                  },
                },
                {
                  id: 'call_menu_2',
                  type: 'function',
                  function: {
                    name: 'get_menu',
                    arguments: '{}',
                  },
                },
              ],
            };
          }
          return {
            content: 'Hola Carlos, veo tus notas y el menú.',
          };
        }),
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
      if (result.status === 'responded') {
        expect(result.toolCallsExecuted).toBe(2);
      }
      expect(mockLLMProvider.chat).toHaveBeenCalledTimes(2);

      // Mensajes: user -> assistant (2 tool_calls) -> tool 1 -> tool 2 -> assistant final
      expect(savedMessages.length).toBe(5);
      expect(savedMessages[0]?.role).toBe('user');
      expect(savedMessages[1]?.role).toBe('assistant');
      expect(savedMessages[2]?.role).toBe('tool');
      expect(savedMessages[3]?.role).toBe('tool');
      expect(savedMessages[4]?.role).toBe('assistant');
    });

    it('debe ejecutar un flujo secuencial multi-paso (get_menu -> create_order -> add_order_item -> respuesta)', async () => {
      let step = 0;
      mockLLMProvider = {
        chat: vi.fn(async (): Promise<LLMResponse> => {
          step++;
          if (step === 1) {
            return {
              content: null,
              tool_calls: [
                {
                  id: 'call_step_1',
                  type: 'function',
                  function: { name: 'get_menu', arguments: '{}' },
                },
              ],
            };
          }
          if (step === 2) {
            return {
              content: null,
              tool_calls: [
                {
                  id: 'call_step_2',
                  type: 'function',
                  function: { name: 'create_order', arguments: '{}' },
                },
              ],
            };
          }
          if (step === 3) {
            return {
              content: null,
              tool_calls: [
                {
                  id: 'call_step_3',
                  type: 'function',
                  function: {
                    name: 'add_order_item',
                    arguments: JSON.stringify({
                      order_id: '11111111-1111-1111-1111-111111111111',
                      product_id: 'e1111111-1111-1111-1111-111111111111',
                      quantity: 1,
                    }),
                  },
                },
              ],
            };
          }
          return {
            content: 'He creado tu pedido con la Pizza Pepperoni.',
          };
        }),
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
        messageText: 'Quiero pedir una pizza pepperoni',
      });

      expect(result.status).toBe('responded');
      if (result.status === 'responded') {
        expect(result.replyText).toContain('He creado tu pedido');
        expect(result.toolCallsExecuted).toBe(3);
      }
      expect(mockLLMProvider.chat).toHaveBeenCalledTimes(4);
    });

    it('debe detener el bucle inmediatamente y cambiar a modo humano cuando se ejecuta handoff_to_human', async () => {
      mockLLMProvider = {
        chat: vi.fn(async (): Promise<LLMResponse> => ({
          content: 'Entiendo tu molestia, te paso con un agente.',
          tool_calls: [
            {
              id: 'call_handoff_1',
              type: 'function',
              function: {
                name: 'handoff_to_human',
                arguments: JSON.stringify({ reason: 'Cliente molesto con el servicio' }),
              },
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
        messageText: 'Quiero hablar con el gerente ya',
      });

      expect(result.status).toBe('responded');
      if (result.status === 'responded') {
        expect(result.replyText).toContain('te paso con un agente');
        expect(result.toolCallsExecuted).toBe(1);
      }

      expect(activeConversation.mode).toBe('human');
      expect(mockLLMProvider.chat).toHaveBeenCalledTimes(1);
    });
  });

  describe('Bounded Loop Limit (Max 5 Iterations) & Error Resilience', () => {
    it('debe detenerse forzosamente tras 5 iteraciones de tool_calls continuas y emitir mensaje de fallback', async () => {
      mockLLMProvider = {
        chat: vi.fn(async (): Promise<LLMResponse> => ({
          content: null,
          tool_calls: [
            {
              id: `loop_call_${Math.random()}`,
              type: 'function',
              function: {
                name: 'get_menu',
                arguments: '{}',
              },
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
        messageText: 'Loop infinito de tools',
      });

      expect(result.status).toBe('max_iterations_reached');
      if (result.status === 'max_iterations_reached') {
        expect(result.replyText).toContain('Disculpa la demora');
        expect(result.toolCallsExecuted).toBe(5);
      }

      expect(mockLLMProvider.chat).toHaveBeenCalledTimes(5);
      expect(mockWhatsAppProvider.sendTextMessage).toHaveBeenCalledWith(
        mockRestaurant.slug,
        mockCustomer.phone,
        expect.stringContaining('Disculpa la demora')
      );
    });

    it('debe manejar errores de proveedor LLM sin tumbar la ejecución, retornando status error y mensaje amigable', async () => {
      mockLLMProvider = {
        chat: vi.fn(async () => {
          throw new LLMProviderError('LLM Provider error: 502 Bad Gateway', 502);
        }),
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
        messageText: 'Hola con error de API',
      });

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.error).toContain('502 Bad Gateway');
        expect(result.replyText).toContain('Tuvimos un inconveniente al procesar tu mensaje');
      }
    });
  });
});
