import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database, type OrderItem } from '../../types/database';

export interface CartItemSummary {
  id: string;
  name: string;
  quantity: number;
  unit_price: number;
  options: string;
  subtotal: number;
}

/**
 * Builds a standardized, human-readable summary of items currently in the cart
 * by resolving product names and selected options.
 */
export async function buildCartSummary(
  db: SupabaseClient<Database>,
  restaurantId: string,
  items: OrderItem[]
): Promise<CartItemSummary[]> {
  if (!items || items.length === 0) return [];
  const productIds = Array.from(new Set(items.map((i) => i.product_id)));
  const productNames = new Map<string, string>();

  if (productIds.length > 0) {
    const { data: products } = await db
      .from('menu_items')
      .select('id, name')
      .in('id', productIds)
      .eq('restaurant_id', restaurantId);

    if (products) {
      for (const p of products) {
        productNames.set(p.id, p.name);
      }
    }
  }

  return items.map((item) => {
    let opts = '';
    if (
      item.options_selected &&
      Array.isArray(item.options_selected) &&
      item.options_selected.length > 0
    ) {
      opts = (item.options_selected as Array<{ group_name?: string; choice_label?: string }>)
        .map((o) => `${o.group_name || ''}: ${o.choice_label || ''}`)
        .filter(Boolean)
        .join(', ');
    }
    return {
      id: item.id,
      name: productNames.get(item.product_id) || 'Producto',
      quantity: item.quantity,
      unit_price: item.unit_price,
      options: opts,
      subtotal: item.subtotal,
    };
  });
}
