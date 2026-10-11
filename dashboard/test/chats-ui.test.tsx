import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

// Server Action y dependencias de base de datos
import { updateCustomerNotes } from '../src/app/(dashboard)/chats/actions';
import { type EnrichedConversation } from '../src/hooks/use-live-chat';
import { type Message, type Customer } from '../src/types/database';

// Componentes de UI
import { ChatList } from '../src/components/chats/chat-list';
import { ChatItem } from '../src/components/chats/chat-item';
import { ChatFilterTabs } from '../src/components/chats/chat-filter-tabs';
import { ChatDetailHeader } from '../src/components/chats/chat-detail-header';
import { MessageList } from '../src/components/chats/message-list';
import { MessageBubble } from '../src/components/chats/message-bubble';
import { MessageInput } from '../src/components/chats/message-input';
import { CustomerSidebar } from '../src/components/chats/customer-sidebar';
import {
  EmptyChatDetailState,
  EmptyChatListState,
  ChatListSkeleton,
  MessageListSkeleton,
  CustomerSidebarSkeleton,
} from '../src/components/chats/chat-skeletons';
import ChatsPage from '../src/app/(dashboard)/chats/page';

// Mocks de Supabase Server para testear la Server Action updateCustomerNotes
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}));

function makeMockMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-default',
    restaurant_id: '11111111-1111-4111-8111-111111111111',
    conversation_id: '22222222-2222-4222-8222-222222222222',
    role: 'user',
    content: 'Hola',
    provider_message_id: null,
    metadata: {},
    created_at: '2026-09-06T12:00:00Z',
    ...overrides,
  };
}

const todayIso = new Date().toISOString();

// Mock para useTenant y useLiveChat para renderizar ChatsPage
const mockActiveConversation: EnrichedConversation = {
  id: '22222222-2222-4222-8222-222222222222',
  restaurant_id: '11111111-1111-4111-8111-111111111111',
  customer_id: '44444444-4444-4444-8444-444444444444',
  status: 'open',
  mode: 'ai',
  created_at: todayIso,
  updated_at: todayIso,
  customer: {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Carlos Mendoza',
    phone: '+525512345678',
    notes_md: '- 📍 **Entrega:** Roma Norte\n- ⚠️ **Restricciones/Alergias:** Sin cebolla',
  },
  last_message: {
    id: '55555555-5555-5555-8555-555555555555',
    content: 'Hola, ¿tienen pizza margarita?',
    role: 'user',
    created_at: todayIso,
  },
  unread_count: 2,
};

let mockChatHookState: any = {
  conversations: [mockActiveConversation],
  filteredConversations: [mockActiveConversation],
  activeConversation: mockActiveConversation,
  activeConversationId: mockActiveConversation.id,
  messages: [
    makeMockMessage({
      id: 'msg-1',
      conversation_id: mockActiveConversation.id,
      role: 'user',
      content: 'Hola, ¿tienen pizza margarita?',
      created_at: '2026-09-06T14:20:00Z',
    }),
  ],
  loading: false,
  loadingMessages: false,
  error: null,
  searchQuery: '',
  statusFilter: 'all',
  modeFilter: 'all',
  soundEnabled: true,
  selectConversation: vi.fn(),
  sendMessage: vi.fn(),
  setMode: vi.fn(),
  setStatus: vi.fn(),
  updateNotes: vi.fn(),
  setSearchQuery: vi.fn(),
  setStatusFilter: vi.fn(),
  setModeFilter: vi.fn(),
  toggleSound: vi.fn(),
  refresh: vi.fn(),
};

vi.mock('@/components/layout/tenant-provider', () => ({
  useTenant: () => ({
    activeRestaurant: {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Pizzería Napolitana Roma',
      slug: 'pizzeria-napolitana',
    },
    userRole: 'owner',
    availableRestaurants: [],
    switchRestaurant: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-live-chat', () => ({
  useLiveChat: () => mockChatHookState,
}));

// Regex estricto universal para verificar AUSENCIA TOTAL de emojis
const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|\p{Extended_Pictographic}|\p{Emoji_Presentation}/u;

describe('Live Chat UI Component Suite (React 19 & Node SSR Engine)', () => {
  const validTenantId = '11111111-1111-4111-8111-111111111111';
  const validCustomerId = '44444444-4444-4444-8444-444444444444';
  const validUserId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* ======================================================================== */
  /* a. ChatList & ChatItem                                                   */
  /* ======================================================================== */
  describe('a. ChatList & ChatItem', () => {
    it('renderiza empty state cuando conversations está vacío', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <ChatList
          conversations={[]}
          activeConversationId={null}
          searchQuery=""
          soundEnabled={true}
          loading={false}
          onSelectConversation={vi.fn()}
          onSearchChange={vi.fn()}
          onToggleSound={vi.fn()}
        />
      );

      expect(html).toContain('No se encontraron conversaciones');
      expect(html).toContain('Limpiar filtros');
      expect(html).toContain('Conversaciones');
    });

    it('renderiza loading skeletons cuando loading === true', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <ChatList
          conversations={[]}
          activeConversationId={null}
          searchQuery=""
          soundEnabled={true}
          loading={true}
          onSelectConversation={vi.fn()}
          onSearchChange={vi.fn()}
          onToggleSound={vi.fn()}
        />
      );

      expect(html).toContain('animate-pulse');
      expect(html).toContain('Cargando conversaciones');
    });

    it('renderiza tarjetas de conversación con iniciales de avatar, nombre, snippet truncado y timestamp en Geist Mono', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <ChatItem
          conversation={mockActiveConversation}
          isActive={false}
          onSelect={vi.fn()}
        />
      );

      // Iniciales
      expect(html).toContain('CM');
      // Nombre
      expect(html).toContain('Carlos Mendoza');
      // Snippet del mensaje
      expect(html).toContain('Hola, ¿tienen pizza margarita?');
      // Timestamp en font-mono (calculado en zona horaria local)
      const expectedDate = new Date(mockActiveConversation.last_message!.created_at);
      const expectedHours = expectedDate.getHours().toString().padStart(2, '0');
      const expectedMinutes = expectedDate.getMinutes().toString().padStart(2, '0');
      expect(html).toContain('font-mono');
      expect(html).toContain(`${expectedHours}:${expectedMinutes}`);
    });

    it('aplica fondo Periwinkle (bg-periwinkle-tint) y borde Jade cuando la conversación está activa', () => {
      const activeHtml = ReactDOMServer.renderToStaticMarkup(
        <ChatItem
          conversation={mockActiveConversation}
          isActive={true}
          onSelect={vi.fn()}
        />
      );

      expect(activeHtml).toContain('bg-periwinkle-tint');
      expect(activeHtml).toContain('border-accent-jade');
      expect(activeHtml).toContain('border-l-4');
    });

    it('renderiza badge de mensajes no leídos en font-mono cuando unread_count > 0', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <ChatItem
          conversation={{ ...mockActiveConversation, unread_count: 5 }}
          isActive={false}
          onSelect={vi.fn()}
        />
      );

      expect(html).toContain('5 mensajes no leídos');
      expect(html).toContain('bg-accent-jade');
      expect(html).toContain('font-mono');
    });

    it('muestra icono Bot en Modo IA e icono User en Modo Humano', () => {
      const aiHtml = ReactDOMServer.renderToStaticMarkup(
        <ChatItem
          conversation={{ ...mockActiveConversation, mode: 'ai' }}
          isActive={false}
          onSelect={vi.fn()}
        />
      );
      expect(aiHtml).toContain('Modo IA Activo');
      expect(aiHtml).toContain('lucide-bot');
      expect(aiHtml).toContain('IA');

      const humanHtml = ReactDOMServer.renderToStaticMarkup(
        <ChatItem
          conversation={{ ...mockActiveConversation, mode: 'human' }}
          isActive={false}
          onSelect={vi.fn()}
        />
      );
      expect(humanHtml).toContain('Requiere Operador Humano');
      expect(humanHtml).toContain('lucide-user');
      expect(humanHtml).toContain('Humano');
    });
  });

  /* ======================================================================== */
  /* b. ChatFilterTabs                                                        */
  /* ======================================================================== */
  describe('b. ChatFilterTabs', () => {
    it('renderiza las 5 pestañas ergonómicas (Todos, Abiertos, Cerrados, IA Atendiendo, Requiere Humano)', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <ChatFilterTabs
          activeTab="all"
          counts={{ all: 10, open: 6, closed: 4, ai: 5, human: 1 }}
        />
      );

      expect(html).toContain('Todos');
      expect(html).toContain('Abiertos');
      expect(html).toContain('Cerrados');
      expect(html).toContain('IA Atendiendo');
      expect(html).toContain('Requiere Humano');
    });

    it('renderiza badge en Ámbar/Ochre en la pestaña Requiere Humano', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <ChatFilterTabs
          activeTab="human"
          counts={{ all: 5, open: 2, closed: 3, ai: 1, human: 1 }}
        />
      );

      expect(html).toContain('text-alert-ochre');
      expect(html).toContain('bg-alert-ochre/15');
      expect(html).toContain('border-alert-ochre/30');
    });

    it('renderiza los conteos numéricos en tipografía font-mono', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <ChatFilterTabs
          activeTab="all"
          counts={{ all: 42, open: 20, closed: 22, ai: 18, human: 2 }}
        />
      );

      expect(html).toContain('font-mono');
      expect(html).toContain('42');
      expect(html).toContain('20');
      expect(html).toContain('22');
    });
  });

  /* ======================================================================== */
  /* c. ChatDetailHeader                                                      */
  /* ======================================================================== */
  describe('c. ChatDetailHeader', () => {
    it('renderiza el nombre del cliente y teléfono formateado en font-mono', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <ChatDetailHeader
          conversation={mockActiveConversation}
          onToggleMode={vi.fn()}
          onToggleStatus={vi.fn()}
        />
      );

      expect(html).toContain('Carlos Mendoza');
      expect(html).toContain('font-mono');
      expect(html).toContain('+52 55 1234 5678');
    });

    it('renderiza enlace directo a WhatsApp con href="https://wa.me/{phone}", target="_blank" y rel="noopener noreferrer"', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <ChatDetailHeader
          conversation={mockActiveConversation}
          onToggleMode={vi.fn()}
          onToggleStatus={vi.fn()}
        />
      );

      expect(html).toContain('href="https://wa.me/525512345678"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
      expect(html).toContain('lucide-message-circle');
    });

    it('renderiza conmutador de modo en 1-clic y botón de cerrar/reabrir conversación', () => {
      // En modo IA
      const aiHtml = ReactDOMServer.renderToStaticMarkup(
        <ChatDetailHeader
          conversation={{ ...mockActiveConversation, mode: 'ai', status: 'open' }}
          onToggleMode={vi.fn()}
          onToggleStatus={vi.fn()}
        />
      );
      expect(aiHtml).toContain('Tomar Control');
      expect(aiHtml).toContain('lucide-bot');
      expect(aiHtml).toContain('Cerrar Chat');
      expect(aiHtml).toMatch(/lucide-(check-circle|circle-check)/);

      // En modo Humano y cerrada
      const humanHtml = ReactDOMServer.renderToStaticMarkup(
        <ChatDetailHeader
          conversation={{ ...mockActiveConversation, mode: 'human', status: 'closed' }}
          onToggleMode={vi.fn()}
          onToggleStatus={vi.fn()}
        />
      );
      expect(humanHtml).toContain('Devolver a IA');
      expect(humanHtml).toContain('lucide-user');
      expect(humanHtml).toContain('Reabrir Chat');
      expect(humanHtml).toContain('lucide-rotate-ccw');
    });
  });

  /* ======================================================================== */
  /* d. MessageList & MessageBubble                                           */
  /* ======================================================================== */
  describe('d. MessageList & MessageBubble', () => {
    it('renderiza burbujas diferenciadas por rol de remitente', () => {
      // 1. Comensal: Periwinkle, izquierda
      const userBubble = ReactDOMServer.renderToStaticMarkup(
        <MessageBubble
          message={makeMockMessage({
            id: 'm1',
            role: 'user',
            content: 'Quiero ordenar',
          })}
          customerName="Carlos"
        />
      );
      expect(userBubble).toContain('justify-start');
      expect(userBubble).toContain('bg-periwinkle-tint');
      expect(userBubble).toContain('text-ink-primary');

      // 2. Bot IA: Jade, derecha, ChatAliado
      const botBubble = ReactDOMServer.renderToStaticMarkup(
        <MessageBubble
          message={makeMockMessage({
            id: 'm2',
            role: 'assistant',
            content: '¡Con gusto! ¿Para cuántas personas?',
            created_at: '2026-09-06T12:01:00Z',
          })}
        />
      );
      expect(botBubble).toContain('justify-end');
      expect(botBubble).toContain('ChatAliado');
      expect(botBubble).toContain('border-accent-jade/40');
      expect(botBubble).toContain('lucide-bot');

      // 3. Operador: Slate, derecha, Operador (Tú)
      const operatorBubble = ReactDOMServer.renderToStaticMarkup(
        <MessageBubble
          message={makeMockMessage({
            id: 'm3',
            role: 'human_agent',
            content: 'Un momento por favor, verifico en cocina.',
            created_at: '2026-09-06T12:02:00Z',
          })}
        />
      );
      expect(operatorBubble).toContain('justify-end');
      expect(operatorBubble).toContain('Operador (Tú)');
      expect(operatorBubble).toContain('border-border-strong');
      expect(operatorBubble).toContain('lucide-user');

      // 4. Sistema: Píldora centrada
      const systemBubble = ReactDOMServer.renderToStaticMarkup(
        <MessageBubble
          message={makeMockMessage({
            id: 'm4',
            role: 'system',
            content: 'Conversación transferida a operador',
            created_at: '2026-09-06T12:03:00Z',
          })}
        />
      );
      expect(systemBubble).toContain('justify-center');
      expect(systemBubble).toContain('lucide-info');
    });

    it('procesa el formateo seguro de WhatsApp (*bold*, _italic_, ~strike~, code)', () => {
      const bubble = ReactDOMServer.renderToStaticMarkup(
        <MessageBubble
          message={makeMockMessage({
            id: 'm-formatting',
            role: 'user',
            content: 'Mensaje con *negrita*, _cursiva_, ~tachado~ y `código mono`',
          })}
        />
      );

      expect(bubble).toContain('>negrita</strong>');
      expect(bubble).toContain('>cursiva</em>');
      expect(bubble).toContain('>tachado</del>');
      expect(bubble).toContain('<code');
      expect(bubble).toContain('>código mono</code>');
    });

    it('renderiza timestamps de mensaje en font-mono', () => {
      const bubble = ReactDOMServer.renderToStaticMarkup(
        <MessageBubble
          message={makeMockMessage({
            id: 'm-time',
            role: 'user',
            content: 'Prueba de hora',
            created_at: '2026-09-06T18:45:00Z',
          })}
        />
      );

      const expectedDate = new Date('2026-09-06T18:45:00Z');
      const expectedHours = expectedDate.getHours().toString().padStart(2, '0');
      const expectedMinutes = expectedDate.getMinutes().toString().padStart(2, '0');

      expect(bubble).toContain('font-mono');
      expect(bubble).toContain(`${expectedHours}:${expectedMinutes}`);
    });
  });

  /* ======================================================================== */
  /* e. MessageInput                                                          */
  /* ======================================================================== */
  describe('e. MessageInput', () => {
    it('renderiza textarea y botón de envío táctil con Send icon y física de presión', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <MessageInput
          mode="human"
          status="open"
          onSendMessage={vi.fn().mockResolvedValue({ success: true })}
        />
      );

      expect(html).toContain('<textarea');
      expect(html).toContain('Escribe un mensaje para el comensal');
      expect(html).toContain('pressable');
      expect(html).toContain('lucide-send');
      expect(html).toContain('Modo Humano activo');
    });

    it('renderiza banner preventivo en Modo IA con botón de 1-clic "Tomar Control"', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <MessageInput
          mode="ai"
          status="open"
          onSendMessage={vi.fn().mockResolvedValue({ success: true })}
          onTakeControl={vi.fn()}
        />
      );

      expect(html).toContain('Modo IA Activo');
      expect(html).toContain('Tomar Control');
      expect(html).toContain('lucide-user-check');
      expect(html).toContain('El bot está atendiendo al comensal en WhatsApp');
      // No debe exponer el textarea en Modo IA para evitar colisiones
      expect(html).not.toContain('<textarea');
    });

    it('renderiza aviso de conversación cerrada con botón de reapertura', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <MessageInput
          mode="human"
          status="closed"
          onSendMessage={vi.fn().mockResolvedValue({ success: true })}
          onReopenChat={vi.fn()}
        />
      );

      expect(html).toContain('Esta conversación se encuentra cerrada.');
      expect(html).toContain('Reabrir Conversación');
      expect(html).toContain('lucide-rotate-ccw');
      expect(html).not.toContain('<textarea');
    });
  });

  /* ======================================================================== */
  /* f. CustomerSidebar                                                       */
  /* ======================================================================== */
  describe('f. CustomerSidebar', () => {
    const customerWithNotes: Pick<Customer, 'id' | 'name' | 'phone' | 'notes_md'> & { created_at: string } = {
      id: validCustomerId,
      name: 'Lucía Morales',
      phone: '+525544332211',
      created_at: '2026-08-15T10:00:00Z',
      notes_md: [
        '- 📍 **Entrega:** Calle Durango #45, Depto 302, Roma Norte',
        '- ⚠️ **Restricciones/Alergias:** Alergia severa a mariscos y cacahuate',
        '- 🍕 **Preferencias Habituales:** Pizza Cuatro Quesos con orilla rellena',
        '- 📦 **Último Pedido Confirmado:** Orden #11613 por $320.00 MXN',
      ].join('\n'),
    };

    it('renderiza información de perfil y teléfono formateado en font-mono', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <CustomerSidebar
          customer={customerWithNotes}
          isOpen={true}
          onClose={vi.fn()}
          onUpdateNotes={vi.fn().mockResolvedValue({ success: true })}
        />
      );

      expect(html).toContain('Ficha del Cliente');
      expect(html).toContain('Lucía Morales');
      expect(html).toContain('+52 55 4433 2211');
      expect(html).toContain('font-mono');
      expect(html).toContain('LU'); // Iniciales por prefijo
    });

    it('renderiza los 4 bloques estructurados de memoria utilizando iconos Lucide 1.5px', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <CustomerSidebar
          customer={customerWithNotes}
          isOpen={true}
          onClose={vi.fn()}
          onUpdateNotes={vi.fn().mockResolvedValue({ success: true })}
        />
      );

      // Bloque 1: Entrega
      expect(html).toContain('Entrega');
      expect(html).toContain('Calle Durango #45, Depto 302, Roma Norte');
      expect(html).toContain('lucide-map-pin');

      // Bloque 2: Restricciones / Alergias
      expect(html).toContain('Restricciones / Alergias');
      expect(html).toContain('Alergia severa a mariscos y cacahuate');
      expect(html).toMatch(/lucide-(alert-triangle|triangle-alert)/);

      // Bloque 3: Preferencias Habituales
      expect(html).toContain('Preferencias Habituales');
      expect(html).toContain('Pizza Cuatro Quesos con orilla rellena');
      expect(html).toContain('lucide-heart');

      // Bloque 4: Último Pedido Confirmado
      expect(html).toContain('Último Pedido Confirmado');
      expect(html).toContain('Orden #11613 por $320.00 MXN');
      expect(html).toContain('lucide-package');
    });

    it('muestra botón "Editar Notas" en modo lectura', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        <CustomerSidebar
          customer={customerWithNotes}
          isOpen={true}
          onClose={vi.fn()}
          onUpdateNotes={vi.fn().mockResolvedValue({ success: true })}
        />
      );

      expect(html).toContain('Editar Notas');
      expect(html).toContain('lucide-pencil');
    });
  });

  /* ======================================================================== */
  /* g. Server Action updateCustomerNotes                                     */
  /* ======================================================================== */
  describe('g. Server Action updateCustomerNotes', () => {
    it('rechaza llamadas con identificadores no UUID (validación Zod)', async () => {
      const res1 = await updateCustomerNotes('not-a-uuid', validCustomerId, 'nuevas notas');
      expect(res1.success).toBe(false);
      expect(res1.error).toContain('UUID');

      const res2 = await updateCustomerNotes(validTenantId, 'bad-customer-id', 'nuevas notas');
      expect(res2.success).toBe(false);
      expect(res2.error).toContain('UUID');
    });

    it('rechaza llamadas si el usuario no tiene sesión autenticada', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'No session' } });

      const res = await updateCustomerNotes(validTenantId, validCustomerId, 'nuevas notas');
      expect(res.success).toBe(false);
      expect(res.error).toContain('UNAUTHORIZED');
    });

    it('rechaza llamadas si el usuario autenticado no pertenece al restaurante', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'Not found' } }),
      });

      const res = await updateCustomerNotes(validTenantId, validCustomerId, 'nuevas notas');
      expect(res.success).toBe(false);
      expect(res.error).toContain('FORBIDDEN');
    });

    it('persiste las notas en base de datos aplicando aislamiento multi-tenant estricto', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });

      const membershipChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({
          data: { role: 'owner', restaurant_id: validTenantId },
          error: null,
        }),
      };

      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };
      // Simula el segundo .eq('restaurant_id', restaurantId)
      updateChain.eq.mockReturnValueOnce(updateChain).mockResolvedValueOnce({
        data: { id: validCustomerId, notes_md: 'notas actualizadas' },
        error: null,
      });

      mockFrom
        .mockReturnValueOnce(membershipChain) // restaurant_users
        .mockReturnValueOnce(updateChain); // customers

      const res = await updateCustomerNotes(validTenantId, validCustomerId, 'notas actualizadas');

      expect(res.success).toBe(true);
      expect(res.data?.success).toBe(true);
      expect(updateChain.update).toHaveBeenCalledWith({ notes_md: 'notas actualizadas' });
    });
  });

  /* ======================================================================== */
  /* h. Strict Zero Emojis Assertion                                          */
  /* ======================================================================== */
  describe('h. Strict Zero Emojis Assertion', () => {
    it('no contiene ningún emoji en el markup de ChatList ni ChatItem', () => {
      const listHtml = ReactDOMServer.renderToStaticMarkup(
        <ChatList
          conversations={[mockActiveConversation]}
          activeConversationId={mockActiveConversation.id}
          searchQuery=""
          soundEnabled={true}
          loading={false}
          onSelectConversation={vi.fn()}
          onSearchChange={vi.fn()}
          onToggleSound={vi.fn()}
        />
      );
      expect(listHtml).not.toMatch(EMOJI_REGEX);

      const itemHtml = ReactDOMServer.renderToStaticMarkup(
        <ChatItem
          conversation={mockActiveConversation}
          isActive={true}
          onSelect={vi.fn()}
        />
      );
      expect(itemHtml).not.toMatch(EMOJI_REGEX);
    });

    it('no contiene ningún emoji en el markup de ChatFilterTabs', () => {
      const tabsHtml = ReactDOMServer.renderToStaticMarkup(
        <ChatFilterTabs
          activeTab="human"
          counts={{ all: 8, open: 4, closed: 4, ai: 2, human: 2 }}
        />
      );
      expect(tabsHtml).not.toMatch(EMOJI_REGEX);
    });

    it('no contiene ningún emoji en el markup de ChatDetailHeader', () => {
      const headerHtml = ReactDOMServer.renderToStaticMarkup(
        <ChatDetailHeader
          conversation={mockActiveConversation}
          onToggleMode={vi.fn()}
          onToggleStatus={vi.fn()}
        />
      );
      expect(headerHtml).not.toMatch(EMOJI_REGEX);
    });

    it('no contiene ningún emoji en el markup de MessageList ni MessageBubble', () => {
      const bubbleHtml = ReactDOMServer.renderToStaticMarkup(
        <MessageBubble
          message={makeMockMessage({
            id: 'm1',
            role: 'assistant',
            content: 'Hola, gracias por comunicarte con nosotros.',
          })}
        />
      );
      expect(bubbleHtml).not.toMatch(EMOJI_REGEX);

      const listHtml = ReactDOMServer.renderToStaticMarkup(
        <MessageList
          messages={[
            makeMockMessage({
              id: 'm1',
              role: 'user',
              content: 'Hola',
            }),
            makeMockMessage({
              id: 'm2',
              role: 'assistant',
              content: 'Hola Carlos',
              created_at: '2026-09-06T12:01:00Z',
            }),
          ]}
          customerName="Carlos"
        />
      );
      expect(listHtml).not.toMatch(EMOJI_REGEX);
    });

    it('no contiene ningún emoji en el markup de MessageInput (Modo IA ni Modo Humano)', () => {
      const aiInput = ReactDOMServer.renderToStaticMarkup(
        <MessageInput
          mode="ai"
          status="open"
          onSendMessage={vi.fn().mockResolvedValue({ success: true })}
        />
      );
      expect(aiInput).not.toMatch(EMOJI_REGEX);

      const humanInput = ReactDOMServer.renderToStaticMarkup(
        <MessageInput
          mode="human"
          status="open"
          onSendMessage={vi.fn().mockResolvedValue({ success: true })}
        />
      );
      expect(humanInput).not.toMatch(EMOJI_REGEX);
    });

    it('no contiene ningún emoji en el markup de CustomerSidebar incluso si las notas originales tenían emojis', () => {
      const dirtyCustomer = {
        id: validCustomerId,
        name: 'Ana García',
        phone: '+525599887766',
        created_at: '2026-07-01T12:00:00Z',
        // Emojis en el markdown crudo consolidado por workers antiguos
        notes_md: '- 📍 **Entrega:** Condesa\n- ⚠️ **Restricciones/Alergias:** Nuez\n- 🍕 **Preferencias Habituales:** Pizza\n- 📦 **Último Pedido Confirmado:** Orden 101',
      };

      const sidebarHtml = ReactDOMServer.renderToStaticMarkup(
        <CustomerSidebar
          customer={dirtyCustomer}
          isOpen={true}
          onClose={vi.fn()}
          onUpdateNotes={vi.fn().mockResolvedValue({ success: true })}
        />
      );

      // Verificación matemática: cero emojis en todo el HTML resultante
      expect(sidebarHtml).not.toMatch(EMOJI_REGEX);
    });

    it('no contiene ningún emoji en los skeletons ni estados vacíos', () => {
      const emptyDetail = ReactDOMServer.renderToStaticMarkup(<EmptyChatDetailState />);
      expect(emptyDetail).not.toMatch(EMOJI_REGEX);

      const emptyList = ReactDOMServer.renderToStaticMarkup(<EmptyChatListState />);
      expect(emptyList).not.toMatch(EMOJI_REGEX);

      const listSkeleton = ReactDOMServer.renderToStaticMarkup(<ChatListSkeleton count={3} />);
      expect(listSkeleton).not.toMatch(EMOJI_REGEX);

      const msgSkeleton = ReactDOMServer.renderToStaticMarkup(<MessageListSkeleton />);
      expect(msgSkeleton).not.toMatch(EMOJI_REGEX);

      const custSkeleton = ReactDOMServer.renderToStaticMarkup(<CustomerSidebarSkeleton />);
      expect(custSkeleton).not.toMatch(EMOJI_REGEX);
    });
  });

  /* ======================================================================== */
  /* i. Orchestrator Page (ChatsPage Trek Layout)                             */
  /* ======================================================================== */
  describe('i. Orchestrator Page (ChatsPage Trek Layout)', () => {
    it('renderiza el contenedor maestro Trek con clases Liquid Glass y sin emojis', () => {
      const pageHtml = ReactDOMServer.renderToStaticMarkup(<ChatsPage />);

      // Contenedor Liquid Glass
      expect(pageHtml).toContain('data-testid="chats-trek-container"');
      expect(pageHtml).toContain('bg-surface-subtle');
      expect(pageHtml).toContain('border-border-whisper');
      expect(pageHtml).toContain('shadow-glass-subtle');
      expect(pageHtml).toContain('overflow-x-hidden');

      // 3 Columnas
      expect(pageHtml).toContain('data-testid="chat-list-column"');
      expect(pageHtml).toContain('data-testid="chat-detail-column"');
      expect(pageHtml).toContain('data-testid="customer-sidebar-column"');

      // Cero emojis en la página completa
      expect(pageHtml).not.toMatch(EMOJI_REGEX);
    });

    it('renderiza EmptyChatDetailState cuando no hay conversación activa', () => {
      // Modificar temporalmente el hook mockeado
      const previousState = mockChatHookState;
      mockChatHookState = {
        ...previousState,
        activeConversation: null,
        activeConversationId: null,
      };

      const emptyPageHtml = ReactDOMServer.renderToStaticMarkup(<ChatsPage />);
      expect(emptyPageHtml).toContain('Selecciona una conversación');
      expect(emptyPageHtml).not.toContain('data-testid="customer-sidebar-column"');
      expect(emptyPageHtml).not.toMatch(EMOJI_REGEX);

      // Restaurar
      mockChatHookState = previousState;
    });
  });
});
