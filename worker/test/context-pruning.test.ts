import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database, type Restaurant, type Customer, type Conversation, type Message } from '../src/types/database';
import { type Env } from '../src/types/env';
import { type LLMProvider, type LLMMessage, type LLMResponse, type LLMToolDefinition } from '../src/providers/llm/interface';
import { type WhatsAppProvider } from '../src/providers/whatsapp/interface';
import {
  AgentOrchestrator,
  pruneToolResponse,
  buildConversationHistory,
} from '../src/services/agent/orchestrator';

describe('Context Pruning for Tool Responses (Milestone 5 - R2)', () => {
  describe('Unit: pruneToolResponse', () => {
    it('debe podar respuestas de get_menu reduciendo caracteres en más del 70%', () => {
      const fullMenuPayload = JSON.stringify({
        success: true,
        categories: [
          { id: 'cat-1', name: 'Pizzas Tradicionales', sort_order: 1 },
          { id: 'cat-2', name: 'Pizzas Especiales', sort_order: 2 },
          { id: 'cat-3', name: 'Bebidas', sort_order: 3 },
          { id: 'cat-4', name: 'Postres', sort_order: 4 },
        ],
        items: [
          {
            id: 'item-1',
            category_id: 'cat-1',
            name: 'Pizza Pepperoni Clásica',
            description: 'Salsa de tomate San Marzano, mozzarella fior di latte y abundante pepperoni artesanal curado.',
            price: 189.0,
            options_schema: [
              {
                name: 'Tamaño',
                type: 'single_choice',
                required: true,
                choices: [
                  { label: 'Mediana (30cm)', price_modifier: 0 },
                  { label: 'Grande (35cm)', price_modifier: 50 },
                  { label: 'Familiar (40cm)', price_modifier: 95 },
                ],
              },
              {
                name: 'Orilla',
                type: 'single_choice',
                required: false,
                choices: [
                  { label: 'Tradicional', price_modifier: 0 },
                  { label: 'Rellena de queso crema', price_modifier: 45 },
                ],
              },
            ],
          },
          {
            id: 'item-2',
            category_id: 'cat-1',
            name: 'Pizza Cuatro Quesos',
            description: 'Combinación artesanal de queso mozzarella, gorgonzola, parmesano reggiano y provolone ahumado.',
            price: 219.0,
            options_schema: [],
          },
          {
            id: 'item-3',
            category_id: 'cat-2',
            name: 'Pizza Suprema Diávola',
            description: 'Chorizo italiano, pimientos asados, cebolla morada, jalapeños frescos y toque de aceite picante.',
            price: 249.0,
            options_schema: [],
          },
          {
            id: 'item-4',
            category_id: 'cat-3',
            name: 'Coca-Cola 600ml',
            description: 'Refresco embotellado de 600ml bien frío.',
            price: 35.0,
            options_schema: [],
          },
        ],
      });

      const originalLength = fullMenuPayload.length;
      expect(originalLength).toBeGreaterThan(1200);

      // Con tool_name explícito
      const prunedExplicit = pruneToolResponse(fullMenuPayload, 'get_menu');
      const parsedExplicit = JSON.parse(prunedExplicit);

      expect(parsedExplicit.success).toBe(true);
      expect(parsedExplicit.status).toBe('success');
      expect(parsedExplicit.items_count).toBe(4);
      expect(parsedExplicit.categories).toEqual([
        'Pizzas Tradicionales',
        'Pizzas Especiales',
        'Bebidas',
        'Postres',
      ]);
      expect(parsedExplicit.note).toContain('cached in system prompt');

      const reductionExplicit = ((originalLength - prunedExplicit.length) / originalLength) * 100;
      expect(reductionExplicit).toBeGreaterThan(70);

      // Sin tool_name (detección heurística de payload)
      const prunedInferred = pruneToolResponse(fullMenuPayload);
      const parsedInferred = JSON.parse(prunedInferred);
      expect(parsedInferred.items_count).toBe(4);
      expect(parsedInferred.categories.length).toBe(4);
    });

    it('debe podar respuestas de get_product preservando identidad y precio', () => {
      const fullProductPayload = JSON.stringify({
        success: true,
        product: {
          id: 'e1111111-1111-1111-1111-111111111111',
          name: 'Pizza Pepperoni',
          description: 'Deliciosa pizza con masa madre fermentada por 48 horas y pepperoni importado.',
          price: 189.0,
          is_available: true,
          options_schema: [
            {
              name: 'Tamaño',
              type: 'single_choice',
              required: true,
              choices: [
                { label: 'Mediana', price_modifier: 0 },
                { label: 'Grande', price_modifier: 50 },
              ],
            },
          ],
        },
      });

      const pruned = pruneToolResponse(fullProductPayload, 'get_product');
      const parsed = JSON.parse(pruned);

      expect(parsed.success).toBe(true);
      expect(parsed.product_id).toBe('e1111111-1111-1111-1111-111111111111');
      expect(parsed.name).toBe('Pizza Pepperoni');
      expect(parsed.price).toBe(189.0);
      expect(parsed.note).toContain('consultados previamente');
      expect(parsed).not.toHaveProperty('options_schema');
      expect(parsed).not.toHaveProperty('description');
    });

    it('debe podar respuestas de create_order reteniendo order_id y status', () => {
      const fullCreateOrderPayload = JSON.stringify({
        success: true,
        order: {
          id: 'ord-9999-aaaa',
          status: 'draft',
          subtotal: 0,
          delivery_fee: 0,
          discount: 0,
          total: 0,
          created_at: '2026-08-26T12:00:00.000Z',
        },
      });

      const pruned = pruneToolResponse(fullCreateOrderPayload, 'create_order');
      const parsed = JSON.parse(pruned);

      expect(parsed.success).toBe(true);
      expect(parsed.order_id).toBe('ord-9999-aaaa');
      expect(parsed.status).toBe('draft');
      expect(parsed.note).toContain('System Prompt');
    });

    it('debe podar respuestas de add_order_item eliminando el array current_cart redundante', () => {
      const fullAddOrderItemPayload = JSON.stringify({
        success: true,
        order_id: 'ord-1234',
        item_id: 'item-row-5678',
        product_id: 'prod-uuid-111',
        quantity: 2,
        unit_price: 239.0,
        item_subtotal: 478.0,
        order_subtotal: 478.0,
        order_total: 508.0,
        current_cart: [
          {
            id: 'item-row-5678',
            product_id: 'prod-uuid-111',
            name: 'Pizza Cuatro Quesos',
            quantity: 2,
            unit_price: 239.0,
            subtotal: 478.0,
            options_selected: [
              { group_name: 'Orilla', choice_label: 'Rellena de queso', price_modifier: 45 },
            ],
          },
        ],
        items_count: 1,
      });

      const pruned = pruneToolResponse(fullAddOrderItemPayload, 'add_order_item');
      const parsed = JSON.parse(pruned);

      expect(parsed.success).toBe(true);
      expect(parsed.order_id).toBe('ord-1234');
      expect(parsed.item_id).toBe('item-row-5678');
      expect(parsed.items_count).toBe(1);
      expect(parsed.order_total).toBe(508.0);
      expect(parsed).not.toHaveProperty('current_cart');
      expect(parsed.note).toContain('System Prompt');
    });

    it('debe podar respuestas de remove_order_item y update_order_item_quantity', () => {
      const removePayload = JSON.stringify({
        success: true,
        order_id: 'ord-1234',
        removed_item_id: 'item-row-5678',
        new_subtotal: 0,
        new_total: 0,
        remaining_items_count: 0,
        current_cart: [],
      });

      const prunedRemove = pruneToolResponse(removePayload, 'remove_order_item');
      const parsedRemove = JSON.parse(prunedRemove);

      expect(parsedRemove.success).toBe(true);
      expect(parsedRemove.order_id).toBe('ord-1234');
      expect(parsedRemove.item_id).toBe('item-row-5678');
      expect(parsedRemove.items_count).toBe(0);
      expect(parsedRemove.order_total).toBe(0);

      const updateQtyPayload = JSON.stringify({
        success: true,
        order_id: 'ord-1234',
        item_id: 'item-row-5678',
        new_quantity: 3,
        unit_price: 189.0,
        item_subtotal: 567.0,
        order_subtotal: 567.0,
        order_total: 597.0,
        current_cart: [{ id: 'item-row-5678', name: 'Pizza', quantity: 3 }],
        items_count: 1,
      });

      const prunedUpdate = pruneToolResponse(updateQtyPayload, 'update_order_item_quantity');
      const parsedUpdate = JSON.parse(prunedUpdate);

      expect(parsedUpdate.success).toBe(true);
      expect(parsedUpdate.order_id).toBe('ord-1234');
      expect(parsedUpdate.item_id).toBe('item-row-5678');
      expect(parsedUpdate.items_count).toBe(1);
      expect(parsedUpdate.order_total).toBe(597.0);
      expect(parsedUpdate).not.toHaveProperty('current_cart');
    });

    it('debe podar respuestas de get_current_order y confirm_order', () => {
      const getCurrentOrderPayload = JSON.stringify({
        success: true,
        order: {
          id: 'ord-current-1',
          status: 'draft',
          subtotal: 378.0,
          delivery_fee: 30.0,
          discount: 0,
          total: 408.0,
          delivery_address: 'Av Reforma 100',
          payment_method: 'cash',
          items: [
            { id: 'i-1', product_id: 'p-1', name: 'Pizza', quantity: 2, unit_price: 189, options_selected: [], subtotal: 378 },
          ],
        },
      });

      const prunedGetOrder = pruneToolResponse(getCurrentOrderPayload, 'get_current_order');
      const parsedGetOrder = JSON.parse(prunedGetOrder);

      expect(parsedGetOrder.success).toBe(true);
      expect(parsedGetOrder.order_id).toBe('ord-current-1');
      expect(parsedGetOrder.items_count).toBe(1);
      expect(parsedGetOrder.order_total).toBe(408.0);
      expect(parsedGetOrder).not.toHaveProperty('items');

      const confirmPayload = JSON.stringify({
        success: true,
        order_id: 'ord-current-1',
        status: 'confirmed',
        subtotal: 378.0,
        delivery_fee: 30.0,
        total: 408.0,
        delivery_address: 'Av Reforma 100',
        payment_method: 'cash',
        message: 'Pedido confirmado exitosamente y enviado a cocina.',
      });

      const prunedConfirm = pruneToolResponse(confirmPayload, 'confirm_order');
      const parsedConfirm = JSON.parse(prunedConfirm);

      expect(parsedConfirm.success).toBe(true);
      expect(parsedConfirm.order_id).toBe('ord-current-1');
      expect(parsedConfirm.status).toBe('confirmed');
      expect(parsedConfirm.total).toBe(408.0);
      expect(parsedConfirm.note).toContain('confirmado previamente');
    });

    it('debe podar respuestas de customer y handoff tools', () => {
      const customerPayload = JSON.stringify({
        success: true,
        customer: {
          id: 'cust-uuid-1',
          phone: '5215512345678',
          name: 'Zam',
          address_default: 'Calle Olmo 12',
          notes_md: '- Masa delgada\n- Sin cebolla\n- Alérgico a mariscos',
        },
        last_order: {
          id: 'ord-old-1',
          status: 'delivered',
          total: 350.0,
          created_at: '2026-08-20T00:00:00Z',
          items_count: 2,
          items: [{ product_id: 'p-1', quantity: 1, unit_price: 350, subtotal: 350 }],
        },
      });

      const prunedCustomer = pruneToolResponse(customerPayload, 'get_customer');
      const parsedCustomer = JSON.parse(prunedCustomer);

      expect(parsedCustomer.success).toBe(true);
      expect(parsedCustomer.customer_id).toBe('cust-uuid-1');
      expect(parsedCustomer.note).toContain('System Prompt');
      expect(parsedCustomer).not.toHaveProperty('notes_md');
      expect(parsedCustomer).not.toHaveProperty('last_order');

      const notesPayload = JSON.stringify({
        success: true,
        customer_id: 'cust-uuid-1',
        notes_md: '- Nueva preferencia guardada',
        message: 'Bloc de notas del cliente actualizado exitosamente.',
      });

      const prunedNotes = pruneToolResponse(notesPayload, 'update_customer_notes');
      const parsedNotes = JSON.parse(prunedNotes);
      expect(parsedNotes.success).toBe(true);
      expect(parsedNotes.customer_id).toBe('cust-uuid-1');

      const handoffPayload = JSON.stringify({
        success: true,
        mode: 'human',
        reason: 'Cliente solicita factura y no la generamos automáticamente',
        message: 'Conversación transferida a operador humano.',
      });

      const prunedHandoff = pruneToolResponse(handoffPayload, 'handoff_to_human');
      const parsedHandoff = JSON.parse(prunedHandoff);
      expect(parsedHandoff.success).toBe(true);
      expect(parsedHandoff.mode).toBe('human');
      expect(parsedHandoff.reason).toContain('factura');
    });

    it('debe PRESERVAR íntegramente las respuestas con errores (success: false o error)', () => {
      const errorPayload = JSON.stringify({
        success: false,
        error: 'El producto "Pizza Hawaiana" no está disponible en este restaurante',
      });

      const pruned = pruneToolResponse(errorPayload, 'get_product');
      const parsed = JSON.parse(pruned);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('El producto "Pizza Hawaiana" no está disponible en este restaurante');

      const genericError = JSON.stringify({
        error: 'Conexión rechazada con el catálogo',
      });
      const prunedGeneric = pruneToolResponse(genericError);
      const parsedGeneric = JSON.parse(prunedGeneric);
      expect(parsedGeneric.success).toBe(false);
      expect(parsedGeneric.error).toBe('Conexión rechazada con el catálogo');
    });

    it('debe manejar gracefully cadenas no-JSON o entradas mal formateadas sin arrojar excepciones', () => {
      expect(pruneToolResponse('')).toBe('');
      expect(pruneToolResponse('texto plano no json')).toBe('texto plano no json');
      expect(pruneToolResponse('12345')).toBe('12345');
      expect(pruneToolResponse(null as unknown as string)).toBe(null);
      expect(pruneToolResponse(undefined as unknown as string)).toBe(undefined);
    });
  });

  describe('Unit: buildConversationHistory with Pruning', () => {
    it('debe podar mensajes históricos de rol tool y preservar tool_call_id y system prompt', () => {
      const systemPrompt = 'Eres el asistente virtual de Pizzería Bella Napoli.';
      const savedUserMsgId = 'msg-user-2';
      const messageText = '¿Cuál es el total de mi pedido?';

      const fullMenuContent = JSON.stringify({
        success: true,
        categories: [{ id: 'c-1', name: 'Pizzas' }],
        items: Array.from({ length: 10 }, (_, i) => ({
          id: `item-${i}`,
          name: `Pizza Especial ${i}`,
          description: `Descripción muy larga y detallada del producto número ${i} con ingredientes premium.`,
          price: 150 + i * 10,
          options_schema: [{ name: 'Tamaño', choices: [{ label: 'Grande', price_modifier: 50 }] }],
        })),
      });

      const recentMessages: Message[] = [
        {
          id: 'msg-user-1',
          restaurant_id: 'rest-1',
          conversation_id: 'conv-1',
          provider_message_id: null,
          role: 'user',
          content: 'Hola, muéstrame el menú',
          metadata: {},
          created_at: '2026-08-26T10:00:00Z',
        },
        {
          id: 'msg-asst-1',
          restaurant_id: 'rest-1',
          conversation_id: 'conv-1',
          provider_message_id: null,
          role: 'assistant',
          content: '[Invocando herramientas: get_menu]',
          metadata: {
            tool_calls: [
              {
                id: 'call_get_menu_999',
                type: 'function',
                function: { name: 'get_menu', arguments: '{}' },
              },
            ],
          },
          created_at: '2026-08-26T10:00:01Z',
        },
        {
          id: 'msg-tool-1',
          restaurant_id: 'rest-1',
          conversation_id: 'conv-1',
          provider_message_id: null,
          role: 'tool',
          content: fullMenuContent,
          metadata: {
            tool_call_id: 'call_get_menu_999',
            tool_name: 'get_menu',
          },
          created_at: '2026-08-26T10:00:02Z',
        },
        {
          id: 'msg-asst-2',
          restaurant_id: 'rest-1',
          conversation_id: 'conv-1',
          provider_message_id: null,
          role: 'assistant',
          content: 'Tenemos 10 pizzas en el menú.',
          metadata: {},
          created_at: '2026-08-26T10:00:03Z',
        },
        {
          id: 'msg-user-2',
          restaurant_id: 'rest-1',
          conversation_id: 'conv-1',
          provider_message_id: null,
          role: 'user',
          content: messageText,
          metadata: {},
          created_at: '2026-08-26T10:01:00Z',
        },
      ];

      const history = buildConversationHistory(systemPrompt, recentMessages, savedUserMsgId, messageText);

      expect(history.length).toBe(6);
      expect(history[0]?.role).toBe('system');
      expect(history[0]?.content).toBe(systemPrompt);

      expect(history[1]?.role).toBe('user');
      expect(history[1]?.content).toBe('Hola, muéstrame el menú');

      // Assistant con tool_calls sintético -> content = null
      const asstMsg = history[2];
      expect(asstMsg?.role).toBe('assistant');
      expect(asstMsg?.content).toBeNull();
      if (asstMsg && asstMsg.role === 'assistant') {
        expect(asstMsg.tool_calls).toBeDefined();
        expect(asstMsg.tool_calls?.[0]?.id).toBe('call_get_menu_999');
      }

      // Tool podado: tool_call_id preservado y content podado
      const toolMsg = history[3];
      expect(toolMsg?.role).toBe('tool');
      if (toolMsg && toolMsg.role === 'tool') {
        expect(toolMsg.tool_call_id).toBe('call_get_menu_999');
      }
      const toolContent = JSON.parse(toolMsg?.content ?? '{}');
      expect(toolContent.status).toBe('success');
      expect(toolContent.items_count).toBe(10);
      expect(toolContent).not.toHaveProperty('items');
      expect(toolMsg?.content?.length).toBeLessThan(150);

      expect(history[4]?.role).toBe('assistant');
      expect(history[4]?.content).toBe('Tenemos 10 pizzas en el menú.');

      expect(history[5]?.role).toBe('user');
      expect(history[5]?.content).toBe(messageText);
    });
  });

  describe('Integration: AgentOrchestrator Turn Dynamics (Unpruned Active Turn vs Pruned Historical Turn)', () => {
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
    let savedMessages: Array<Record<string, unknown>>;
    let activeConversation: Conversation;

    beforeEach(() => {
      savedMessages = [];
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
            return builder;
          }),
          update: vi.fn(() => builder),
          delete: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          in: vi.fn(() => builder),
          order: vi.fn(() => builder),
          limit: vi.fn(() => builder),
          single: vi.fn(async () => {
            if (table === 'conversations') return { data: activeConversation, error: null };
            if (table === 'messages') return { data: savedMessages[savedMessages.length - 1], error: null };
            return { data: null, error: null };
          }),
          maybeSingle: vi.fn(async () => {
            if (table === 'conversations') return { data: activeConversation, error: null };
            if (table === 'restaurants') return { data: mockRestaurant, error: null };
            if (table === 'customers') return { data: mockCustomer, error: null };
            if (table === 'orders') return { data: null, error: null };
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
                      description: 'Pepperoni artesanal importado con mozzarella fresca',
                      price: 189.0,
                      options_schema: [{ name: 'Tamaño', choices: [{ label: 'Grande', price_modifier: 50 }] }],
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

    it('debe mantener las respuestas de tools COMPLETAS (unpruned) durante la iteración activa del bucle, y PODADAS en el siguiente turno', async () => {
      let turn1Step = 0;
      let activeTurnToolContentReceivedByLLM = '';

      mockLLMProvider = {
        chat: vi.fn(async (history: LLMMessage[]): Promise<LLMResponse> => {
          turn1Step++;
          if (turn1Step === 1) {
            // Turno 1, iteración 1: el LLM llama a get_menu
            return {
              content: null,
              tool_calls: [
                {
                  id: 'call_live_menu_1',
                  type: 'function',
                  function: { name: 'get_menu', arguments: '{}' },
                },
              ],
            };
          }
          if (turn1Step === 2) {
            // Turno 1, iteración 2: capturamos lo que el LLM recibe en su historial activo
            const toolMsg = history.find((m) => m.role === 'tool' && m.tool_call_id === 'call_live_menu_1');
            activeTurnToolContentReceivedByLLM = toolMsg?.content ?? '';

            return {
              content: 'Tenemos Pizza Pepperoni por $189.',
            };
          }

          // Turno 2, iteración 1: el usuario vuelve a escribir y verificamos cómo llega la historia previa
          const historicalToolMsg = history.find((m) => m.role === 'tool' && m.tool_call_id === 'call_live_menu_1');
          return {
            content: `Entendido. Historia podada recibida: ${historicalToolMsg?.content}`,
          };
        }),
      };

      const orchestrator = new AgentOrchestrator({
        db: mockDb,
        env: mockEnv,
        llmProvider: mockLLMProvider,
        whatsAppProvider: mockWhatsAppProvider,
      });

      // === TURNO 1: El comensal pregunta por el menú ===
      const result1 = await orchestrator.processIncomingMessage({
        restaurant: mockRestaurant,
        customer: mockCustomer,
        messageText: '¿Qué pizzas tienen?',
      });

      expect(result1.status).toBe('responded');
      expect(turn1Step).toBe(2);

      // Verificación 1: Durante el turno activo, el LLM recibió el menú COMPLETO (unpruned)
      expect(activeTurnToolContentReceivedByLLM).toContain('Pepperoni artesanal importado');
      expect(activeTurnToolContentReceivedByLLM).toContain('options_schema');
      const activeParsed = JSON.parse(activeTurnToolContentReceivedByLLM);
      expect(activeParsed.items[0].name).toBe('Pizza Pepperoni');

      // Verificación 2: En la BD de Supabase (savedMessages) se persistió la respuesta completa
      const savedToolMsg = savedMessages.find((m) => m.role === 'tool');
      expect(savedToolMsg).toBeDefined();
      expect(savedToolMsg?.content).toContain('Pepperoni artesanal importado');

      // === TURNO 2: El comensal envía un segundo mensaje ===
      // En este turno, el mensaje de tool pasa a ser HISTÓRICO y debe ser podado al ensamblarse
      const result2 = await orchestrator.processIncomingMessage({
        restaurant: mockRestaurant,
        customer: mockCustomer,
        messageText: '¿Tienen servicio a domicilio?',
      });

      expect(result2.status).toBe('responded');
      if (result2.status === 'responded') {
        // Verificamos que el LLM en el turno 2 recibió la versión compactada
        expect(result2.replyText).toContain('Historia podada recibida:');
        expect(result2.replyText).toContain('"status":"success"');
        expect(result2.replyText).toContain('[Menu cached in system prompt]');
        // Y NO contiene el árbol completo de descripciones u opciones
        expect(result2.replyText).not.toContain('Pepperoni artesanal importado');
      }
    });
  });
});
