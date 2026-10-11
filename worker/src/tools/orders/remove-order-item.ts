import { z } from 'zod';
import { type ToolDefinition, type ToolContext } from '../interface';
import { OrderRepository } from '../../services/db/order-repository';
import { uuidSchema } from '../../schemas/database';
import { buildCartSummary, type CartItemSummary } from './cart-helper';

export const removeOrderItemToolSchema = z.object({
  order_id: uuidSchema.describe('Identificador único (UUID) del pedido'),
  item_id: uuidSchema.describe('Identificador único (UUID) del ítem a remover'),
});

export type RemoveOrderItemToolInput = z.infer<typeof removeOrderItemToolSchema>;

export interface RemoveOrderItemToolOutput {
  success: boolean;
  order_id: string;
  removed_item_id: string;
  new_subtotal: number;
  new_total: number;
  remaining_items_count: number;
  current_cart: CartItemSummary[];
}

export const removeOrderItemTool: ToolDefinition<
  RemoveOrderItemToolInput,
  RemoveOrderItemToolOutput
> = {
  name: 'remove_order_item',
  description:
    'Elimina una línea de producto de un pedido en borrador (draft) y recalcula los subtotales automáticamente.',
  parameters: removeOrderItemToolSchema,

  async execute(
    input: RemoveOrderItemToolInput,
    context: ToolContext
  ): Promise<RemoveOrderItemToolOutput> {
    const orderRepo = new OrderRepository(context.db);
    const updatedOrder = await orderRepo.removeItem(
      context.restaurantId,
      input.order_id,
      input.item_id
    );

    const summary = await orderRepo.getOrderSummary(context.restaurantId, input.order_id);
    const cartSummary = await buildCartSummary(context.db, context.restaurantId, summary?.items ?? []);
    const remainingCount = summary?.items.length ?? 0;

    return {
      success: true,
      order_id: updatedOrder.id,
      removed_item_id: input.item_id,
      new_subtotal: updatedOrder.subtotal,
      new_total: updatedOrder.total,
      remaining_items_count: remainingCount,
      current_cart: cartSummary,
    };
  },
};
