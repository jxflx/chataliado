import { z } from 'zod';
import { type ToolDefinition, type ToolContext } from '../interface';
import { OrderRepository } from '../../services/db/order-repository';
import { uuidSchema, quantitySchema } from '../../schemas/database';
import { buildCartSummary, type CartItemSummary } from './cart-helper';

export const updateOrderItemQuantitySchema = z.object({
  order_id: uuidSchema.describe('Identificador único (UUID) del pedido'),
  item_id: uuidSchema.describe('Identificador único (UUID) del ítem cuya cantidad se va a modificar'),
  quantity: quantitySchema.describe('Nueva cantidad deseada (entero mayor a 0)'),
});

export type UpdateOrderItemQuantityInput = z.infer<typeof updateOrderItemQuantitySchema>;

export interface UpdateOrderItemQuantityOutput {
  success: boolean;
  order_id: string;
  item_id: string;
  new_quantity: number;
  unit_price: number;
  item_subtotal: number;
  order_subtotal: number;
  order_total: number;
  current_cart: CartItemSummary[];
  items_count: number;
}

export const updateOrderItemQuantityTool: ToolDefinition<
  UpdateOrderItemQuantityInput,
  UpdateOrderItemQuantityOutput
> = {
  name: 'update_order_item_quantity',
  description:
    'Modifica directamente la cantidad de un producto existente en el carrito sin tener que eliminarlo ni volver a crearlo.',
  parameters: updateOrderItemQuantitySchema,

  async execute(
    input: UpdateOrderItemQuantityInput,
    context: ToolContext
  ): Promise<UpdateOrderItemQuantityOutput> {
    const orderRepo = new OrderRepository(context.db);
    const { order, item } = await orderRepo.updateItemQuantity(
      context.restaurantId,
      input.order_id,
      input.item_id,
      input.quantity
    );

    const summary = await orderRepo.getOrderSummary(context.restaurantId, input.order_id);
    const cartSummary = await buildCartSummary(context.db, context.restaurantId, summary?.items ?? []);

    return {
      success: true,
      order_id: order.id,
      item_id: item.id,
      new_quantity: item.quantity,
      unit_price: item.unit_price,
      item_subtotal: item.subtotal,
      order_subtotal: order.subtotal,
      order_total: order.total,
      current_cart: cartSummary,
      items_count: cartSummary.length,
    };
  },
};
