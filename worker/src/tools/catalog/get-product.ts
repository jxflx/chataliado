import { z } from 'zod';
import { type ToolDefinition, type ToolContext } from '../interface';
import { MenuRepository } from '../../services/db/menu-repository';
import { uuidSchema } from '../../schemas/database';

export const getProductSchema = z.object({
  product_id: uuidSchema.describe('Identificador único (UUID) del producto a consultar'),
});

export type GetProductInput = z.infer<typeof getProductSchema>;

export interface GetProductOutput {
  success: boolean;
  product?: {
    id: string;
    name: string;
    description: string;
    price: number;
    is_available: boolean;
    options_schema: unknown;
  };
  error?: string;
}

export const getProductTool: ToolDefinition<GetProductInput, GetProductOutput> = {
  name: 'get_product',
  description:
    'Consulta los detalles completos, ingredientes, precio oficial y variantes de un producto específico mediante su UUID.',
  parameters: getProductSchema,

  async execute(input: GetProductInput, context: ToolContext): Promise<GetProductOutput> {
    const menuRepo = new MenuRepository(context.db);
    const product = await menuRepo.getProduct(context.restaurantId, input.product_id);

    if (!product || !product.is_available) {
      return {
        success: false,
        error: 'Producto no encontrado o no disponible actualmente en este restaurante',
      };
    }

    return {
      success: true,
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        is_available: product.is_available,
        options_schema: product.options_schema,
      },
    };
  },
};
