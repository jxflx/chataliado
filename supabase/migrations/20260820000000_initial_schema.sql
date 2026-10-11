-- ============================================================================
-- ChatAliado — Migración Inicial de Base de Datos (Supabase / PostgreSQL)
-- Multi-Tenant SaaS con Row Level Security (RLS)
-- ============================================================================

-- 1. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Función genérica para actualización automática de updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. Definición de Tablas Relacionales
-- ============================================================================

-- 3.1. Restaurantes (Tenants)
CREATE TABLE IF NOT EXISTS public.restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  phone TEXT,
  address TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_restaurants_updated_at
  BEFORE UPDATE ON public.restaurants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3.2. Usuarios de Restaurante (Vínculo con Supabase Auth)
CREATE TABLE IF NOT EXISTS public.restaurant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_restaurant_user UNIQUE (user_id, restaurant_id)
);

-- 3.3. Clientes (Comensales con memoria Markdown "Bloc de Notas del Mesero")
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  address_default TEXT,
  notes_md TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_customer_restaurant_phone UNIQUE (restaurant_id, phone)
);

CREATE TRIGGER set_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3.4. Conversaciones
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  mode TEXT NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai', 'human')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3.5. Mensajes
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'human_agent', 'tool')),
  content TEXT NOT NULL,
  provider_message_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.6. Categorías del Menú
CREATE TABLE IF NOT EXISTS public.menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.7. Productos / Ítems del Menú
CREATE TABLE IF NOT EXISTS public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  options_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_menu_items_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3.8. Pedidos
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'preparing', 'delivered', 'cancelled')),
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
  delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (delivery_fee >= 0),
  discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
  total NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total >= 0),
  delivery_address TEXT,
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('cash', 'transfer', 'card', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3.9. Ítems del Pedido
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  options_selected JSONB NOT NULL DEFAULT '{}'::jsonb,
  subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.10. Configuración del Agente de IA por Restaurante
CREATE TABLE IF NOT EXISTS public.agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  system_prompt TEXT NOT NULL DEFAULT '',
  business_rules TEXT NOT NULL DEFAULT '',
  handoff_triggers JSONB NOT NULL DEFAULT '[]'::jsonb,
  operating_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_agent_configs_updated_at
  BEFORE UPDATE ON public.agent_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4. Índices de Rendimiento y Claves Multi-Tenant
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_restaurant_users_user ON public.restaurant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_users_tenant ON public.restaurant_users(restaurant_id);



CREATE INDEX IF NOT EXISTS idx_conversations_tenant_customer ON public.conversations(restaurant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_status ON public.conversations(restaurant_id, status);

CREATE INDEX IF NOT EXISTS idx_messages_tenant_convo ON public.messages(restaurant_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_convo_created ON public.messages(conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_menu_categories_tenant ON public.menu_categories(restaurant_id, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_menu_items_tenant_cat ON public.menu_items(restaurant_id, category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_tenant_available ON public.menu_items(restaurant_id, is_available);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON public.orders(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_customer ON public.orders(restaurant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);

-- ============================================================================
-- 5. Row Level Security (RLS) y Políticas Multi-Tenant
-- ============================================================================

-- 5.1. Habilitar y forzar RLS en todas las tablas
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants FORCE ROW LEVEL SECURITY;

ALTER TABLE public.restaurant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_users FORCE ROW LEVEL SECURITY;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories FORCE ROW LEVEL SECURITY;

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_configs FORCE ROW LEVEL SECURITY;

-- 5.2. Función auxiliar segura para extraer los restaurantes del usuario autenticado
CREATE OR REPLACE FUNCTION public.get_auth_user_restaurants()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT restaurant_id
  FROM public.restaurant_users
  WHERE user_id = auth.uid();
$$;

-- 5.3. Políticas RLS para `restaurants`
CREATE POLICY "Users can view their associated restaurants"
  ON public.restaurants
  FOR SELECT
  TO authenticated
  USING (id IN (SELECT public.get_auth_user_restaurants()));

CREATE POLICY "Owners/Admins can update their restaurant"
  ON public.restaurants
  FOR UPDATE
  TO authenticated
  USING (id IN (SELECT public.get_auth_user_restaurants()))
  WITH CHECK (id IN (SELECT public.get_auth_user_restaurants()));

-- 5.4. Políticas RLS para `restaurant_users`
CREATE POLICY "Users can view members in their restaurants"
  ON public.restaurant_users
  FOR SELECT
  TO authenticated
  USING (restaurant_id IN (SELECT public.get_auth_user_restaurants()));

-- 5.5. Políticas RLS para `customers`
CREATE POLICY "Users can view customers of their restaurant"
  ON public.customers
  FOR ALL
  TO authenticated
  USING (restaurant_id IN (SELECT public.get_auth_user_restaurants()))
  WITH CHECK (restaurant_id IN (SELECT public.get_auth_user_restaurants()));

-- 5.6. Políticas RLS para `conversations`
CREATE POLICY "Users can manage conversations of their restaurant"
  ON public.conversations
  FOR ALL
  TO authenticated
  USING (restaurant_id IN (SELECT public.get_auth_user_restaurants()))
  WITH CHECK (restaurant_id IN (SELECT public.get_auth_user_restaurants()));

-- 5.7. Políticas RLS para `messages`
CREATE POLICY "Users can manage messages of their restaurant"
  ON public.messages
  FOR ALL
  TO authenticated
  USING (restaurant_id IN (SELECT public.get_auth_user_restaurants()))
  WITH CHECK (restaurant_id IN (SELECT public.get_auth_user_restaurants()));

-- 5.8. Políticas RLS para `menu_categories`
CREATE POLICY "Users can manage menu categories of their restaurant"
  ON public.menu_categories
  FOR ALL
  TO authenticated
  USING (restaurant_id IN (SELECT public.get_auth_user_restaurants()))
  WITH CHECK (restaurant_id IN (SELECT public.get_auth_user_restaurants()));

-- 5.9. Políticas RLS para `menu_items`
CREATE POLICY "Users can manage menu items of their restaurant"
  ON public.menu_items
  FOR ALL
  TO authenticated
  USING (restaurant_id IN (SELECT public.get_auth_user_restaurants()))
  WITH CHECK (restaurant_id IN (SELECT public.get_auth_user_restaurants()));

-- 5.10. Políticas RLS para `orders`
CREATE POLICY "Users can manage orders of their restaurant"
  ON public.orders
  FOR ALL
  TO authenticated
  USING (restaurant_id IN (SELECT public.get_auth_user_restaurants()))
  WITH CHECK (restaurant_id IN (SELECT public.get_auth_user_restaurants()));

-- 5.11. Políticas RLS para `order_items`
CREATE POLICY "Users can manage order items via parent order"
  ON public.order_items
  FOR ALL
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM public.orders
      WHERE restaurant_id IN (SELECT public.get_auth_user_restaurants())
    )
  )
  WITH CHECK (
    order_id IN (
      SELECT id FROM public.orders
      WHERE restaurant_id IN (SELECT public.get_auth_user_restaurants())
    )
  );

-- 5.12. Políticas RLS para `agent_configs`
CREATE POLICY "Users can manage agent config of their restaurant"
  ON public.agent_configs
  FOR ALL
  TO authenticated
  USING (restaurant_id IN (SELECT public.get_auth_user_restaurants()))
  WITH CHECK (restaurant_id IN (SELECT public.get_auth_user_restaurants()));
