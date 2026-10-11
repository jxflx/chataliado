import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleItemAvailability,
  reorderMenuItems,
} from '../src/app/(dashboard)/menu/actions';
import {
  optionChoiceSchema,
  optionGroupSchema,
  optionsSchema,
  createCategorySchema,
  createMenuItemSchema,
} from '../src/schemas/menu';

// Mock de next/cache
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock de @/lib/supabase/server
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}));

describe('Menu Server Actions & Schemas (Multi-Tenant & Security)', () => {
  const validTenantId = '11111111-1111-4111-8111-111111111111';
  const validCategoryId = '22222222-2222-4222-8222-222222222222';
  const validItemId = '33333333-3333-4333-8333-333333333333';
  const validUserId = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper para simular usuario autenticado con rol específico
  function mockAuth(role: 'owner' | 'admin' | 'staff' = 'admin') {
    mockGetUser.mockResolvedValue({
      data: { user: { id: validUserId } },
      error: null,
    });

    const membershipQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { role },
        error: null,
      }),
    };

    return membershipQuery;
  }

  // ==========================================================================
  // 1. Zod Schemas Validation
  // ==========================================================================
  describe('Zod Schemas (menu.ts)', () => {
    it('optionChoiceSchema debe aceptar opciones válidas con modificador >= 0', () => {
      const parsed = optionChoiceSchema.safeParse({ label: 'Extra Queso', price_modifier: 25.5 });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.label).toBe('Extra Queso');
        expect(parsed.data.price_modifier).toBe(25.5);
      }
    });

    it('optionChoiceSchema debe rechazar modificador de precio negativo', () => {
      const parsed = optionChoiceSchema.safeParse({ label: 'Descuento', price_modifier: -10 });
      expect(parsed.success).toBe(false);
    });

    it('optionGroupSchema debe aceptar grupos con opciones', () => {
      const parsed = optionGroupSchema.safeParse({
        name: 'Tamaño de Pizza',
        type: 'single_choice',
        required: true,
        choices: [
          { label: 'Individual', price_modifier: 0 },
          { label: 'Familiar', price_modifier: 70 },
        ],
      });
      expect(parsed.success).toBe(true);
    });

    it('optionGroupSchema debe rechazar grupos sin opciones (choices vacíos)', () => {
      const parsed = optionGroupSchema.safeParse({
        name: 'Sin Opciones',
        type: 'single_choice',
        required: false,
        choices: [],
      });
      expect(parsed.success).toBe(false);
    });

    it('optionsSchema debe validar un array vacío como válido', () => {
      const parsed = optionsSchema.safeParse([]);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data).toEqual([]);
      }
    });

    it('createCategorySchema debe rechazar nombres vacíos', () => {
      const parsed = createCategorySchema.safeParse({ name: '   ' });
      expect(parsed.success).toBe(false);
    });

    it('createMenuItemSchema debe rechazar precio negativo', () => {
      const parsed = createMenuItemSchema.safeParse({
        name: 'Pizza Pepperoni',
        price: -50,
      });
      expect(parsed.success).toBe(false);
    });
  });

  // ==========================================================================
  // 2. Categories Actions
  // ==========================================================================
  describe('Categories Server Actions', () => {
    describe('getCategories', () => {
      it('debe rechazar restaurantId no UUID', async () => {
        const res = await getCategories('not-a-uuid');
        expect(res.success).toBe(false);
        expect(res.error).toContain('UUID');
      });

      it('debe rechazar llamadas sin sesión (UNAUTHORIZED)', async () => {
        mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'No session' } });
        const res = await getCategories(validTenantId);
        expect(res.success).toBe(false);
        expect(res.error).toContain('UNAUTHORIZED');
      });

      it('debe permitir rol staff para lectura y retornar categorías ordenadas', async () => {
        const membershipQuery = mockAuth('staff');

        const categoriesData = [
          { id: 'c1', name: 'Pizzas', sort_order: 0 },
          { id: 'c2', name: 'Bebidas', sort_order: 1 },
        ];

        const selectQuery = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
        };
        // Segunda llamada a order resuelve con los datos
        selectQuery.order
          .mockReturnValueOnce(selectQuery)
          .mockResolvedValueOnce({ data: categoriesData, error: null });

        mockFrom
          .mockReturnValueOnce(membershipQuery)
          .mockReturnValueOnce(selectQuery);

        const res = await getCategories(validTenantId);
        expect(res.success).toBe(true);
        expect(res.data).toHaveLength(2);
        expect(res.data?.[0]?.name).toBe('Pizzas');
      });
    });

    describe('createCategory', () => {
      it('debe rechazar cuando rol es staff (FORBIDDEN: Rol insuficiente)', async () => {
        const membershipQuery = mockAuth('staff');
        mockFrom.mockReturnValueOnce(membershipQuery);

        const res = await createCategory(validTenantId, 'Nueva Cat');
        expect(res.success).toBe(false);
        expect(res.error).toContain('FORBIDDEN');
      });

      it('debe crear exitosamente la categoría cuando es admin', async () => {
        const membershipQuery = mockAuth('admin');

        const insertQuery = {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({
            data: { id: validCategoryId, name: 'Pizzas Especiales', sort_order: 2, is_active: true },
            error: null,
          }),
        };

        mockFrom
          .mockReturnValueOnce(membershipQuery)
          .mockReturnValueOnce(insertQuery);

        const res = await createCategory(validTenantId, 'Pizzas Especiales', 2);
        expect(res.success).toBe(true);
        expect(res.data?.name).toBe('Pizzas Especiales');
      });
    });

    describe('updateCategory', () => {
      it('debe rechazar payload vacío', async () => {
        const membershipQuery = mockAuth('admin');
        mockFrom.mockReturnValueOnce(membershipQuery);

        const res = await updateCategory(validTenantId, validCategoryId, {});
        expect(res.success).toBe(false);
        expect(res.error).toContain('No se proporcionaron cambios');
      });

      it('debe actualizar exitosamente los campos proporcionados', async () => {
        const membershipQuery = mockAuth('admin');

        const updateQuery = {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({
            data: { id: validCategoryId, name: 'Pizzas Gourmet', sort_order: 1, is_active: true },
            error: null,
          }),
        };
        updateQuery.eq.mockReturnValue(updateQuery);

        mockFrom
          .mockReturnValueOnce(membershipQuery)
          .mockReturnValueOnce(updateQuery);

        const res = await updateCategory(validTenantId, validCategoryId, { name: 'Pizzas Gourmet' });
        expect(res.success).toBe(true);
        expect(res.data?.name).toBe('Pizzas Gourmet');
      });
    });

    describe('deleteCategory', () => {
      it('debe rechazar eliminación si la categoría contiene platillos con mensaje amigable', async () => {
        const membershipQuery = mockAuth('admin');

        const countQuery = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };
        countQuery.eq
          .mockReturnValueOnce(countQuery)
          .mockResolvedValueOnce({ count: 3, error: null });

        mockFrom
          .mockReturnValueOnce(membershipQuery)
          .mockReturnValueOnce(countQuery);

        const res = await deleteCategory(validTenantId, validCategoryId);
        expect(res.success).toBe(false);
        expect(res.error).toBe(
          'No se puede eliminar una categoría que contiene platillos. Muévelos o elimínalos primero.'
        );
      });

      it('debe eliminar físicamente si no contiene platillos asociados', async () => {
        const membershipQuery = mockAuth('admin');

        const countQuery = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };
        countQuery.eq
          .mockReturnValueOnce(countQuery)
          .mockResolvedValueOnce({ count: 0, error: null });

        const deleteQuery = {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };
        deleteQuery.eq
          .mockReturnValueOnce(deleteQuery)
          .mockResolvedValueOnce({ error: null });

        mockFrom
          .mockReturnValueOnce(membershipQuery)
          .mockReturnValueOnce(countQuery)
          .mockReturnValueOnce(deleteQuery);

        const res = await deleteCategory(validTenantId, validCategoryId);
        expect(res.success).toBe(true);
        expect(res.data?.id).toBe(validCategoryId);
      });
    });

    describe('reorderCategories', () => {
      it('debe actualizar el sort_order en lote', async () => {
        const membershipQuery = mockAuth('admin');

        const cat1 = '11111111-2222-4222-8222-222222222222';
        const cat2 = '22222222-3333-4222-8222-222222222222';

        const updateQuery1 = {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };
        updateQuery1.eq
          .mockReturnValueOnce(updateQuery1)
          .mockResolvedValueOnce({ error: null });

        const updateQuery2 = {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };
        updateQuery2.eq
          .mockReturnValueOnce(updateQuery2)
          .mockResolvedValueOnce({ error: null });

        mockFrom
          .mockReturnValueOnce(membershipQuery)
          .mockReturnValueOnce(updateQuery1)
          .mockReturnValueOnce(updateQuery2);

        const res = await reorderCategories(validTenantId, [cat1, cat2]);
        expect(res.success).toBe(true);
        expect(res.data?.count).toBe(2);
      });
    });
  });

  // ==========================================================================
  // 3. Menu Items Actions
  // ==========================================================================
  describe('Menu Items Server Actions', () => {
    describe('getMenuItems', () => {
      it('debe rechazar restaurantId no UUID', async () => {
        const res = await getMenuItems('not-uuid');
        expect(res.success).toBe(false);
      });

      it('debe retornar platillos ordenados', async () => {
        const membershipQuery = mockAuth('staff');

        const selectQuery = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
        };
        selectQuery.order
          .mockReturnValueOnce(selectQuery)
          .mockResolvedValueOnce({
            data: [
              { id: validItemId, name: 'Pizza Hawaiana', price: 150, sort_order: 0 },
            ],
            error: null,
          });

        mockFrom
          .mockReturnValueOnce(membershipQuery)
          .mockReturnValueOnce(selectQuery);

        const res = await getMenuItems(validTenantId);
        expect(res.success).toBe(true);
        expect(res.data).toHaveLength(1);
        expect(res.data?.[0]?.name).toBe('Pizza Hawaiana');
      });
    });

    describe('createMenuItem', () => {
      it('debe rechazar precio negativo con Zod', async () => {
        const res = await createMenuItem(validTenantId, {
          name: 'Pizza',
          price: -10,
        });
        expect(res.success).toBe(false);
        expect(res.error).toContain('negativo');
      });

      it('debe insertar exitosamente el platillo con options_schema', async () => {
        const membershipQuery = mockAuth('admin');

        const itemPayload = {
          category_id: validCategoryId,
          name: 'Pizza Margherita',
          price: 180,
          description: 'Tomate, albahaca y mozzarella fresca',
          options_schema: [
            {
              name: 'Masa',
              type: 'single_choice' as const,
              required: true,
              choices: [
                { label: 'Tradicional', price_modifier: 0 },
                { label: 'Orilla de Queso', price_modifier: 35 },
              ],
            },
          ],
        };

        const insertQuery = {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({
            data: { id: validItemId, ...itemPayload, is_available: true, sort_order: 0 },
            error: null,
          }),
        };

        mockFrom
          .mockReturnValueOnce(membershipQuery)
          .mockReturnValueOnce(insertQuery);

        const res = await createMenuItem(validTenantId, itemPayload);
        expect(res.success).toBe(true);
        expect(res.data?.name).toBe('Pizza Margherita');
        expect(res.data?.price).toBe(180);
      });
    });

    describe('updateMenuItem', () => {
      it('debe rechazar llamada si no se envían campos para modificar', async () => {
        const membershipQuery = mockAuth('admin');
        mockFrom.mockReturnValueOnce(membershipQuery);

        const res = await updateMenuItem(validTenantId, validItemId, {});
        expect(res.success).toBe(false);
        expect(res.error).toContain('No se proporcionaron cambios');
      });

      it('debe actualizar precio y disponibilidad', async () => {
        const membershipQuery = mockAuth('admin');

        const updateQuery = {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({
            data: { id: validItemId, name: 'Pizza', price: 200, is_available: false },
            error: null,
          }),
        };
        updateQuery.eq.mockReturnValue(updateQuery);

        mockFrom
          .mockReturnValueOnce(membershipQuery)
          .mockReturnValueOnce(updateQuery);

        const res = await updateMenuItem(validTenantId, validItemId, {
          price: 200,
          is_available: false,
        });
        expect(res.success).toBe(true);
        expect(res.data?.price).toBe(200);
      });
    });

    describe('deleteMenuItem', () => {
      it('debe rechazar eliminación si tiene historial en order_items con mensaje amigable', async () => {
        const membershipQuery = mockAuth('admin');

        const countQuery = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValueOnce({ count: 5, error: null }),
        };

        mockFrom
          .mockReturnValueOnce(membershipQuery)
          .mockReturnValueOnce(countQuery);

        const res = await deleteMenuItem(validTenantId, validItemId);
        expect(res.success).toBe(false);
        expect(res.error).toBe(
          'No se puede eliminar un platillo con historial de pedidos. Puedes desactivar su disponibilidad en su lugar.'
        );
      });

      it('debe eliminar físicamente si no tiene órdenes históricas asociadas', async () => {
        const membershipQuery = mockAuth('admin');

        const countQuery = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValueOnce({ count: 0, error: null }),
        };

        const deleteQuery = {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };
        deleteQuery.eq
          .mockReturnValueOnce(deleteQuery)
          .mockResolvedValueOnce({ error: null });

        mockFrom
          .mockReturnValueOnce(membershipQuery)
          .mockReturnValueOnce(countQuery)
          .mockReturnValueOnce(deleteQuery);

        const res = await deleteMenuItem(validTenantId, validItemId);
        expect(res.success).toBe(true);
        expect(res.data?.id).toBe(validItemId);
      });
    });

    describe('toggleItemAvailability', () => {
      it('debe invertir disponibilidad de true a false', async () => {
        const membershipQuery = mockAuth('admin');

        const selectQuery = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({
            data: { id: validItemId, is_available: true },
            error: null,
          }),
        };
        selectQuery.eq.mockReturnValue(selectQuery);

        const updateQuery = {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValueOnce({
            data: { id: validItemId, is_available: false },
            error: null,
          }),
        };
        updateQuery.eq.mockReturnValue(updateQuery);

        mockFrom
          .mockReturnValueOnce(membershipQuery)
          .mockReturnValueOnce(selectQuery)
          .mockReturnValueOnce(updateQuery);

        const res = await toggleItemAvailability(validTenantId, validItemId);
        expect(res.success).toBe(true);
        expect(res.data?.is_available).toBe(false);
      });
    });

    describe('reorderMenuItems', () => {
      it('debe actualizar el sort_order de platillos en lote', async () => {
        const membershipQuery = mockAuth('admin');

        const item1 = '11111111-5555-4222-8222-222222222222';
        const item2 = '22222222-6666-4222-8222-222222222222';

        const updateQuery1 = {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };
        updateQuery1.eq
          .mockReturnValueOnce(updateQuery1)
          .mockReturnValueOnce(updateQuery1)
          .mockResolvedValueOnce({ error: null });

        const updateQuery2 = {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        };
        updateQuery2.eq
          .mockReturnValueOnce(updateQuery2)
          .mockReturnValueOnce(updateQuery2)
          .mockResolvedValueOnce({ error: null });

        mockFrom
          .mockReturnValueOnce(membershipQuery)
          .mockReturnValueOnce(updateQuery1)
          .mockReturnValueOnce(updateQuery2);

        const res = await reorderMenuItems(validTenantId, validCategoryId, [item1, item2]);
        expect(res.success).toBe(true);
        expect(res.data?.count).toBe(2);
      });
    });
  });
});
