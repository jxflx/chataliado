import { describe, it, expect, vi } from 'vitest';
import { ConversationRepository } from '../src/services/db/conversation-repository';
import { MessageRepository } from '../src/services/db/message-repository';
import { RestaurantRepository } from '../src/services/db/restaurant-repository';
import { OrderRepository } from '../src/services/db/order-repository';
import { CustomerRepository } from '../src/services/db/customer-repository';
import { MenuRepository } from '../src/services/db/menu-repository';
import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database } from '../src/types/database';
import { ValidationError, WorkerError } from '../src/utils/errors';
import { ZodError } from 'zod';

/**
 * Adversarial Mock Factory for Supabase PostgREST client.
 * Records every filter, mutation, and query parameter to detect cross-tenant leaks.
 */
function createAdversarialMockSupabase(overrides?: Record<string, unknown>): {
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
  } as unknown as SupabaseClient<Database>;

  return { client, queryHistory };
}

describe('Adversarial Challenge Suite — Milestone 1 (Persistence & Boundary Stress)', () => {
  const tenantA = 'a0000000-0000-0000-0000-000000000001';
  const tenantB = 'b0000000-0000-0000-0000-000000000002';
  const customerId = 'c0000000-0000-0000-0000-000000000001';
  const conversationId = 'd0000000-0000-0000-0000-000000000001';
  const orderId = 'e0000000-0000-0000-0000-000000000001';
  const itemId = 'f0000000-0000-0000-0000-000000000001';
  const productId = '90000000-0000-0000-0000-000000000001';

  /* ========================================================================== */
  /* 1. Boundary & Input Validation Attacks (Zod Defense)                       */
  /* ========================================================================== */
  describe('Boundary & Input Validation Attacks (Zod Defense)', () => {
    it('debe rechazar IDs no UUID en ConversationRepository (SQL Injection, strings vacíos, etc)', async () => {
      const { client } = createAdversarialMockSupabase();
      const repo = new ConversationRepository(client);

      const invalidIds = [
        '',
        '   ',
        'not-a-uuid',
        '12345',
        'a0000000-0000-0000-0000-000000000001; DROP TABLE conversations;',
        'null',
        'undefined',
        '../../etc/passwd',
      ];

      for (const invalidId of invalidIds) {
        await expect(repo.getOrCreateActiveConversation(invalidId, customerId)).rejects.toThrow(
          ZodError
        );
        await expect(repo.getOrCreateActiveConversation(tenantA, invalidId)).rejects.toThrow(
          ZodError
        );
        await expect(repo.setMode(invalidId, conversationId, 'ai')).rejects.toThrow(ZodError);
        await expect(repo.setMode(tenantA, invalidId, 'ai')).rejects.toThrow(ZodError);
        await expect(repo.setStatus(invalidId, conversationId, 'open')).rejects.toThrow(ZodError);
        await expect(repo.getById(invalidId, conversationId)).rejects.toThrow(ZodError);
      }
    });

    it('debe rechazar modos o estados inválidos en ConversationRepository', async () => {
      const { client } = createAdversarialMockSupabase();
      const repo = new ConversationRepository(client);

      // @ts-expect-error - Probando valores inválidos en tiempo de ejecución
      await expect(repo.setMode(tenantA, conversationId, 'bot')).rejects.toThrow(ZodError);
      // @ts-expect-error - Probando valores inválidos en tiempo de ejecución
      await expect(repo.setMode(tenantA, conversationId, 'robot')).rejects.toThrow(ZodError);
      // @ts-expect-error - Probando valores inválidos en tiempo de ejecución
      await expect(repo.setStatus(tenantA, conversationId, 'pending')).rejects.toThrow(ZodError);
      // @ts-expect-error - Probando valores inválidos en tiempo de ejecución
      await expect(repo.setStatus(tenantA, conversationId, 'archived')).rejects.toThrow(ZodError);
    });

    it('debe rechazar mensajes con contenido vacío o roles inexistentes en MessageRepository', async () => {
      const { client } = createAdversarialMockSupabase();
      const repo = new MessageRepository(client);

      // Contenido vacío
      await expect(
        repo.saveMessage(tenantA, {
          conversationId,
          role: 'user',
          content: '',
        })
      ).rejects.toThrow(ZodError);

      // Rol no soportado
      await expect(
        repo.saveMessage(tenantA, {
          conversationId,
          // @ts-expect-error - Rol inválido en tiempo de ejecución
          role: 'hacker',
          content: 'Mensaje de prueba',
        })
      ).rejects.toThrow(ZodError);
    });

    it('debe rechazar límites negativos o 0 en getRecentMessages', async () => {
      const { client } = createAdversarialMockSupabase();
      const repo = new MessageRepository(client);

      await expect(repo.getRecentMessages(tenantA, conversationId, 0)).rejects.toThrow(ZodError);
      await expect(repo.getRecentMessages(tenantA, conversationId, -5)).rejects.toThrow(ZodError);
    });

    it('debe rechazar identificadores vacíos en RestaurantRepository.getByIdOrSlug', async () => {
      const { client } = createAdversarialMockSupabase();
      const repo = new RestaurantRepository(client);

      await expect(repo.getByIdOrSlug('')).rejects.toThrow(ZodError);
      await expect(repo.getByIdOrSlug('   ')).rejects.toThrow(ZodError);
    });
  });

  /* ========================================================================== */
  /* 2. Multi-Tenant Isolation & Cross-Tenant Attack Scenarios                  */
  /* ========================================================================== */
  describe('Multi-Tenant Isolation & Cross-Tenant Attack Scenarios', () => {
    it('ConversationRepository: toda consulta debe filtrar estrictamente por restaurant_id', async () => {
      const { client, queryHistory } = createAdversarialMockSupabase({
        'conversations:maybeSingle': { id: conversationId, restaurant_id: tenantA },
        'conversations:single': { id: conversationId, restaurant_id: tenantA },
      });

      const repo = new ConversationRepository(client);

      await repo.getOrCreateActiveConversation(tenantA, customerId);
      await repo.getById(tenantA, conversationId);
      await repo.setMode(tenantA, conversationId, 'human');
      await repo.setStatus(tenantA, conversationId, 'closed');

      // Verificar que TODAS las queries a 'conversations' tienen eq('restaurant_id', tenantA)
      const convoQueries = queryHistory.filter((q) => q.table === 'conversations');
      expect(convoQueries.length).toBeGreaterThan(0);

      const eqTenantCalls = convoQueries.filter(
        (q) => q.method === 'eq' && q.args[0] === 'restaurant_id' && q.args[1] === tenantA
      );
      // getById (1 eq), setMode (1 eq), setStatus (1 eq), getOrCreate (1 eq)
      expect(eqTenantCalls.length).toBe(4);
    });

    it('MessageRepository: saveMessage y getRecentMessages deben incluir siempre restaurant_id del tenant', async () => {
      const { client, queryHistory } = createAdversarialMockSupabase({
        'messages:single': { id: 'm1', restaurant_id: tenantA },
        messages: [{ id: 'm1', restaurant_id: tenantA, created_at: '2026-08-21T00:00:00Z' }],
      });

      const repo = new MessageRepository(client);

      await repo.saveMessage(tenantA, {
        conversationId,
        role: 'user',
        content: 'Hola',
      });

      await repo.getRecentMessages(tenantA, conversationId, 10);

      const insertCall = queryHistory.find((q) => q.table === 'messages' && q.method === 'insert');
      expect(insertCall?.args[0]).toMatchObject({ restaurant_id: tenantA });

      const eqTenantCall = queryHistory.find(
        (q) => q.table === 'messages' && q.method === 'eq' && q.args[0] === 'restaurant_id'
      );
      expect(eqTenantCall?.args[1]).toBe(tenantA);
    });

    it('OrderRepository.removeItem: no debe permitir que Tenant B modifique una orden de Tenant A', async () => {
      // Simula que al buscar con Tenant B, la orden no existe
      const { client } = createAdversarialMockSupabase({
        'orders:maybeSingle': null,
      });

      const repo = new OrderRepository(client);

      // Tenant B intenta eliminar un ítem de la orden
      await expect(repo.removeItem(tenantB, orderId, itemId)).rejects.toThrow(ValidationError);
    });

    it('RestaurantRepository.getLastCompletedOrder: debe filtrar con restaurant_id Y customer_id', async () => {
      const { client, queryHistory } = createAdversarialMockSupabase({
        'orders:maybeSingle': null,
      });

      const repo = new RestaurantRepository(client);
      await repo.getLastCompletedOrder(tenantA, customerId);

      const tenantFilter = queryHistory.find(
        (q) => q.table === 'orders' && q.method === 'eq' && q.args[0] === 'restaurant_id'
      );
      const customerFilter = queryHistory.find(
        (q) => q.table === 'orders' && q.method === 'eq' && q.args[0] === 'customer_id'
      );
      expect(tenantFilter?.args[1]).toBe(tenantA);
      expect(customerFilter?.args[1]).toBe(customerId);
    });
  });

  /* ========================================================================== */
  /* 3. Mathematical & Deterministic State Transitions (OrderRepository)        */
  /* ========================================================================== */
  describe('Mathematical & Deterministic State Transitions (OrderRepository)', () => {
    it('debe calcular subtotal 0 y total exacto cuando se elimina el último ítem de un pedido', async () => {
      const mockOrder = {
        id: orderId,
        restaurant_id: tenantA,
        status: 'draft',
        subtotal: 100.0,
        delivery_fee: 35.0,
        discount: 0,
        total: 135.0,
      };

      const mockItem = { id: itemId, order_id: orderId, subtotal: 100.0 };
      // Ningún ítem restante en la orden
      const mockRemainingItems: Array<{ subtotal: number }> = [];

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
              if (table === 'orders') {
                return {
                  data: {
                    ...mockOrder,
                    subtotal: 0,
                    total: 35.0,
                  },
                  error: null,
                };
              }
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
      const updated = await repo.removeItem(tenantA, orderId, itemId);

      expect(updated.subtotal).toBe(0);
      expect(updated.total).toBe(35.0);

      const updateCall = queryHistory.find((q) => q.table === 'orders' && q.method === 'update');
      expect(updateCall?.args[0]).toEqual({ subtotal: 0, total: 35.0 });
    });

    it('debe prevenir totales negativos si el descuento supera subtotal + delivery_fee', async () => {
      const mockOrder = {
        id: orderId,
        restaurant_id: tenantA,
        status: 'draft',
        subtotal: 200.0,
        delivery_fee: 20.0,
        discount: 150.0, // cupón grande
        total: 70.0,
      };

      const mockItem = { id: itemId, order_id: orderId, subtotal: 150.0 };
      // Queda un ítem de 50.0. Con subtotal 50 + delivery 20 - discount 150 = -80 => Total debe ser 0
      const mockRemainingItems = [{ subtotal: 50.0 }];

      const queryHistory: Array<{ table: string; method: string; args: unknown[] }> = [];

      const mockClient = {
        from: vi.fn((table: string) => {
          queryHistory.push({ table, method: 'from', args: [table] });
          const builder: Record<string, unknown> = {
            select: vi.fn(() => builder),
            delete: vi.fn(() => builder),
            update: vi.fn((args: unknown) => {
              queryHistory.push({ table, method: 'update', args: [args] });
              return builder;
            }),
            eq: vi.fn(() => builder),
            maybeSingle: vi.fn(async () => {
              if (table === 'orders') return { data: mockOrder, error: null };
              if (table === 'order_items') return { data: mockItem, error: null };
              return { data: null, error: null };
            }),
            single: vi.fn(async () => {
              if (table === 'orders') {
                return {
                  data: {
                    ...mockOrder,
                    subtotal: 50.0,
                    total: 0,
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            }),
            then: (resolve: (val: unknown) => unknown) => {
              return Promise.resolve(resolve({ data: mockRemainingItems, error: null }));
            },
          };
          return builder;
        }),
      } as unknown as SupabaseClient<Database>;

      const repo = new OrderRepository(mockClient);
      const updated = await repo.removeItem(tenantA, orderId, itemId);

      expect(updated.subtotal).toBe(50.0);
      expect(updated.total).toBe(0);

      const updateCall = queryHistory.find((q) => q.table === 'orders' && q.method === 'update');
      expect(updateCall?.args[0]).toEqual({ subtotal: 50.0, total: 0 });
    });

    it('debe rechazar removeItem si el ítem no pertenece a la orden indicada', async () => {
      const mockOrder = {
        id: orderId,
        restaurant_id: tenantA,
        status: 'draft',
      };

      const { client } = createAdversarialMockSupabase({
        'orders:maybeSingle': mockOrder,
        'order_items:maybeSingle': null, // Ítem no existe en este order_id
      });

      const repo = new OrderRepository(client);
      await expect(repo.removeItem(tenantA, orderId, itemId)).rejects.toThrow(ValidationError);
    });

    it('debe rechazar addItem si el producto está marcado como no disponible (is_available = false)', async () => {
      const mockOrder = {
        id: orderId,
        restaurant_id: tenantA,
        status: 'draft',
      };
      const mockUnavailableProduct = {
        id: productId,
        restaurant_id: tenantA,
        name: 'Pizza Trufa',
        price: 350.0,
        is_available: false, // NO disponible
      };

      const mockClient = {
        from: vi.fn((table: string) => {
          const builder: Record<string, unknown> = {
            select: vi.fn(() => builder),
            eq: vi.fn(() => builder),
            maybeSingle: vi.fn(async () => {
              if (table === 'orders') return { data: mockOrder, error: null };
              if (table === 'menu_items') return { data: mockUnavailableProduct, error: null };
              return { data: null, error: null };
            }),
          };
          return builder;
        }),
      } as unknown as SupabaseClient<Database>;

      const repo = new OrderRepository(mockClient);
      await expect(
        repo.addItem(tenantA, {
          order_id: orderId,
          product_id: productId,
          quantity: 1,
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  /* ========================================================================== */
  /* 4. Typed Error Handling & Stack Trace Shielding                            */
  /* ========================================================================== */
  describe('Typed Error Handling & Stack Trace Shielding', () => {
    it('debe transformar fallos de Supabase DB en WorkerError(500) limpios sin exponer stack traces SQL', async () => {
      const dbError = {
        message: 'FATAL: relation "conversations" does not exist (SQLSTATE 42P01)',
        code: '42P01',
        details: 'Table dropped in production',
      };

      const { client } = createAdversarialMockSupabase({
        'conversations:error': dbError,
      });

      const repo = new ConversationRepository(client);

      try {
        await repo.getOrCreateActiveConversation(tenantA, customerId);
        expect.fail('Debería haber lanzado WorkerError');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(WorkerError);
        const workerErr = err as WorkerError;
        expect(workerErr.statusCode).toBe(500);
        // El mensaje no debe exponer el SQLSTATE ni la estructura interna de la tabla
        expect(workerErr.message).toBe('Error interno al consultar conversación activa');
        expect(workerErr.message).not.toContain('42P01');
      }
    });

    it('MessageRepository: debe capturar errores de DB en getRecentMessages y retornar WorkerError(500)', async () => {
      const dbError = { message: 'Connection timeout to pooler' };
      const { client } = createAdversarialMockSupabase({
        'messages:error': dbError,
      });

      const repo = new MessageRepository(client);
      await expect(repo.getRecentMessages(tenantA, conversationId, 5)).rejects.toThrow(WorkerError);
    });

    it('RestaurantRepository: debe capturar errores de DB en getAgentConfig y retornar WorkerError(500)', async () => {
      const dbError = { message: 'Socket hang up' };
      const { client } = createAdversarialMockSupabase({
        'agent_configs:error': dbError,
      });

      const repo = new RestaurantRepository(client);
      await expect(repo.getAgentConfig(tenantA)).rejects.toThrow(WorkerError);
    });
  });
});
