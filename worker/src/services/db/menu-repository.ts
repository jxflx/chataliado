import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database, type MenuCategory, type MenuItem } from '../../types/database';
import { uuidSchema } from '../../schemas/database';
import { WorkerError } from '../../utils/errors';

/**
 * Repositorio del Catálogo y Menú con Aislamiento Multi-Tenant.
 * Proporciona acceso a categorías y productos filtrados por restaurante.
 */
export class MenuRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  /**
   * Obtiene las categorías activas del menú para un restaurante.
   */
  async getCategories(restaurantId: string): Promise<MenuCategory[]> {
    const validatedTenant = uuidSchema.parse(restaurantId);

    const { data, error } = await this.db
      .from('menu_categories')
      .select('*')
      .eq('restaurant_id', validatedTenant)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[MenuRepository.getCategories]', error);
      throw new WorkerError('Error interno al consultar categorías', 500);
    }

    return (data as MenuCategory[]) ?? [];
  }

  /**
   * Obtiene los productos disponibles de un restaurante, opcionalmente filtrados por categoría.
   */
  async getMenuItems(
    restaurantId: string,
    categoryId?: string,
    onlyAvailable = true
  ): Promise<MenuItem[]> {
    const validatedTenant = uuidSchema.parse(restaurantId);

    let query = this.db
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', validatedTenant);

    if (onlyAvailable) {
      query = query.eq('is_available', true);
    }

    if (categoryId) {
      const validatedCategory = uuidSchema.parse(categoryId);
      query = query.eq('category_id', validatedCategory);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[MenuRepository.getMenuItems]', error);
      throw new WorkerError('Error interno al consultar productos', 500);
    }

    return (data as MenuItem[]) ?? [];
  }

  /**
   * Consulta un producto específico por ID asegurando pertenencia al tenant.
   */
  async getProduct(restaurantId: string, productId: string): Promise<MenuItem | null> {
    const validatedTenant = uuidSchema.parse(restaurantId);
    const validatedProductId = uuidSchema.parse(productId);

    const { data, error } = await this.db
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', validatedTenant)
      .eq('id', validatedProductId)
      .maybeSingle();

    if (error) {
      console.error('[MenuRepository.getProduct]', error);
      throw new WorkerError('Error interno al consultar producto', 500);
    }

    return data ? (data as MenuItem) : null;
  }
}
