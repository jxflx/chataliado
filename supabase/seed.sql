-- ============================================================================
-- ChatAliado — Dataset Semilla (Seed Data)
-- Restaurante MVP de prueba: Pizzería Don Giovanni
-- ============================================================================

-- 1. Restaurante de prueba (Tenant)
INSERT INTO public.restaurants (
  id,
  name,
  slug,
  phone,
  address,
  timezone,
  is_active
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Pizzería Don Giovanni',
  'don-giovanni',
  '5215500000000',
  'Av. Insurgentes Sur #450, Col. Roma Sur, CDMX',
  'America/Mexico_City',
  true
) ON CONFLICT (id) DO NOTHING;

-- 2. Categorías del Menú
INSERT INTO public.menu_categories (
  id,
  restaurant_id,
  name,
  sort_order,
  is_active
) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Pizzas Clásicas', 1, true),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Pizzas Especiales', 2, true),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Bebidas', 3, true),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Postres', 4, true)
ON CONFLICT (id) DO NOTHING;

-- 3. Productos / Ítems del Menú con opciones y variantes (options_schema)
INSERT INTO public.menu_items (
  id,
  restaurant_id,
  category_id,
  name,
  description,
  price,
  options_schema,
  is_available
) VALUES
  (
    'c0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Pizza Pepperoni',
    'Salsa de tomate casera, queso mozzarella de primera calidad y generoso pepperoni artesanal.',
    189.00,
    '[
      {
        "name": "Tamaño",
        "type": "single_choice",
        "required": true,
        "choices": [
          { "label": "Mediana (30cm)", "price_modifier": 0.00 },
          { "label": "Grande (35cm)", "price_modifier": 50.00 },
          { "label": "Familiar (40cm)", "price_modifier": 95.00 }
        ]
      },
      {
        "name": "Orilla",
        "type": "single_choice",
        "required": false,
        "choices": [
          { "label": "Tradicional", "price_modifier": 0.00 },
          { "label": "Rellena de queso", "price_modifier": 45.00 }
        ]
      }
    ]'::jsonb,
    true
  ),
  (
    'c0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Pizza Margherita',
    'Mozzarella fresca, jitomate bola, albahaca fresca y toque de aceite de oliva extra virgen.',
    179.00,
    '[
      {
        "name": "Tamaño",
        "type": "single_choice",
        "required": true,
        "choices": [
          { "label": "Mediana (30cm)", "price_modifier": 0.00 },
          { "label": "Grande (35cm)", "price_modifier": 45.00 },
          { "label": "Familiar (40cm)", "price_modifier": 85.00 }
        ]
      }
    ]'::jsonb,
    true
  ),
  (
    'c0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000003',
    'Refresco 600ml',
    'Botella PET de 600ml bien fría.',
    35.00,
    '[
      {
        "name": "Sabor",
        "type": "single_choice",
        "required": true,
        "choices": [
          { "label": "Coca-Cola Original", "price_modifier": 0.00 },
          { "label": "Coca-Cola Sin Azúcar", "price_modifier": 0.00 },
          { "label": "Manzanita Lift", "price_modifier": 0.00 },
          { "label": "Sprite", "price_modifier": 0.00 }
        ]
      }
    ]'::jsonb,
    true
  ),
  (
    'c0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000004',
    'Tiramisú Tradicional',
    'Receta clásica italiana con café espresso y queso mascarpone.',
    85.00,
    '[]'::jsonb,
    true
  )
ON CONFLICT (id) DO NOTHING;

-- 4. Cliente de prueba con memoria Markdown ("Bloc de Notas del Mesero")
INSERT INTO public.customers (
  id,
  restaurant_id,
  phone,
  name,
  address_default,
  notes_md
) VALUES (
  'd0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '5215512345678',
  'Carlos Mendoza',
  'Calle Fresno #123, Depto 402, Col. Del Valle, Benito Juárez, CDMX',
  E'[MEMORIA DEL CLIENTE - CARLOS]\n- Nombre preferido: Carlos o Charly\n- Preferencias: Pizza pepperoni grande bien dorada y masa delgada. Le encanta la salsa chimichurri.\n- Dirección habitual: Calle Fresno #123, Depto 402, Col. Del Valle\n- Notas memorables: Paga casi siempre con transferencia. Suele pedir los viernes por la noche.'
) ON CONFLICT (id) DO NOTHING;

-- 5. Configuración del Agente de IA para el restaurante
INSERT INTO public.agent_configs (
  id,
  restaurant_id,
  system_prompt,
  business_rules,
  handoff_triggers,
  operating_hours
) VALUES (
  'f0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Eres "Gia", la asistente virtual amable y eficiente de Pizzería Don Giovanni. Ayudas a los clientes a consultar el menú, armar sus pedidos con sus tamaños e ingredientes favoritos, y confirmar su entrega a domicilio o para recoger.',
  'Tiempo promedio de entrega: 35-50 minutos. Costo de envío estándar: $30 MXN (gratis en pedidos superiores a $350 MXN). Formas de pago aceptadas: Efectivo al entregar, Transferencia SPEI y Tarjeta.',
  '["solicitud de factura", "queja por retraso grave", "pedir hablar con encargado", "modificaciones complejas fuera del menú"]'::jsonb,
  '{
    "lunes": { "open": "13:00", "close": "22:30" },
    "martes": { "open": "13:00", "close": "22:30" },
    "miercoles": { "open": "13:00", "close": "22:30" },
    "jueves": { "open": "13:00", "close": "23:00" },
    "viernes": { "open": "13:00", "close": "23:59" },
    "sabado": { "open": "13:00", "close": "23:59" },
    "domingo": { "open": "13:00", "close": "22:00" }
  }'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- 6. Usuario asociado al restaurante (para RLS en Dashboard)
-- Si ya existe un usuario registrado en auth.users, lo vincula automáticamente como 'owner'.
INSERT INTO public.restaurant_users (user_id, restaurant_id, role)
SELECT id, 'a0000000-0000-0000-0000-000000000001', 'owner'
FROM auth.users
LIMIT 1
ON CONFLICT (user_id, restaurant_id) DO NOTHING;
