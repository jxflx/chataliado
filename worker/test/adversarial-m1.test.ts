import { describe, it, expect, vi } from 'vitest';
import { ConversationRepository } from '../src/services/db/conversation-repository';
import { MessageRepository } from '../src/services/db/message-repository';
import { RestaurantRepository } from '../src/services/db/restaurant-repository';
import { OrderRepository } from '../src/services/db/order-repository';
import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database } from '../src/types/database';
import { ValidationError, WorkerError } from '../src/utils/errors';
import { ZodError } from 'zod';

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

describe('M1 Adversarial Challenge & Stress Suite', () => {
  const tenantA = 'a0000000-0000-0000-0000-000000000001';
  const tenantB = 'b0000000-0000-0000-0000-000000000002';
  const customerId = 'd0000000-0000-0000-0000-000000000001';
  const convoId = 'c0000000-0000-0000-0000-000000000001';
  const orderId = 'e0000000-0000-0000-0000-000000000001';
  const itemId = 'f0000000-0000-0000-0000-000000000001';

  /* -------------------------------------------------------------------------- */
  /* Challenge 1: Multi-Tenant Isolation & Boundary Defense                    */
  /* -------------------------------------------------------------------------- */
  describe('Challenge 1: Multi-Tenant Isolation & Boundary Defense', () => {
    it('debe rechazar IDs no UUID con ZodError en ConversationRepository', async () => {
      const { client } = createMockSupabase();
      const repo = new ConversationRepository(client);

      await expect(repo.getOrCreateActiveConversation('not-a-uuid', customerId)).rejects.toThrow(ZodError);
      await expect(repo.getOrCreateActiveConversation(tenantA, 'invalid-customer')).rejects.toThrow(ZodError);
      await expect(repo.setMode('bad-tenant', convoId, 'ai')).rejects.toThrow(ZodError);
      await expect(repo.setStatus(tenantA, 'bad-convo', 'open')).rejects.toThrow(ZodError);
      await expect(repo.getById('malicious-id; DROP TABLE', convoId)).rejects.toThrow(ZodError);
    });

    it('debe rechazar IDs no UUID con ZodError en MessageRepository', async () => {
      const { client } = createMockSupabase();
      const repo = new MessageRepository(client);

      await expect(
        repo.saveMessage('not-a-uuid', {
          conversationId: convoId,
          role: 'user',
          content: 'Hello',
        })
      ).rejects.toThrow(ZodError);

      await expect(
        repo.saveMessage(tenantA, {
          conversationId: 'not-a-uuid',
          role: 'user',
          content: 'Hello',
        })
      ).rejects.toThrow(ZodError);

      await expect(repo.getRecentMessages('bad-tenant', convoId)).rejects.toThrow(ZodError);
    });

    it('debe rechazar IDs no UUID con ZodError en OrderRepository', async () => {
      const { client } = createMockSupabase();
      const repo = new OrderRepository(client);

      await expect(repo.createDraftOrder('invalid-tenant', customerId)).rejects.toThrow(ZodError);
      await expect(repo.removeItem('invalid-tenant', orderId, itemId)).rejects.toThrow(ZodError);
      await expect(repo.getActiveDraftOrder('invalid-tenant', customerId)).rejects.toThrow(ZodError);
      await expect(repo.confirmOrder('invalid-tenant', orderId, {})).rejects.toThrow(ZodError);
    });

    it('debe bloquear consultas cruzadas de conversación (cross-tenant) aplicando filtro restaurant_id', async () => {
      const { client, queryHistory } = createMockSupabase({
        'conversations:maybeSingle': null,
      });
      const repo = new ConversationRepository(client);

      const res = await repo.getById(tenantA, convoId);
      expect(res).toBeNull();

      const tenantFilters = queryHistory.filter(
        (q) => q.table === 'conversations' && q.method === 'eq' && q.args[0] === 'restaurant_id'
      );
      expect(tenantFilters.length).toBeGreaterThan(0);
      expect(tenantFilters[0]?.args[1]).toBe(tenantA);
    });

    it('debe impedir setMode o setStatus en conversación ajena a Tenant A', async () => {
      const { client } = createMockSupabase({
        'conversations:single': null,
        'conversations:error': { message: 'Row not found or RLS restricted' },
      });
      const repo = new ConversationRepository(client);

      await expect(repo.setMode(tenantA, convoId, 'human')).rejects.toThrow(ValidationError);
      await expect(repo.setStatus(tenantA, convoId, 'closed')).rejects.toThrow(ValidationError);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Challenge 2: Order removeItem Edge Cases & Price Recalculation            */
  /* -------------------------------------------------------------------------- */
  describe('Challenge 2: Order removeItem Edge Cases & Price Recalculation', () => {
    it('debe fallar con ValidationError si el pedido no existe para el tenant en removeItem', async () => {
      const { client } = createMockSupabase({
        'orders:maybeSingle': null,
      });
      const repo = new OrderRepository(client);

      await expect(repo.removeItem(tenantA, orderId, itemId)).rejects.toThrow(ValidationError);
    });

    it('debe fallar con ValidationError si el pedido ya está en estado preparing o delivered', async () => {
      for (const status of ['preparing', 'delivered', 'cancelled'] as const) {
        const { client } = createMockSupabase({
          'orders:maybeSingle': {
            id: orderId,
            restaurant_id: tenantA,
            status,
          },
        });
        const repo = new OrderRepository(client);

        await expect(repo.removeItem(tenantA, orderId, itemId)).rejects.toThrow(
          `No se pueden modificar ítems de un pedido en estado '${status}'`
        );
      }
    });

    it('debe fallar con ValidationError si el item no existe dentro del pedido', async () => {
      const mockOrder = {
        id: orderId,
        restaurant_id: tenantA,
        status: 'draft',
      };

      const mockClient = {
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => {
            if (table === 'orders') return { data: mockOrder, error: null };
            if (table === 'order_items') return { data: null, error: null }; // item no existe
            return { data: null, error: null };
          }),
        })),
      } as unknown as SupabaseClient<Database>;

      const repo = new OrderRepository(mockClient);
      await expect(repo.removeItem(tenantA, orderId, itemId)).rejects.toThrow(
        'El ítem no existe en este pedido'
      );
    });

    it('debe recalcular subtotal a 0 y total exacto cuando se elimina el ÚLTIMO ítem del pedido', async () => {
      const mockOrder = {
        id: orderId,
        restaurant_id: tenantA,
        status: 'draft',
        subtotal: 150.0,
        delivery_fee: 35.0,
        discount: 10.0,
        total: 175.0,
      };

      const mockItem = {
        id: itemId,
        order_id: orderId,
        subtotal: 150.0,
      };

      // Al eliminar el único ítem, quedan 0 items
      const mockRemainingItems: Array<{ subtotal: number }> = [];

      let updatedPayload: Record<string, unknown> | null = null;

      const mockClient = {
        from: vi.fn((table: string) => {
          const builder: Record<string, unknown> = {
            select: vi.fn(() => builder),
            delete: vi.fn(() => builder),
            update: vi.fn((payload: Record<string, unknown>) => {
              updatedPayload = payload;
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
                    subtotal: updatedPayload?.subtotal,
                    total: updatedPayload?.total,
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
      const result = await repo.removeItem(tenantA, orderId, itemId);

      expect(result.subtotal).toBe(0);
      // newTotal = max(0, 0 + 35 - 10) = 25
      expect(result.total).toBe(25.0);
      expect(updatedPayload).toEqual({
        subtotal: 0,
        total: 25.0,
      });
    });

    it('debe asegurar que el total jamás sea negativo si el descuento supera subtotal + delivery', async () => {
      const mockOrder = {
        id: orderId,
        restaurant_id: tenantA,
        status: 'draft',
        subtotal: 50.0,
        delivery_fee: 0,
        discount: 100.0, // cupón de 100
        total: 0,
      };

      const mockItem = {
        id: itemId,
        order_id: orderId,
        subtotal: 50.0,
      };

      let updatedPayload: Record<string, unknown> | null = null;

      const mockClient = {
        from: vi.fn((table: string) => {
          const builder: Record<string, unknown> = {
            select: vi.fn(() => builder),
            delete: vi.fn(() => builder),
            update: vi.fn((payload: Record<string, unknown>) => {
              updatedPayload = payload;
              return builder;
            }),
            eq: vi.fn(() => builder),
            maybeSingle: vi.fn(async () => {
              if (table === 'orders') return { data: mockOrder, error: null };
              if (table === 'order_items') return { data: mockItem, error: null };
              return { data: null, error: null };
            }),
            single: vi.fn(async () => {
              return {
                data: {
                  ...mockOrder,
                  subtotal: updatedPayload?.subtotal,
                  total: updatedPayload?.total,
                },
                error: null,
              };
            }),
            then: (resolve: (val: unknown) => unknown) => {
              if (table === 'order_items') {
                return Promise.resolve(resolve({ data: [], error: null }));
              }
              return Promise.resolve(resolve({ data: [], error: null }));
            },
          };
          return builder;
        }),
      } as unknown as SupabaseClient<Database>;

      const repo = new OrderRepository(mockClient);
      const result = await repo.removeItem(tenantA, orderId, itemId);

      expect(result.subtotal).toBe(0);
      expect(result.total).toBe(0); // No -100!
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Challenge 3: MessageRepository Limits, Roles and Chronological Ordering   */
  /* -------------------------------------------------------------------------- */
  describe('Challenge 3: MessageRepository Limits, Roles and Chronological Ordering', () => {
    it('debe rechazar mensajes con contenido vacío o espacios en blanco vacíos', async () => {
      const { client } = createMockSupabase();
      const repo = new MessageRepository(client);

      await expect(
        repo.saveMessage(tenantA, {
          conversationId: convoId,
          role: 'user',
          content: '',
        })
      ).rejects.toThrow(ZodError);
    });

    it('debe rechazar límites inválidos en getRecentMessages (cero, negativos, decimales)', async () => {
      const { client } = createMockSupabase();
      const repo = new MessageRepository(client);

      await expect(repo.getRecentMessages(tenantA, convoId, 0)).rejects.toThrow(ZodError);
      await expect(repo.getRecentMessages(tenantA, convoId, -10)).rejects.toThrow(ZodError);
      await expect(repo.getRecentMessages(tenantA, convoId, 4.5)).rejects.toThrow(ZodError);
    });

    it('debe manejar correctamente cuando hay 0 mensajes devolviendo array vacío', async () => {
      const { client } = createMockSupabase({
        messages: [],
      });
      const repo = new MessageRepository(client);

      const msgs = await repo.getRecentMessages(tenantA, convoId, 10);
      expect(msgs).toEqual([]);
    });

    it('debe soportar roles válidos: user, assistant, system, tool, human_agent', async () => {
      for (const role of ['user', 'assistant', 'system', 'tool', 'human_agent'] as const) {
        const mockMsg = {
          id: 'm-1',
          restaurant_id: tenantA,
          conversation_id: convoId,
          role,
          content: `Mensaje de prueba con rol ${role}`,
        };

        const { client } = createMockSupabase({
          'messages:single': mockMsg,
        });

        const repo = new MessageRepository(client);
        const saved = await repo.saveMessage(tenantA, {
          conversationId: convoId,
          role,
          content: `Mensaje de prueba con rol ${role}`,
        });

        expect(saved.role).toBe(role);
      }
    });

    it('debe rechazar roles inválidos con ZodError', async () => {
      const { client } = createMockSupabase();
      const repo = new MessageRepository(client);

      await expect(
        repo.saveMessage(tenantA, {
          conversationId: convoId,
          role: 'invalid_role' as unknown as 'user',
          content: 'Test content',
        })
      ).rejects.toThrow(ZodError);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* Challenge 4: RestaurantRepository Slug vs UUID Resolution                 */
  /* -------------------------------------------------------------------------- */
  describe('Challenge 4: RestaurantRepository Slug vs UUID Resolution', () => {
    it('debe distinguir UUID minúsculas y consultar por id', async () => {
      const testUuid = 'a0000000-0000-0000-0000-000000000001';
      const { client, queryHistory } = createMockSupabase({
        'restaurants:maybeSingle': { id: testUuid, slug: 'pizzeria-1', is_active: true },
      });

      const repo = new RestaurantRepository(client);
      const res = await repo.getByIdOrSlug(testUuid);

      expect(res?.id).toBe(testUuid);
      const idFilter = queryHistory.find(
        (q) => q.table === 'restaurants' && q.method === 'eq' && q.args[0] === 'id'
      );
      expect(idFilter?.args[1]).toBe(testUuid);
    });

    it('debe distinguir UUID mayúsculas y consultar por id', async () => {
      const testUpperUuid = 'A0000000-0000-0000-0000-000000000001';
      const { client, queryHistory } = createMockSupabase({
        'restaurants:maybeSingle': { id: testUpperUuid, slug: 'pizzeria-1', is_active: true },
      });

      const repo = new RestaurantRepository(client);
      const res = await repo.getByIdOrSlug(testUpperUuid);

      expect(res?.id).toBe(testUpperUuid);
      const idFilter = queryHistory.find(
        (q) => q.table === 'restaurants' && q.method === 'eq' && q.args[0] === 'id'
      );
      expect(idFilter?.args[1]).toBe(testUpperUuid);
    });

    it('debe identificar slugs con guiones y números y consultar por slug', async () => {
      const testSlug = 'pizzeria-don-giovanni-sur-99';
      const { client, queryHistory } = createMockSupabase({
        'restaurants:maybeSingle': { id: tenantA, slug: testSlug, is_active: true },
      });

      const repo = new RestaurantRepository(client);
      const res = await repo.getByIdOrSlug(testSlug);

      expect(res?.slug).toBe(testSlug);
      const slugFilter = queryHistory.find(
        (q) => q.table === 'restaurants' && q.method === 'eq' && q.args[0] === 'slug'
      );
      expect(slugFilter?.args[1]).toBe(testSlug);
    });

    it('debe trimear espacios antes de evaluar el identificador', async () => {
      const paddedSlug = '   pizzeria-centro   ';
      const { client, queryHistory } = createMockSupabase({
        'restaurants:maybeSingle': { id: tenantA, slug: 'pizzeria-centro', is_active: true },
      });

      const repo = new RestaurantRepository(client);
      const res = await repo.getByIdOrSlug(paddedSlug);

      expect(res?.slug).toBe('pizzeria-centro');
      const slugFilter = queryHistory.find(
        (q) => q.table === 'restaurants' && q.method === 'eq' && q.args[0] === 'slug'
      );
      expect(slugFilter?.args[1]).toBe('pizzeria-centro');
    });

    it('debe rechazar identificador vacío o solo espacios en blanco', async () => {
      const { client } = createMockSupabase();
      const repo = new RestaurantRepository(client);

      await expect(repo.getByIdOrSlug('')).rejects.toThrow(ZodError);
      await expect(repo.getByIdOrSlug('   ')).rejects.toThrow(ZodError);
    });

    it('debe retornar null cuando el restaurante no existe o está inactivo', async () => {
      const { client } = createMockSupabase({
        'restaurants:maybeSingle': null,
      });

      const repo = new RestaurantRepository(client);
      const res = await repo.getByIdOrSlug('restaurante-inactivo');

      expect(res).toBeNull();
    });
  });
});
