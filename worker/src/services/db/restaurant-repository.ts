import { type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  type Database,
  type Restaurant,
  type AgentConfig,
  type Order,
  type OrderItem,
} from '../../types/database';
import { uuidSchema } from '../../schemas/database';
import { WorkerError } from '../../utils/errors';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Repositorio de Restaurantes, Configuración del Agente y Memoria de Pedidos Anteriores.
 */
export class RestaurantRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  /**
   * Resuelve el restaurante a partir de su ID (UUID) o de su slug de instancia (Evolution API).
   * Filtra únicamente restaurantes activos (`is_active = true`).
   */
  async getByIdOrSlug(identifier: string): Promise<Restaurant | null> {
    const cleaned = z.string().min(1, { message: 'El identificador no puede estar vacío' }).parse(identifier.trim());
    const isUuid = UUID_REGEX.test(cleaned);

    let query = this.db.from('restaurants').select('*').eq('is_active', true);
    if (isUuid) {
      query = query.eq('id', cleaned);
    } else {
      query = query.eq('slug', cleaned);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('[RestaurantRepository.getByIdOrSlug]', error);
      throw new WorkerError('Error interno al consultar restaurante', 500);
    }

    return data ? (data as Restaurant) : null;
  }

  /**
   * Obtiene la configuración del agente IA (prompt, reglas de negocio, horarios) para un restaurante.
   */
  async getAgentConfig(restaurantId: string): Promise<AgentConfig | null> {
    const validatedTenant = uuidSchema.parse(restaurantId);

    const { data, error } = await this.db
      .from('agent_configs')
      .select('*')
      .eq('restaurant_id', validatedTenant)
      .maybeSingle();

    if (error) {
      console.error('[RestaurantRepository.getAgentConfig]', error);
      throw new WorkerError('Error interno al consultar configuración del agente', 500);
    }

    return data ? (data as AgentConfig) : null;
  }

  /**
   * Obtiene el último pedido completado/confirmado del cliente con sus ítems para memoria de contexto.
   * Filtra por status IN ('confirmed', 'preparing', 'delivered') ordenado por created_at DESC.
   */
  async getLastCompletedOrder(
    restaurantId: string,
    customerId: string
  ): Promise<{ order: Order; items: OrderItem[] } | null> {
    const validatedTenant = uuidSchema.parse(restaurantId);
    const validatedCustomer = uuidSchema.parse(customerId);

    const { data, error } = await this.db
      .from('orders')
      .select('*, order_items(*)')
      .eq('restaurant_id', validatedTenant)
      .eq('customer_id', validatedCustomer)
      .in('status', ['confirmed', 'preparing', 'delivered'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[RestaurantRepository.getLastCompletedOrder]', error);
      throw new WorkerError('Error interno al consultar último pedido', 500);
    }

    if (!data) {
      return null;
    }

    const rawData = data as unknown as Order & { order_items?: OrderItem[] };
    const { order_items: items, ...orderData } = rawData;

    const productIds = items?.map((i) => i.product_id) ?? [];
    const productNames = new Map<string, string>();
    if (productIds.length > 0) {
      const { data: products } = await this.db
        .from('menu_items')
        .select('id, name')
        .in('id', productIds)
        .eq('restaurant_id', validatedTenant);

      if (products) {
        for (const p of products) {
          productNames.set(p.id, p.name);
        }
      }
    }

    const enrichedItems = (items ?? []).map((item) => ({
      ...item,
      product_name: productNames.get(item.product_id) || 'Producto',
    }));

    return {
      order: orderData as Order,
      items: enrichedItems as unknown as OrderItem[],
    };
  }
}
