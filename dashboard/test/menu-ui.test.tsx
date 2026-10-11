import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

import { AmbientCanvas } from '../src/components/layout/ambient-canvas';
import { CategoryList } from '../src/components/menu/category-list';
import { MenuItemCard } from '../src/components/menu/menu-item-card';
import { OptionsSchemaBuilder } from '../src/components/menu/options-schema-builder';
import { CategoryForm } from '../src/components/menu/category-form';
import { MenuItemForm } from '../src/components/menu/menu-item-form';
import { MenuGrid } from '../src/components/menu/menu-grid';
import MenuPage from '../src/app/(dashboard)/menu/page';
import { type MenuCategory, type MenuItem, type Restaurant } from '../src/types/database';
import { type OptionGroup } from '../src/schemas/menu';

// Mock de Next.js navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/menu'),
}));

// Mock de useTenant
const mockActiveRestaurant: Restaurant = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Pizzería Toscana Bella',
  slug: 'toscana-bella',
  phone: '+52 55 1234 5678',
  address: 'Calle Roma 45, CDMX',
  timezone: 'America/Mexico_City',
  is_active: true,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  trial_ends_at: null,
  current_period_ends_at: null,
  grace_period_ends_at: null,
  max_orders_per_month: 1000,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  subscription_status: 'active',
  subscription_tier: 'starter',
};

vi.mock('@/components/layout/tenant-provider', () => ({
  useTenant: () => ({
    activeRestaurant: mockActiveRestaurant,
    userRole: 'owner',
    availableRestaurants: [mockActiveRestaurant],
    switchRestaurant: vi.fn(),
  }),
}));

// Mock de Server Actions
vi.mock('@/app/(dashboard)/menu/actions', () => ({
  getCategories: vi.fn().mockResolvedValue({
    success: true,
    data: [
      {
        id: 'cat-1111-1111-1111-1111',
        restaurant_id: '33333333-3333-4333-8333-333333333333',
        name: 'Pizzas Artesanales',
        sort_order: 0,
        is_active: true,
        created_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'cat-2222-2222-2222-2222',
        restaurant_id: '33333333-3333-4333-8333-333333333333',
        name: 'Bebidas Frías',
        sort_order: 1,
        is_active: false,
        created_at: '2026-09-01T00:00:00Z',
      },
    ],
  }),
  getMenuItems: vi.fn().mockResolvedValue({
    success: true,
    data: [
      {
        id: 'dish-1111-1111-1111-1111',
        restaurant_id: '33333333-3333-4333-8333-333333333333',
        category_id: 'cat-1111-1111-1111-1111',
        name: 'Pizza Margherita DOC',
        description: 'Salsa de tomate San Marzano, mozzarella fior di latte y albahaca fresca.',
        price: 210.0,
        options_schema: [
          {
            name: 'Tamaño de Pizza',
            type: 'single_choice',
            required: true,
            choices: [
              { label: 'Mediana 30cm', price_modifier: 0 },
              { label: 'Familiar 40cm', price_modifier: 60 },
            ],
          },
        ],
        is_available: true,
        sort_order: 0,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'dish-2222-2222-2222-2222',
        restaurant_id: '33333333-3333-4333-8333-333333333333',
        category_id: 'cat-2222-2222-2222-2222',
        name: 'Cerveza Moretti 330ml',
        description: 'Auténtica cerveza rubia italiana.',
        price: 85.0,
        options_schema: [],
        is_available: false,
        sort_order: 1,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      },
    ],
  }),
  createCategory: vi.fn().mockResolvedValue({ success: true }),
  updateCategory: vi.fn().mockResolvedValue({ success: true }),
  deleteCategory: vi.fn().mockResolvedValue({ success: true }),
  reorderCategories: vi.fn().mockResolvedValue({ success: true }),
  createMenuItem: vi.fn().mockResolvedValue({ success: true }),
  updateMenuItem: vi.fn().mockResolvedValue({ success: true }),
  deleteMenuItem: vi.fn().mockResolvedValue({ success: true }),
  toggleItemAvailability: vi.fn().mockResolvedValue({ success: true }),
  reorderMenuItems: vi.fn().mockResolvedValue({ success: true }),
}));

// Datos de prueba
const sampleCategories: MenuCategory[] = [
  {
    id: 'cat-1',
    restaurant_id: 'rest-1',
    name: 'Pizzas Artesanales',
    sort_order: 0,
    is_active: true,
    created_at: '2026-09-01T00:00:00Z',
  },
  {
    id: 'cat-2',
    restaurant_id: 'rest-1',
    name: 'Pastas & Lasañas',
    sort_order: 1,
    is_active: false,
    created_at: '2026-09-01T00:00:00Z',
  },
];

const sampleItems: MenuItem[] = [
  {
    id: 'dish-1',
    restaurant_id: 'rest-1',
    category_id: 'cat-1',
    name: 'Pizza Margherita DOC',
    description: 'Tomate San Marzano, mozzarella fresca y albahaca',
    price: 195.5,
    options_schema: [
      {
        name: 'Tamaño',
        type: 'single_choice',
        required: true,
        choices: [
          { label: 'Individual 25cm', price_modifier: 0 },
          { label: 'Familiar 35cm', price_modifier: 55 },
        ],
      },
      {
        name: 'Ingredientes Extra',
        type: 'multiple_choice',
        required: false,
        choices: [
          { label: 'Prosciutto di Parma', price_modifier: 40 },
          { label: 'Hongos Porcini', price_modifier: 30 },
        ],
      },
    ],
    is_available: true,
    sort_order: 0,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  },
  {
    id: 'dish-2',
    restaurant_id: 'rest-1',
    category_id: 'cat-2',
    name: 'Lasaña Bolognese',
    description: 'Carne de res estofada al vino tinto y bechamel',
    price: 240.0,
    options_schema: [],
    is_available: false,
    sort_order: 1,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  },
];

describe('Menú & Catálogo UI — Liquid Glass & Design System Compliance', () => {
  const emojiRegex = /\p{Extended_Pictographic}/u;

  describe('1. Ambient Canvas — Calidez Toscana Suave Palette', () => {
    it('debe incluir ambient-layer-menu con la paleta Calidez Toscana Suave', () => {
      const html = ReactDOMServer.renderToString(<AmbientCanvas />);
      expect(html).toContain('id="ambient-layer-menu"');
      // Colores de la paleta Calidez Toscana Suave
      expect(html).toContain('rgba(245, 158, 11, 0.35)'); // Ámbar toscano
      expect(html).toContain('rgba(249, 115, 22, 0.32)'); // Mandarina coral
      expect(html).toContain('rgba(16, 185, 129, 0.28)'); // Albahaca menta
      expect(html).toContain('rgba(244, 63, 94, 0.22)'); // Frambuesa carmesí
      expect(emojiRegex.test(html)).toBe(false);
    });
  });

  describe('2. CategoryList Component', () => {
    it('debe renderizar categorías con conteo de platillos y atributos draggable', () => {
      const html = ReactDOMServer.renderToString(
        <CategoryList
          categories={sampleCategories}
          items={sampleItems}
          restaurantId="rest-1"
          selectedCategoryId="cat-1"
          onSelectCategory={vi.fn()}
          onCategoriesChanged={vi.fn()}
          onOpenCreate={vi.fn()}
        />
      );

      expect(html).toContain('Pizzas Artesanales');
      expect(html).toContain('Pastas &amp; Lasañas');
      expect(html).toContain('Todos los Platillos');
      expect(html).toContain('draggable="true"');
      expect(html).toContain('font-mono');
      expect(emojiRegex.test(html)).toBe(false);
    });

    it('debe mostrar indicador de categoría inactiva si is_active es false', () => {
      const html = ReactDOMServer.renderToString(
        <CategoryList
          categories={sampleCategories}
          items={sampleItems}
          restaurantId="rest-1"
          selectedCategoryId={null}
          onSelectCategory={vi.fn()}
          onCategoriesChanged={vi.fn()}
          onOpenCreate={vi.fn()}
        />
      );

      expect(html).toContain('Inactiva');
    });
  });

  describe('3. MenuItemCard Component', () => {
    it('debe renderizar precios en JetBrains Mono y switch de disponibilidad', () => {
      const html = ReactDOMServer.renderToString(
        <MenuItemCard
          item={sampleItems[0]!}
          restaurantId="rest-1"
          categoryName="Pizzas Artesanales"
          onEdit={vi.fn()}
          onDeleted={vi.fn()}
        />
      );

      expect(html).toContain('Pizza Margherita DOC');
      expect(html).toContain('$195.50');
      expect(html).toContain('font-mono');
      expect(html).toContain('Disponible');
      expect(html).toContain('2 grupos de opciones');
      expect(html).toContain('liquid-card');
      expect(emojiRegex.test(html)).toBe(false);
    });

    it('debe renderizar estado Agotado cuando is_available es false', () => {
      const html = ReactDOMServer.renderToString(
        <MenuItemCard
          item={sampleItems[1]!}
          restaurantId="rest-1"
          categoryName="Pastas & Lasañas"
          onEdit={vi.fn()}
          onDeleted={vi.fn()}
        />
      );

      expect(html).toContain('Lasaña Bolognese');
      expect(html).toContain('$240.00');
      expect(html).toContain('Agotado');
      expect(emojiRegex.test(html)).toBe(false);
    });
  });

  describe('4. OptionsSchemaBuilder Component', () => {
    it('debe renderizar grupos de modificadores y opciones con precios formateados', () => {
      const groups: OptionGroup[] = [
        {
          name: 'Tamaño',
          type: 'single_choice',
          required: true,
          choices: [
            { label: 'Chica', price_modifier: 0 },
            { label: 'Grande', price_modifier: 35.5 },
          ],
        },
      ];

      const html = ReactDOMServer.renderToString(
        <OptionsSchemaBuilder value={groups} onChange={vi.fn()} />
      );

      expect(html).toContain('Modificadores &amp; Opciones (1)');
      expect(html).toContain('Tamaño');
      expect(html).toContain('Obligatorio');
      expect(html).toContain('+$35.50');
      expect(html).toContain('font-mono');
      expect(emojiRegex.test(html)).toBe(false);
    });

    it('debe renderizar estado vacío amigable si no hay grupos', () => {
      const html = ReactDOMServer.renderToString(
        <OptionsSchemaBuilder value={[]} onChange={vi.fn()} />
      );

      expect(html).toContain('Este platillo no tiene modificadores ni grupos de opciones');
      expect(html).toContain('Agregar Primer Grupo');
      expect(emojiRegex.test(html)).toBe(false);
    });
  });

  describe('5. CategoryForm Modal Component', () => {
    it('debe renderizar modal de categoría cuando isOpen es true', () => {
      const html = ReactDOMServer.renderToString(
        <CategoryForm
          isOpen={true}
          onClose={vi.fn()}
          restaurantId="rest-1"
          categoryToEdit={null}
        />
      );

      expect(html).toContain('Nueva Categoría');
      expect(html).toContain('Nombre de la Categoría');
      expect(html).toContain('Estado Activo');
      expect(emojiRegex.test(html)).toBe(false);
    });

    it('no debe renderizar nada cuando isOpen es false', () => {
      const html = ReactDOMServer.renderToString(
        <CategoryForm
          isOpen={false}
          onClose={vi.fn()}
          restaurantId="rest-1"
          categoryToEdit={null}
        />
      );

      expect(html).toBe('');
    });
  });

  describe('6. MenuItemForm Modal Component', () => {
    it('debe renderizar campos de platillo, precio en font-mono y selector de categoría', () => {
      const html = ReactDOMServer.renderToString(
        <MenuItemForm
          isOpen={true}
          onClose={vi.fn()}
          restaurantId="rest-1"
          categories={sampleCategories}
          itemToEdit={null}
        />
      );

      expect(html).toContain('Nuevo Platillo');
      expect(html).toContain('Precio Base (MXN)');
      expect(html).toContain('font-mono');
      expect(html).toContain('Pizzas Artesanales');
      expect(html).toContain('Pastas &amp; Lasañas');
      expect(emojiRegex.test(html)).toBe(false);
    });
  });

  describe('7. MenuGrid Component', () => {
    it('debe renderizar barra de búsqueda, píldoras de filtrado y tarjetas de platillos', () => {
      const html = ReactDOMServer.renderToString(
        <MenuGrid
          items={sampleItems}
          categories={sampleCategories}
          restaurantId="rest-1"
          selectedCategoryId={null}
          onSelectCategory={vi.fn()}
          onEditItem={vi.fn()}
          onDeleteItem={vi.fn()}
          onOpenCreateDish={vi.fn()}
          onItemUpdated={vi.fn()}
        />
      );

      expect(html).toContain('Buscar por nombre o ingredientes...');
      expect(html).toContain('Disponibles');
      expect(html).toContain('Agotados');
      expect(html).toContain('Pizza Margherita DOC');
      expect(html).toContain('Lasaña Bolognese');
      expect(html).toContain('font-mono');
      expect(emojiRegex.test(html)).toBe(false);
    });

    it('debe mostrar estado vacío cuando no hay ítems', () => {
      const html = ReactDOMServer.renderToString(
        <MenuGrid
          items={[]}
          categories={sampleCategories}
          restaurantId="rest-1"
          selectedCategoryId={null}
          onSelectCategory={vi.fn()}
          onEditItem={vi.fn()}
          onDeleteItem={vi.fn()}
          onOpenCreateDish={vi.fn()}
          onItemUpdated={vi.fn()}
        />
      );

      expect(html).toContain('No hay platillos en el catálogo');
      expect(html).toContain('Crear Primer Platillo');
      expect(emojiRegex.test(html)).toBe(false);
    });
  });

  describe('8. MenuPage Complete Integration', () => {
    it('debe renderizar encabezado oficial con título Menú & Catálogo y acciones', () => {
      const html = ReactDOMServer.renderToString(<MenuPage />);
      expect(html).toContain('Menú &amp; Catálogo');
      expect(html).toContain('Nueva Categoría');
      expect(html).toContain('Nuevo Platillo');
      expect(emojiRegex.test(html)).toBe(false);
    });
  });
});
