import { describe, it, expect, vi } from 'vitest';
import { type SupabaseClient } from '@supabase/supabase-js';
import { validateAndResolveModifiers } from '../src/services/orders/modifier-validator';
import { OrderRepository } from '../src/services/db/order-repository';
import { addOrderItemTool } from '../src/tools/orders/add-order-item';
import { ValidationError } from '../src/utils/errors';
import { type Database } from '../src/types/database';
import { type ToolContext } from '../src/tools/interface';

describe('Strict Modifier Validation against options_schema (R3)', () => {
  const sampleOptionsSchema = [
    {
      name: 'Tamaño',
      type: 'single_choice' as const,
      required: true,
      choices: [
        { label: 'Mediana (30cm)', price_modifier: 0.0 },
        { label: 'Grande (35cm)', price_modifier: 50.0 },
        { label: 'Familiar (40cm)', price_modifier: 95.0 },
      ],
    },
    {
      name: 'Orilla',
      type: 'single_choice' as const,
      required: false,
      choices: [
        { label: 'Tradicional', price_modifier: 0.0 },
        { label: 'Rellena de Queso', price_modifier: 45.0 },
      ],
    },
    {
      name: 'Ingredientes Extra',
      type: 'multiple_choice' as const,
      required: false,
      choices: [
        { label: 'Tocino', price_modifier: 25.0 },
        { label: 'Champiñones', price_modifier: 20.0 },
        { label: 'Parmesano', price_modifier: 15.0 },
      ],
    },
  ];

  /* -------------------------------------------------------------------------- */
  /* 1. Valid Single Choice and Multiple Choice Selections                      */
  /* -------------------------------------------------------------------------- */
  it('debe validar exitosamente una opción single_choice con modificador de precio y calcular costo', () => {
    const selected = [
      { group_name: 'Tamaño', choice_label: 'Grande (35cm)', price_modifier: 50.0 },
    ];

    const result = validateAndResolveModifiers(sampleOptionsSchema, selected, 'Pizza Pepperoni');

    expect(result.additionalCost).toBe(50.0);
    expect(result.resolvedModifiers).toHaveLength(1);
    expect(result.resolvedModifiers[0]).toEqual({
      group_name: 'Tamaño',
      choice_label: 'Grande (35cm)',
      price_modifier: 50.0,
      group: 'Tamaño',
      label: 'Grande (35cm)',
    });
    expect(result.validatedOptions).toEqual([
      { group_name: 'Tamaño', choice_label: 'Grande (35cm)', price_modifier: 50.0 },
    ]);
  });

  it('debe validar exitosamente opciones múltiples en grupo multiple_choice acumulando precios', () => {
    const selected = [
      { group_name: 'Tamaño', choice_label: 'Mediana (30cm)' },
      { group_name: 'Ingredientes Extra', choice_label: 'Tocino' },
      { group_name: 'Ingredientes Extra', choice_label: 'Champiñones' },
    ];

    const result = validateAndResolveModifiers(sampleOptionsSchema, selected, 'Pizza Especial');

    expect(result.additionalCost).toBe(45.0); // 0 + 25 + 20
    expect(result.resolvedModifiers).toHaveLength(3);
    expect(result.totalOptionsModifier).toBe(45.0);
  });

  /* -------------------------------------------------------------------------- */
  /* 2. Nonexistent Group Validation                                            */
  /* -------------------------------------------------------------------------- */
  it('debe lanzar ValidationError si se selecciona un grupo inexistente', () => {
    const selected = [
      { group_name: 'Tamaño', choice_label: 'Mediana (30cm)' },
      { group_name: 'Salsa Base', choice_label: 'Pesto' },
    ];

    expect(() =>
      validateAndResolveModifiers(sampleOptionsSchema, selected, 'Pizza Pepperoni')
    ).toThrowError(/El grupo de opciones 'Salsa Base' no existe para 'Pizza Pepperoni'/);
  });

  /* -------------------------------------------------------------------------- */
  /* 3. Nonexistent Choice in Group Validation                                  */
  /* -------------------------------------------------------------------------- */
  it('debe lanzar ValidationError si se selecciona una opción inexistente dentro de un grupo', () => {
    const selected = [
      { group_name: 'Tamaño', choice_label: 'Colosal (60cm)' },
    ];

    expect(() =>
      validateAndResolveModifiers(sampleOptionsSchema, selected, 'Pizza Pepperoni')
    ).toThrowError(/La opción 'Colosal \(60cm\)' no es válida para el grupo 'Tamaño'/);
  });

  /* -------------------------------------------------------------------------- */
  /* 4. Single Choice Exclusivity Enforcement                                    */
  /* -------------------------------------------------------------------------- */
  it('debe lanzar ValidationError si se seleccionan múltiples opciones en un grupo single_choice', () => {
    const selected = [
      { group_name: 'Tamaño', choice_label: 'Mediana (30cm)' },
      { group_name: 'Tamaño', choice_label: 'Grande (35cm)' },
    ];

    expect(() =>
      validateAndResolveModifiers(sampleOptionsSchema, selected, 'Pizza Pepperoni')
    ).toThrowError(/El grupo 'Tamaño' solo permite seleccionar una sola opción \('single_choice'\) y se recibieron 2/);
  });

  /* -------------------------------------------------------------------------- */
  /* 5. Required Group Enforcement                                              */
  /* -------------------------------------------------------------------------- */
  it('debe lanzar ValidationError si se omite un grupo obligatorio (required: true)', () => {
    const selected = [
      { group_name: 'Orilla', choice_label: 'Tradicional' },
    ];

    expect(() =>
      validateAndResolveModifiers(sampleOptionsSchema, selected, 'Pizza Pepperoni')
    ).toThrowError(/El grupo de opciones 'Tamaño' es obligatorio para 'Pizza Pepperoni'/);
  });

  /* -------------------------------------------------------------------------- */
  /* 6. Anti-Price Tampering (Authoritative Catalog Price Override)               */
  /* -------------------------------------------------------------------------- */
  it('debe sobreescribir el precio manipulado por el llamador con el precio oficial del esquema', () => {
    const selectedWithTamperedPrice = [
      { group_name: 'Tamaño', choice_label: 'Familiar (40cm)', price_modifier: 0.0 }, // Oficial: 95.0
      { group_name: 'Orilla', choice_label: 'Rellena de Queso', price_modifier: -100.0 }, // Oficial: 45.0
    ];

    const result = validateAndResolveModifiers(
      sampleOptionsSchema,
      selectedWithTamperedPrice,
      'Pizza Pepperoni'
    );

    // Debe prevalecer 95.0 + 45.0 = 140.0
    expect(result.additionalCost).toBe(140.0);
    expect(result.resolvedModifiers[0]!.price_modifier).toBe(95.0);
    expect(result.resolvedModifiers[1]!.price_modifier).toBe(45.0);
  });

  /* -------------------------------------------------------------------------- */
  /* 7. Null / Empty options_schema Handling                                    */
  /* -------------------------------------------------------------------------- */
  it('debe permitir producto sin opciones si options_selected está vacío', () => {
    const resultNull = validateAndResolveModifiers(null, [], 'Refresco 600ml');
    expect(resultNull.additionalCost).toBe(0);
    expect(resultNull.resolvedModifiers).toEqual([]);

    const resultEmpty = validateAndResolveModifiers([], undefined, 'Refresco 600ml');
    expect(resultEmpty.additionalCost).toBe(0);
    expect(resultEmpty.resolvedModifiers).toEqual([]);

    const resultStringEmpty = validateAndResolveModifiers('[]', null, 'Refresco 600ml');
    expect(resultStringEmpty.additionalCost).toBe(0);
    expect(resultStringEmpty.resolvedModifiers).toEqual([]);
  });

  it('debe rechazar opciones en un producto que no tiene options_schema configurado', () => {
    const selected = [
      { group_name: 'Tamaño', choice_label: 'Grande' },
    ];

    expect(() =>
      validateAndResolveModifiers([], selected, 'Tiramisú')
    ).toThrowError(/El producto 'Tiramisú' no acepta opciones ni modificadores de personalización/);
  });

  /* -------------------------------------------------------------------------- */
  /* 8. Robustness & Formatting Normalizations                                  */
  /* -------------------------------------------------------------------------- */
  it('debe soportar case-insensitivity y espacios en nombres de grupos y opciones', () => {
    const selected = [
      { group_name: '  tamaño  ', choice_label: ' grande (35cm) ' },
      { group_name: 'ORILLA', choice_label: 'rellena de queso' },
    ];

    const result = validateAndResolveModifiers(sampleOptionsSchema, selected, 'Pizza');
    expect(result.additionalCost).toBe(95.0); // 50 + 45
    expect(result.resolvedModifiers[0]!.group_name).toBe('Tamaño');
    expect(result.resolvedModifiers[0]!.choice_label).toBe('Grande (35cm)');
  });

  it('debe soportar options_schema serializado como string JSON', () => {
    const schemaString = JSON.stringify(sampleOptionsSchema);
    const selected = [
      { group_name: 'Tamaño', choice_label: 'Mediana (30cm)' },
    ];

    const result = validateAndResolveModifiers(schemaString, selected, 'Pizza');
    expect(result.additionalCost).toBe(0);
    expect(result.resolvedModifiers).toHaveLength(1);
  });

  /* -------------------------------------------------------------------------- */
  /* 9. Integration with OrderRepository.addItem and addOrderItemTool           */
  /* -------------------------------------------------------------------------- */
  it('OrderRepository.addItem debe aplicar validación estricta y recalcular precios', async () => {
    const restaurantId = '11111111-1111-4111-8111-111111111111';
    const orderId = '22222222-2222-4222-8222-222222222222';
    const productId = '33333333-3333-4333-8333-333333333333';
    const itemId = '44444444-4444-4444-8444-444444444444';

    const mockOrder = {
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
      restaurant_id: restaurantId,
      name: 'Pizza Hawaiana',
      price: 180.0,
      is_available: true,
      options_schema: sampleOptionsSchema,
    };

    let insertedOptions: unknown = null;
    const mockClient = {
      from: vi.fn((table: string) => {
        const builder: Record<string, unknown> = {
          select: vi.fn(() => builder),
          insert: vi.fn((payload: Record<string, unknown>) => {
            insertedOptions = payload.options_selected;
            return builder;
          }),
          update: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => {
            if (table === 'orders') return { data: mockOrder, error: null };
            if (table === 'menu_items') return { data: mockProduct, error: null };
            return { data: null, error: null };
          }),
          single: vi.fn(async () => {
            if (table === 'order_items') {
              return {
                data: {
                  id: itemId,
                  order_id: orderId,
                  product_id: productId,
                  quantity: 2,
                  unit_price: 230.0, // 180 + 50
                  options_selected: insertedOptions,
                  subtotal: 460.0,
                },
                error: null,
              };
            }
            if (table === 'orders') {
              return {
                data: {
                  ...mockOrder,
                  subtotal: 460.0,
                  total: 490.0,
                },
                error: null,
              };
            }
            return { data: null, error: null };
          }),
        };
        return builder;
      }),
    } as unknown as SupabaseClient<Database>;

    const repo = new OrderRepository(mockClient);

    // Caso A: Selección válida con tamaño Grande (+50)
    const result = await repo.addItem(restaurantId, {
      order_id: orderId,
      product_id: productId,
      quantity: 2,
      options_selected: [
        { group_name: 'Tamaño', choice_label: 'Grande (35cm)', price_modifier: 999.0 }, // Manipulación de precio
      ],
    });

    expect(result.item.unit_price).toBe(230.0);
    expect(result.item.subtotal).toBe(460.0);
    expect(result.order.subtotal).toBe(460.0);
    expect(result.order.total).toBe(490.0);

    // Caso B: Falta grupo obligatorio -> lanza ValidationError
    await expect(
      repo.addItem(restaurantId, {
        order_id: orderId,
        product_id: productId,
        quantity: 1,
        options_selected: [
          { group_name: 'Orilla', choice_label: 'Tradicional' },
        ],
      })
    ).rejects.toThrow(ValidationError);
  });

  it('addOrderItemTool debe ejecutar exitosamente con validación de modificadores', async () => {
    const restaurantId = '11111111-1111-4111-8111-111111111111';
    const orderId = '22222222-2222-4222-8222-222222222222';
    const productId = '33333333-3333-4333-8333-333333333333';
    const itemId = '44444444-4444-4444-8444-444444444444';

    const mockDraftOrder = {
      id: orderId,
      restaurant_id: restaurantId,
      status: 'draft',
      subtotal: 0,
      delivery_fee: 25,
      discount: 0,
      total: 25,
    };

    const mockProduct = {
      id: productId,
      restaurant_id: restaurantId,
      name: 'Pizza Suprema',
      price: 200.0,
      is_available: true,
      options_schema: sampleOptionsSchema,
    };

    const mockCreatedItem = {
      id: itemId,
      order_id: orderId,
      product_id: productId,
      quantity: 1,
      unit_price: 295.0, // 200 + 95
      subtotal: 295.0,
      options_selected: [{ group_name: 'Tamaño', choice_label: 'Familiar (40cm)', price_modifier: 95.0 }],
    };

    const mockUpdatedOrder = {
      ...mockDraftOrder,
      subtotal: 295.0,
      total: 320.0,
    };

    const mockClient = {
      from: vi.fn((table: string) => {
        const builder: Record<string, unknown> = {
          select: vi.fn(() => builder),
          insert: vi.fn(() => builder),
          update: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          in: vi.fn(() => builder),
          order: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => {
            if (table === 'orders') return { data: mockDraftOrder, error: null };
            if (table === 'menu_items') return { data: mockProduct, error: null };
            return { data: null, error: null };
          }),
          single: vi.fn(async () => {
            if (table === 'order_items') return { data: mockCreatedItem, error: null };
            if (table === 'orders') return { data: mockUpdatedOrder, error: null };
            return { data: null, error: null };
          }),
        };
        return builder;
      }),
    } as unknown as SupabaseClient<Database>;

    const context: ToolContext = {
      restaurantId,
      customerId: '55555555-5555-4555-8555-555555555555',
      conversationId: '66666666-6666-4666-8666-666666666666',
      db: mockClient,
      env: {} as unknown as ToolContext['env'],
    };

    const result = await addOrderItemTool.execute(
      {
        order_id: orderId,
        product_id: productId,
        quantity: 1,
        options_selected: [
          { group_name: 'Tamaño', choice_label: 'Familiar (40cm)', price_modifier: 0.0 },
        ],
      },
      context
    );

    expect(result.success).toBe(true);
    expect(result.unit_price).toBe(295.0);
    expect(result.item_subtotal).toBe(295.0);
    expect(result.order_total).toBe(320.0);
  });
});
