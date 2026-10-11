-- ============================================================================
-- ChatAliado — Migración P0 & P1: Idempotencia y Transaccionalidad Atómica (RPCs)
-- ============================================================================

-- 1. Tabla de Idempotencia de Webhooks Distribuidos (P0)
CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  provider_message_id TEXT PRIMARY KEY,
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
  instance_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processed_webhooks_received ON public.processed_webhook_events(received_at);

ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_webhook_events FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage processed webhook events of their restaurant"
  ON public.processed_webhook_events
  FOR ALL
  TO authenticated
  USING (restaurant_id IN (SELECT public.get_auth_user_restaurants()))
  WITH CHECK (restaurant_id IN (SELECT public.get_auth_user_restaurants()));

-- ============================================================================
-- 2. Procedimientos Almacenados Atómicos con Transacciones ACID (P1)
-- ============================================================================

-- 2.1. RPC Atómico para Agregar Ítem al Pedido con Bloqueo Pesimista
CREATE OR REPLACE FUNCTION public.rpc_add_order_item(
  p_restaurant_id UUID,
  p_order_id UUID,
  p_product_id UUID,
  p_quantity INTEGER,
  p_options JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_product RECORD;
  v_unit_price NUMERIC(10,2);
  v_options_modifier NUMERIC(10,2) := 0;
  v_item_subtotal NUMERIC(10,2);
  v_new_subtotal NUMERIC(10,2);
  v_new_total NUMERIC(10,2);
  v_new_item_id UUID;
  v_opt RECORD;
  v_item RECORD;
  v_updated_order RECORD;
BEGIN
  -- 1. Validar y bloquear la orden (SELECT FOR UPDATE previene condiciones de carrera)
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND restaurant_id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Pedido no encontrado o no pertenece a este restaurante';
  END IF;

  IF v_order.status != 'draft' THEN
    RAISE EXCEPTION 'INVALID_ORDER_STATUS: No se pueden modificar pedidos en estado %', v_order.status;
  END IF;

  -- 2. Validar producto y disponibilidad
  SELECT * INTO v_product
  FROM public.menu_items
  WHERE id = p_product_id AND restaurant_id = p_restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND: El producto no existe en el catálogo del restaurante';
  END IF;

  IF NOT v_product.is_available THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE: El producto % no está disponible actualmente', v_product.name;
  END IF;

  -- 3. Calcular modificadores de opciones seleccionadas
  IF p_options IS NOT NULL AND jsonb_typeof(p_options) = 'array' THEN
    FOR v_opt IN SELECT * FROM jsonb_to_recordset(p_options) AS (price_modifier NUMERIC)
    LOOP
      v_options_modifier := v_options_modifier + COALESCE(v_opt.price_modifier, 0);
    END LOOP;
  END IF;

  v_unit_price := ROUND(v_product.price + v_options_modifier, 2);
  v_item_subtotal := ROUND(v_unit_price * p_quantity, 2);

  -- 4. Inserción atómica del ítem
  INSERT INTO public.order_items (
    order_id,
    product_id,
    quantity,
    unit_price,
    options_selected,
    subtotal
  ) VALUES (
    p_order_id,
    p_product_id,
    p_quantity,
    v_unit_price,
    COALESCE(p_options, '[]'::jsonb),
    v_item_subtotal
  )
  RETURNING * INTO v_item;

  v_new_item_id := v_item.id;

  -- 5. Recalcular subtotales deterministas directamente desde la suma de ítems
  SELECT COALESCE(SUM(subtotal), 0) INTO v_new_subtotal
  FROM public.order_items
  WHERE order_id = p_order_id;

  v_new_total := GREATEST(0, v_new_subtotal + v_order.delivery_fee - v_order.discount);

  -- 6. Actualizar la orden padre en la misma transacción
  UPDATE public.orders
  SET subtotal = v_new_subtotal,
      total = v_new_total,
      updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_updated_order;

  -- 7. Retornar el resultado estructurado
  RETURN jsonb_build_object(
    'order', row_to_json(v_updated_order),
    'item', row_to_json(v_item)
  );
END;
$$;

-- 2.2. RPC Atómico para Eliminar Ítem del Pedido con Recálculo Inmediato
CREATE OR REPLACE FUNCTION public.rpc_remove_order_item(
  p_restaurant_id UUID,
  p_order_id UUID,
  p_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_new_subtotal NUMERIC(10,2);
  v_new_total NUMERIC(10,2);
  v_updated_order RECORD;
BEGIN
  -- 1. Bloquear y validar la orden
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND restaurant_id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Pedido no encontrado o no pertenece a este restaurante';
  END IF;

  IF v_order.status != 'draft' THEN
    RAISE EXCEPTION 'INVALID_ORDER_STATUS: No se pueden modificar ítems de un pedido en estado %', v_order.status;
  END IF;

  -- 2. Validar que el ítem existe en este pedido
  SELECT * INTO v_item
  FROM public.order_items
  WHERE id = p_item_id AND order_id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND: El ítem no existe en este pedido';
  END IF;

  -- 3. Eliminar el ítem
  DELETE FROM public.order_items
  WHERE id = p_item_id AND order_id = p_order_id;

  -- 4. Recalcular subtotales deterministas
  SELECT COALESCE(SUM(subtotal), 0) INTO v_new_subtotal
  FROM public.order_items
  WHERE order_id = p_order_id;

  v_new_total := GREATEST(0, v_new_subtotal + v_order.delivery_fee - v_order.discount);

  -- 5. Actualizar la orden
  UPDATE public.orders
  SET subtotal = v_new_subtotal,
      total = v_new_total,
      updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_updated_order;

  RETURN row_to_json(v_updated_order)::jsonb;
END;
$$;

-- 2.3. RPC Atómico para Confirmación de Pedido
CREATE OR REPLACE FUNCTION public.rpc_confirm_order(
  p_restaurant_id UUID,
  p_order_id UUID,
  p_delivery_address TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'pending'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item_count INTEGER;
  v_updated_order RECORD;
BEGIN
  -- 1. Bloquear y validar
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND restaurant_id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Pedido no encontrado o no pertenece a este restaurante';
  END IF;

  IF v_order.status != 'draft' THEN
    RAISE EXCEPTION 'ALREADY_CONFIRMED: El pedido ya fue confirmado previamente';
  END IF;

  -- 2. Verificar que la orden no esté vacía
  SELECT COUNT(*) INTO v_item_count
  FROM public.order_items
  WHERE order_id = p_order_id;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'EMPTY_ORDER: No se puede confirmar un pedido sin productos añadidos';
  END IF;

  -- 3. Transición atómica de estado
  UPDATE public.orders
  SET status = 'confirmed',
      delivery_address = COALESCE(p_delivery_address, delivery_address),
      payment_method = COALESCE(p_payment_method, 'pending'),
      updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_updated_order;

  RETURN row_to_json(v_updated_order)::jsonb;
END;
$$;

-- 2.4. RPC Atómico para Inicializar Sesión Conversacional y Comensal
CREATE OR REPLACE FUNCTION public.rpc_init_conversation_session(
  p_restaurant_id UUID,
  p_phone TEXT,
  p_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer RECORD;
  v_conversation RECORD;
BEGIN
  -- 1. Upsert atómico del cliente
  INSERT INTO public.customers (restaurant_id, phone, name)
  VALUES (p_restaurant_id, p_phone, p_name)
  ON CONFLICT (restaurant_id, phone)
  DO UPDATE SET
    name = COALESCE(EXCLUDED.name, customers.name),
    updated_at = now()
  RETURNING * INTO v_customer;

  -- 2. Obtener o crear conversación abierta
  SELECT * INTO v_conversation
  FROM public.conversations
  WHERE restaurant_id = p_restaurant_id
    AND customer_id = v_customer.id
    AND status = 'open'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.conversations (restaurant_id, customer_id, status, mode)
    VALUES (p_restaurant_id, v_customer.id, 'open', 'ai')
    RETURNING * INTO v_conversation;
  END IF;

  RETURN jsonb_build_object(
    'customer', row_to_json(v_customer),
    'conversation', row_to_json(v_conversation)
  );
END;
$$;
