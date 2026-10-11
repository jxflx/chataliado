import { type SupabaseClient } from '@supabase/supabase-js';
import {
  type Database,
  type Order,
  type OrderItem,
  type PaymentMethod,
  type Json,
  type TablesInsert,
  type TablesUpdate,
} from '../../types/database';
import { uuidSchema, addOrderItemInputSchema, type AddOrderItemInput } from '../../schemas/database';
import { validateAndResolveModifiers } from '../orders/modifier-validator';
import { ValidationError, WorkerError } from '../../utils/errors';

/**
 * Repositorio de Pedidos con Cálculo Determinista de Precios y Aislamiento Multi-Tenant.
 * Subtotales, variantes y totales se calculan en TypeScript con precisión a 2 decimales.
 */
export class OrderRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  /**
   * Crea un nuevo pedido en estado `draft` asociado al cliente y restaurante.
   */
  async createDraftOrder(
    restaurantId: string,
    customerId: string,
    conversationId?: string | null
  ): Promise<Order> {
    const validatedTenant = uuidSchema.parse(restaurantId);
    const validatedCustomer = uuidSchema.parse(customerId);
    const validatedConvo = conversationId ? uuidSchema.parse(conversationId) : null;

    const insertPayload: TablesInsert<'orders'> = {
      restaurant_id: validatedTenant,
      customer_id: validatedCustomer,
      conversation_id: validatedConvo,
      status: 'draft',
      subtotal: 0,
      delivery_fee: 0,
      discount: 0,
      total: 0,
    };

    const { data, error } = await this.db
      .from('orders')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error || !data) {
      console.error('[OrderRepository.createDraftOrder]', error);
      throw new WorkerError('Error interno al crear pedido', 500);
    }

    return data as Order;
  }

  /**
   * Añade un ítem a la orden calculando precios unitarios y subtotales en base de datos.
   * Utiliza el procedimiento almacenado atómico `rpc_add_order_item` con bloqueo FOR UPDATE.
   */
  async addItem(
    restaurantId: string,
    input: AddOrderItemInput
  ): Promise<{ order: Order; item: OrderItem }> {
    const validatedTenant = uuidSchema.parse(restaurantId);
    const validated = addOrderItemInputSchema.parse(input);

    // 1. Vía atómica: RPC en PostgreSQL con transacción y SELECT FOR UPDATE
    if (typeof this.db.rpc === 'function') {
      const { data, error } = await this.db.rpc('rpc_add_order_item', {
        p_restaurant_id: validatedTenant,
        p_order_id: validated.order_id,
        p_product_id: validated.product_id,
        p_quantity: validated.quantity,
        p_options: (validated.options_selected || []) as unknown as Json,
      });

      if (!error && data && typeof data === 'object') {
        const rpcResult = data as { order?: Order; item?: OrderItem };
        if (rpcResult.order && rpcResult.item) {
          return {
            order: rpcResult.order,
            item: rpcResult.item,
          };
        }
      }

      if (error) {
        const errorMsg = error.message || '';
        if (
          errorMsg.includes('ORDER_NOT_FOUND') ||
          errorMsg.includes('INVALID_ORDER_STATUS') ||
          errorMsg.includes('PRODUCT_NOT_FOUND') ||
          errorMsg.includes('PRODUCT_UNAVAILABLE')
        ) {
          throw new ValidationError(errorMsg);
        }
      }
    }

    // 2. Fallback REST para compatibilidad con entornos de prueba
    const { data: orderData, error: orderError } = await this.db
      .from('orders')
      .select('*')
      .eq('id', validated.order_id)
      .eq('restaurant_id', validatedTenant)
      .maybeSingle();

    if (orderError || !orderData) {
      throw new ValidationError(`Pedido no encontrado o no pertenece a este restaurante`);
    }

    const currentOrder = orderData as Order;
    if (currentOrder.status !== 'draft') {
      throw new ValidationError(`No se pueden añadir productos a un pedido en estado '${currentOrder.status}'`);
    }

    const { data: productData, error: productError } = await this.db
      .from('menu_items')
      .select('*')
      .eq('id', validated.product_id)
      .eq('restaurant_id', validatedTenant)
      .maybeSingle();

    if (productError || !productData) {
      throw new ValidationError(`El producto no existe en el catálogo del restaurante`);
    }

    const product = productData as {
      name: string;
      price: number;
      is_available: boolean;
      options_schema?: Json;
    };
    if (!product.is_available) {
      throw new ValidationError(`El producto '${product.name}' no está disponible actualmente`);
    }

    const { validatedOptions, totalOptionsModifier } = validateAndResolveModifiers(
      product.options_schema,
      validated.options_selected || [],
      product.name
    );

    const unitPrice = Number((Number(product.price) + totalOptionsModifier).toFixed(2));
    const itemSubtotal = Number((unitPrice * validated.quantity).toFixed(2));

    const itemPayload: TablesInsert<'order_items'> = {
      order_id: validated.order_id,
      product_id: validated.product_id,
      quantity: validated.quantity,
      unit_price: unitPrice,
      options_selected: validatedOptions as unknown as Json,
      subtotal: itemSubtotal,
    };

    const { data: itemData, error: itemError } = await this.db
      .from('order_items')
      .insert(itemPayload)
      .select('*')
      .single();

    if (itemError || !itemData) {
      console.error('[OrderRepository.addItem] insert item', itemError);
      throw new WorkerError('Error interno al registrar ítem', 500);
    }

    const newSubtotal = Number((Number(currentOrder.subtotal) + itemSubtotal).toFixed(2));
    const newTotal = Number(
      (newSubtotal + Number(currentOrder.delivery_fee) - Number(currentOrder.discount)).toFixed(2)
    );

    const updatePayload: TablesUpdate<'orders'> = {
      subtotal: newSubtotal,
      total: Math.max(0, newTotal),
    };

    const { data: updatedOrder, error: updateError } = await this.db
      .from('orders')
      .update(updatePayload)
      .eq('id', validated.order_id)
      .eq('restaurant_id', validatedTenant)
      .select('*')
      .single();

    if (updateError || !updatedOrder) {
      console.error('[OrderRepository.addItem] update order', updateError);
      throw new WorkerError('Error interno al actualizar pedido', 500);
    }

    return {
      order: updatedOrder as Order,
      item: itemData as unknown as OrderItem,
    };
  }

  /**
   * Actualiza la cantidad de un ítem existente en un pedido en borrador y recalcula totales.
   */
  async updateItemQuantity(
    restaurantId: string,
    orderId: string,
    itemId: string,
    newQuantity: number
  ): Promise<{ order: Order; item: OrderItem }> {
    const validatedTenant = uuidSchema.parse(restaurantId);
    const validatedOrder = uuidSchema.parse(orderId);
    const validatedItem = uuidSchema.parse(itemId);

    if (newQuantity <= 0) {
      throw new ValidationError('La cantidad debe ser mayor a 0');
    }

    const { data: orderData, error: orderError } = await this.db
      .from('orders')
      .select('*')
      .eq('id', validatedOrder)
      .eq('restaurant_id', validatedTenant)
      .maybeSingle();

    if (orderError || !orderData) {
      throw new ValidationError('Pedido no encontrado o no pertenece a este restaurante');
    }

    const currentOrder = orderData as Order;
    if (currentOrder.status !== 'draft') {
      throw new ValidationError(
        `No se pueden modificar ítems de un pedido en estado '${currentOrder.status}'`
      );
    }

    const { data: itemData, error: itemError } = await this.db
      .from('order_items')
      .select('*')
      .eq('id', validatedItem)
      .eq('order_id', validatedOrder)
      .maybeSingle();

    if (itemError || !itemData) {
      throw new ValidationError('El ítem no existe en este pedido');
    }

    const currentItem = itemData as OrderItem;
    const newItemSubtotal = Number((Number(currentItem.unit_price) * newQuantity).toFixed(2));

    const { data: updatedItem, error: updateItemError } = await this.db
      .from('order_items')
      .update({
        quantity: newQuantity,
        subtotal: newItemSubtotal,
      })
      .eq('id', validatedItem)
      .select('*')
      .single();

    if (updateItemError || !updatedItem) {
      throw new WorkerError('Error al actualizar la cantidad del ítem', 500);
    }

    const { data: remainingItems, error: itemsError } = await this.db
      .from('order_items')
      .select('subtotal')
      .eq('order_id', validatedOrder);

    if (itemsError) {
      throw new WorkerError('Error al recalcular subtotales', 500);
    }

    const itemsList = (remainingItems ?? []) as Array<{ subtotal: number }>;
    const newSubtotal = Number(
      itemsList.reduce((acc, it) => acc + Number(it.subtotal || 0), 0).toFixed(2)
    );
    const newTotal = Number(
      Math.max(
        0,
        newSubtotal + Number(currentOrder.delivery_fee || 0) - Number(currentOrder.discount || 0)
      ).toFixed(2)
    );

    const { data: updatedOrder, error: updateOrderError } = await this.db
      .from('orders')
      .update({
        subtotal: newSubtotal,
        total: newTotal,
      })
      .eq('id', validatedOrder)
      .eq('restaurant_id', validatedTenant)
      .select('*')
      .single();

    if (updateOrderError || !updatedOrder) {
      throw new WorkerError('Error al actualizar los totales del pedido', 500);
    }

    return {
      order: updatedOrder as Order,
      item: updatedItem as OrderItem,
    };
  }

  /**
   * Elimina un ítem del pedido en borrador y recalcula deterministamente subtotales y total.
   * Utiliza el procedimiento almacenado atómico `rpc_remove_order_item` con bloqueo FOR UPDATE.
   */
  async removeItem(
    restaurantId: string,
    orderId: string,
    itemId: string
  ): Promise<Order> {
    const validatedTenant = uuidSchema.parse(restaurantId);
    const validatedOrder = uuidSchema.parse(orderId);
    const validatedItem = uuidSchema.parse(itemId);

    // 1. Vía atómica: RPC en PostgreSQL
    if (typeof this.db.rpc === 'function') {
      const { data, error } = await this.db.rpc('rpc_remove_order_item', {
        p_restaurant_id: validatedTenant,
        p_order_id: validatedOrder,
        p_item_id: validatedItem,
      });

      if (!error && data && typeof data === 'object') {
        return data as Order;
      }

      if (error) {
        const errorMsg = error.message || '';
        if (
          errorMsg.includes('ORDER_NOT_FOUND') ||
          errorMsg.includes('INVALID_ORDER_STATUS') ||
          errorMsg.includes('ITEM_NOT_FOUND')
        ) {
          throw new ValidationError(errorMsg);
        }
      }
    }

    // 2. Fallback REST para pruebas
    const { data: orderData, error: orderError } = await this.db
      .from('orders')
      .select('*')
      .eq('id', validatedOrder)
      .eq('restaurant_id', validatedTenant)
      .maybeSingle();

    if (orderError || !orderData) {
      throw new ValidationError('Pedido no encontrado o no pertenece a este restaurante');
    }

    const currentOrder = orderData as Order;
    if (currentOrder.status !== 'draft') {
      throw new ValidationError(`No se pueden modificar ítems de un pedido en estado '${currentOrder.status}'`);
    }

    const { data: itemData, error: itemFindError } = await this.db
      .from('order_items')
      .select('*')
      .eq('id', validatedItem)
      .eq('order_id', validatedOrder)
      .maybeSingle();

    if (itemFindError || !itemData) {
      throw new ValidationError('El ítem no existe en este pedido');
    }

    const { error: deleteError } = await this.db
      .from('order_items')
      .delete()
      .eq('id', validatedItem)
      .eq('order_id', validatedOrder);

    if (deleteError) {
      console.error('[OrderRepository.removeItem] delete', deleteError);
      throw new WorkerError('Error interno al eliminar ítem', 500);
    }

    const { data: remainingItems, error: itemsError } = await this.db
      .from('order_items')
      .select('subtotal')
      .eq('order_id', validatedOrder);

    if (itemsError) {
      console.error('[OrderRepository.removeItem] fetch remaining', itemsError);
      throw new WorkerError('Error interno al recalcular subtotales', 500);
    }

    const itemsList = (remainingItems ?? []) as Array<{ subtotal: number }>;
    const newSubtotal = Number(
      itemsList.reduce((acc, it) => acc + Number(it.subtotal || 0), 0).toFixed(2)
    );
    const newTotal = Number(
      Math.max(
        0,
        newSubtotal + Number(currentOrder.delivery_fee || 0) - Number(currentOrder.discount || 0)
      ).toFixed(2)
    );

    const updatePayload: TablesUpdate<'orders'> = {
      subtotal: newSubtotal,
      total: newTotal,
    };

    const { data: updatedOrder, error: updateError } = await this.db
      .from('orders')
      .update(updatePayload)
      .eq('id', validatedOrder)
      .eq('restaurant_id', validatedTenant)
      .select('*')
      .single();

    if (updateError || !updatedOrder) {
      console.error('[OrderRepository.removeItem] update order', updateError);
      throw new WorkerError('Error interno al actualizar pedido tras eliminar ítem', 500);
    }

    return updatedOrder as Order;
  }

  /**
   * Consulta el pedido en borrador activo (status = 'draft') del cliente con sus ítems.
   */
  async getActiveDraftOrder(
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
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[OrderRepository.getActiveDraftOrder]', error);
      throw new WorkerError('Error interno al consultar pedido activo', 500);
    }

    if (!data) {
      return null;
    }

    const rawData = data as unknown as Order & { order_items?: OrderItem[] };
    const { order_items: items, ...orderData } = rawData;

    return {
      order: orderData as Order,
      items: items ?? [],
    };
  }

  async getOrderSummary(
    restaurantId: string,
    orderId: string
  ): Promise<{ order: Order; items: OrderItem[] } | null> {
    const validatedTenant = uuidSchema.parse(restaurantId);
    const validatedOrder = uuidSchema.parse(orderId);

    const { data, error } = await this.db
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', validatedOrder)
      .eq('restaurant_id', validatedTenant)
      .maybeSingle();

    if (error) {
      console.error('[OrderRepository.getOrderSummary]', error);
      throw new WorkerError('Error interno al consultar resumen del pedido', 500);
    }

    if (!data) return null;

    const rawData = data as unknown as Order & { order_items?: OrderItem[] };
    const { order_items: items, ...orderData } = rawData;
    return {
      order: orderData as Order,
      items: items ?? [],
    };
  }

  /**
   * Confirma un pedido pasando su estado a `confirmed`.
   * Utiliza el procedimiento almacenado atómico `rpc_confirm_order` con verificación de orden no vacía.
   */
  async confirmOrder(
    restaurantId: string,
    orderId: string,
    details: { deliveryAddress?: string; paymentMethod?: PaymentMethod }
  ): Promise<Order> {
    const validatedTenant = uuidSchema.parse(restaurantId);
    const validatedOrder = uuidSchema.parse(orderId);

    // 1. Vía atómica: RPC en PostgreSQL
    if (typeof this.db.rpc === 'function') {
      const { data, error } = await this.db.rpc('rpc_confirm_order', {
        p_restaurant_id: validatedTenant,
        p_order_id: validatedOrder,
        p_delivery_address: details.deliveryAddress ?? null,
        p_payment_method: details.paymentMethod ?? 'pending',
      });

      if (!error && data && typeof data === 'object') {
        return data as Order;
      }

      if (error) {
        const errorMsg = error.message || '';
        if (
          errorMsg.includes('ORDER_NOT_FOUND') ||
          errorMsg.includes('ALREADY_CONFIRMED') ||
          errorMsg.includes('EMPTY_ORDER')
        ) {
          throw new ValidationError(errorMsg);
        }
      }
    }

    // 2. Fallback REST para pruebas
    const updatePayload: TablesUpdate<'orders'> = {
      status: 'confirmed',
      delivery_address: details.deliveryAddress ?? null,
      payment_method: details.paymentMethod ?? 'pending',
    };

    const { data, error } = await this.db
      .from('orders')
      .update(updatePayload)
      .eq('id', validatedOrder)
      .eq('restaurant_id', validatedTenant)
      .select('*')
      .single();

    if (error || !data) {
      console.error('[OrderRepository.confirmOrder]', error);
      throw new ValidationError('Pedido no encontrado o no pertenece a este restaurante');
    }

    return data as Order;
  }
}
