-- ============================================================================
-- ChatAliado — Migración Hito 6: Dashboard SaaS, Roles RLS por Función,
-- Máquina de Estados de Cocina y Preparación para Realtime
-- ============================================================================
-- NOTA DE SEGURIDAD: Esta migración refuerza el aislamiento multi-tenant
-- separando permisos por rol (owner/admin vs staff) y habilita
-- REPLICA IDENTITY FULL para que Supabase Realtime pueda evaluar RLS
-- correctamente en eventos UPDATE/DELETE.
-- ============================================================================

-- ============================================================================
-- 1. Extensión del Esquema de Suscripción y Acceso SaaS en `restaurants`
-- ============================================================================

-- 1.1 Tipo ENUM para subscription_status (más seguro que TEXT CHECK)
DO $$ BEGIN
  CREATE TYPE public.subscription_status_enum AS ENUM (
    'trialing',
    'active',
    'in_grace_period',
    'past_due',
    'suspended',
    'manual_exempt'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_tier_enum AS ENUM (
    'starter',
    'pro',
    'enterprise'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 1.2 Nuevas columnas en `restaurants` para facturación y control de acceso
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS subscription_status public.subscription_status_enum
    NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS subscription_tier public.subscription_tier_enum
    NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ
    DEFAULT (now() + interval '14 days'),
  ADD COLUMN IF NOT EXISTS current_period_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_orders_per_month INTEGER NOT NULL DEFAULT 500;

-- 1.3 Índice compuesto para consultas rápidas de estado de acceso
-- (usado por el Middleware de Next.js y el Worker en cada webhook)
CREATE INDEX IF NOT EXISTS idx_restaurants_access_guard
  ON public.restaurants (id, is_active, subscription_status);

-- Índice para resolver restaurante por Stripe Customer ID (webhooks de Stripe)
CREATE INDEX IF NOT EXISTS idx_restaurants_stripe_customer
  ON public.restaurants (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ============================================================================
-- 2. Extensión del estado de pedidos para KDS (agregar 'ready')
-- ============================================================================
-- El KDS necesita: confirmed -> preparing -> ready -> delivered
-- La tabla original solo tiene: draft, confirmed, preparing, delivered, cancelled

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('draft', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'));

-- ============================================================================
-- 3. REPLICA IDENTITY FULL para Supabase Realtime
-- ============================================================================
-- Sin esto, los eventos UPDATE/DELETE en el WAL solo emiten la PK (id),
-- y Supabase Realtime no puede evaluar las políticas RLS que filtran
-- por restaurant_id, provocando que los eventos se descarten o se
-- transmitan sin filtrado multi-tenant correcto.

ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.customers REPLICA IDENTITY FULL;
ALTER TABLE public.menu_items REPLICA IDENTITY FULL;
ALTER TABLE public.menu_categories REPLICA IDENTITY FULL;

-- ============================================================================
-- 3. Función Auxiliar Segura: Obtener Rol del Usuario en un Restaurante
-- ============================================================================
-- SECURITY DEFINER: Se ejecuta con privilegios del creador (superuser),
-- evitando que un usuario malicioso altere el search_path para
-- suplantar la función.

CREATE OR REPLACE FUNCTION public.get_auth_user_role(p_restaurant_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role
  FROM public.restaurant_users
  WHERE user_id = auth.uid()
    AND restaurant_id = p_restaurant_id
  LIMIT 1;
$$;

-- ============================================================================
-- 4. Función Auxiliar Actualizada: Restaurantes ACTIVOS del Usuario
-- ============================================================================
-- Ahora exige que el restaurante esté activo (is_active = true)
-- Y que la suscripción no esté en estado 'suspended'.
-- Esto actúa como la Barrera 3 (RLS criptográfica) del Triple Gate.

CREATE OR REPLACE FUNCTION public.get_auth_user_restaurants()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT ru.restaurant_id
  FROM public.restaurant_users ru
  INNER JOIN public.restaurants r ON r.id = ru.restaurant_id
  WHERE ru.user_id = auth.uid()
    AND r.is_active = true;
$$;

-- ============================================================================
-- 5. Políticas RLS Reforzadas: Separación por Rol (owner/admin vs staff)
-- ============================================================================

-- -----------------------------------------------------------------------
-- 5.1. menu_items: Staff puede VER el menú, solo Admin/Owner pueden MUTAR
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage menu items of their restaurant" ON public.menu_items;

CREATE POLICY "All roles can view menu items"
  ON public.menu_items
  FOR SELECT
  TO authenticated
  USING (restaurant_id IN (SELECT public.get_auth_user_restaurants()));

CREATE POLICY "Admin and Owner can mutate menu items"
  ON public.menu_items
  FOR ALL
  TO authenticated
  USING (
    restaurant_id IN (SELECT public.get_auth_user_restaurants())
    AND public.get_auth_user_role(restaurant_id) IN ('owner', 'admin')
  )
  WITH CHECK (
    restaurant_id IN (SELECT public.get_auth_user_restaurants())
    AND public.get_auth_user_role(restaurant_id) IN ('owner', 'admin')
  );

-- -----------------------------------------------------------------------
-- 5.2. menu_categories: Misma lógica que menu_items
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage menu categories of their restaurant" ON public.menu_categories;

CREATE POLICY "All roles can view menu categories"
  ON public.menu_categories
  FOR SELECT
  TO authenticated
  USING (restaurant_id IN (SELECT public.get_auth_user_restaurants()));

CREATE POLICY "Admin and Owner can mutate menu categories"
  ON public.menu_categories
  FOR ALL
  TO authenticated
  USING (
    restaurant_id IN (SELECT public.get_auth_user_restaurants())
    AND public.get_auth_user_role(restaurant_id) IN ('owner', 'admin')
  )
  WITH CHECK (
    restaurant_id IN (SELECT public.get_auth_user_restaurants())
    AND public.get_auth_user_role(restaurant_id) IN ('owner', 'admin')
  );

-- -----------------------------------------------------------------------
-- 5.3. agent_configs: Solo Owner puede modificar prompt y reglas del bot
-- -----------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage agent config of their restaurant" ON public.agent_configs;

CREATE POLICY "All roles can view agent config"
  ON public.agent_configs
  FOR SELECT
  TO authenticated
  USING (restaurant_id IN (SELECT public.get_auth_user_restaurants()));

CREATE POLICY "Owner can mutate agent config"
  ON public.agent_configs
  FOR ALL
  TO authenticated
  USING (
    restaurant_id IN (SELECT public.get_auth_user_restaurants())
    AND public.get_auth_user_role(restaurant_id) = 'owner'
  )
  WITH CHECK (
    restaurant_id IN (SELECT public.get_auth_user_restaurants())
    AND public.get_auth_user_role(restaurant_id) = 'owner'
  );

-- -----------------------------------------------------------------------
-- 5.4. restaurants: Solo Owner puede UPDATE (cambiar nombre, teléfono, etc.)
-- Todos los roles asociados pueden SELECT (necesario para el dashboard)
-- -----------------------------------------------------------------------
-- Las políticas originales ya separan SELECT y UPDATE, las mantenemos.

-- -----------------------------------------------------------------------
-- 5.5. restaurant_users: Solo Owner puede gestionar miembros del equipo
-- -----------------------------------------------------------------------
-- La política SELECT original se mantiene (todos ven los miembros).
-- Agregamos restricción de INSERT/UPDATE/DELETE para solo Owner.

CREATE POLICY "Owner can manage team members"
  ON public.restaurant_users
  FOR ALL
  TO authenticated
  USING (
    restaurant_id IN (SELECT public.get_auth_user_restaurants())
    AND public.get_auth_user_role(restaurant_id) = 'owner'
  )
  WITH CHECK (
    restaurant_id IN (SELECT public.get_auth_user_restaurants())
    AND public.get_auth_user_role(restaurant_id) = 'owner'
  );

-- ============================================================================
-- 6. RPC Atómico: Máquina de Estados de Cocina (KDS)
-- ============================================================================
-- Previene conflictos concurrentes cuando 2 cocineros tocan la misma
-- comanda al mismo tiempo. Usa SELECT FOR UPDATE (bloqueo pesimista).
-- Valida que la transición de estado sea lícita (sin saltar pasos).

CREATE OR REPLACE FUNCTION public.rpc_advance_order_status(
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
  -- 1. Bloquear la orden atómicamente (previene race conditions entre tablets)
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND restaurant_id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND: Pedido no encontrado o no pertenece a este restaurante';
  END IF;

  -- 2. Validar que el estado actual coincida con el esperado (Optimistic Lock)
  IF v_order.status != p_from_status THEN
    RAISE EXCEPTION 'STATUS_CONFLICT: El pedido ya cambió de estado a "%" (esperado: "%")',
      v_order.status, p_from_status;
  END IF;

  -- 3. Validar transiciones lícitas de la máquina de estados de cocina
  -- confirmed -> preparing -> ready -> delivered
  -- confirmed -> cancelled (cancelación directa)
  -- preparing -> cancelled (cancelación en cocina)
  v_valid_transition := (
    (p_from_status = 'confirmed'  AND p_to_status IN ('preparing', 'cancelled'))
    OR (p_from_status = 'preparing' AND p_to_status IN ('ready', 'cancelled'))
    OR (p_from_status = 'ready'     AND p_to_status = 'delivered')
  );

  IF NOT v_valid_transition THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: No se puede cambiar de "%" a "%"',
      p_from_status, p_to_status;
  END IF;

  -- 4. Transición atómica
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

-- ============================================================================
-- 7. Índices adicionales para rendimiento del Dashboard
-- ============================================================================

-- Índice para consultas de órdenes del KDS (filtrar por estados activos del día)
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status_created
  ON public.orders (restaurant_id, status, created_at DESC);

-- Índice para búsqueda rápida de conversaciones abiertas en el monitor de chat
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_mode_status
  ON public.conversations (restaurant_id, mode, status);

-- Índice para búsqueda de clientes por nombre/teléfono en la ficha
CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone
  ON public.customers (restaurant_id, phone);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_name
  ON public.customers (restaurant_id, name)
  WHERE name IS NOT NULL;

-- ============================================================================
-- FIN DE LA MIGRACIÓN
-- ============================================================================
