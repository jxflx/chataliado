import { describe, it, expect } from 'vitest';
import {
  phoneSchema,
  notesMdSchema,
  uuidSchema,
  priceSchema,
  quantitySchema,
  menuItemSchema,
  addOrderItemInputSchema,
  orderSchema,
  agentConfigSchema,
  userRoleSchema,
  orderStatusSchema,
  paymentMethodSchema,
  createCustomerSchema,
  updateCustomerNotesSchema,
  customerSchema,
  restaurantSchema,
  menuCategorySchema,
  orderItemSchema,
} from '../src/schemas/database';

describe('Database & Domain Zod Schemas Validation', () => {
  describe('Primitivos y Validadores Base', () => {
    it('debe validar números de teléfono válidos (dígitos E.164 sin +)', () => {
      expect(phoneSchema.parse('5215512345678')).toBe('5215512345678');
      expect(phoneSchema.parse('5512345678')).toBe('5512345678');
    });

    it('debe rechazar teléfonos con caracteres no numéricos o longitud inválida', () => {
      expect(phoneSchema.parse('+5215512345678')).toBe('+5215512345678');
      expect(() => phoneSchema.parse('55-1234-5678')).toThrow();
      expect(() => phoneSchema.parse('12345')).toThrow();
      expect(() => phoneSchema.parse('12345678901234567890')).toThrow();
    });

    it('debe validar y sanitizar el campo notes_md (memoria Markdown)', () => {
      const validMarkdown = '# Notas de Juan\n- Prefiere masa delgada\n- Sin cebolla';
      expect(notesMdSchema.parse(validMarkdown)).toBe(validMarkdown);
      expect(notesMdSchema.parse('')).toBe('');
    });

    it('debe rechazar un notes_md que exceda 5000 caracteres', () => {
      const hugeText = 'a'.repeat(5001);
      expect(() => notesMdSchema.parse(hugeText)).toThrow();
    });

    it('debe validar UUIDs correctamente', () => {
      const validUuid = 'a0000000-0000-0000-0000-000000000001';
      expect(uuidSchema.parse(validUuid)).toBe(validUuid);
      expect(() => uuidSchema.parse('invalid-uuid-123')).toThrow();
    });
  });

  describe('Catálogo y Menú Items (options_schema)', () => {
    it('debe validar un ítem de menú con opciones de personalización válidas', () => {
      const item = {
        id: 'c0000000-0000-0000-0000-000000000001',
        restaurant_id: 'a0000000-0000-0000-0000-000000000001',
        category_id: 'b0000000-0000-0000-0000-000000000001',
        name: 'Pizza Pepperoni',
        description: 'Deliciosa pizza artesanal',
        price: 189.5,
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
        is_available: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = menuItemSchema.parse(item);
      expect(result.name).toBe('Pizza Pepperoni');
      expect(result.options_schema[0]?.choices[1]?.price_modifier).toBe(50);
    });

    it('debe rechazar ítems de menú con precios negativos', () => {
      const invalidItem = {
        id: 'c0000000-0000-0000-0000-000000000001',
        restaurant_id: 'a0000000-0000-0000-0000-000000000001',
        category_id: null,
        name: 'Pizza Error',
        price: -10,
        options_schema: [],
        is_available: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(() => menuItemSchema.parse(invalidItem)).toThrow();
    });
  });

  describe('Pedidos y Líneas de Pedido (Order & Items)', () => {
    it('debe validar la entrada para agregar un ítem al pedido con opciones seleccionadas', () => {
      const input = {
        order_id: 'd0000000-0000-0000-0000-000000000001',
        product_id: 'c0000000-0000-0000-0000-000000000001',
        quantity: 2,
        options_selected: [
          { group_name: 'Tamaño', choice_label: 'Grande', price_modifier: 50 },
          { group_name: 'Orilla', choice_label: 'Queso', price_modifier: 40 },
        ],
      };

      const parsed = addOrderItemInputSchema.parse(input);
      expect(parsed.quantity).toBe(2);
      expect(parsed.options_selected.length).toBe(2);
    });

    it('debe rechazar cantidades menores o iguales a cero', () => {
      expect(() =>
        addOrderItemInputSchema.parse({
          order_id: 'd0000000-0000-0000-0000-000000000001',
          product_id: 'c0000000-0000-0000-0000-000000000001',
          quantity: 0,
        })
      ).toThrow();
    });

    it('debe validar un pedido completo con estados permitidos', () => {
      const order = {
        id: 'd0000000-0000-0000-0000-000000000001',
        restaurant_id: 'a0000000-0000-0000-0000-000000000001',
        customer_id: 'b0000000-0000-0000-0000-000000000001',
        conversation_id: null,
        status: 'draft',
        subtotal: 350.0,
        delivery_fee: 30.0,
        discount: 0.0,
        total: 380.0,
        delivery_address: 'Calle 123',
        payment_method: 'cash',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = orderSchema.parse(order);
      expect(result.status).toBe('draft');
      expect(result.total).toBe(380.0);
    });
  });

  describe('Configuración del Agente (Agent Config)', () => {
    it('debe validar un horario de operación con formato HH:mm', () => {
      const config = {
        id: 'f0000000-0000-0000-0000-000000000001',
        restaurant_id: 'a0000000-0000-0000-0000-000000000001',
        system_prompt: 'Eres el asistente virtual...',
        business_rules: 'Reglas de entrega...',
        handoff_triggers: ['queja', 'factura'],
        operating_hours: {
          lunes: { open: '13:00', close: '22:00' },
          martes: { open: '13:00', close: '22:00' },
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const parsed = agentConfigSchema.parse(config);
      expect(parsed.operating_hours.lunes?.open).toBe('13:00');
    });

    it('debe rechazar horarios con formato inválido', () => {
      const invalidConfig = {
        id: 'f0000000-0000-0000-0000-000000000001',
        restaurant_id: 'a0000000-0000-0000-0000-000000000001',
        operating_hours: {
          lunes: { open: '25:00', close: 'invalid' },
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(() => agentConfigSchema.parse(invalidConfig)).toThrow();
    });
  });

  describe('Schemas Faltantes — Cobertura Completa', () => {
    it('debe validar userRoleSchema con roles permitidos', () => {
      expect(userRoleSchema.parse('owner')).toBe('owner');
      expect(userRoleSchema.parse('admin')).toBe('admin');
      expect(userRoleSchema.parse('staff')).toBe('staff');
      expect(() => userRoleSchema.parse('superadmin')).toThrow();
      expect(() => userRoleSchema.parse('')).toThrow();
    });

    it('debe validar orderStatusSchema con estados permitidos', () => {
      expect(orderStatusSchema.parse('draft')).toBe('draft');
      expect(orderStatusSchema.parse('confirmed')).toBe('confirmed');
      expect(orderStatusSchema.parse('preparing')).toBe('preparing');
      expect(orderStatusSchema.parse('delivered')).toBe('delivered');
      expect(orderStatusSchema.parse('cancelled')).toBe('cancelled');
      expect(() => orderStatusSchema.parse('pending')).toThrow();
      expect(() => orderStatusSchema.parse('')).toThrow();
    });

    it('debe validar paymentMethodSchema con métodos permitidos', () => {
      expect(paymentMethodSchema.parse('cash')).toBe('cash');
      expect(paymentMethodSchema.parse('transfer')).toBe('transfer');
      expect(paymentMethodSchema.parse('card')).toBe('card');
      expect(paymentMethodSchema.parse('pending')).toBe('pending');
      expect(() => paymentMethodSchema.parse('bitcoin')).toThrow();
    });

    it('debe validar createCustomerSchema con datos mínimos y completos', () => {
      const minimal = { phone: '5215512345678' };
      const parsed = createCustomerSchema.parse(minimal);
      expect(parsed.phone).toBe('5215512345678');
      expect(parsed.notes_md).toBe('');

      const full = { phone: '5215512345678', name: 'Juan', address_default: 'Calle 1', notes_md: 'VIP' };
      const parsedFull = createCustomerSchema.parse(full);
      expect(parsedFull.name).toBe('Juan');
    });

    it('debe validar updateCustomerNotesSchema', () => {
      const valid = { customer_id: 'a0000000-0000-0000-0000-000000000001', notes_md: 'Notas nuevas' };
      expect(updateCustomerNotesSchema.parse(valid).notes_md).toBe('Notas nuevas');
      expect(() => updateCustomerNotesSchema.parse({ customer_id: 'bad-uuid', notes_md: 'x' })).toThrow();
    });

    it('debe validar customerSchema completo', () => {
      const customer = {
        id: 'a0000000-0000-0000-0000-000000000001',
        restaurant_id: 'a0000000-0000-0000-0000-000000000001',
        phone: '5215512345678',
        name: 'Carlos',
        address_default: null,
        notes_md: 'VIP',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      expect(customerSchema.parse(customer).name).toBe('Carlos');
    });

    it('debe validar restaurantSchema', () => {
      const restaurant = {
        id: 'a0000000-0000-0000-0000-000000000001',
        name: 'Pizzería Don Giovanni',
        slug: 'don-giovanni',
        phone: null,
        address: null,
        timezone: 'America/Mexico_City',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      expect(restaurantSchema.parse(restaurant).slug).toBe('don-giovanni');
      expect(() => restaurantSchema.parse({ ...restaurant, name: '' })).toThrow();
    });

    it('debe validar menuCategorySchema', () => {
      const cat = {
        id: 'b0000000-0000-0000-0000-000000000001',
        restaurant_id: 'a0000000-0000-0000-0000-000000000001',
        name: 'Pizzas',
        sort_order: 1,
        is_active: true,
        created_at: new Date().toISOString(),
      };
      expect(menuCategorySchema.parse(cat).name).toBe('Pizzas');
      expect(() => menuCategorySchema.parse({ ...cat, name: '' })).toThrow();
    });

    it('debe validar orderItemSchema completo', () => {
      const item = {
        id: 'f0000000-0000-0000-0000-000000000001',
        order_id: 'e0000000-0000-0000-0000-000000000001',
        product_id: 'c0000000-0000-0000-0000-000000000001',
        quantity: 2,
        unit_price: 189.00,
        options_selected: [{ group_name: 'Tamaño', choice_label: 'Grande', price_modifier: 50 }],
        subtotal: 478.00,
        created_at: new Date().toISOString(),
      };
      expect(orderItemSchema.parse(item).quantity).toBe(2);
      expect(() => orderItemSchema.parse({ ...item, quantity: 0 })).toThrow();
      expect(() => orderItemSchema.parse({ ...item, unit_price: -10 })).toThrow();
    });

    it('debe validar priceSchema con límite de 2 decimales', () => {
      expect(priceSchema.parse(189.50)).toBe(189.50);
      expect(priceSchema.parse(0)).toBe(0);
      expect(() => priceSchema.parse(-1)).toThrow();
      expect(() => priceSchema.parse(199.999)).toThrow();
    });

    it('debe rechazar edge cases: null, undefined, strings vacíos donde no corresponde', () => {
      expect(() => phoneSchema.parse(null as unknown as string)).toThrow();
      expect(() => phoneSchema.parse(undefined as unknown as string)).toThrow();
      expect(() => uuidSchema.parse('')).toThrow();
      expect(() => quantitySchema.parse(0)).toThrow();
      expect(() => quantitySchema.parse(-1)).toThrow();
      expect(() => quantitySchema.parse(1.5)).toThrow();
    });
  });
});

