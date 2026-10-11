import { describe, it, expect, vi } from 'vitest';
import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database } from '../src/types/database';
import { type Env } from '../src/types/env';
import {
  OpenAICompatibleProvider,
  type LLMMessage,
  type LLMToolDefinition,
} from '../src/providers/llm';
import {
  type ToolContext,
  getMenuTool,
  getProductTool,
  createOrderTool,
  addOrderItemTool,
  removeOrderItemTool,
  getCurrentOrderTool,
  confirmOrderTool,
  getCustomerTool,
  updateCustomerNotesTool,
  handoffToHumanTool,
  executeTool,
  getTool,
  getAllTools,
  zodToJsonSchema,
} from '../src/tools';
import { LLMProviderError, ValidationError, WorkerError } from '../src/utils/errors';
import { z } from 'zod';

function createMockToolContext(overrides?: {
  dbData?: Record<string, unknown>;
  restaurantId?: string;
  customerId?: string;
  conversationId?: string;
}): ToolContext {
  const dbData = overrides?.dbData ?? {};

  const createBuilder = (table: string): Record<string, unknown> => {
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      update: vi.fn(() => builder),
      delete: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      single: vi.fn(async () => {
        const mockError = dbData[`${table}:error`] ?? null;
        const mockData = dbData[`${table}:single`] ?? dbData[table] ?? null;
        return { data: mockData, error: mockError };
      }),
      maybeSingle: vi.fn(async () => {
        const mockError = dbData[`${table}:error`] ?? null;
        const mockData = dbData[`${table}:maybeSingle`] ?? dbData[table] ?? null;
        return { data: mockData, error: mockError };
      }),
      then: (resolve: (val: unknown) => unknown) => {
        const mockError = dbData[`${table}:error`] ?? null;
        const mockData = dbData[table] ?? [];
        return Promise.resolve(resolve({ data: mockData, error: mockError }));
      },
    };
    return builder;
  };

  const client = {
    from: vi.fn((table: string) => createBuilder(table)),
  } as unknown as SupabaseClient<Database>;

  const mockEnv: Env = {
    EVOLUTION_API_URL: 'https://evo.test.com',
    EVOLUTION_API_KEY: 'test-key-evo',
    WEBHOOK_VERIFY_TOKEN: 'verify-token-123',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key-abc',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-xyz',
    LLM_API_KEY: 'sk-llm-secret-999',
    LLM_MODEL: 'llama-3.3-70b-versatile',
    LLM_BASE_URL: 'https://api.groq.com/openai/v1',
  };

  return {
    restaurantId: overrides?.restaurantId ?? 'a0000000-0000-4000-8000-000000000001',
    customerId: overrides?.customerId ?? 'e0000000-0000-4000-8000-000000000001',
    conversationId: overrides?.conversationId ?? 'f0000000-0000-4000-8000-000000000001',
    db: client,
    env: mockEnv,
  };
}

describe('Challenger M2 — Adversarial Stress & Empirical Verification Suite', () => {
  const restaurantId = 'a0000000-0000-4000-8000-000000000001';
  const customerId = 'e0000000-0000-4000-8000-000000000001';
  const conversationId = 'f0000000-0000-4000-8000-000000000001';
  const categoryId = 'b0000000-0000-4000-8000-000000000001';
  const productId = 'c0000000-0000-4000-8000-000000000001';
  const orderId = 'd0000000-0000-4000-8000-000000000001';
  const itemId = 'a1000000-0000-4000-8000-000000000001';

  /* ========================================================================== */
  /* CHALLENGE 1: LLM Provider Adversarial Transports & Error Sanitization      */
  /* ========================================================================== */
  describe('Challenge 1: LLM Provider Edge Cases, HTTP Errors & Sanitization', () => {
    const testApiKey = 'sk-groq-live-secret-token-abcdef123456789';
    const baseOptions = {
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: testApiKey,
      model: 'llama-3.3-70b-versatile',
      timeoutMs: 300,
    };

    it('debe sanitizar la API key incluso cuando viene en mensajes anidados de error y encabezados Bearer', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: `Authentication failed for Bearer ${testApiKey} with upstream provider`,
              code: 'invalid_auth',
            },
          }),
          { status: 401, statusText: 'Unauthorized' }
        )
      );

      const provider = new OpenAICompatibleProvider({
        ...baseOptions,
        fetchFn: fetchMock,
      });

      try {
        await provider.chat([{ role: 'user', content: 'Dame el menú' }]);
        expect.unreachable('Debe fallar');
      } catch (err) {
        expect(err).toBeInstanceOf(LLMProviderError);
        const error = err as LLMProviderError;
        expect(error.statusCode).toBe(401);
        expect(error.message).not.toContain(testApiKey);
        expect(error.message).toContain('[REDACTED]');
      }
    });

    it('debe manejar Rate Limit HTTP 429 preservando el código de estado', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: 'Rate limit reached: 30 requests per minute exceeded.' },
          }),
          { status: 429, statusText: 'Too Many Requests' }
        )
      );

      const provider = new OpenAICompatibleProvider({
        ...baseOptions,
        fetchFn: fetchMock,
      });

      try {
        await provider.chat([{ role: 'user', content: 'Hola' }]);
        expect.unreachable('Debe fallar');
      } catch (err) {
        expect(err).toBeInstanceOf(LLMProviderError);
        expect((err as LLMProviderError).statusCode).toBe(429);
        expect((err as LLMProviderError).message).toContain('Rate limit reached');
      }
    });

    it('debe manejar respuestas HTTP 503 / 504 transformando a 502 Bad Gateway', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'Service temporarily unavailable. Model overloaded.',
          }),
          { status: 503, statusText: 'Service Unavailable' }
        )
      );

      const provider = new OpenAICompatibleProvider({
        ...baseOptions,
        fetchFn: fetchMock,
      });

      try {
        await provider.chat([{ role: 'user', content: 'Hola' }]);
        expect.unreachable('Debe fallar');
      } catch (err) {
        expect(err).toBeInstanceOf(LLMProviderError);
        expect((err as LLMProviderError).statusCode).toBe(502);
      }
    });

    it('debe manejar respuestas no-JSON (ej: HTML error 520 de Cloudflare) sin romper el proceso', async () => {
      const htmlBody = '<html><head><title>520 Origin Error</title></head><body><h1>Origin Error</h1></body></html>';
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(htmlBody, {
          status: 520,
          statusText: 'Origin Error',
          headers: { 'Content-Type': 'text/html' },
        })
      );

      const provider = new OpenAICompatibleProvider({
        ...baseOptions,
        fetchFn: fetchMock,
      });

      try {
        await provider.chat([{ role: 'user', content: 'Hola' }]);
        expect.unreachable('Debe fallar');
      } catch (err) {
        expect(err).toBeInstanceOf(LLMProviderError);
        expect((err as LLMProviderError).statusCode).toBe(520 >= 500 ? 502 : 520);
        expect((err as LLMProviderError).message).toContain('520 Origin Error');
      }
    });

    it('debe abortar por timeout y arrojar HTTP 504 Gateway Timeout', async () => {
      const slowFetchMock = vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((resolve, reject) => {
            const signal = init.signal;
            const timer = setTimeout(() => {
              resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'Tarde' } }] })));
            }, 1000);

            signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('The operation was aborted'));
            });
          })
      );

      const provider = new OpenAICompatibleProvider({
        ...baseOptions,
        timeoutMs: 50,
        fetchFn: slowFetchMock as unknown as typeof fetch,
      });

      try {
        await provider.chat([{ role: 'user', content: 'Hola' }]);
        expect.unreachable('Debe abortar');
      } catch (err) {
        expect(err).toBeInstanceOf(LLMProviderError);
        expect((err as LLMProviderError).statusCode).toBe(504);
        expect((err as LLMProviderError).message).toContain('Tiempo de espera agotado');
      }
    });

    it('debe parsear múltiples tool calls devueltas en un solo turno y aceptar function.arguments como objeto', async () => {
      const mockResponseBody = {
        id: 'chatcmpl-multi-001',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Voy a consultar el menú y su ficha de cliente.',
              tool_calls: [
                {
                  id: 'call_menu_001',
                  type: 'function',
                  function: {
                    name: 'get_menu',
                    arguments: '{"category":"pizzas"}',
                  },
                },
                {
                  type: 'function',
                  function: {
                    name: 'get_customer',
                    arguments: { phone: '5215512345678' },
                  },
                },
              ],
            },
          },
        ],
      };

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponseBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const provider = new OpenAICompatibleProvider({
        ...baseOptions,
        fetchFn: fetchMock,
      });

      const result = await provider.chat([{ role: 'user', content: 'Quiero mi pizza habitual' }]);

      expect(result.content).toBe('Voy a consultar el menú y su ficha de cliente.');
      expect(result.tool_calls).toHaveLength(2);
      expect(result.tool_calls?.[0]?.function.name).toBe('get_menu');
      expect(result.tool_calls?.[0]?.function.arguments).toBe('{"category":"pizzas"}');
      expect(result.tool_calls?.[1]?.function.name).toBe('get_customer');
      expect(result.tool_calls?.[1]?.function.arguments).toBe('{"phone":"5215512345678"}');
    });

    it('debe manejar respuestas con caracteres Unicode y Emojis sin distorsión', async () => {
      const emojiContent = '🍕 Tu pizza está lista en 25 min 🛵 ¡Buen provecho! ✨';
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: emojiContent } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const provider = new OpenAICompatibleProvider({
        ...baseOptions,
        fetchFn: fetchMock,
      });

      const res = await provider.chat([{ role: 'user', content: '¿Cuánto falta? 🍕' }]);
      expect(res.content).toBe(emojiContent);
    });
  });

  /* ========================================================================== */
  /* CHALLENGE 2: Tool Registry & Schema Converter Adversarial Boundary Tests   */
  /* ========================================================================== */
  describe('Challenge 2: Tool Registry & Boundary Validation', () => {
    it('debe manejar entradas malformadas de argumentos (JSON corrupto, arrays, primitivos)', async () => {
      const context = createMockToolContext();

      // 1. JSON sintácticamente corrupto
      const corruptRes = JSON.parse(await executeTool('get_product', '{"product_id": "abc', context));
      expect(corruptRes.success).toBe(false);
      expect(corruptRes.error).toContain('Argumentos JSON malformados');

      // 2. Trailing commas inválidas en JSON
      const trailingCommaRes = JSON.parse(
        await executeTool('get_product', `{"product_id": "${productId}",}`, context)
      );
      expect(trailingCommaRes.success).toBe(false);
      expect(trailingCommaRes.error).toContain('Argumentos JSON malformados');

      // 3. Primitivo numérico en lugar de objeto
      const numberRes = JSON.parse(await executeTool('get_product', '12345', context));
      expect(numberRes.success).toBe(false);
      expect(numberRes.error).toContain('Parámetros inválidos');

      // 4. Array en lugar de objeto
      const arrayRes = JSON.parse(await executeTool('get_product', `["${productId}"]`, context));
      expect(arrayRes.success).toBe(false);
      expect(arrayRes.error).toContain('Parámetros inválidos');
    });

    it('debe manejar strings vacíos o con solo espacios como objeto vacío {}', async () => {
      const mockConvo = { id: conversationId, restaurant_id: restaurantId, mode: 'human' };
      const context = createMockToolContext({
        dbData: {
          'conversations:single': mockConvo,
          'messages:single': { id: 'msg_1', role: 'system' },
        },
      });

      // handoff_to_human requiere 'reason', por lo que {} debe retornar error de validación Zod estructurado
      const res = JSON.parse(await executeTool('handoff_to_human', '   ', context));
      expect(res.success).toBe(false);
      expect(res.error).toContain('Parámetros inválidos para \'handoff_to_human\'');
    });

    it('debe resistir ataques de Prototype Pollution en executeTool y getTool', async () => {
      const context = createMockToolContext();

      const protoRes = JSON.parse(await executeTool('__proto__', '{}', context));
      expect(protoRes.success).toBe(false);
      expect(protoRes.error).toContain('no encontrada en el catálogo');

      const constructorRes = JSON.parse(await executeTool('constructor', '{}', context));
      expect(constructorRes.success).toBe(false);
      expect(constructorRes.error).toContain('no encontrada en el catálogo');

      const toStringRes = JSON.parse(await executeTool('toString', '{}', context));
      expect(toStringRes.success).toBe(false);
      expect(toStringRes.error).toContain('no encontrada en el catálogo');

      expect(getTool('__proto__')).toBeUndefined();
      expect(getTool('constructor')).toBeUndefined();
    });

    it('debe validar que las 11 tools en getLLMToolDefinitions generen schemas con types correctos', () => {
      const toolDefs = getAllTools();
      expect(toolDefs).toHaveLength(11);

      const expectedNames = [
        'get_menu',
        'get_product',
        'create_order',
        'add_order_item',
        'remove_order_item',
        'update_order_item_quantity',
        'get_current_order',
        'confirm_order',
        'get_customer',
        'update_customer_notes',
        'handoff_to_human',
      ];

      for (const name of expectedNames) {
        const tool = getTool(name);
        expect(tool).toBeDefined();
        expect(tool?.name).toBe(name);
        expect(tool?.description.length).toBeGreaterThan(10);
        expect(tool?.parameters).toBeDefined();

        const jsonSchema = zodToJsonSchema(tool!.parameters);
        expect(jsonSchema.type).toBe('object');
      }
    });
  });

  /* ========================================================================== */
  /* CHALLENGE 3: 10 Deterministic Tools Execution & Business Edge Cases        */
  /* ========================================================================== */
  describe('Challenge 3: Tool Execution Edge Cases & Math Determinism', () => {
    /* ------------------------------------------------------------------------ */
    /* 3.1 Catalog Tools Edge Cases                                             */
    /* ------------------------------------------------------------------------ */
    describe('Catalog Tools (get_menu, get_product)', () => {
      it('get_menu: debe manejar búsqueda por UUID exacto de categoría', async () => {
        const mockCategories = [
          { id: categoryId, name: 'Bebidas Frías', sort_order: 1, is_active: true, restaurant_id: restaurantId },
        ];
        const mockItems = [
          {
            id: productId,
            category_id: categoryId,
            name: 'Refresco 600ml',
            description: 'Coca Cola',
            price: 35,
            options_schema: [],
            is_available: true,
            restaurant_id: restaurantId,
          },
        ];

        const context = createMockToolContext({
          dbData: {
            menu_categories: mockCategories,
            menu_items: mockItems,
          },
        });

        const result = await getMenuTool.execute({ category: categoryId }, context);
        expect(result.success).toBe(true);
        expect(result.categories).toHaveLength(1);
        expect(result.categories[0]?.id).toBe(categoryId);
        expect(result.items).toHaveLength(1);
      });

      it('get_product: debe fallar si el producto está marcado como no disponible (is_available = false)', async () => {
        const mockProduct = {
          id: productId,
          name: 'Cerveza Artesanal',
          price: 90,
          is_available: false,
          restaurant_id: restaurantId,
        };

        const context = createMockToolContext({
          dbData: {
            'menu_items:maybeSingle': mockProduct,
          },
        });

        const result = await getProductTool.execute({ product_id: productId }, context);
        expect(result.success).toBe(false);
        expect(result.error).toContain('no disponible actualmente');
      });
    });

    /* ------------------------------------------------------------------------ */
    /* 3.2 Orders Tools Deterministic Math & Lifecycle Edge Cases               */
    /* ------------------------------------------------------------------------ */
    describe('Orders Tools Math & Lifecycle', () => {
      it('add_order_item: debe calcular determinísticamente la suma de múltiples modificadores de precio con redondeo a 2 decimales', async () => {
        const mockDraftOrder = {
          id: orderId,
          restaurant_id: restaurantId,
          status: 'draft',
          subtotal: 0,
          delivery_fee: 25.50,
          discount: 10.00,
          total: 15.50,
        };

        const mockProduct = {
          id: productId,
          name: 'Pizza Especial de la Casa',
          price: 199.99,
          is_available: true,
          restaurant_id: restaurantId,
          options_schema: [
            {
              name: 'Orilla',
              type: 'single_choice',
              required: false,
              choices: [{ label: 'Rellena de Queso', price_modifier: 35.5 }],
            },
            {
              name: 'Ingrediente Extra',
              type: 'single_choice',
              required: false,
              choices: [{ label: 'Tocino Crujiente', price_modifier: 14.75 }],
            },
          ],
        };

        const mockCreatedItem = {
          id: itemId,
          order_id: orderId,
          product_id: productId,
          quantity: 3,
          unit_price: 250.24, // 199.99 + 35.50 + 14.75 = 250.24
          subtotal: 750.72, // 250.24 * 3 = 750.72
        };

        const mockUpdatedOrder = {
          ...mockDraftOrder,
          subtotal: 750.72,
          total: 766.22, // 750.72 + 25.50 - 10.00 = 766.22
        };

        const context = createMockToolContext({
          dbData: {
            'orders:maybeSingle': mockDraftOrder,
            'menu_items:maybeSingle': mockProduct,
            'order_items:single': mockCreatedItem,
            'orders:single': mockUpdatedOrder,
          },
        });

        const result = await addOrderItemTool.execute(
          {
            order_id: orderId,
            product_id: productId,
            quantity: 3,
            options_selected: [
              { group_name: 'Orilla', choice_label: 'Rellena de Queso', price_modifier: 35.50 },
              { group_name: 'Ingrediente Extra', choice_label: 'Tocino Crujiente', price_modifier: 14.75 },
            ],
          },
          context
        );

        expect(result.success).toBe(true);
        expect(result.quantity).toBe(3);
        expect(result.unit_price).toBe(250.24);
        expect(result.item_subtotal).toBe(750.72);
        expect(result.order_subtotal).toBe(750.72);
        expect(result.order_total).toBe(766.22);
      });

      it('add_order_item: debe rechazar cantidades fraccionarias o negativas vía Zod schema', () => {
        const negativeQty = addOrderItemTool.parameters.safeParse({
          order_id: orderId,
          product_id: productId,
          quantity: -2,
        });
        expect(negativeQty.success).toBe(false);

        const floatQty = addOrderItemTool.parameters.safeParse({
          order_id: orderId,
          product_id: productId,
          quantity: 1.5,
        });
        expect(floatQty.success).toBe(false);
      });

      it('remove_order_item: debe recalcular a subtotal 0 cuando se elimina el único ítem de un pedido', async () => {
        const mockDraftOrder = {
          id: orderId,
          restaurant_id: restaurantId,
          status: 'draft',
          subtotal: 180,
          delivery_fee: 30,
          discount: 0,
          total: 210,
        };

        const mockItem = {
          id: itemId,
          order_id: orderId,
          subtotal: 180,
        };

        const mockUpdatedOrder = {
          ...mockDraftOrder,
          subtotal: 0,
          total: 30, // Solo queda la tarifa de envío
        };

        const context = createMockToolContext({
          dbData: {
            'orders:maybeSingle': mockDraftOrder,
            'order_items:maybeSingle': mockItem,
            'order_items': [], // No quedan más items
            'orders:single': mockUpdatedOrder,
          },
        });

        const result = await removeOrderItemTool.execute(
          { order_id: orderId, item_id: itemId },
          context
        );

        expect(result.success).toBe(true);
        expect(result.removed_item_id).toBe(itemId);
        expect(result.new_subtotal).toBe(0);
        expect(result.new_total).toBe(30);
        expect(result.remaining_items_count).toBe(0);
      });

      it('confirm_order: debe rechazar pedidos que ya fueron confirmados previamente', async () => {
        const mockConfirmedOrder = {
          id: orderId,
          status: 'confirmed',
          subtotal: 300,
          delivery_fee: 0,
          total: 300,
          order_items: [{ id: itemId, subtotal: 300 }],
        };

        const context = createMockToolContext({
          dbData: {
            'orders:maybeSingle': mockConfirmedOrder,
          },
        });

        await expect(
          confirmOrderTool.execute(
            {
              order_id: orderId,
              delivery_address: 'Av. Insurgentes Sur 400',
              payment_method: 'card',
            },
            context
          )
        ).rejects.toThrowError("El pedido ya se encuentra en estado 'confirmed'");
      });

      it('confirm_order: executeTool debe atrapar ValidationError y retornar JSON estructurado sin romper la ejecución', async () => {
        const mockEmptyOrder = {
          id: orderId,
          status: 'draft',
          subtotal: 0,
          total: 0,
          order_items: [],
        };

        const context = createMockToolContext({
          dbData: {
            'orders:maybeSingle': mockEmptyOrder,
          },
        });

        const responseString = await executeTool(
          'confirm_order',
          JSON.stringify({
            order_id: orderId,
            delivery_address: 'Calle Juárez 123',
            payment_method: 'cash',
          }),
          context
        );

        const parsed = JSON.parse(responseString);
        expect(parsed.success).toBe(false);
        expect(parsed.error).toContain('No se puede confirmar un pedido sin productos');
      });
    });

    /* ------------------------------------------------------------------------ */
    /* 3.3 Customer Memory & Notes Edge Cases                                   */
    /* ------------------------------------------------------------------------ */
    describe('Customer & Waiter Notepad Tools', () => {
      it('get_customer: debe retornar last_order: null cuando el cliente es nuevo y no tiene compras previas', async () => {
        const mockCustomer = {
          id: customerId,
          restaurant_id: restaurantId,
          phone: '5215599887766',
          name: 'Nuevo Comensal',
          address_default: null,
          notes_md: '',
        };

        const context = createMockToolContext({
          dbData: {
            'customers:maybeSingle': mockCustomer,
            'orders:maybeSingle': null, // sin pedidos
          },
        });

        const result = await getCustomerTool.execute({}, context);
        expect(result.success).toBe(true);
        expect(result.customer?.name).toBe('Nuevo Comensal');
        expect(result.last_order).toBeNull();
      });

      it('update_customer_notes: debe permitir notas de exactamente 5,000 caracteres y rechazar 5,001 caracteres', async () => {
        const exact5k = '# Preferencias\n' + 'X'.repeat(4985);
        expect(exact5k.length).toBe(5000);

        const updatedCustomer = {
          id: customerId,
          restaurant_id: restaurantId,
          notes_md: exact5k,
        };

        const context = createMockToolContext({
          dbData: {
            'customers:single': updatedCustomer,
          },
        });

        const result = await updateCustomerNotesTool.execute({ notes_md: exact5k }, context);
        expect(result.success).toBe(true);
        expect(result.notes_md.length).toBe(5000);

        const tooLong = 'X'.repeat(5001);
        const parseCheck = updateCustomerNotesTool.parameters.safeParse({ notes_md: tooLong });
        expect(parseCheck.success).toBe(false);
      });
    });

    /* ------------------------------------------------------------------------ */
    /* 3.4 Escalation (handoff_to_human) Edge Cases                             */
    /* ------------------------------------------------------------------------ */
    describe('Escalation & Handoff Tool', () => {
      it('handoff_to_human: debe cambiar modo a human incluso si el insert de mensaje de sistema falla', async () => {
        const mockConvo = {
          id: conversationId,
          restaurant_id: restaurantId,
          mode: 'human',
        };

        const context = createMockToolContext({
          dbData: {
            'conversations:single': mockConvo,
            'messages:error': { message: 'Database connection failed during audit logging' },
          },
        });

        const result = await handoffToHumanTool.execute(
          { reason: 'Cliente muy molesto exige hablar con el gerente' },
          context
        );

        expect(result.success).toBe(true);
        expect(result.mode).toBe('human');
        expect(result.reason).toBe('Cliente muy molesto exige hablar con el gerente');
        expect(result.message).toContain('Conversación transferida a operador humano');
      });
    });
  });
});
