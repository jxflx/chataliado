import { z } from 'zod';

/**
 * Esquemas de validación Zod en fronteras (Boundaries).
 * Aseguran tipado estricto e integridad de datos antes de interactuar con Supabase o el LLM.
 */

// 1. Validadores Primitivos
export const uuidSchema = z.string().uuid({ message: 'Debe ser un UUID válido' });

export const phoneSchema = z
  .string()
  .min(10, { message: 'El teléfono debe tener al menos 10 dígitos' })
  .max(16, { message: 'El teléfono no puede exceder 16 caracteres' })
  .regex(/^\+?\d+$/, { message: 'El teléfono debe contener solo dígitos, opcionalmente precedido por +' });

export const notesMdSchema = z
  .string()
  .max(5000, { message: 'El bloc de notas Markdown no puede exceder 5,000 caracteres' });

export const priceSchema = z
  .number()
  .nonnegative({ message: 'El precio no puede ser negativo' })
  .multipleOf(0.01, { message: 'El precio debe tener máximo 2 decimales' });

export const quantitySchema = z
  .number()
  .int({ message: 'La cantidad debe ser un número entero' })
  .positive({ message: 'La cantidad debe ser mayor a 0' });

// 2. Esquemas de Usuario y Restaurante
export const userRoleSchema = z.enum(['owner', 'admin', 'staff']);

export const restaurantSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  timezone: z.string().default('America/Mexico_City'),
  is_active: z.boolean().default(true),
  subscription_status: z.enum([
    'trialing', 'active', 'in_grace_period',
    'past_due', 'suspended', 'manual_exempt',
  ]).default('trialing'),
  subscription_tier: z.enum(['starter', 'pro', 'enterprise']).default('starter'),
  stripe_customer_id: z.string().nullable().default(null),
  stripe_subscription_id: z.string().nullable().default(null),
  trial_ends_at: z.string().datetime().nullable().default(null),
  current_period_ends_at: z.string().datetime().nullable().default(null),
  grace_period_ends_at: z.string().datetime().nullable().default(null),
  max_orders_per_month: z.number().int().positive().default(500),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// 3. Esquemas de Clientes y Memoria
export const customerSchema = z.object({
  id: uuidSchema,
  restaurant_id: uuidSchema,
  phone: phoneSchema,
  name: z.string().nullable(),
  address_default: z.string().nullable(),
  notes_md: notesMdSchema.default(''),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const createCustomerSchema = z.object({
  phone: phoneSchema,
  name: z.string().optional().nullable(),
  address_default: z.string().optional().nullable(),
  notes_md: notesMdSchema.optional().default(''),
});

export const updateCustomerNotesSchema = z.object({
  customer_id: uuidSchema,
  notes_md: notesMdSchema,
});

// 4. Esquemas de Conversaciones y Mensajes
export const conversationStatusSchema = z.enum(['open', 'closed']);
export const conversationModeSchema = z.enum(['ai', 'human']);
export const messageRoleSchema = z.enum(['user', 'assistant', 'system', 'human_agent', 'tool']);

export const conversationSchema = z.object({
  id: uuidSchema,
  restaurant_id: uuidSchema,
  customer_id: uuidSchema,
  status: conversationStatusSchema.default('open'),
  mode: conversationModeSchema.default('ai'),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const messageSchema = z.object({
  id: uuidSchema,
  restaurant_id: uuidSchema,
  conversation_id: uuidSchema,
  role: messageRoleSchema,
  content: z.string().min(1),
  provider_message_id: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
  created_at: z.string().datetime(),
});

// 5. Esquemas de Menú y Catálogo
export const optionChoiceSchema = z.object({
  label: z.string().min(1),
  price_modifier: priceSchema.default(0),
});

export const optionGroupSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['single_choice', 'multiple_choice']),
  required: z.boolean().default(false),
  choices: z.array(optionChoiceSchema).min(1),
});

export const menuCategorySchema = z.object({
  id: uuidSchema,
  restaurant_id: uuidSchema,
  name: z.string().min(1).max(100),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
  created_at: z.string().datetime(),
});

export const menuItemSchema = z.object({
  id: uuidSchema,
  restaurant_id: uuidSchema,
  category_id: uuidSchema.nullable(),
  name: z.string().min(1).max(200),
  description: z.string().default(''),
  price: priceSchema,
  options_schema: z.array(optionGroupSchema).default([]),
  is_available: z.boolean().default(true),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// 5. Esquemas de Pedidos y Líneas de Pedido
export const orderStatusSchema = z.enum(['draft', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']);
export const paymentMethodSchema = z.enum(['cash', 'transfer', 'card', 'pending']);

// 5.1 Esquemas de Suscripción y Acceso SaaS
export const subscriptionStatusSchema = z.enum([
  'trialing',
  'active',
  'in_grace_period',
  'past_due',
  'suspended',
  'manual_exempt',
]);
export const subscriptionTierSchema = z.enum(['starter', 'pro', 'enterprise']);

export const selectedOptionSchema = z.object({
  group_name: z.string().min(1),
  choice_label: z.string().min(1),
  price_modifier: priceSchema.default(0),
});

export const orderItemSchema = z.object({
  id: uuidSchema,
  order_id: uuidSchema,
  product_id: uuidSchema,
  quantity: quantitySchema,
  unit_price: priceSchema,
  options_selected: z.array(selectedOptionSchema).default([]),
  subtotal: priceSchema,
  created_at: z.string().datetime(),
});

export const orderSchema = z.object({
  id: uuidSchema,
  restaurant_id: uuidSchema,
  customer_id: uuidSchema,
  conversation_id: uuidSchema.nullable(),
  status: orderStatusSchema.default('draft'),
  subtotal: priceSchema.default(0),
  delivery_fee: priceSchema.default(0),
  discount: priceSchema.default(0),
  total: priceSchema.default(0),
  delivery_address: z.string().nullable().optional(),
  payment_method: paymentMethodSchema.nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const addOrderItemInputSchema = z.object({
  order_id: uuidSchema,
  product_id: uuidSchema,
  quantity: quantitySchema.default(1),
  options_selected: z.array(selectedOptionSchema).default([]),
});

// 6. Esquemas de Configuración del Agente
export const dayScheduleSchema = z.object({
  open: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:mm requerido'),
  close: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato HH:mm requerido'),
});

export const agentConfigSchema = z.object({
  id: uuidSchema,
  restaurant_id: uuidSchema,
  system_prompt: z.string().default(''),
  business_rules: z.string().default(''),
  handoff_triggers: z.array(z.string()).default([]),
  operating_hours: z.record(dayScheduleSchema).default({}),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

// Tipos inferidos automáticamente de los esquemas Zod
export type CustomerInput = z.input<typeof createCustomerSchema>;
export type UpdateCustomerNotesInput = z.input<typeof updateCustomerNotesSchema>;
export type AddOrderItemInput = z.input<typeof addOrderItemInputSchema>;
export type AddOrderItemValidated = z.output<typeof addOrderItemInputSchema>;
export type MenuItemValidated = z.infer<typeof menuItemSchema>;
export type OrderValidated = z.infer<typeof orderSchema>;

