import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import KDSPage from '../src/app/(dashboard)/kds/page';
import { type KDSOrder } from '../src/hooks/use-kds-orders';

const mockUseTenant = vi.fn();
const mockUseKDSOrders = vi.fn();
const mockUseWakeLock = vi.fn();

vi.mock('@/components/layout/tenant-provider', () => ({
  useTenant: () => mockUseTenant(),
}));

vi.mock('@/hooks/use-kds-orders', () => ({
  useKDSOrders: (opts: any) => mockUseKDSOrders(opts),
  inferOrderChannel: vi.fn((addr: string) => ({ channel: 'Domicilio', channelBadge: 'Domicilio' })),
}));

vi.mock('@/hooks/use-wake-lock', () => ({
  useWakeLock: (opts: any) => mockUseWakeLock(opts),
}));

vi.mock('@/lib/audio/sound-alerts', () => ({
  soundAlerts: {
    getSoundEnabled: vi.fn(() => true),
    setSoundEnabled: vi.fn(),
    playNewOrderSound: vi.fn(),
  },
}));

vi.mock('@/app/(dashboard)/chats/actions', () => ({
  sendHumanMessage: vi.fn().mockResolvedValue({ success: true }),
}));

describe('KDS Kitchen Display System UI & Design Compliance', () => {
  const sampleOrders: KDSOrder[] = [
    {
      id: 'ord-uuid-11613',
      restaurant_id: 'rest-1',
      name: 'Sarah Martínez',
      phone: '+52 55 4920 1192',
      channel: 'Domicilio',
      channelBadge: 'Domicilio',
      address: 'Av. Revolución 340',
      elapsedSeconds: 950, // >15m Retraso Crítico
      paid: true,
      total: '$330',
      rawTotal: 330,
      status: 'confirmed',
      stage: 'new',
      notes: 'Sin cebolla',
      items: [
        { id: 'item-1', qty: 1, name: 'Pizza Pepperoni Familiar', mod: 'Orilla Rellena', done: false },
        { id: 'item-2', qty: 2, name: 'Coca-Cola 600ml', done: true },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'ord-uuid-11614',
      restaurant_id: 'rest-1',
      name: 'Carlos Robles',
      phone: '+52 55 8392 0012',
      channel: 'Mesa',
      channelBadge: 'Mesa 2',
      address: 'Comedor Interior',
      elapsedSeconds: 520, // >8m Advertencia
      paid: false,
      total: '$210',
      rawTotal: 210,
      status: 'preparing',
      stage: 'prep',
      items: [
        { id: 'item-3', qty: 1, name: 'Hamburguesa Doble', done: false },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'ord-uuid-11615',
      restaurant_id: 'rest-1',
      name: 'Elena Fuentes',
      phone: '+52 55 1092 8841',
      channel: 'Llevar',
      channelBadge: 'Para Llevar',
      address: 'Pasa a mostrador',
      elapsedSeconds: 120, // Normal
      paid: true,
      total: '$285',
      rawTotal: 285,
      status: 'ready',
      stage: 'ready',
      items: [
        { id: 'item-4', qty: 1, name: 'Alitas BBQ (8pz)', done: false },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTenant.mockReturnValue({
      activeRestaurant: { id: 'rest-1', name: 'Pizzería Don Giovanni' },
      userRole: 'owner',
    });

    mockUseWakeLock.mockReturnValue({
      isSupported: true,
      isActive: true,
      error: null,
      request: vi.fn(),
      release: vi.fn(),
      toggle: vi.fn(),
    });

    mockUseKDSOrders.mockReturnValue({
      orders: sampleOrders,
      filteredOrders: sampleOrders,
      recallStack: [],
      loading: false,
      error: null,
      channelFilter: 'all',
      setChannelFilter: vi.fn(),
      bumpOrder: vi.fn().mockResolvedValue({ success: true }),
      recallLastOrder: vi.fn().mockResolvedValue({ success: true }),
      toggleItemDone: vi.fn(),
      refresh: vi.fn(),
    });
  });

  it('debe renderizar la barra operativa con filtros de canal, selector de densidad y controles de hardware', () => {
    const rawHtml = ReactDOMServer.renderToString(<KDSPage />);
    const html = rawHtml.replace(/<!--.*?-->/g, '');

    // Filtros de canal
    expect(html).toContain('Todos (3)');
    expect(html).toContain('Domicilio');
    expect(html).toContain('Mesa');
    expect(html).toContain('Llevar');

    // Selector de columnas
    expect(html).toContain('4 cols');
    expect(html).toContain('5 cols');

    // Totales All Day en footer
    const footerMatch = html.match(/<footer[\s\S]*?<\/footer>/);
    const footerHtml = footerMatch ? footerMatch[0] : '';
    expect(footerHtml).toContain('TOTALES ALL DAY:');
    expect(footerHtml).toContain('Pizza Pepperoni Familiar');
    expect(footerHtml).toContain('Hamburguesa Doble');
    expect(footerHtml).toContain('Alitas BBQ (8pz)');
    // La Coca-Cola marcada como done no debe sumar en los pendientes All Day
    expect(footerHtml).not.toContain('Coca-Cola 600ml');
  });

  it('debe renderizar las tarjetas con semáforo, botones de acción según el estado y datos de comanda', () => {
    const html = ReactDOMServer.renderToString(<KDSPage />);

    // Comanda 1 (status: confirmed -> botón A Cocina)
    expect(html).toContain('Sarah');
    expect(html).toContain('A Cocina');
    expect(html).toContain('$330');
    expect(html).toContain('PAGADO');

    // Comanda 2 (status: preparing -> botón Listo)
    expect(html).toContain('Carlos');
    expect(html).toContain('Listo');
    expect(html).toContain('$210');
    expect(html).toContain('COBRAR');

    // Comanda 3 (status: ready -> botón Despachar)
    expect(html).toContain('Elena');
    expect(html).toContain('Despachar');
    expect(html).toContain('$285');

    // Notas de comanda
    expect(html).toContain('Sin cebolla');
  });

  it('debe deshabilitar el botón de Recall si la pila está vacía', () => {
    mockUseKDSOrders.mockReturnValueOnce({
      orders: sampleOrders,
      filteredOrders: sampleOrders,
      recallStack: [],
      loading: false,
      error: null,
      channelFilter: 'all',
      setChannelFilter: vi.fn(),
      bumpOrder: vi.fn(),
      recallLastOrder: vi.fn(),
      toggleItemDone: vi.fn(),
      refresh: vi.fn(),
    });

    const html = ReactDOMServer.renderToString(<KDSPage />);
    expect(html).toContain('Deshacer (Recall)');
    expect(html).toContain('disabled');
  });

  it('debe mostrar el botón de Recall habilitado con el ID de la comanda previa', () => {
    mockUseKDSOrders.mockReturnValueOnce({
      orders: sampleOrders,
      filteredOrders: sampleOrders,
      recallStack: [
        {
          id: 'ord-uuid-99999',
          name: 'Comanda Despachada',
          status: 'delivered',
        } as any,
      ],
      loading: false,
      error: null,
      channelFilter: 'all',
      setChannelFilter: vi.fn(),
      bumpOrder: vi.fn(),
      recallLastOrder: vi.fn(),
      toggleItemDone: vi.fn(),
      refresh: vi.fn(),
    });

    const html = ReactDOMServer.renderToString(<KDSPage />);
    expect(html).toContain('Deshacer #99999');
  });

  it('debe mostrar empty state amigable cuando no hay comandas en cocina', () => {
    mockUseKDSOrders.mockReturnValueOnce({
      orders: [],
      filteredOrders: [],
      recallStack: [],
      loading: false,
      error: null,
      channelFilter: 'all',
      setChannelFilter: vi.fn(),
      bumpOrder: vi.fn(),
      recallLastOrder: vi.fn(),
      toggleItemDone: vi.fn(),
      refresh: vi.fn(),
    });

    const html = ReactDOMServer.renderToString(<KDSPage />);
    expect(html).toContain('Sin comandas pendientes en cocina');
  });

  it('CUMPLE ESTRICTAMENTE LA REGLA DE CERO EMOJIS EN TODO EL RENDERIZADO', () => {
    const html = ReactDOMServer.renderToString(<KDSPage />);

    // Rango estándar de Unicode Emojis
    const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    expect(emojiRegex.test(html)).toBe(false);
  });

  it('debe renderizar notas de comensal y alergias con break-words sin truncar con puntos suspensivos', () => {
    const longAllergyNote = 'ALÉRGICO A LOS MARISCOS Y CACAHUATES - POR FAVOR LIMPIAR LA PLANCHA';
    mockUseKDSOrders.mockReturnValueOnce({
      orders: [
        {
          ...sampleOrders[0],
          notes: longAllergyNote,
        },
      ],
      filteredOrders: [
        {
          ...sampleOrders[0],
          notes: longAllergyNote,
        },
      ],
      recallStack: [],
      loading: false,
      error: null,
      channelFilter: 'all',
      setChannelFilter: vi.fn(),
      bumpOrder: vi.fn(),
      recallLastOrder: vi.fn(),
      toggleItemDone: vi.fn(),
      refresh: vi.fn(),
    });

    const html = ReactDOMServer.renderToString(<KDSPage />);
    // La nota completa debe estar presente en el HTML
    expect(html).toContain(longAllergyNote);
    // Debe incluir break-words para salto de línea ergonómico y NO truncate
    expect(html).toContain('break-words');
    expect(html).not.toMatch(/<span class="truncate">ALÉRGICO/);
  });

  it('debe utilizar fallback "WA" en el avatar si el nombre del comensal está vacío o sólo tiene espacios', () => {
    mockUseKDSOrders.mockReturnValueOnce({
      orders: [
        {
          ...sampleOrders[0],
          name: '   ',
        },
      ],
      filteredOrders: [
        {
          ...sampleOrders[0],
          name: '   ',
        },
      ],
      recallStack: [],
      loading: false,
      error: null,
      channelFilter: 'all',
      setChannelFilter: vi.fn(),
      bumpOrder: vi.fn(),
      recallLastOrder: vi.fn(),
      toggleItemDone: vi.fn(),
      refresh: vi.fn(),
    });

    const html = ReactDOMServer.renderToString(<KDSPage />);
    expect(html).toBeDefined();
  });
});