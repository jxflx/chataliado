import { describe, it, expect } from 'vitest';
import {
  checkOperatingHours,
  formatCustomerMemory,
  formatLastOrder,
  formatActiveOrder,
  buildSystemPrompt,
  PromptBuilder,
} from '../src/services/agent/prompt-builder';
import {
  type Restaurant,
  type AgentConfig,
  type Customer,
  type Order,
  type OrderItem,
} from '../src/types/database';

describe('PromptBuilder & Operating Hours Subsystem', () => {
  const mockRestaurant: Restaurant = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Pizzería Bella Napoli',
    slug: 'bella-napoli',
    phone: '5215512345678',
    address: 'Av. Insurgentes Sur #1234, CDMX',
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
    address_default: 'Calle Roble #45, Depto 302',
    notes_md: '- Prefiere masa delgada\n- Alérgico a los mariscos\n- Nombre preferido: Carlitos',
    created_at: '2026-02-01T10:00:00Z',
    updated_at: '2026-02-01T10:00:00Z',
  };

  const mockAgentConfig: AgentConfig = {
    id: '33333333-3333-3333-3333-333333333333',
    restaurant_id: mockRestaurant.id,
    system_prompt: 'Eres Don Mario, el experto pizzero de Bella Napoli. Responde siempre con entusiasmo.',
    business_rules: '- Envíos gratis en compras mayores a $300.\n- Tiempo de entrega estimado: 35-45 minutos.\n- Aceptamos efectivo y transferencias.',
    handoff_triggers: ['factura', 'queja', 'humano'],
    operating_hours: {
      friday: { open: '13:00', close: '23:00' },
      saturday: { open: '13:00', close: '23:30' },
      sunday: { open: '12:00', close: '21:00' },
    },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  describe('checkOperatingHours', () => {
    it('debe indicar abierto cuando la hora local en Mexico_City está dentro del rango', () => {
      // 2026-08-21 es viernes. En UTC 20:00 es 14:00 en America/Mexico_City (UTC-6)
      const testDate = new Date('2026-08-21T20:00:00Z');
      const result = checkOperatingHours(
        mockAgentConfig.operating_hours,
        'America/Mexico_City',
        testDate
      );

      expect(result.isOpen).toBe(true);
      expect(result.localDayName).toBe('friday');
      expect(result.localTimeStr).toBe('14:00');
      expect(result.currentDaySchedule).toEqual({ open: '13:00', close: '23:00' });
    });

    it('debe indicar cerrado cuando la hora local está antes del horario de apertura', () => {
      // 2026-08-21 (viernes) a las 15:00 UTC = 09:00 AM en Mexico_City (Abre a las 13:00)
      const testDate = new Date('2026-08-21T15:00:00Z');
      const result = checkOperatingHours(
        mockAgentConfig.operating_hours,
        'America/Mexico_City',
        testDate
      );

      expect(result.isOpen).toBe(false);
      expect(result.localTimeStr).toBe('09:00');
      expect(result.localDayName).toBe('friday');
    });

    it('debe indicar cerrado cuando la hora local está después del horario de cierre', () => {
      // 2026-08-22 (sábado en UTC 05:30) = viernes 23:30 en Mexico_City (Cierra a las 23:00)
      const testDate = new Date('2026-08-22T05:30:00Z');
      const result = checkOperatingHours(
        mockAgentConfig.operating_hours,
        'America/Mexico_City',
        testDate
      );

      expect(result.isOpen).toBe(false);
      expect(result.localTimeStr).toBe('23:30');
      expect(result.localDayName).toBe('friday');
    });

    it('debe indicar cerrado si el día de la semana no tiene horario registrado', () => {
      // 2026-08-17 es lunes (no está en el horario de mockAgentConfig)
      const testDate = new Date('2026-08-17T20:00:00Z');
      const result = checkOperatingHours(
        mockAgentConfig.operating_hours,
        'America/Mexico_City',
        testDate
      );

      expect(result.isOpen).toBe(false);
      expect(result.localDayName).toBe('monday');
      expect(result.currentDaySchedule).toBeUndefined();
    });

    it('debe soportar nombres de días en español (ej: "viernes", "sábado")', () => {
      const spanishHours = {
        viernes: { open: '14:00', close: '22:00' },
      };
      // Viernes 16:00 en CDMX
      const testDate = new Date('2026-08-21T22:00:00Z');
      const result = checkOperatingHours(spanishHours, 'America/Mexico_City', testDate);

      expect(result.isOpen).toBe(true);
      expect(result.localDayName).toBe('friday');
      expect(result.currentDaySchedule).toEqual({ open: '14:00', close: '22:00' });
    });

    it('debe soportar horarios nocturnos que cruzan la medianoche (ej: 18:00 a 02:00)', () => {
      const overnightHours = {
        friday: { open: '18:00', close: '02:00' },
      };

      // Viernes 23:00 en CDMX -> Abierto
      const testLateNight = new Date('2026-08-22T05:00:00Z'); // 23:00 CDMX viernes
      const res1 = checkOperatingHours(overnightHours, 'America/Mexico_City', testLateNight);
      expect(res1.isOpen).toBe(true);

      // Viernes 01:30 en CDMX -> Abierto
      const testEarlyMorning = new Date('2026-08-21T07:30:00Z'); // 01:30 CDMX viernes
      const res2 = checkOperatingHours(overnightHours, 'America/Mexico_City', testEarlyMorning);
      expect(res2.isOpen).toBe(true);

      // Viernes 12:00 en CDMX -> Cerrado
      const testNoon = new Date('2026-08-21T18:00:00Z'); // 12:00 CDMX viernes
      const res3 = checkOperatingHours(overnightHours, 'America/Mexico_City', testNoon);
      expect(res3.isOpen).toBe(false);
    });

    it('debe retornar isOpen=true por defecto si operating_hours es nulo o vacío', () => {
      const resultNull = checkOperatingHours(null, 'America/Mexico_City');
      expect(resultNull.isOpen).toBe(true);

      const resultEmpty = checkOperatingHours({}, 'America/Mexico_City');
      expect(resultEmpty.isOpen).toBe(true);
    });

    it('debe manejar timezones inválidos usando fallback seguro a UTC sin arrojar excepciones', () => {
      const result = checkOperatingHours(
        mockAgentConfig.operating_hours,
        'Invalid/NonExistent_Zone',
        new Date('2026-08-21T20:00:00Z')
      );
      expect(result).toBeDefined();
      expect(typeof result.isOpen).toBe('boolean');
      expect(typeof result.localTimeStr).toBe('string');
    });
  });

  describe('formatCustomerMemory & formatLastOrder', () => {
    it('debe formatear correctamente la memoria de un cliente recurrente con notas y último pedido', () => {
      const mockLastOrder: { order: Order; items: OrderItem[] } = {
        order: {
          id: '44444444-4444-4444-4444-444444444444',
          restaurant_id: mockRestaurant.id,
          customer_id: mockCustomer.id,
          conversation_id: '55555555-5555-5555-5555-555555555555',
          status: 'delivered',
          subtotal: 350.0,
          delivery_fee: 30.0,
          discount: 0.0,
          total: 380.0,
          delivery_address: 'Calle Roble #45',
          payment_method: 'transfer',
          created_at: '2026-08-15T21:00:00Z',
          updated_at: '2026-08-15T21:45:00Z',
        },
        items: [
          {
            id: '66666666-6666-6666-6666-666666666666',
            order_id: '44444444-4444-4444-4444-444444444444',
            product_id: '77777777-7777-7777-7777-777777777777',
            quantity: 2,
            unit_price: 175.0,
            options_selected: [],
            subtotal: 350.0,
            created_at: '2026-08-15T21:00:00Z',
          },
        ],
      };

      const memory = formatCustomerMemory(mockCustomer, mockLastOrder);

      expect(memory).toContain('[MEMORIA DEL CLIENTE - Carlos Mendoza]');
      expect(memory).toContain('- Teléfono: 5215598765432');
      expect(memory).toContain('- Dirección habitual: Calle Roble #45, Depto 302');
      expect(memory).toContain('- Prefiere masa delgada');
      expect(memory).toContain('- Alérgico a los mariscos');
      expect(memory).toContain('- ID: 44444444-4444-4444-4444-444444444444');
      expect(memory).toContain('- Total: $380.00');
      expect(memory).toContain('2x (Unitario: $175.00)');
    });

    it('debe formatear adecuadamente un cliente nuevo sin notas ni pedidos previos', () => {
      const newCustomer: Customer = {
        id: '88888888-8888-8888-8888-888888888888',
        restaurant_id: mockRestaurant.id,
        phone: '5215500000000',
        name: null,
        address_default: null,
        notes_md: '',
        created_at: '2026-08-21T10:00:00Z',
        updated_at: '2026-08-21T10:00:00Z',
      };

      const memory = formatCustomerMemory(newCustomer, null);

      expect(memory).toContain('[MEMORIA DEL CLIENTE - 5215500000000]');
      expect(memory).toContain('- Nombre: No registrado');
      expect(memory).toContain('- Dirección habitual: No registrada');
      expect(memory).toContain('Sin notas registradas previamente. Cliente nuevo.');
      expect(memory).toContain('Sin pedidos previos.');
    });
  });

  describe('formatActiveOrder', () => {
    it('debe retornar mensaje de sin pedido en borrador cuando activeOrder es nulo o vacío', () => {
      expect(formatActiveOrder(null)).toBe(
        '[PEDIDO EN CURSO: No hay pedido en borrador activo actualmente.]'
      );
      expect(formatActiveOrder({ order: {} as Order, items: [] })).toBe(
        '[PEDIDO EN CURSO: No hay pedido en borrador activo actualmente.]'
      );
    });

    it('debe desglosar los ítems y opciones de una orden en borrador activo', () => {
      const activeDraftOrder = {
        order: {
          id: 'draft-order-uuid-1',
          restaurant_id: mockRestaurant.id,
          customer_id: mockCustomer.id,
          conversation_id: 'convo-uuid-1',
          status: 'draft' as const,
          subtotal: 239.0,
          delivery_fee: 30.0,
          discount: 0.0,
          total: 269.0,
          delivery_address: null,
          payment_method: null,
          created_at: '2026-08-21T15:00:00Z',
          updated_at: '2026-08-21T15:05:00Z',
        },
        items: [
          {
            id: 'item-uuid-1',
            order_id: 'draft-order-uuid-1',
            product_id: 'prod-uuid-1',
            quantity: 1,
            unit_price: 239.0,
            options_selected: [
              { group_name: 'Tamaño', choice_label: 'Grande', price_modifier: 50 },
              { group_name: 'Orilla', choice_label: 'Rellena de Queso', price_modifier: 30 },
            ],
            subtotal: 239.0,
            created_at: '2026-08-21T15:05:00Z',
          },
        ],
      };

      const result = formatActiveOrder(activeDraftOrder);

      expect(result).toContain('[PEDIDO EN CURSO (BORRADOR ACTIVO)]');
      expect(result).toContain('- ID de la Orden: draft-order-uuid-1');
      expect(result).toContain('- Subtotal: $239.00');
      expect(result).toContain('- Envío: $30.00');
      expect(result).toContain('- Total acumulado: $269.00');
      expect(result).toContain('1. 1x — Unitario: $239.00 | Subtotal: $239.00');
      expect(result).toContain('Tamaño: Grande, Orilla: Rellena de Queso');
    });
  });

  describe('buildSystemPrompt', () => {
    it('debe ensamblar el System Prompt con encabezado ABIERTO cuando corresponde', () => {
      // Viernes 15:00 en CDMX (Abierto)
      const openDate = new Date('2026-08-21T21:00:00Z');

      const prompt = buildSystemPrompt({
        restaurant: mockRestaurant,
        agentConfig: mockAgentConfig,
        customer: mockCustomer,
        now: openDate,
      });

      expect(prompt).toContain('=== ESTADO OPERATIVO Y HORARIO ===');
      expect(prompt).toContain('🟢 ESTADO: El restaurante está ABIERTO actualmente');
      expect(prompt).toContain('Horario hoy: 13:00 a 23:00');
      expect(prompt).toContain('=== PERFIL DEL NEGOCIO Y ROL ===');
      expect(prompt).toContain('Don Mario, el experto pizzero');
      expect(prompt).toContain('=== REGLAS DE NEGOCIO ===');
      expect(prompt).toContain('Envíos gratis en compras mayores a $300.');
      expect(prompt).toContain('=== MEMORIA Y CONTEXTO DEL CLIENTE ===');
      expect(prompt).toContain('[MEMORIA DEL CLIENTE - Carlos Mendoza]');
      expect(prompt).toContain('=== DIRECTIVAS ESTRICTAS DE SEGURIDAD, PERSONA Y CÁLCULO DETERMINISTA ===');
      expect(prompt).toContain('BLINDAJE ESTRICTO DE PERSONA');
      expect(prompt).toContain('CERO CORRECCIONES ORTOGRÁFICAS');
      expect(prompt).toContain('CERO ALUCINACIÓN DE PRECIOS');
      expect(prompt).toContain('CERO CÁLCULOS MENTALES');
      expect(prompt).toContain('handoff_to_human');
    });

    it('debe ensamblar el System Prompt con encabezado CERRADO y aviso explícito cuando está cerrado', () => {
      // Viernes 08:00 AM en CDMX (Cerrado, abre a las 13:00)
      const closedDate = new Date('2026-08-21T14:00:00Z');

      const prompt = buildSystemPrompt({
        restaurant: mockRestaurant,
        agentConfig: mockAgentConfig,
        customer: mockCustomer,
        now: closedDate,
      });

      expect(prompt).toContain('⚠️ AVISO IMPORTANTE: EL RESTAURANTE ESTÁ CERRADO ACTUALMENTE');
      expect(prompt).toContain('Horario hoy: 13:00 a 23:00');
      expect(prompt).toContain('Informa amablemente al cliente nuestro horario de servicio');
    });

    it('debe proveer un System Prompt por defecto si agentConfig no tiene system_prompt personalizado', () => {
      const prompt = buildSystemPrompt({
        restaurant: mockRestaurant,
        agentConfig: null,
        customer: mockCustomer,
        now: new Date('2026-08-21T21:00:00Z'),
      });

      expect(prompt).toContain('Eres el mesero y asistente virtual de "Pizzería Bella Napoli"');
      expect(prompt).toContain('Nombre: Pizzería Bella Napoli');
    });

    it('la clase PromptBuilder debe exponer los métodos estáticos idénticos a las funciones', () => {
      expect(typeof PromptBuilder.buildSystemPrompt).toBe('function');
      expect(typeof PromptBuilder.checkOperatingHours).toBe('function');
      expect(typeof PromptBuilder.formatCustomerMemory).toBe('function');
      expect(typeof PromptBuilder.formatLastOrder).toBe('function');
      expect(typeof PromptBuilder.formatActiveOrder).toBe('function');
    });
  });
});
