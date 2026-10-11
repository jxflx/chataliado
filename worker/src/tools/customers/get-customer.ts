import { z } from 'zod';
import { type ToolDefinition, type ToolContext } from '../interface';
import { CustomerRepository } from '../../services/db/customer-repository';
import { RestaurantRepository } from '../../services/db/restaurant-repository';
import { phoneSchema } from '../../schemas/database';

export const getCustomerToolSchema = z.object({
  phone: phoneSchema
    .optional()
    .describe('Número de teléfono del cliente (opcional; si se omite, consulta al cliente actual)'),
});

export type GetCustomerToolInput = z.infer<typeof getCustomerToolSchema>;

export interface GetCustomerToolOutput {
  success: boolean;
  customer?: {
    id: string;
    phone: string;
    name: string | null;
    address_default: string | null;
    notes_md: string;
  };
  last_order?: {
    id: string;
    status: string;
    total: number;
    created_at: string;
    items_count: number;
    items: Array<{
      product_id: string;
      quantity: number;
      unit_price: number;
      subtotal: number;
    }>;
  } | null;
  error?: string;
}

export const getCustomerTool: ToolDefinition<GetCustomerToolInput, GetCustomerToolOutput> = {
  name: 'get_customer',
  description:
    'Consulta la ficha del cliente, su bloc de notas de preferencias (notes_md) y su último pedido completado.',
  parameters: getCustomerToolSchema,

  async execute(
    input: GetCustomerToolInput,
    context: ToolContext
  ): Promise<GetCustomerToolOutput> {
    const customerRepo = new CustomerRepository(context.db);
    const restaurantRepo = new RestaurantRepository(context.db);

    let customer: {
      id: string;
      phone: string;
      name: string | null;
      address_default: string | null;
      notes_md: string;
    } | null = null;

    if (input.phone) {
      customer = await customerRepo.getByPhone(context.restaurantId, input.phone);
    } else {
      const { data, error } = await context.db
        .from('customers')
        .select('*')
        .eq('id', context.customerId)
        .eq('restaurant_id', context.restaurantId)
        .maybeSingle();

      if (!error && data) {
        customer = data;
      }
    }

    if (!customer) {
      return {
        success: false,
        error: 'Cliente no encontrado en este restaurante',
      };
    }

    const lastCompleted = await restaurantRepo.getLastCompletedOrder(
      context.restaurantId,
      customer.id
    );

    return {
      success: true,
      customer: {
        id: customer.id,
        phone: customer.phone,
        name: customer.name,
        address_default: customer.address_default,
        notes_md: customer.notes_md,
      },
      last_order: lastCompleted
        ? {
            id: lastCompleted.order.id,
            status: lastCompleted.order.status,
            total: lastCompleted.order.total,
            created_at: lastCompleted.order.created_at,
            items_count: lastCompleted.items.length,
            items: lastCompleted.items.map((it) => ({
              product_id: it.product_id,
              quantity: it.quantity,
              unit_price: it.unit_price,
              subtotal: it.subtotal,
            })),
          }
        : null,
    };
  },
};
