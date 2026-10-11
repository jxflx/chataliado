import { z } from 'zod';
import { type ToolDefinition, type ToolContext } from '../interface';
import { MenuRepository } from '../../services/db/menu-repository';

export const getMenuSchema = z.object({
  category: z
    .string()
    .optional()
    .describe('Nombre o ID (UUID) de la categoría para filtrar el menú (opcional)'),
});

export type GetMenuInput = z.infer<typeof getMenuSchema>;

export interface GetMenuOutput {
  success: boolean;
  categories: Array<{ id: string; name: string; sort_order: number }>;
  items: Array<{
    id: string;
    category_id: string | null;
    name: string;
    description: string;
    price: number;
    options_schema: unknown;
  }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const getMenuTool: ToolDefinition<GetMenuInput, GetMenuOutput> = {
  name: 'get_menu',
  description:
    'Consulta las categorías activas y productos disponibles del menú con sus precios oficiales y opciones de personalización.',
  parameters: getMenuSchema,

  async execute(input: GetMenuInput, context: ToolContext): Promise<GetMenuOutput> {
    const menuRepo = new MenuRepository(context.db);
    const allCategories = await menuRepo.getCategories(context.restaurantId);

    let targetCategoryId: string | undefined;
    let filteredCategories = allCategories;

    if (input.category && input.category.trim() !== '') {
      const catQuery = input.category.trim();
      if (UUID_REGEX.test(catQuery)) {
        targetCategoryId = catQuery;
        filteredCategories = allCategories.filter((c) => c.id.toLowerCase() === catQuery.toLowerCase());
      } else {
        const lowerQuery = catQuery.toLowerCase();
        const matched = allCategories.filter(
          (c) =>
            c.name.toLowerCase() === lowerQuery ||
            c.name.toLowerCase().includes(lowerQuery)
        );
        if (matched.length > 0) {
          filteredCategories = matched;
          targetCategoryId = matched[0]?.id;
        } else {
          return {
            success: true,
            categories: [],
            items: [],
          };
        }
      }
    }

    const items = await menuRepo.getMenuItems(context.restaurantId, targetCategoryId, true);

    return {
      success: true,
      categories: filteredCategories.map((c) => ({
        id: c.id,
        name: c.name,
        sort_order: c.sort_order,
      })),
      items: items.map((item) => ({
        id: item.id,
        category_id: item.category_id,
        name: item.name,
        description: item.description,
        price: item.price,
        options_schema: item.options_schema,
      })),
    };
  },
};
