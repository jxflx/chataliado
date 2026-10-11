import { describe, it, expect, vi } from 'vitest';
import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database } from '../src/types/database';
import { type Env } from '../src/types/env';
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
  getLLMToolDefinitions,
  executeTool,
  getTool,
  getAllTools,
  zodToJsonSchema,
} from '../src/tools';
import { ValidationError } from '../src/utils/errors';
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
    EVOLUTION_API_KEY: 'test-key',
    WEBHOOK_VERIFY_TOKEN: 'verify-token',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    LLM_API_KEY: 'llm-key',
    LLM_MODEL: 'gpt-4o-mini',
    LLM_BASE_URL: 'https://api.openai.com/v1',
  };

  return {
    restaurantId: overrides?.restaurantId ?? 'a0000000-0000-0000-0000-000000000001',
    customerId: overrides?.customerId ?? 'd0000000-0000-0000-0000-000000000001',
    conversationId: overrides?.conversationId ?? 'c1000000-0000-0000-0000-000000000001',
    db: client,
    env: mockEnv,
  };
}

describe('Deterministic Tools Suite (M2 - R4)', () => {
  const restaurantId = 'a0000000-0000-0000-0000-000000000001';
  const customerId = 'd0000000-0000-0000-0000-000000000001';
  const conversationId = 'c1000000-0000-0000-0000-000000000001';
  const categoryId = 'b0000000-0000-0000-0000-000000000001';
  const productId = 'c0000000-0000-0000-0000-000000000001';
  const orderId = 'e0000000-0000-0000-0000-000000000001';
  const itemId = 'f0000000-0000-0000-0000-000000000001';

  /* -------------------------------------------------------------------------- */
  /* 1. get_menu                                                                */
  /* -------------------------------------------------------------------------- */
  describe('Tool: get_menu', () => {
    it('debe listar todas las categorías activas y productos disponibles cuando no se filtra', async () => {
      const mockCategories = [
        { id: categoryId, name: 'Pizzas', sort_order: 1, is_active: true, restaurant_id: restaurantId },
      ];
      const mockItems = [
        {
          id: productId,
          category_id: categoryId,
          name: 'Pizza Margherita',
          description: 'Tomate y mozzarella',
          price: 150,
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

      const result = await getMenuTool.execute({}, context);
      expect(result.success).toBe(true);
      expect(result.categories).toHaveLength(1);
      expect(result.categories[0]?.name).toBe('Pizzas');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.name).toBe('Pizza Margherita');
    });

    it('debe filtrar por nombre de categoría (case-insensitive)', async () => {
      const mockCategories = [
        { id: categoryId, name: 'Pizzas Especiales', sort_order: 1, is_active: true, restaurant_id: restaurantId },
        { id: 'b0000000-0000-0000-0000-000000000002', name: 'Bebidas', sort_order: 2, is_active: true, restaurant_id: restaurantId },
      ];
      const mockItems = [
        {
          id: productId,
          category_id: categoryId,
          name: 'Pizza Pepperoni',
          description: 'Con pepperoni artesanal',
          price: 180,
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

      const result = await getMenuTool.execute({ category: 'pizzas' }, context);
      expect(result.success).toBe(true);
      expect(result.categories).toHaveLength(1);
      expect(result.categories[0]?.name).toBe('Pizzas Especiales');
      expect(result.items).toHaveLength(1);
    });

    it('debe retornar listas vacías si la categoría buscada no existe', async () => {
      const mockCategories = [
        { id: categoryId, name: 'Pizzas', sort_order: 1, is_active: true, restaurant_id: restaurantId },
      ];

      const context = createMockToolContext({
        dbData: {
          menu_categories: mockCategories,
          menu_items: [],
        },
      });

      const result = await getMenuTool.execute({ category: 'Postres Inexistentes' }, context);
      expect(result.success).toBe(true);
      expect(result.categories).toHaveLength(0);
      expect(result.items).toHaveLength(0);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. get_product                                                             */
  /* -------------------------------------------------------------------------- */
  describe('Tool: get_product', () => {
    it('debe retornar la información completa de un producto disponible', async () => {
      const mockProduct = {
        id: productId,
        name: 'Pizza Cuatro Quesos',
        description: 'Mozzarella, gorgonzola, parmesano y gouda',
        price: 220,
        is_available: true,
        options_schema: [{ name: 'Tamaño', type: 'single_choice', choices: [] }],
        restaurant_id: restaurantId,
      };

      const context = createMockToolContext({
        dbData: {
          'menu_items:maybeSingle': mockProduct,
        },
      });

      const result = await getProductTool.execute({ product_id: productId }, context);
      expect(result.success).toBe(true);
      expect(result.product?.name).toBe('Pizza Cuatro Quesos');
      expect(result.product?.price).toBe(220);
    });

    it('debe retornar success: false si el producto no está disponible o no existe', async () => {
      const context = createMockToolContext({
        dbData: {
          'menu_items:maybeSingle': null,
        },
      });

      const result = await getProductTool.execute({ product_id: productId }, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('no encontrado o no disponible');
    });

    it('debe rechazar UUID inválido mediante Zod', () => {
      const parseResult = getProductTool.parameters.safeParse({ product_id: 'invalid-uuid-123' });
      expect(parseResult.success).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. create_order                                                            */
  /* -------------------------------------------------------------------------- */
  describe('Tool: create_order', () => {
    it('debe inicializar un pedido en estado draft con subtotales en 0', async () => {
      const mockOrder = {
        id: orderId,
        restaurant_id: restaurantId,
        customer_id: customerId,
        conversation_id: conversationId,
        status: 'draft',
        subtotal: 0,
        delivery_fee: 0,
        discount: 0,
        total: 0,
        created_at: '2026-08-21T10:00:00Z',
      };

      const context = createMockToolContext({
        dbData: {
          'orders:single': mockOrder,
        },
      });

      const result = await createOrderTool.execute({}, context);
      expect(result.success).toBe(true);
      expect(result.order.id).toBe(orderId);
      expect(result.order.status).toBe('draft');
      expect(result.order.total).toBe(0);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. add_order_item                                                          */
  /* -------------------------------------------------------------------------- */
  describe('Tool: add_order_item', () => {
    it('debe añadir un ítem a la orden draft y calcular determinísticamente subtotales con modificadores', async () => {
      const mockDraftOrder = {
        id: orderId,
        restaurant_id: restaurantId,
        status: 'draft',
        subtotal: 0,
        delivery_fee: 30,
        discount: 0,
        total: 30,
      };

      const mockProduct = {
        id: productId,
        name: 'Pizza Pepperoni',
        price: 180,
        is_available: true,
        restaurant_id: restaurantId,
        options_schema: [
          {
            name: 'Extra',
            type: 'single_choice',
            required: false,
            choices: [{ label: 'Queso Extra', price_modifier: 30 }],
          },
        ],
      };

      const mockCreatedItem = {
        id: itemId,
        order_id: orderId,
        product_id: productId,
        quantity: 2,
        unit_price: 210, // 180 + 30 extra
        subtotal: 420,
      };

      const mockUpdatedOrder = {
        ...mockDraftOrder,
        subtotal: 420,
        total: 450, // 420 + 30 delivery
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
          quantity: 2,
          options_selected: [
            { group_name: 'Extra', choice_label: 'Queso Extra', price_modifier: 30 },
          ],
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.item_id).toBe(itemId);
      expect(result.unit_price).toBe(210);
      expect(result.item_subtotal).toBe(420);
      expect(result.order_subtotal).toBe(420);
      expect(result.order_total).toBe(450);
    });

    it('debe fallar si la orden ya está confirmada', async () => {
      const mockConfirmedOrder = {
        id: orderId,
        restaurant_id: restaurantId,
        status: 'confirmed',
        subtotal: 200,
        total: 200,
      };

      const context = createMockToolContext({
        dbData: {
          'orders:maybeSingle': mockConfirmedOrder,
        },
      });

      await expect(
        addOrderItemTool.execute(
          { order_id: orderId, product_id: productId, quantity: 1, options_selected: [] },
          context
        )
      ).rejects.toThrowError(ValidationError);
    });

    it('debe validar que la cantidad sea un entero positivo mayor a cero', () => {
      const invalidQuantity = addOrderItemTool.parameters.safeParse({
        order_id: orderId,
        product_id: productId,
        quantity: 0,
      });
      expect(invalidQuantity.success).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 5. remove_order_item                                                       */
  /* -------------------------------------------------------------------------- */
  describe('Tool: remove_order_item', () => {
    it('debe remover el ítem y recalcular subtotales de la orden', async () => {
      const mockDraftOrder = {
        id: orderId,
        restaurant_id: restaurantId,
        status: 'draft',
        subtotal: 300,
        delivery_fee: 0,
        discount: 0,
        total: 300,
      };

      const mockItem = {
        id: itemId,
        order_id: orderId,
        subtotal: 100,
      };

      const mockUpdatedOrder = {
        ...mockDraftOrder,
        subtotal: 200,
        total: 200,
      };

      const context = createMockToolContext({
        dbData: {
          'orders:maybeSingle': mockDraftOrder,
          'order_items:maybeSingle': mockItem,
          'order_items': [{ subtotal: 200 }], // remaining items
          'orders:single': mockUpdatedOrder,
        },
      });

      const result = await removeOrderItemTool.execute(
        { order_id: orderId, item_id: itemId },
        context
      );

      expect(result.success).toBe(true);
      expect(result.removed_item_id).toBe(itemId);
      expect(result.new_subtotal).toBe(200);
      expect(result.new_total).toBe(200);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 6. get_current_order                                                       */
  /* -------------------------------------------------------------------------- */
  describe('Tool: get_current_order', () => {
    it('debe retornar el pedido draft activo del cliente cuando se omite order_id', async () => {
      const mockOrderWithItems = {
        id: orderId,
        status: 'draft',
        subtotal: 180,
        delivery_fee: 25,
        discount: 0,
        total: 205,
        delivery_address: null,
        payment_method: null,
        order_items: [
          {
            id: itemId,
            product_id: productId,
            quantity: 1,
            unit_price: 180,
            options_selected: [],
            subtotal: 180,
          },
        ],
      };

      const context = createMockToolContext({
        dbData: {
          'orders:maybeSingle': mockOrderWithItems,
          menu_items: [{ id: productId, name: 'Pizza Hawaiana' }],
        },
      });

      const result = await getCurrentOrderTool.execute({}, context);
      expect(result.success).toBe(true);
      expect(result.order?.id).toBe(orderId);
      expect(result.order?.items).toHaveLength(1);
      expect(result.order?.items[0]?.name).toBe('Pizza Hawaiana');
      expect(result.order?.total).toBe(205);
    });

    it('debe retornar success: false si no hay pedido activo', async () => {
      const context = createMockToolContext({
        dbData: {
          'orders:maybeSingle': null,
        },
      });

      const result = await getCurrentOrderTool.execute({}, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('No se encontró ningún pedido activo');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 7. confirm_order                                                           */
  /* -------------------------------------------------------------------------- */
  describe('Tool: confirm_order', () => {
    it('debe confirmar el pedido si tiene productos y datos válidos', async () => {
      const mockOrderSummary = {
        id: orderId,
        status: 'draft',
        subtotal: 250,
        delivery_fee: 30,
        discount: 0,
        total: 280,
        order_items: [{ id: itemId, subtotal: 250 }],
      };

      const mockConfirmedOrder = {
        ...mockOrderSummary,
        status: 'confirmed',
        delivery_address: 'Av. Revolución 1234, CDMX',
        payment_method: 'transfer',
      };

      const context = createMockToolContext({
        dbData: {
          'orders:maybeSingle': mockOrderSummary,
          'orders:single': mockConfirmedOrder,
        },
      });

      const result = await confirmOrderTool.execute(
        {
          order_id: orderId,
          delivery_address: 'Av. Revolución 1234, CDMX',
          payment_method: 'transfer',
        },
        context
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('confirmed');
      expect(result.delivery_address).toBe('Av. Revolución 1234, CDMX');
      expect(result.payment_method).toBe('transfer');
    });

    it('debe rechazar confirmación si el pedido no tiene productos (subtotal 0 o sin items)', async () => {
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

      await expect(
        confirmOrderTool.execute(
          {
            order_id: orderId,
            delivery_address: 'Calle Juárez 55',
            payment_method: 'cash',
          },
          context
        )
      ).rejects.toThrowError('No se puede confirmar un pedido sin productos');
    });

    it('debe validar la longitud de la dirección y método de pago con Zod', () => {
      const invalidAddress = confirmOrderTool.parameters.safeParse({
        order_id: orderId,
        delivery_address: 'ab', // < 3 chars
        payment_method: 'cash',
      });
      expect(invalidAddress.success).toBe(false);

      const invalidPayment = confirmOrderTool.parameters.safeParse({
        order_id: orderId,
        delivery_address: 'Calle Valida 123',
        payment_method: 'bitcoin', // invalid enum
      });
      expect(invalidPayment.success).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 8. get_customer                                                            */
  /* -------------------------------------------------------------------------- */
  describe('Tool: get_customer', () => {
    it('debe retornar el cliente actual y su último pedido completado', async () => {
      const mockCustomer = {
        id: customerId,
        restaurant_id: restaurantId,
        phone: '5215512345678',
        name: 'Carlos Ruiz',
        address_default: 'Calle Pino 45',
        notes_md: '- Cliente frecuente\n- Prefiere salsa picante aparte',
      };

      const mockLastOrder = {
        id: 'e0000000-0000-0000-0000-000000000099',
        restaurant_id: restaurantId,
        status: 'delivered',
        total: 320,
        created_at: '2026-08-10T20:00:00Z',
        order_items: [
          { product_id: productId, quantity: 1, unit_price: 320, subtotal: 320 },
        ],
      };

      const context = createMockToolContext({
        dbData: {
          'customers:maybeSingle': mockCustomer,
          'orders:maybeSingle': mockLastOrder,
        },
      });

      const result = await getCustomerTool.execute({}, context);
      expect(result.success).toBe(true);
      expect(result.customer?.name).toBe('Carlos Ruiz');
      expect(result.customer?.notes_md).toContain('Cliente frecuente');
      expect(result.last_order?.status).toBe('delivered');
      expect(result.last_order?.total).toBe(320);
    });

    it('debe retornar success: false si el cliente no existe', async () => {
      const context = createMockToolContext({
        dbData: {
          'customers:maybeSingle': null,
        },
      });

      const result = await getCustomerTool.execute({ phone: '5215500000000' }, context);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cliente no encontrado');
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 9. update_customer_notes                                                   */
  /* -------------------------------------------------------------------------- */
  describe('Tool: update_customer_notes', () => {
    it('debe actualizar el bloc de notas Markdown del cliente', async () => {
      const updatedCustomer = {
        id: customerId,
        restaurant_id: restaurantId,
        notes_md: '- Nuevo cambio de domicilio a Calle Roble 12\n- Pide sin cebolla',
      };

      const context = createMockToolContext({
        dbData: {
          'customers:single': updatedCustomer,
        },
      });

      const result = await updateCustomerNotesTool.execute(
        { notes_md: '- Nuevo cambio de domicilio a Calle Roble 12\n- Pide sin cebolla' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.notes_md).toContain('Calle Roble 12');
    });

    it('debe rechazar notas que excedan 5,000 caracteres con Zod', () => {
      const tooLongNotes = 'A'.repeat(5001);
      const parseResult = updateCustomerNotesTool.parameters.safeParse({
        notes_md: tooLongNotes,
      });
      expect(parseResult.success).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 10. handoff_to_human                                                       */
  /* -------------------------------------------------------------------------- */
  describe('Tool: handoff_to_human', () => {
    it('debe cambiar el modo de conversación a human y registrar auditoría', async () => {
      const mockConvo = {
        id: conversationId,
        restaurant_id: restaurantId,
        mode: 'human',
      };

      const mockSavedMsg = {
        id: 'msg_001',
        conversation_id: conversationId,
        role: 'system',
        content: 'Handoff',
      };

      const context = createMockToolContext({
        dbData: {
          'conversations:single': mockConvo,
          'messages:single': mockSavedMsg,
        },
      });

      const result = await handoffToHumanTool.execute(
        { reason: 'Cliente solicita aclaración de factura con RFC' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe('human');
      expect(result.reason).toBe('Cliente solicita aclaración de factura con RFC');
      expect(result.message).toContain('Conversación transferida a operador humano');
    });

    it('debe rechazar motivo vacío con Zod', () => {
      const parseResult = handoffToHumanTool.parameters.safeParse({ reason: '' });
      expect(parseResult.success).toBe(false);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 11. Registry & Schema Generator                                           */
  /* -------------------------------------------------------------------------- */
  describe('Tools Registry & Schema Converter', () => {
    it('debe registrar exactamente 11 herramientas deterministas', () => {
      const all = getAllTools();
      expect(all).toHaveLength(11);
      expect(getTool('get_menu')).toBeDefined();
      expect(getTool('get_product')).toBeDefined();
      expect(getTool('create_order')).toBeDefined();
      expect(getTool('add_order_item')).toBeDefined();
      expect(getTool('remove_order_item')).toBeDefined();
      expect(getTool('update_order_item_quantity')).toBeDefined();
      expect(getTool('get_current_order')).toBeDefined();
      expect(getTool('confirm_order')).toBeDefined();
      expect(getTool('get_customer')).toBeDefined();
      expect(getTool('update_customer_notes')).toBeDefined();
      expect(getTool('handoff_to_human')).toBeDefined();
    });

    it('debe generar definiciones LLM con esquemas JSON válidos para Function Calling', () => {
      const definitions = getLLMToolDefinitions();
      expect(definitions).toHaveLength(11);

      for (const def of definitions) {
        expect(def.type).toBe('function');
        expect(typeof def.function.name).toBe('string');
        expect(typeof def.function.description).toBe('string');
        expect(def.function.parameters).toBeDefined();
        expect(def.function.parameters.type).toBe('object');
      }
    });

    it('debe ejecutar una herramienta mediante executeTool con argumentos en formato JSON string', async () => {
      const mockProduct = {
        id: productId,
        name: 'Pizza Especial',
        description: 'Rica pizza',
        price: 200,
        is_available: true,
        options_schema: [],
        restaurant_id: restaurantId,
      };

      const context = createMockToolContext({
        dbData: {
          'menu_items:maybeSingle': mockProduct,
        },
      });

      const responseString = await executeTool(
        'get_product',
        JSON.stringify({ product_id: productId }),
        context
      );

      const parsed = JSON.parse(responseString);
      expect(parsed.success).toBe(true);
      expect(parsed.product.name).toBe('Pizza Especial');
    });

    it('debe manejar argumentos en formato objeto en executeTool', async () => {
      const mockOrder = {
        id: orderId,
        status: 'draft',
        subtotal: 0,
        delivery_fee: 0,
        discount: 0,
        total: 0,
        created_at: '2026-08-21T10:00:00Z',
      };

      const context = createMockToolContext({
        dbData: {
          'orders:single': mockOrder,
        },
      });

      const responseString = await executeTool('create_order', {}, context);
      const parsed = JSON.parse(responseString);
      expect(parsed.success).toBe(true);
      expect(parsed.order.id).toBe(orderId);
    });

    it('debe retornar error amigable cuando la herramienta no existe', async () => {
      const context = createMockToolContext();
      const responseString = await executeTool('non_existent_tool', '{}', context);
      const parsed = JSON.parse(responseString);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('no encontrada en el catálogo');
    });

    it('debe retornar error cuando el JSON de entrada está malformado', async () => {
      const context = createMockToolContext();
      const responseString = await executeTool('get_product', '{malformed json:', context);
      const parsed = JSON.parse(responseString);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('malformados');
    });

    it('debe retornar error estructurado cuando la validación de Zod falla', async () => {
      const context = createMockToolContext();
      const responseString = await executeTool(
        'confirm_order',
        JSON.stringify({ order_id: 'not-a-uuid', delivery_address: 'x' }),
        context
      );
      const parsed = JSON.parse(responseString);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Parámetros inválidos');
    });

    it('debe convertir esquemas Zod complejos con zodToJsonSchema determinísticamente', () => {
      const testSchema = z.object({
        name: z.string().describe('Nombre de prueba'),
        count: z.number().int().default(5),
        tags: z.array(z.string()).optional(),
        active: z.boolean(),
        role: z.enum(['admin', 'user']),
      });

      const jsonSchema = zodToJsonSchema(testSchema) as Record<string, unknown>;
      expect(jsonSchema.type).toBe('object');
      expect(jsonSchema.required).toEqual(['name', 'active', 'role']);
      const props = jsonSchema.properties as Record<string, Record<string, unknown>>;
      expect(props.name?.type).toBe('string');
      expect(props.name?.description).toBe('Nombre de prueba');
      expect(props.count?.type).toBe('integer');
      expect(props.count?.default).toBe(5);
      expect(props.tags?.type).toBe('array');
      expect(props.active?.type).toBe('boolean');
      expect(props.role?.type).toBe('string');
      expect(props.role?.enum).toEqual(['admin', 'user']);
    });
  });
});
