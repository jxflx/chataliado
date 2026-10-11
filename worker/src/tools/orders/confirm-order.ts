import { z } from 'zod';
import { type ToolDefinition, type ToolContext } from '../interface';
import { OrderRepository } from '../../services/db/order-repository';
import { uuidSchema } from '../../schemas/database';
import { ValidationError } from '../../utils/errors';
import { consolidateCustomerMemory } from '../../services/agent/memory-consolidator';

export const confirmOrderToolSchema = z.object({
  order_id: uuidSchema.describe('Identificador único (UUID) del pedido a confirmar'),
  delivery_address: z
    .string()
    .min(3, { message: 'La dirección de entrega debe ser válida y específica (mínimo 3 caracteres)' })
    .describe('Dirección completa y detallada de entrega del comensal'),
  payment_method: z
    .enum(['cash', 'transfer', 'card'])
    .describe('Método de pago acordado (cash: efectivo, transfer: transferencia, card: tarjeta)'),
});

export type ConfirmOrderToolInput = z.infer<typeof confirmOrderToolSchema>;

export interface ConfirmOrderToolOutput {
  success: boolean;
  order_id: string;
  status: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  delivery_address: string | null;
  payment_method: string | null;
  message: string;
}

export const confirmOrderTool: ToolDefinition<ConfirmOrderToolInput, ConfirmOrderToolOutput> = {
  name: 'confirm_order',
  description:
    'Finaliza y confirma el pedido (pasa de draft a confirmed), asignando dirección de entrega y método de pago.',
  parameters: confirmOrderToolSchema,

  async execute(
    input: ConfirmOrderToolInput,
    context: ToolContext
  ): Promise<ConfirmOrderToolOutput> {
    const orderRepo = new OrderRepository(context.db);

    const summary = await orderRepo.getOrderSummary(context.restaurantId, input.order_id);
    if (!summary) {
      throw new ValidationError('Pedido no encontrado o no pertenece a este restaurante');
    }

    if (summary.order.status !== 'draft') {
      throw new ValidationError(`El pedido ya se encuentra en estado '${summary.order.status}'`);
    }

    if (summary.items.length === 0 || Number(summary.order.subtotal) <= 0) {
      throw new ValidationError('No se puede confirmar un pedido sin productos');
    }

    const confirmed = await orderRepo.confirmOrder(context.restaurantId, input.order_id, {
      deliveryAddress: input.delivery_address,
      paymentMethod: input.payment_method,
    });

    // Consolidación "Lazy" y no bloqueante en segundo plano (Fire-and-forget)
    void consolidateCustomerMemory(context.db, {
      restaurantId: context.restaurantId,
      customerId: context.customerId,
      orderId: confirmed.id,
      deliveryAddress: input.delivery_address,
      conversationId: context.conversationId,
    }).catch((memErr) => {
      console.error('[confirm_order] Error en consolidación lazy de memoria:', memErr);
    });

    return {
      success: true,
      order_id: confirmed.id,
      status: confirmed.status,
      subtotal: confirmed.subtotal,
      delivery_fee: confirmed.delivery_fee,
      total: confirmed.total,
      delivery_address: confirmed.delivery_address,
      payment_method: confirmed.payment_method,
      message: 'Pedido confirmado exitosamente y enviado a cocina.',
    };
  },
};
