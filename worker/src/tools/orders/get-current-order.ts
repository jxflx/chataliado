import { z } from 'zod';
import { type ToolDefinition, type ToolContext } from '../interface';
import { OrderRepository } from '../../services/db/order-repository';
import { RestaurantRepository } from '../../services/db/restaurant-repository';
import { uuidSchema } from '../../schemas/database';

export const getCurrentOrderSchema = z.object({
  order_id: uuidSchema
    .optional()
    .describe('ID (UUID) del pedido (opcional; si se omite, busca el borrador o pedido activo del cliente)'),
});

export type GetCurrentOrderInput = z.infer<typeof getCurrentOrderSchema>;

export interface CurrentOrderItem {
  id: string;
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  options_selected: unknown;
  subtotal: number;
}

export interface GetCurrentOrderOutput {
  success: boolean;
  order?: {
    id: string;
    status: string;
    subtotal: number;
    delivery_fee: number;
    discount: number;
    total: number;
    delivery_address: string | null;
    payment_method: string | null;
    items: CurrentOrderItem[];
  };
  error?: string;
}

export const getCurrentOrderTool: ToolDefinition<GetCurrentOrderInput, GetCurrentOrderOutput> = {
  name: 'get_current_order',
  description:
    'Obtiene el resumen consolidado del pedido actual (en borrador o recientemente confirmado) con sus productos, estado y totales.',
  parameters: getCurrentOrderSchema,

  async execute(input: GetCurrentOrderInput, context: ToolContext): Promise<GetCurrentOrderOutput> {
    const orderRepo = new OrderRepository(context.db);
    const restaurantRepo = new RestaurantRepository(context.db);

    let summary: {
      order: {
        id: string;
        status: string;
        subtotal: number;
        delivery_fee: number;
        discount: number;
        total: number;
        delivery_address: string | null;
        payment_method: string | null;
      };
      items: Array<{
        id: string;
        product_id: string;
        quantity: number;
        unit_price: number;
        options_selected: unknown;
        subtotal: number;
      }>;
    } | null = null;

    if (input.order_id) {
      summary = await orderRepo.getOrderSummary(context.restaurantId, input.order_id);
    } else {
      summary = await orderRepo.getActiveDraftOrder(context.restaurantId, context.customerId);
      if (!summary) {
        summary = await restaurantRepo.getLastCompletedOrder(context.restaurantId, context.customerId);
      }
    }

    if (!summary) {
      return {
        success: false,
        error: 'No se encontró ningún pedido activo o reciente para este cliente',
      };
    }

    // Mapeo opcional de nombres de productos para máxima legibilidad
    const productIds = summary.items.map((it) => it.product_id);
    const productNames = new Map<string, string>();

    if (productIds.length > 0) {
      const { data: products } = await context.db
        .from('menu_items')
        .select('id, name')
        .in('id', productIds)
        .eq('restaurant_id', context.restaurantId);

      if (products) {
        for (const p of products) {
          productNames.set(p.id, p.name);
        }
      }
    }

    return {
      success: true,
      order: {
        id: summary.order.id,
        status: summary.order.status,
        subtotal: summary.order.subtotal,
        delivery_fee: summary.order.delivery_fee,
        discount: summary.order.discount,
        total: summary.order.total,
        delivery_address: summary.order.delivery_address,
        payment_method: summary.order.payment_method,
        items: summary.items.map((it) => ({
          id: it.id,
          product_id: it.product_id,
          name: productNames.get(it.product_id) ?? 'Producto',
          quantity: it.quantity,
          unit_price: it.unit_price,
          options_selected: it.options_selected,
          subtotal: it.subtotal,
        })),
      },
    };
  },
};
