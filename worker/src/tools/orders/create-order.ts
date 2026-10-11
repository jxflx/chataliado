import { z } from 'zod';
import { type ToolDefinition, type ToolContext } from '../interface';
import { OrderRepository } from '../../services/db/order-repository';

export const createOrderSchema = z.object({});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export interface CreateOrderOutput {
  success: boolean;
  order: {
    id: string;
    status: string;
    subtotal: number;
    delivery_fee: number;
    discount: number;
    total: number;
    created_at: string;
  };
}

export const createOrderTool: ToolDefinition<CreateOrderInput, CreateOrderOutput> = {
  name: 'create_order',
  description:
    'Inicializa un nuevo pedido en estado borrador (draft) para el cliente y conversación actual.',
  parameters: createOrderSchema,

  async execute(_input: CreateOrderInput, context: ToolContext): Promise<CreateOrderOutput> {
    const orderRepo = new OrderRepository(context.db);
    const order = await orderRepo.createDraftOrder(
      context.restaurantId,
      context.customerId,
      context.conversationId
    );

    return {
      success: true,
      order: {
        id: order.id,
        status: order.status,
        subtotal: order.subtotal,
        delivery_fee: order.delivery_fee,
        discount: order.discount,
        total: order.total,
        created_at: order.created_at,
      },
    };
  },
};
