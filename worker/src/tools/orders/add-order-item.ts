import { z } from 'zod';
import { type ToolDefinition, type ToolContext } from '../interface';
import { OrderRepository } from '../../services/db/order-repository';
import { uuidSchema, quantitySchema } from '../../schemas/database';
import { buildCartSummary, type CartItemSummary } from './cart-helper';

export const selectedOptionInputSchema = z.object({
  group_name: z.string().min(1).describe('Nombre del grupo de opciones (ej: Tamaño, Masa, Extra)'),
  choice_label: z.string().min(1).describe('Etiqueta de la opción elegida (ej: Grande, Queso Extra)'),
  price_modifier: z.number().default(0).describe('Modificador de precio de la opción (ej: 50.00)'),
});

export const addOrderItemToolSchema = z.object({
  order_id: uuidSchema.describe('Identificador (UUID) del pedido en estado draft'),
  product_id: uuidSchema.describe('Identificador (UUID) del producto del menú a añadir'),
  quantity: quantitySchema.default(1).describe('Cantidad de unidades a agregar (entero mayor a 0)'),
  options_selected: z
    .array(selectedOptionInputSchema)
    .optional()
    .default([])
    .describe('Opciones y variantes seleccionadas para el ítem'),
});

export type AddOrderItemToolInput = z.infer<typeof addOrderItemToolSchema>;

export interface AddOrderItemToolOutput {
  success: boolean;
  order_id: string;
  item_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  item_subtotal: number;
  order_subtotal: number;
  order_total: number;
  current_cart: CartItemSummary[];
  items_count: number;
}

export const addOrderItemTool: ToolDefinition<AddOrderItemToolInput, AddOrderItemToolOutput> = {
  name: 'add_order_item',
  description:
    'Añade un producto del catálogo con sus opciones a un pedido en borrador (draft) y recalcula determinísticamente los totales.',
  parameters: addOrderItemToolSchema,

  async execute(input: AddOrderItemToolInput, context: ToolContext): Promise<AddOrderItemToolOutput> {
    const orderRepo = new OrderRepository(context.db);
    const { order, item } = await orderRepo.addItem(context.restaurantId, {
      order_id: input.order_id,
      product_id: input.product_id,
      quantity: input.quantity,
      options_selected: input.options_selected,
    });

    const summary = await orderRepo.getOrderSummary(context.restaurantId, order.id);
    const cartSummary = await buildCartSummary(context.db, context.restaurantId, summary?.items ?? []);

    return {
      success: true,
      order_id: order.id,
      item_id: item.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      item_subtotal: item.subtotal,
      order_subtotal: order.subtotal,
      order_total: order.total,
      current_cart: cartSummary,
      items_count: cartSummary.length,
    };
  },
};
