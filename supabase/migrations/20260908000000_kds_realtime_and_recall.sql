-- ============================================================================
-- ChatAliado — Migración: Soporte KDS Realtime, Aislamiento Tenant y Recall RPC
-- ============================================================================

-- 1. Asegurar columna restaurant_id en order_items para aislamiento multi-tenant
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_order_items_tenant ON public.order_items(restaurant_id);

-- 2. Trigger para auto-completar restaurant_id en inserciones de order_items
CREATE OR REPLACE FUNCTION public.set_order_item_restaurant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.restaurant_id IS NULL THEN
    SELECT restaurant_id INTO NEW.restaurant_id
    FROM public.orders
    WHERE id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_items_restaurant_id ON public.order_items;
CREATE TRIGGER trg_order_items_restaurant_id
  BEFORE INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_item_restaurant_id();

-- 3. Backfill de restaurant_id para order_items existentes
UPDATE public.order_items oi
SET restaurant_id = o.restaurant_id
FROM public.orders o
WHERE oi.order_id = o.id AND oi.restaurant_id IS NULL;

-- 4. RPC Atómico: Reversión de Estado de Pedido (Recall / Deshacer Despacho)
-- Permite deshacer de forma atómica y segura un despacho en el KDS:
-- delivered -> ready
-- ready -> preparing
-- preparing -> confirmed
CREATE OR REPLACE FUNCTION public.rpc_recall_order_status(
  p_restaurant_id UUID,
  p_order_id UUID,
  p_from_status TEXT,
  p_to_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_valid_transition BOOLEAN := FALSE;
BEGIN
  -- 1. Bloquear la orden atómicamente (previene colisiones entre pantallas)
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND restaurant_id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Pedido no encontrado o no pertenece a este restaurante';
  END IF;

  -- 2. Validar que el estado actual coincida con el esperado
  IF v_order.status != p_from_status THEN
    RAISE EXCEPTION 'STATUS_CONFLICT: El pedido ya cambió de estado a "%" (esperado: "%")',
      v_order.status, p_from_status;
  END IF;

  -- 3. Validar transiciones de reversión lícitas
  v_valid_transition := (
    (p_from_status = 'delivered' AND p_to_status = 'ready')
    OR (p_from_status = 'ready' AND p_to_status = 'preparing')
    OR (p_from_status = 'preparing' AND p_to_status = 'confirmed')
  );

  IF NOT v_valid_transition THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: No se puede revertir de "%" a "%"',
      p_from_status, p_to_status;
  END IF;

  -- 4. Reversión atómica
  UPDATE public.orders
  SET status = p_to_status,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'previous_status', p_from_status,
    'new_status', p_to_status,
    'updated_at', now()
  );
END;
$$;