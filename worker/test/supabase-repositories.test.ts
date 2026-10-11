import { describe, it, expect, vi } from 'vitest';
import { CustomerRepository } from '../src/services/db/customer-repository';
import { MenuRepository } from '../src/services/db/menu-repository';
import { OrderRepository } from '../src/services/db/order-repository';
import { ConversationRepository } from '../src/services/db/conversation-repository';
import { MessageRepository } from '../src/services/db/message-repository';
import { RestaurantRepository } from '../src/services/db/restaurant-repository';
import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database } from '../src/types/database';
import { ValidationError, WorkerError } from '../src/utils/errors';

/**
 * Mock helper configurable para emular el encadenamiento de consultas PostgREST de Supabase.
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
      upsert: vi.fn((...args: unknown[]) => {
        queryHistory.push({ table, method: 'upsert', args });
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
      in: vi.fn((column: string, values: unknown[]) => {
        queryHistory.push({ table, method: 'in', args: [column, values] });
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
    rpc: vi.fn(async (funcName: string, args?: unknown) => {
      queryHistory.push({ table: 'rpc', method: funcName, args: [args] });
      const mockError = overrides?.[`rpc:${funcName}:error`] ?? null;
      const mockData = overrides?.[`rpc:${funcName}`] ?? null;
      return { data: mockData, error: mockError };
    }),
  } as unknown as SupabaseClient<Database>;

  return { client, queryHistory };
}

describe('Supabase Repositories — Aislamiento Multi-Tenant & Operaciones', () => {
  const restaurantId = 'a0000000-0000-0000-0000-000000000001';
  const customerId = 'd0000000-0000-0000-0000-000000000001';
  const conversationId = 'c1000000-0000-0000-0000-000000000001';
  const orderId = 'e0000000-0000-0000-0000-000000000001';
  const productId = 'c0000000-0000-0000-0000-000000000001';
  const itemId = 'f0000000-0000-0000-0000-000000000001';

  /* -------------------------------------------------------------------------- */
  /* 1. CustomerRepository                                                      */
  /* -------------------------------------------------------------------------- */
  describe('CustomerRepository', () => {
    it('debe buscar cliente por teléfono filtrando SIEMPRE por restaurant_id', async () => {
      const mockCustomer = {
        id: customerId,
        restaurant_id: restaurantId,
        phone: '5215512345678',
        name: 'Carlos',
        address_default: 'Calle Fresno #123',
        notes_md: '- Prefiere masa delgada',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { client, queryHistory } = createMockSupabase({
        'customers:maybeSingle': mockCustomer,
      });

      const repo = new CustomerRepository(client);
      const customer = await repo.getByPhone(restaurantId, '5215512345678');

      expect(customer).toEqual(mockCustomer);
      const tenantEqCall = queryHistory.find(
        (q) => q.table === 'customers' && q.method === 'eq' && q.args[0] === 'restaurant_id'
      );
      expect(tenantEqCall?.args[1]).toBe(restaurantId);
    });

    it('debe actualizar el campo notes_md respetando el tenant', async () => {
      const updatedNotes = '## Preferencias\n- Sin cebolla';
      const mockUpdated = {
        id: customerId,
        restaurant_id: restaurantId,
        phone: '5215512345678',
        notes_md: updatedNotes,
      };

      const { client, queryHistory } = createMockSupabase({
        'customers:single': mockUpdated,
      });

      const repo = new CustomerRepository(client);
      const result = await repo.updateNotesMd(restaurantId, customerId, updatedNotes);

      expect(result.notes_md).toBe(updatedNotes);
      const updateCall = queryHistory.find((q) => q.table === 'customers' && q.method === 'update');
      expect(updateCall?.args[0]).toEqual({ notes_md: updatedNotes });
    });

    it('debe crear un nuevo cliente con notes_md vacío por defecto en upsert', async () => {
      const mockNewCustomer = {
        id: customerId,
        restaurant_id: restaurantId,
        phone: '5215512345678',
        name: 'Ana',
        address_default: null,
        notes_md: '',
      };

      const { client, queryHistory } = createMockSupabase({
        'customers:maybeSingle': null, // no existe previamente
        'customers:single': mockNewCustomer,
      });

      const repo = new CustomerRepository(client);
      const created = await repo.upsert(restaurantId, { phone: '5215512345678', name: 'Ana' });

      expect(created.phone).toBe('5215512345678');
      const insertCall = queryHistory.find((q) => q.table === 'customers' && q.method === 'insert');
      expect(insertCall?.args[0]).toMatchObject({
        restaurant_id: restaurantId,
        phone: '5215512345678',
        notes_md: '',
      });
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. MenuRepository                                                          */
  /* -------------------------------------------------------------------------- */
  describe('MenuRepository', () => {
    it('debe obtener categorías activas filtradas por restaurant_id', async () => {
      const mockCategories = [
        {
          id: 'b0000000-0000-0000-0000-000000000001',
          restaurant_id: restaurantId,
          name: 'Pizzas',
          sort_order: 1,
          is_active: true,
        },
      ];

      const { client, queryHistory } = createMockSupabase({
        menu_categories: mockCategories,
      });

      const repo = new MenuRepository(client);
      const categories = await repo.getCategories(restaurantId);

      expect(categories).toHaveLength(1);
      expect(categories[0]?.name).toBe('Pizzas');
      const tenantFilter = queryHistory.find(
        (q) => q.table === 'menu_categories' && q.method === 'eq' && q.args[0] === 'restaurant_id'
      );
      expect(tenantFilter?.args[1]).toBe(restaurantId);
    });

    it('debe obtener un producto garantizando que pertenezca al restaurante indicado', async () => {
      const mockProduct = {
        id: productId,
        restaurant_id: restaurantId,
        name: 'Pizza Pepperoni',
        price: 189.0,
      };

      const { client, queryHistory } = createMockSupabase({
        'menu_items:maybeSingle': mockProduct,
      });

      const repo = new MenuRepository(client);
      const product = await repo.getProduct(restaurantId, productId);

      expect(product?.name).toBe('Pizza Pepperoni');
      const tenantFilter = queryHistory.find(
        (q) => q.table === 'menu_items' && q.method === 'eq' && q.args[0] === 'restaurant_id'
      );
      expect(tenantFilter?.args[1]).toBe(restaurantId);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. ConversationRepository (R2)                                             */
  /* -------------------------------------------------------------------------- */
  describe('ConversationRepository', () => {
    it('debe retornar la conversación activa existente si ya hay una abierta', async () => {
      const mockConvo = {
        id: conversationId,
        restaurant_id: restaurantId,
        customer_id: customerId,
        status: 'open',
        mode: 'ai',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { client, queryHistory } = createMockSupabase({
        'conversations:maybeSingle': mockConvo,
      });

      const repo = new ConversationRepository(client);
      const convo = await repo.getOrCreateActiveConversation(restaurantId, customerId);

      expect(convo.id).toBe(conversationId);
      expect(convo.status).toBe('open');

      const selectCall = queryHistory.find((q) => q.table === 'conversations' && q.method === 'select');
      expect(selectCall).toBeDefined();
      const tenantFilter = queryHistory.find(
        (q) => q.table === 'conversations' && q.method === 'eq' && q.args[0] === 'restaurant_id'
      );
      expect(tenantFilter?.args[1]).toBe(restaurantId);
    });

    it('debe crear una nueva conversación con mode = "ai" si no existe una abierta', async () => {
      const mockNewConvo = {
        id: conversationId,
        restaurant_id: restaurantId,
        customer_id: customerId,
        status: 'open',
        mode: 'ai',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { client, queryHistory } = createMockSupabase({
        'conversations:maybeSingle': null, // no hay abierta
        'conversations:single': mockNewConvo,
      });

      const repo = new ConversationRepository(client);
      const created = await repo.getOrCreateActiveConversation(restaurantId, customerId);

      expect(created.id).toBe(conversationId);
      expect(created.mode).toBe('ai');
      expect(created.status).toBe('open');

      const insertCall = queryHistory.find((q) => q.table === 'conversations' && q.method === 'insert');
      expect(insertCall?.args[0]).toMatchObject({
        restaurant_id: restaurantId,
        customer_id: customerId,
        status: 'open',
        mode: 'ai',
      });
    });

    it('debe actualizar el modo de la conversación (setMode) con aislamiento', async () => {
      const mockUpdated = {
        id: conversationId,
        restaurant_id: restaurantId,
        customer_id: customerId,
        status: 'open',
        mode: 'human',
      };

      const { client, queryHistory } = createMockSupabase({
        'conversations:single': mockUpdated,
      });

      const repo = new ConversationRepository(client);
      const result = await repo.setMode(restaurantId, conversationId, 'human');

      expect(result.mode).toBe('human');
      const updateCall = queryHistory.find((q) => q.table === 'conversations' && q.method === 'update');
      expect(updateCall?.args[0]).toEqual({ mode: 'human' });

      const tenantFilter = queryHistory.find(
        (q) => q.table === 'conversations' && q.method === 'eq' && q.args[0] === 'restaurant_id'
      );
      expect(tenantFilter?.args[1]).toBe(restaurantId);
    });

    it('debe rechazar setMode si la conversación no pertenece al restaurante', async () => {
      const { client } = createMockSupabase({
        'conversations:single': null,
        'conversations:error': { message: 'Not found' },
      });

      const repo = new ConversationRepository(client);
      await expect(repo.setMode(restaurantId, conversationId, 'human')).rejects.toThrow(
        ValidationError
      );
    });

    it('debe actualizar el estado de la conversación (setStatus) a closed', async () => {
      const mockUpdated = {
        id: conversationId,
        restaurant_id: restaurantId,
        status: 'closed',
        mode: 'ai',
      };

      const { client, queryHistory } = createMockSupabase({
        'conversations:single': mockUpdated,
      });

      const repo = new ConversationRepository(client);
      const result = await repo.setStatus(restaurantId, conversationId, 'closed');

      expect(result.status).toBe('closed');
      const updateCall = queryHistory.find((q) => q.table === 'conversations' && q.method === 'update');
      expect(updateCall?.args[0]).toEqual({ status: 'closed' });
    });

    it('debe consultar conversación por ID con getById respetando tenant', async () => {
      const mockConvo = {
        id: conversationId,
        restaurant_id: restaurantId,
        customer_id: customerId,
        status: 'open',
        mode: 'ai',
      };

      const { client, queryHistory } = createMockSupabase({
        'conversations:maybeSingle': mockConvo,
      });

      const repo = new ConversationRepository(client);
      const found = await repo.getById(restaurantId, conversationId);

      expect(found).toEqual(mockConvo);
      const tenantFilter = queryHistory.find(
        (q) => q.table === 'conversations' && q.method === 'eq' && q.args[0] === 'restaurant_id'
      );
      expect(tenantFilter?.args[1]).toBe(restaurantId);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. MessageRepository (R2)                                                  */
  /* -------------------------------------------------------------------------- */
  describe('MessageRepository', () => {
    it('debe guardar un mensaje con rol, contenido y metadata JSON', async () => {
      const mockMsg = {
        id: 'm0000000-0000-0000-0000-000000000001',
        restaurant_id: restaurantId,
        conversation_id: conversationId,
        role: 'user',
        content: 'Hola, quiero pedir una pizza',
        provider_message_id: 'wamid.12345',
        metadata: { source: 'whatsapp' },
        created_at: new Date().toISOString(),
      };

      const { client, queryHistory } = createMockSupabase({
        'messages:single': mockMsg,
      });

      const repo = new MessageRepository(client);
      const saved = await repo.saveMessage(restaurantId, {
        conversationId,
        role: 'user',
        content: 'Hola, quiero pedir una pizza',
        providerMessageId: 'wamid.12345',
        metadata: { source: 'whatsapp' },
      });

      expect(saved.content).toBe('Hola, quiero pedir una pizza');
      expect(saved.role).toBe('user');

      const insertCall = queryHistory.find((q) => q.table === 'messages' && q.method === 'insert');
      expect(insertCall?.args[0]).toMatchObject({
        restaurant_id: restaurantId,
        conversation_id: conversationId,
        role: 'user',
        content: 'Hola, quiero pedir una pizza',
        provider_message_id: 'wamid.12345',
        metadata: { source: 'whatsapp' },
      });
    });

    it('debe guardar un mensaje con rol tool y metadatos de tool_call', async () => {
      const mockToolMsg = {
        id: 'm0000000-0000-0000-0000-000000000002',
        restaurant_id: restaurantId,
        conversation_id: conversationId,
        role: 'tool',
        content: JSON.stringify({ success: true, price: 180 }),
        metadata: { tool_call_id: 'call_123', tool_name: 'get_menu' },
        created_at: new Date().toISOString(),
      };

      const { client } = createMockSupabase({
        'messages:single': mockToolMsg,
      });

      const repo = new MessageRepository(client);
      const saved = await repo.saveMessage(restaurantId, {
        conversation_id: conversationId,
        role: 'tool',
        content: JSON.stringify({ success: true, price: 180 }),
        metadata: { tool_call_id: 'call_123', tool_name: 'get_menu' },
      });

      expect(saved.role).toBe('tool');
    });

    it('debe obtener mensajes recientes en orden cronológico ascendente (created_at ASC)', async () => {
      const msg1 = { id: 'm1', created_at: '2026-08-21T10:00:00Z', content: 'Primero' };
      const msg2 = { id: 'm2', created_at: '2026-08-21T10:05:00Z', content: 'Segundo' };
      const msg3 = { id: 'm3', created_at: '2026-08-21T10:10:00Z', content: 'Tercero' };

      // Supabase PostgREST devuelve los N más recientes en orden DESC (m3, m2, m1)
      const mockDescendingMessages = [msg3, msg2, msg1];

      const { client, queryHistory } = createMockSupabase({
        messages: mockDescendingMessages,
      });

      const repo = new MessageRepository(client);
      const recent = await repo.getRecentMessages(restaurantId, conversationId, 10);

      // getRecentMessages debe revertir el arreglo para retornar orden natural cronológico (m1, m2, m3)
      expect(recent).toHaveLength(3);
      expect(recent[0]?.content).toBe('Primero');
      expect(recent[1]?.content).toBe('Segundo');
      expect(recent[2]?.content).toBe('Tercero');

      const tenantFilter = queryHistory.find(
        (q) => q.table === 'messages' && q.method === 'eq' && q.args[0] === 'restaurant_id'
      );
      expect(tenantFilter?.args[1]).toBe(restaurantId);

      const orderCall = queryHistory.find(
        (q) => q.table === 'messages' && q.method === 'order'
      );
      expect(orderCall?.args[0]).toBe('created_at');
      expect(orderCall?.args[1]).toEqual({ ascending: false });
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 5. RestaurantRepository (R2)                                               */
  /* -------------------------------------------------------------------------- */
  describe('RestaurantRepository', () => {
    it('debe resolver restaurante por UUID si el identificador es un UUID', async () => {
      const mockRestaurant = {
        id: restaurantId,
        name: 'Pizzería Don Giovanni',
        slug: 'don-giovanni',
        is_active: true,
        timezone: 'America/Mexico_City',
      };

      const { client, queryHistory } = createMockSupabase({
        'restaurants:maybeSingle': mockRestaurant,
      });

      const repo = new RestaurantRepository(client);
      const found = await repo.getByIdOrSlug(restaurantId);

      expect(found?.slug).toBe('don-giovanni');
      const idFilter = queryHistory.find(
        (q) => q.table === 'restaurants' && q.method === 'eq' && q.args[0] === 'id'
      );
      expect(idFilter?.args[1]).toBe(restaurantId);
    });

    it('debe resolver restaurante por slug si el identificador es un slug', async () => {
      const mockRestaurant = {
        id: restaurantId,
        name: 'Pizzería Don Giovanni',
        slug: 'don-giovanni',
        is_active: true,
        timezone: 'America/Mexico_City',
      };

      const { client, queryHistory } = createMockSupabase({
        'restaurants:maybeSingle': mockRestaurant,
      });

      const repo = new RestaurantRepository(client);
      const found = await repo.getByIdOrSlug('don-giovanni');

      expect(found?.name).toBe('Pizzería Don Giovanni');
      const slugFilter = queryHistory.find(
        (q) => q.table === 'restaurants' && q.method === 'eq' && q.args[0] === 'slug'
      );
      expect(slugFilter?.args[1]).toBe('don-giovanni');
    });

    it('debe obtener la configuración del agente (getAgentConfig)', async () => {
      const mockConfig = {
        id: 'cfg-1',
        restaurant_id: restaurantId,
        system_prompt: 'Eres Giovanni Bot',
        business_rules: 'Envío $30',
        operating_hours: {},
        handoff_triggers: ['humano', 'queja'],
      };

      const { client, queryHistory } = createMockSupabase({
        'agent_configs:maybeSingle': mockConfig,
      });

      const repo = new RestaurantRepository(client);
      const config = await repo.getAgentConfig(restaurantId);

      expect(config?.system_prompt).toBe('Eres Giovanni Bot');
      const tenantFilter = queryHistory.find(
        (q) => q.table === 'agent_configs' && q.method === 'eq' && q.args[0] === 'restaurant_id'
      );
      expect(tenantFilter?.args[1]).toBe(restaurantId);
    });

    it('debe obtener el último pedido completado con sus ítems (getLastCompletedOrder)', async () => {
      const mockOrderWithItems = {
        id: orderId,
        restaurant_id: restaurantId,
        customer_id: customerId,
        status: 'delivered',
        total: 219.0,
        order_items: [
          {
            id: itemId,
            product_id: productId,
            quantity: 1,
            unit_price: 189.0,
            subtotal: 189.0,
          },
        ],
      };

      const { client, queryHistory } = createMockSupabase({
        'orders:maybeSingle': mockOrderWithItems,
      });

      const repo = new RestaurantRepository(client);
      const result = await repo.getLastCompletedOrder(restaurantId, customerId);

      expect(result).not.toBeNull();
      expect(result!.order.status).toBe('delivered');
      expect(result!.items).toHaveLength(1);
      expect(result!.items[0]?.subtotal).toBe(189.0);

      const statusInCall = queryHistory.find(
        (q) => q.table === 'orders' && q.method === 'in' && q.args[0] === 'status'
      );
      expect(statusInCall?.args[1]).toEqual(['confirmed', 'preparing', 'delivered']);
    });

    it('debe retornar null en getLastCompletedOrder si el cliente nunca ha ordenado', async () => {
      const { client } = createMockSupabase({
        'orders:maybeSingle': null,
      });

      const repo = new RestaurantRepository(client);
      const result = await repo.getLastCompletedOrder(restaurantId, customerId);

      expect(result).toBeNull();
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 6. OrderRepository & removeItem / getActiveDraftOrder                      */
  /* -------------------------------------------------------------------------- */
  describe('OrderRepository — Pedidos y Eliminación Determinista', () => {
    it('debe crear un pedido draft con totales en cero y asignado al tenant', async () => {
      const mockOrder = {
        id: orderId,
        restaurant_id: restaurantId,
        customer_id: customerId,
        status: 'draft',
        subtotal: 0,
        total: 0,
      };

      const { client, queryHistory } = createMockSupabase({
        'orders:single': mockOrder,
      });

      const repo = new OrderRepository(client);
      const created = await repo.createDraftOrder(restaurantId, customerId);

      expect(created.status).toBe('draft');
      expect(created.total).toBe(0);

      const insertCall = queryHistory.find((q) => q.table === 'orders' && q.method === 'insert');
      expect(insertCall?.args[0]).toMatchObject({
        restaurant_id: restaurantId,
        customer_id: customerId,
        status: 'draft',
      });
    });

    it('debe calcular matemáticamente el precio unitario y total al agregar un ítem con variantes', async () => {
      const mockExistingOrder = {
        id: orderId,
        restaurant_id: restaurantId,
        status: 'draft',
        subtotal: 0,
        delivery_fee: 30.0,
        discount: 0,
        total: 30.0,
      };

      const mockProduct = {
        id: productId,
        restaurant_id: restaurantId,
        name: 'Pizza Pepperoni',
        price: 180.0,
        is_available: true,
        options_schema: [
          {
            name: 'Tamaño',
            type: 'single_choice',
            required: false,
            choices: [{ label: 'Grande', price_modifier: 50.0 }],
          },
          {
            name: 'Orilla',
            type: 'single_choice',
            required: false,
            choices: [{ label: 'Queso', price_modifier: 40.0 }],
          },
        ],
      };

      const mockInsertedItem = {
        id: itemId,
        order_id: orderId,
        product_id: productId,
        quantity: 2,
        unit_price: 270.0,
        options_selected: [
          { group_name: 'Tamaño', choice_label: 'Grande', price_modifier: 50.0 },
          { group_name: 'Orilla', choice_label: 'Queso', price_modifier: 40.0 },
        ],
        subtotal: 540.0,
      };

      const mockUpdatedOrder = {
        ...mockExistingOrder,
        subtotal: 540.0,
        total: 570.0,
      };

      const mockClient = {
        from: vi.fn((table: string) => {
          const builder: Record<string, unknown> = {
            select: vi.fn(() => builder),
            insert: vi.fn(() => builder),
            update: vi.fn(() => builder),
            eq: vi.fn(() => builder),
            maybeSingle: vi.fn(async () => {
              if (table === 'orders') return { data: mockExistingOrder, error: null };
              if (table === 'menu_items') return { data: mockProduct, error: null };
              return { data: null, error: null };
            }),
            single: vi.fn(async () => {
              if (table === 'order_items') return { data: mockInsertedItem, error: null };
              if (table === 'orders') return { data: mockUpdatedOrder, error: null };
              return { data: null, error: null };
            }),
          };
          return builder;
        }),
      } as unknown as SupabaseClient<Database>;

      const repo = new OrderRepository(mockClient);
      const result = await repo.addItem(restaurantId, {
        order_id: orderId,
        product_id: productId,
        quantity: 2,
        options_selected: [
          { group_name: 'Tamaño', choice_label: 'Grande', price_modifier: 50.0 },
          { group_name: 'Orilla', choice_label: 'Queso', price_modifier: 40.0 },
        ],
      });

      expect(result.item.unit_price).toBe(270.0);
      expect(result.item.subtotal).toBe(540.0);
      expect(result.order.subtotal).toBe(540.0);
      expect(result.order.total).toBe(570.0);
    });

    it('debe eliminar un ítem (removeItem) y recalcular deterministamente el total', async () => {
      const mockOrder = {
        id: orderId,
        restaurant_id: restaurantId,
        status: 'draft',
        subtotal: 350.0,
        delivery_fee: 30.0,
        discount: 0,
        total: 380.0,
      };

      const mockItem = {
        id: itemId,
        order_id: orderId,
        subtotal: 150.0,
      };

      // Queda un ítem restante de $200.00
      const mockRemainingItems = [{ subtotal: 200.0 }];

      const mockUpdatedOrder = {
        ...mockOrder,
        subtotal: 200.0,
        total: 230.0, // 200 + 30
      };

      const queryHistory: Array<{ table: string; method: string; args: unknown[] }> = [];

      const mockClient = {
        from: vi.fn((table: string) => {
          queryHistory.push({ table, method: 'from', args: [table] });
          const builder: Record<string, unknown> = {
            select: vi.fn((...args: unknown[]) => {
              queryHistory.push({ table, method: 'select', args });
              return builder;
            }),
            delete: vi.fn((...args: unknown[]) => {
              queryHistory.push({ table, method: 'delete', args });
              return builder;
            }),
            update: vi.fn((...args: unknown[]) => {
              queryHistory.push({ table, method: 'update', args });
              return builder;
            }),
            eq: vi.fn((col: string, val: unknown) => {
              queryHistory.push({ table, method: 'eq', args: [col, val] });
              return builder;
            }),
            maybeSingle: vi.fn(async () => {
              if (table === 'orders') return { data: mockOrder, error: null };
              if (table === 'order_items') return { data: mockItem, error: null };
              return { data: null, error: null };
            }),
            single: vi.fn(async () => {
              if (table === 'orders') return { data: mockUpdatedOrder, error: null };
              return { data: null, error: null };
            }),
            then: (resolve: (val: unknown) => unknown) => {
              if (table === 'order_items') {
                return Promise.resolve(resolve({ data: mockRemainingItems, error: null }));
              }
              return Promise.resolve(resolve({ data: [], error: null }));
            },
          };
          return builder;
        }),
      } as unknown as SupabaseClient<Database>;

      const repo = new OrderRepository(mockClient);
      const updated = await repo.removeItem(restaurantId, orderId, itemId);

      expect(updated.subtotal).toBe(200.0);
      expect(updated.total).toBe(230.0);

      // Validar que se invocó delete en order_items
      const deleteCall = queryHistory.find((q) => q.table === 'order_items' && q.method === 'delete');
      expect(deleteCall).toBeDefined();

      // Validar actualización del pedido con los nuevos subtotales calculados
      const updateCall = queryHistory.find((q) => q.table === 'orders' && q.method === 'update');
      expect(updateCall?.args[0]).toEqual({ subtotal: 200.0, total: 230.0 });
    });

    it('debe rechazar removeItem si el pedido ya está en estado confirmed', async () => {
      const mockOrder = {
        id: orderId,
        restaurant_id: restaurantId,
        status: 'confirmed',
      };

      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: mockOrder, error: null })),
        })),
      } as unknown as SupabaseClient<Database>;

      const repo = new OrderRepository(mockClient);
      await expect(repo.removeItem(restaurantId, orderId, itemId)).rejects.toThrow(
        ValidationError
      );
    });

    it('debe obtener el pedido borrador activo con getActiveDraftOrder', async () => {
      const mockDraftOrderWithItems = {
        id: orderId,
        restaurant_id: restaurantId,
        customer_id: customerId,
        status: 'draft',
        subtotal: 180.0,
        delivery_fee: 30.0,
        discount: 0,
        total: 210.0,
        order_items: [
          {
            id: itemId,
            product_id: productId,
            quantity: 1,
            unit_price: 180.0,
            subtotal: 180.0,
          },
        ],
      };

      const { client, queryHistory } = createMockSupabase({
        'orders:maybeSingle': mockDraftOrderWithItems,
      });

      const repo = new OrderRepository(client);
      const result = await repo.getActiveDraftOrder(restaurantId, customerId);

      expect(result).not.toBeNull();
      expect(result!.order.status).toBe('draft');
      expect(result!.items).toHaveLength(1);

      const statusFilter = queryHistory.find(
        (q) => q.table === 'orders' && q.method === 'eq' && q.args[0] === 'status'
      );
      expect(statusFilter?.args[1]).toBe('draft');
    });

    it('debe confirmar un pedido cambiando estado a confirmed', async () => {
      const mockConfirmed = {
        id: orderId,
        restaurant_id: restaurantId,
        status: 'confirmed',
        delivery_address: 'Av. Siempre Viva 742',
        payment_method: 'card',
        total: 210.0,
      };

      const { client, queryHistory } = createMockSupabase({
        'orders:single': mockConfirmed,
      });

      const repo = new OrderRepository(client);
      const confirmed = await repo.confirmOrder(restaurantId, orderId, {
        deliveryAddress: 'Av. Siempre Viva 742',
        paymentMethod: 'card',
      });

      expect(confirmed.status).toBe('confirmed');
      expect(confirmed.payment_method).toBe('card');
      const updateCall = queryHistory.find((q) => q.table === 'orders' && q.method === 'update');
      expect(updateCall?.args[0]).toMatchObject({
        status: 'confirmed',
        delivery_address: 'Av. Siempre Viva 742',
        payment_method: 'card',
      });
    });
  });
});
