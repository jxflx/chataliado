import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import fs from 'fs';
import path from 'path';

// Parsers bajo prueba
import {
  parseCustomerNotes,
  stripEmojis,
  serializeCustomerNotes,
  type CustomerNoteBlocks,
} from '../src/components/chats/notes-parser';

import {
  parseWhatsAppMessage,
  formatWhatsAppPreview,
  isSafeUrl,
} from '../src/lib/whatsapp/message-parser';

// Componentes Visuales
import { ChatList } from '../src/components/chats/chat-list';
import { ChatItem } from '../src/components/chats/chat-item';
import { ChatFilterTabs } from '../src/components/chats/chat-filter-tabs';
import { ChatDetailHeader } from '../src/components/chats/chat-detail-header';
import { MessageList } from '../src/components/chats/message-list';
import { MessageBubble } from '../src/components/chats/message-bubble';
import { MessageInput } from '../src/components/chats/message-input';
import { CustomerSidebar } from '../src/components/chats/customer-sidebar';
import {
  ChatListSkeleton,
  MessageListSkeleton,
  CustomerSidebarSkeleton,
  EmptyChatListState,
  EmptyChatDetailState,
} from '../src/components/chats/chat-skeletons';
import ChatsPage from '../src/app/(dashboard)/chats/page';

import { type EnrichedConversation } from '../src/hooks/use-live-chat';
import { type Message } from '../src/types/database';

/**
 * Regex canónico completo para detectar cualquier emoji o pictograma Unicode:
 * (\p{Extended_Pictographic}, \p{Emoji_Presentation}, [\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])
 */
const STRICT_EMOJI_REGEX =
  /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])/u;

const GLOBAL_STRICT_EMOJI_REGEX =
  /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])/gu;

// Mock data fixtures
const mockConvo: EnrichedConversation = {
  id: 'c1111111-1111-4111-8111-111111111111',
  restaurant_id: 'r1111111-1111-4111-8111-111111111111',
  customer_id: 'u1111111-1111-4111-8111-111111111111',
  status: 'open',
  mode: 'ai',
  created_at: '2026-09-06T12:00:00Z',
  updated_at: '2026-09-06T14:30:00Z',
  customer: {
    id: 'u1111111-1111-4111-8111-111111111111',
    name: 'Valeria Dominguez',
    phone: '+525588776655',
    notes_md: '- \u{1F4CD} **Entrega:** Roma Sur 42\n- \u{26A0} **Restricciones/Alergias:** Mariscos y Nueces\n- \u{1F355} **Preferencias Habituales:** Pizza Cuatro Quesos\n- \u{1F4E6} **Último Pedido Confirmado:** Orden #5432',
  },
  last_message: {
    id: 'm1111111-1111-4111-8111-111111111111',
    content: '¿Cuánto tiempo tarda la entrega?',
    role: 'user',
    created_at: '2026-09-06T14:30:00Z',
  },
  unread_count: 1,
};

function createMsg(role: Message['role'], content: string, extra?: Partial<Message>): Message {
  return {
    id: 'msg-' + Math.random().toString(36).slice(2),
    restaurant_id: 'r1111111-1111-4111-8111-111111111111',
    conversation_id: 'c1111111-1111-4111-8111-111111111111',
    role,
    content,
    provider_message_id: null,
    metadata: {},
    created_at: '2026-09-06T15:00:00Z',
    ...extra,
  };
}

// Mocks para ChatsPage
vi.mock('@/components/layout/tenant-provider', () => ({
  useTenant: () => ({
    activeRestaurant: { id: 'r1111111-1111-4111-8111-111111111111', name: 'Pizzería Napolitana' },
  }),
}));

vi.mock('@/hooks/use-live-chat', () => ({
  useLiveChat: () => ({
    conversations: [mockConvo],
    filteredConversations: [mockConvo],
    activeConversation: mockConvo,
    activeConversationId: mockConvo.id,
    messages: [
      createMsg('user', 'Hola, quiero pedir una pizza'),
      createMsg('assistant', '¡Hola! Claro que sí, ¿cuál te gustaría?'),
      createMsg('human_agent', 'Hola Valeria, soy el encargado de cocina.'),
      createMsg('system', 'Operador tomó el control de la conversación.'),
    ],
    loading: false,
    loadingMessages: false,
    error: null,
    searchQuery: '',
    statusFilter: 'all',
    modeFilter: 'all',
    soundEnabled: true,
    selectConversation: vi.fn(),
    setSearchQuery: vi.fn(),
    setStatusFilter: vi.fn(),
    setModeFilter: vi.fn(),
    setMode: vi.fn().mockResolvedValue(undefined),
    setStatus: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue({ success: true }),
    updateNotes: vi.fn().mockResolvedValue({ success: true }),
    toggleSound: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('CHALLENGER ADVERSARIAL SUITE — ZERO EMOJIS & PARSER STRESS TESTING', () => {

  /* ========================================================================= */
  /* 1. STRICT ZERO EMOJIS CONSTRAINT VERIFICATION                             */
  /* ========================================================================= */
  describe('1. Empirically Verify STRICT ZERO EMOJIS Constraint', () => {

    it('1.1 Source code audit: 0 emojis hardcoded in any component or page file', () => {
      const targetDirs = [
        path.resolve(__dirname, '../src/components/chats'),
        path.resolve(__dirname, '../src/app/(dashboard)/chats'),
      ];

      const foundViolations: { file: string; line: number; text: string; match: string }[] = [];

      for (const dir of targetDirs) {
        if (!fs.existsSync(dir)) continue;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
            // notes-parser.ts has emoji regex definitions and comments
            if (entry.name === 'notes-parser.ts') continue;

            const filePath = path.join(dir, entry.name);
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');

            lines.forEach((line, idx) => {
              const trimmed = line.trim();
              if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;
              const matches = line.match(GLOBAL_STRICT_EMOJI_REGEX);
              if (matches) {
                foundViolations.push({
                  file: entry.name,
                  line: idx + 1,
                  text: trimmed,
                  match: matches.join(', '),
                });
              }
            });
          }
        }
      }

      expect(foundViolations).toEqual([]);
    });

    it('1.2 Rendered HTML audit: ChatList renders ZERO emojis in all states', () => {
      const htmlNormal = ReactDOMServer.renderToStaticMarkup(
        <ChatList
          conversations={[mockConvo]}
          activeConversationId={mockConvo.id}
          searchQuery=""
          soundEnabled={true}
          loading={false}
          onSelectConversation={vi.fn()}
          onSearchChange={vi.fn()}
          onToggleSound={vi.fn()}
        />
      );
      expect(STRICT_EMOJI_REGEX.test(htmlNormal)).toBe(false);

      const htmlEmpty = ReactDOMServer.renderToStaticMarkup(
        <ChatList
          conversations={[]}
          activeConversationId={null}
          searchQuery="filtro_inexistente"
          soundEnabled={false}
          loading={false}
          onSelectConversation={vi.fn()}
          onSearchChange={vi.fn()}
          onToggleSound={vi.fn()}
        />
      );
      expect(STRICT_EMOJI_REGEX.test(htmlEmpty)).toBe(false);

      const htmlLoading = ReactDOMServer.renderToStaticMarkup(
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
      expect(STRICT_EMOJI_REGEX.test(htmlLoading)).toBe(false);
    });

    it('1.3 Rendered HTML audit: ChatItem renders ZERO emojis across AI, Human, Closed, Unread', () => {
      const variants: EnrichedConversation[] = [
        { ...mockConvo, mode: 'ai', status: 'open', unread_count: 0 },
        { ...mockConvo, mode: 'human', status: 'open', unread_count: 5 },
        { ...mockConvo, mode: 'ai', status: 'closed', unread_count: 0 },
        { ...mockConvo, mode: 'human', status: 'closed', unread_count: 12 },
        { ...mockConvo, customer: null, last_message: null },
      ];

      for (const variant of variants) {
        const html = ReactDOMServer.renderToStaticMarkup(
          <ChatItem conversation={variant} isActive={true} onSelect={vi.fn()} />
        );
        expect(STRICT_EMOJI_REGEX.test(html)).toBe(false);
      }
    });

    it('1.4 Rendered HTML audit: ChatFilterTabs renders ZERO emojis in all 5 tabs', () => {
      const tabs: ('all' | 'open' | 'closed' | 'ai' | 'human')[] = [
        'all', 'open', 'closed', 'ai', 'human'
      ];
      for (const tab of tabs) {
        const html = ReactDOMServer.renderToStaticMarkup(
          <ChatFilterTabs activeTab={tab} counts={{ all: 10, open: 5, closed: 5, ai: 3, human: 2 }} />
        );
        expect(STRICT_EMOJI_REGEX.test(html)).toBe(false);
      }
    });

    it('1.5 Rendered HTML audit: ChatDetailHeader renders ZERO emojis', () => {
      const htmlAi = ReactDOMServer.renderToStaticMarkup(
        <ChatDetailHeader
          conversation={mockConvo}
          isSidebarOpen={true}
          onToggleMode={vi.fn()}
          onToggleStatus={vi.fn()}
          onToggleCustomerSidebar={vi.fn()}
          onBackToList={vi.fn()}
        />
      );
      expect(STRICT_EMOJI_REGEX.test(htmlAi)).toBe(false);

      const htmlHumanClosed = ReactDOMServer.renderToStaticMarkup(
        <ChatDetailHeader
          conversation={{ ...mockConvo, mode: 'human', status: 'closed' }}
          isSidebarOpen={false}
          onToggleMode={vi.fn()}
          onToggleStatus={vi.fn()}
        />
      );
      expect(STRICT_EMOJI_REGEX.test(htmlHumanClosed)).toBe(false);
    });

    it('1.6 Rendered HTML audit: MessageBubble renders ZERO emojis for all 4 roles', () => {
      const roles: Message['role'][] = ['user', 'assistant', 'human_agent', 'system', 'tool'];
      for (const role of roles) {
        const msg = createMsg(role, `Mensaje de prueba con rol ${role}`);
        const html = ReactDOMServer.renderToStaticMarkup(
          <MessageBubble message={msg} customerName="Valeria" />
        );
        expect(STRICT_EMOJI_REGEX.test(html)).toBe(false);
      }
    });

    it('1.7 Rendered HTML audit: MessageInput renders ZERO emojis in AI, Human, and Closed states', () => {
      const htmlAi = ReactDOMServer.renderToStaticMarkup(
        <MessageInput
          mode="ai"
          status="open"
          onSendMessage={vi.fn().mockResolvedValue({ success: true })}
          onTakeControl={vi.fn()}
        />
      );
      expect(STRICT_EMOJI_REGEX.test(htmlAi)).toBe(false);

      const htmlHuman = ReactDOMServer.renderToStaticMarkup(
        <MessageInput
          mode="human"
          status="open"
          onSendMessage={vi.fn().mockResolvedValue({ success: true })}
        />
      );
      expect(STRICT_EMOJI_REGEX.test(htmlHuman)).toBe(false);

      const htmlClosed = ReactDOMServer.renderToStaticMarkup(
        <MessageInput
          mode="human"
          status="closed"
          onSendMessage={vi.fn().mockResolvedValue({ success: true })}
          onReopenChat={vi.fn()}
        />
      );
      expect(STRICT_EMOJI_REGEX.test(htmlClosed)).toBe(false);
    });

    it('1.8 Rendered HTML audit: CustomerSidebar purges emojis and renders strictly ZERO emojis even with dirty legacy input', () => {
      const dirtyCustomer = {
        id: 'u999',
        name: 'Cliente Con Emojis',
        phone: '+525511223344',
        created_at: '2026-09-01T12:00:00Z',
        notes_md: '- \u{1F4CD} **Entrega:** Calle 10 #20 \u{1F355}\n- \u{26A0} **Restricciones/Alergias:** Cacahuates \u{1F95C} y Mariscos \u{1F990}\n- \u{2764} **Preferencias Habituales:** Extra queso \u{1F9C0} y salsa picante \u{1F336}\n- \u{1F4E6} **Último Pedido Confirmado:** Paquete Familiar #1234',
      };

      const html = ReactDOMServer.renderToStaticMarkup(
        <CustomerSidebar
          customer={dirtyCustomer}
          isOpen={true}
          onClose={vi.fn()}
          onUpdateNotes={vi.fn().mockResolvedValue({ success: true })}
        />
      );

      expect(STRICT_EMOJI_REGEX.test(html)).toBe(false);
    });

    it('1.9 Rendered HTML audit: Skeletons & Empty States render ZERO emojis', () => {
      expect(STRICT_EMOJI_REGEX.test(ReactDOMServer.renderToStaticMarkup(<ChatListSkeleton />))).toBe(false);
      expect(STRICT_EMOJI_REGEX.test(ReactDOMServer.renderToStaticMarkup(<MessageListSkeleton />))).toBe(false);
      expect(STRICT_EMOJI_REGEX.test(ReactDOMServer.renderToStaticMarkup(<CustomerSidebarSkeleton />))).toBe(false);
      expect(STRICT_EMOJI_REGEX.test(ReactDOMServer.renderToStaticMarkup(<EmptyChatListState />))).toBe(false);
      expect(STRICT_EMOJI_REGEX.test(ReactDOMServer.renderToStaticMarkup(<EmptyChatDetailState />))).toBe(false);
    });

    it('1.10 Rendered HTML audit: Complete ChatsPage orchestrator renders ZERO emojis', () => {
      const htmlPage = ReactDOMServer.renderToStaticMarkup(<ChatsPage />);
      expect(STRICT_EMOJI_REGEX.test(htmlPage)).toBe(false);
    });
  });

  /* ========================================================================= */
  /* 2. ADVERSARIAL STRESS-TEST OF notes-parser.ts                             */
  /* ========================================================================= */
  describe('2. Stress-Test notes-parser.ts (parseCustomerNotes & stripEmojis)', () => {

    it('2.1 stripEmojis: strips legacy emojis (📍, ⚠️, 🍕, 📦, ❤️, 🍔, 🌮, 🚨, etc.)', () => {
      const dirtyString = '\u{1F4CD} Dirección: Calle Olivo \u{26A0} Alergia: Nueces \u{1F355} Pizza \u{1F4E6} Paquete \u{2764} Favorito \u{1F354} Hamburguesa \u{1F32E} Tacos \u{1F6A8} Alerta';
      const clean = stripEmojis(dirtyString);
      expect(STRICT_EMOJI_REGEX.test(clean)).toBe(false);
      expect(clean).toContain('Dirección: Calle Olivo');
      expect(clean).toContain('Alergia: Nueces');
      expect(clean).toContain('Pizza');
      expect(clean).toContain('Paquete');
      expect(clean).toContain('Favorito');
      expect(clean).toContain('Hamburguesa');
      expect(clean).toContain('Tacos');
      expect(clean).toContain('Alerta');
    });

    it('2.2 stripEmojis: strips complex emoji sequences (ZWJ, skin tones, flags, variation selectors)', () => {
      const complexEmojis = 'Chef: \u{1F468}\u{200D}\u{1F373} Familia: \u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466} Pulgar: \u{1F44D}\u{1F3FD} Bandera: \u{1F1F2}\u{1F1FD} Chispa: \u{2728} Fuego: \u{1F525}';
      const clean = stripEmojis(complexEmojis);
      expect(STRICT_EMOJI_REGEX.test(clean)).toBe(false);
      expect(clean).toBe('Chef: Familia: Pulgar: Bandera: Chispa: Fuego:');
    });

    it('2.3 stripEmojis: resilient against empty, whitespace, null, undefined, non-strings', () => {
      expect(stripEmojis(null)).toBe('');
      expect(stripEmojis(undefined)).toBe('');
      expect(stripEmojis('')).toBe('');
      expect(stripEmojis('   \n\t  ')).toBe('');
      expect(stripEmojis(12345 as unknown as string)).toBe('');
      expect(stripEmojis({} as unknown as string)).toBe('');
    });

    it('2.4 parseCustomerNotes: parses dirty markdown with legacy emojis into 4 clean blocks', () => {
      const rawNotes = [
        '- \u{1F4CD} **Entrega:** Calle Juárez #456, Col. Roma, CDMX \u{1F1F2}\u{1F1FD}',
        '- \u{26A0} **Restricciones/Alergias:** Sin cebolla \u{1F9C5} ni mariscos \u{1F990}. Es alérgico severo \u{1F6A8}.',
        '- \u{1F355} **Preferencias Habituales:** Salsa verde picante \u{1F336}, masa delgada \u{1F355}',
        '- \u{1F4E6} **Último Pedido Confirmado:** Orden #9081 - 2x Pizza Pepperoni \u{1F4E6}',
      ].join('\n');

      const parsed = parseCustomerNotes(rawNotes);

      expect(parsed.delivery).toBe('Calle Juárez #456, Col. Roma, CDMX');
      expect(parsed.allergies).toContain('Sin cebolla');
      expect(parsed.allergies).toContain('mariscos');
      expect(parsed.preferences).toContain('Salsa verde picante');
      expect(parsed.preferences).toContain('masa delgada');
      expect(parsed.lastOrder).toBe('Orden #9081 - 2x Pizza Pepperoni');

      expect(STRICT_EMOJI_REGEX.test(parsed.delivery || '')).toBe(false);
      expect(STRICT_EMOJI_REGEX.test(parsed.allergies || '')).toBe(false);
      expect(STRICT_EMOJI_REGEX.test(parsed.preferences || '')).toBe(false);
      expect(STRICT_EMOJI_REGEX.test(parsed.lastOrder || '')).toBe(false);
      expect(STRICT_EMOJI_REGEX.test(parsed.raw)).toBe(false);
    });

    it('2.5 parseCustomerNotes: handles malformed bullets, missing asterisks, colon variations', () => {
      const malformedNotes = [
        'Entrega: Avenida Central 100',
        '* Restricciones y Alergias : Intolerancia a la lactosa',
        '• Preferencias: Refresco bien frío',
        '- Último Pedido : 1x Hamburguesa clásica',
      ].join('\n');

      const parsed = parseCustomerNotes(malformedNotes);

      expect(parsed.delivery).toBe('Avenida Central 100');
      expect(parsed.allergies).toBe('Intolerancia a la lactosa');
      expect(parsed.preferences).toBe('Refresco bien frío');
      expect(parsed.lastOrder).toBe('1x Hamburguesa clásica');
    });

    it('2.6 parseCustomerNotes: handles multi-line blocks with indented details', () => {
      const multiLineNotes = [
        '- **Entrega:**',
        '  Calle Nogal #12',
        '  Interior 4B',
        '  C.P. 06700',
        '  Entre calles Puebla y Durango',
        '- **Restricciones/Alergias:**',
        '  - Sin mayonesa',
        '  - Sin chile',
        '- **Preferencias Habituales:**',
        '  Masa crujiente',
        '- **Último Pedido Confirmado:**',
        '  Combo #3',
      ].join('\n');

      const parsed = parseCustomerNotes(multiLineNotes);

      expect(parsed.delivery).toContain('Calle Nogal #12');
      expect(parsed.delivery).toContain('Interior 4B');
      expect(parsed.delivery).toContain('C.P. 06700');
      expect(parsed.allergies).toContain('Sin mayonesa');
      expect(parsed.allergies).toContain('Sin chile');
      expect(parsed.preferences).toBe('Masa crujiente');
      expect(parsed.lastOrder).toBe('Combo #3');
    });

    it('2.7 parseCustomerNotes: handles freeform unformatted notes without crashing', () => {
      const freeform = 'Cliente nuevo contactó por WhatsApp pidiendo información sobre promociones los martes.';
      const parsed = parseCustomerNotes(freeform);

      expect(parsed.delivery).toBeNull();
      expect(parsed.allergies).toBeNull();
      expect(parsed.preferences).toBeNull();
      expect(parsed.lastOrder).toBeNull();
      expect(parsed.raw).toBe(freeform);
    });

    it('2.8 parseCustomerNotes: neutralizes XSS payloads (<script>alert(1)</script>)', () => {
      const xssNotes = [
        '- **Entrega:** <script>alert("xss-delivery")</script>',
        '- **Restricciones/Alergias:** <img src=x onerror=alert("xss-allergies")>',
        '- **Preferencias Habituales:** "><script src=evil.js></script>',
        '- **Último Pedido Confirmado:** javascript:alert(document.domain)',
      ].join('\n');

      const parsed = parseCustomerNotes(xssNotes);

      expect(parsed.delivery).toBe('<script>alert("xss-delivery")</script>');
      expect(parsed.allergies).toBe('<img src=x onerror=alert("xss-allergies")>');

      const dummyCustomer = {
        id: 'u-xss',
        name: 'Attacker',
        phone: '+525500000000',
        notes_md: xssNotes,
      };

      const html = ReactDOMServer.renderToStaticMarkup(
        <CustomerSidebar
          customer={dummyCustomer}
          isOpen={true}
          onClose={vi.fn()}
          onUpdateNotes={vi.fn().mockResolvedValue({ success: true })}
        />
      );

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;img src=x');
    });

    it('2.9 serializeCustomerNotes: generates clean markdown with zero emojis', () => {
      const blocks: CustomerNoteBlocks = {
        delivery: 'Colonia Del Valle 500 \u{1F4CD}',
        allergies: 'Sin mariscos \u{1F990}',
        preferences: 'Mucha salsa \u{1F336}',
        lastOrder: 'Pizza Suprema \u{1F355}',
        raw: '',
      };

      const serialized = serializeCustomerNotes(blocks);

      expect(STRICT_EMOJI_REGEX.test(serialized)).toBe(false);
      expect(serialized).toContain('- **Entrega:** Colonia Del Valle 500');
      expect(serialized).toContain('- **Restricciones/Alergias:** Sin mariscos');
      expect(serialized).toContain('- **Preferencias Habituales:** Mucha salsa');
      expect(serialized).toContain('- **Último Pedido Confirmado:** Pizza Suprema');
    });

    it('2.10 ReDoS & Long Input Stress: parses massive 10,000-line input in < 1500ms', () => {
      const lines = [
        '- \u{1F4CD} **Entrega:** Insurgentes Sur 100 \u{1F1F2}\u{1F1FD}',
        '- \u{26A0} **Restricciones/Alergias:** Cacahuates \u{1F95C}',
        '- \u{1F355} **Preferencias Habituales:** Extra queso \u{1F9C0}',
        '- \u{1F4E6} **Último Pedido Confirmado:** Pedido 999 \u{1F4E6}',
      ];
      const hugeInput = Array.from({ length: 2500 }, () => lines.join('\n')).join('\n');

      const start = performance.now();
      const res = parseCustomerNotes(hugeInput);
      const elapsed = performance.now() - start;

      expect(res.delivery).toBeDefined();
      expect(STRICT_EMOJI_REGEX.test(res.delivery || '')).toBe(false);
      expect(elapsed).toBeLessThan(1500);
    });
  });

  /* ========================================================================= */
  /* 3. ADVERSARIAL STRESS-TEST OF message-parser.tsx                          */
  /* ========================================================================= */
  describe('3. Stress-Test message-parser.tsx', () => {

    it('3.1 isSafeUrl: strictly permits only http: and https: protocols', () => {
      expect(isSafeUrl('http://example.com')).toBe(true);
      expect(isSafeUrl('https://example.com')).toBe(true);
      expect(isSafeUrl('https://chataliado.com/menu/pizza-margherita?coupon=DESC10#ingredientes')).toBe(true);
      expect(isSafeUrl('http://192.168.1.1:8080/health')).toBe(true);

      expect(isSafeUrl('javascript:alert(1)')).toBe(false);
      expect(isSafeUrl('javascript:evil()')).toBe(false);
      expect(isSafeUrl('JAVASCRIPT:alert(document.cookie)')).toBe(false);
      expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isSafeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe(false);
      expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
      expect(isSafeUrl('file:///etc/passwd')).toBe(false);
      expect(isSafeUrl('ftp://malicious.org/payload.exe')).toBe(false);
      expect(isSafeUrl('chrome://settings')).toBe(false);
      expect(isSafeUrl('//evil.com/fake-login')).toBe(false);
      expect(isSafeUrl('not a url at all')).toBe(false);
      expect(isSafeUrl('')).toBe(false);
    });

    it('3.2 parseWhatsAppMessage: malicious URLs (javascript:, data:) are NOT rendered as hyperlinks', () => {
      const maliciousPayloads = [
        'Haz clic aquí: javascript:evil()',
        'javascript:alert(document.cookie)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox("owned")',
        'file:///C:/Windows/System32/calc.exe',
      ];

      for (const payload of maliciousPayloads) {
        const nodes = parseWhatsAppMessage(payload);
        const html = ReactDOMServer.renderToStaticMarkup(React.createElement(React.Fragment, null, nodes));
        expect(html).not.toContain('<a href="javascript:');
        expect(html).not.toContain('<a href="data:');
        expect(html).not.toContain('<a href="vbscript:');
        expect(html).not.toContain('<a href="file:');
        expect(html).not.toContain('<a ');
      }
    });

    it('3.3 parseWhatsAppMessage: nested formatting (*bold _italic_* / _italic *bold*_ / ~strike *bold*~)', () => {
      const testCases = [
        { input: '*bold _italic_*' },
        { input: '_italic *bold*_' },
        { input: '~strike *bold*~' },
      ];

      for (const tc of testCases) {
        const nodes = parseWhatsAppMessage(tc.input);
        const html = ReactDOMServer.renderToStaticMarkup(React.createElement(React.Fragment, null, nodes));
        expect(html).toBeDefined();
        if (tc.input.startsWith('*')) {
          expect(html).toContain('<strong');
        } else if (tc.input.startsWith('_')) {
          expect(html).toContain('<em');
        } else if (tc.input.startsWith('~')) {
          expect(html).toContain('<del');
        }
      }
    });

    it('3.4 parseWhatsAppMessage: resilient against unmatched delimiters (*, _, ~, `, ```)', () => {
      const brokenDelimiters = [
        '*unclosed bold',
        '_unclosed italic',
        '~unclosed strike',
        '`unclosed inline code',
        '```unclosed code block',
        '***',
        '____',
        '~~~~',
        '````',
        '* *',
        '_ _',
        '~ ~',
        '*a *b *c *d *e',
        'Normal text * half formatted _ and more',
      ];

      for (const broken of brokenDelimiters) {
        const nodes = parseWhatsAppMessage(broken);
        const html = ReactDOMServer.renderToStaticMarkup(React.createElement(React.Fragment, null, nodes));
        expect(html).toBeDefined();
        expect(typeof html).toBe('string');
      }
    });

    it('3.5 parseWhatsAppMessage: payload boundary protection around 4096 character threshold', () => {
      const belowLimit = 'A'.repeat(4095);
      const htmlBelow = ReactDOMServer.renderToStaticMarkup(
        React.createElement(React.Fragment, null, parseWhatsAppMessage(belowLimit))
      );
      expect(htmlBelow).not.toContain('[Mensaje truncado por seguridad]');

      const exactLimit = 'B'.repeat(4096);
      const htmlExact = ReactDOMServer.renderToStaticMarkup(
        React.createElement(React.Fragment, null, parseWhatsAppMessage(exactLimit))
      );
      expect(htmlExact).not.toContain('[Mensaje truncado por seguridad]');

      const aboveLimit = 'C'.repeat(4097);
      const htmlAbove = ReactDOMServer.renderToStaticMarkup(
        React.createElement(React.Fragment, null, parseWhatsAppMessage(aboveLimit))
      );
      expect(htmlAbove).toContain('[Mensaje truncado por seguridad]');

      const extreme = 'D'.repeat(50000);
      const start = performance.now();
      const htmlExtreme = ReactDOMServer.renderToStaticMarkup(
        React.createElement(React.Fragment, null, parseWhatsAppMessage(extreme))
      );
      const duration = performance.now() - start;

      expect(htmlExtreme).toContain('[Mensaje truncado por seguridad]');
      expect(duration).toBeLessThan(100);
    });

    it('3.6 parseWhatsAppMessage: XSS injection defense with HTML payloads', () => {
      const xssVectors = [
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '<svg onload=alert(1)>',
        '<iframe src="javascript:alert(1)"></iframe>',
        '"><script>alert(document.cookie)</script>',
        '<<SCRIPT>alert("XSS");//<</SCRIPT>',
      ];

      for (const vector of xssVectors) {
        const nodes = parseWhatsAppMessage(vector);
        const html = ReactDOMServer.renderToStaticMarkup(React.createElement(React.Fragment, null, nodes));
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<img src=x');
        expect(html).not.toContain('<svg onload=');
        expect(html).not.toContain('<iframe');
      }
    });

    it('3.7 parseWhatsAppMessage: ReDoS attack vectors execute in milliseconds', () => {
      const redosAttacks = [
        '*a*'.repeat(1000),
        '*'.repeat(4096),
        '_'.repeat(4096),
        '~'.repeat(4096),
        '`'.repeat(4096),
        'http://'.repeat(500),
      ];

      for (const attack of redosAttacks) {
        const start = performance.now();
        const nodes = parseWhatsAppMessage(attack);
        ReactDOMServer.renderToStaticMarkup(React.createElement(React.Fragment, null, nodes));
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(150);
      }
    });

    it('3.8 formatWhatsAppPreview: adversarial inputs and boundary behavior', () => {
      expect(formatWhatsAppPreview(null)).toBe('');
      expect(formatWhatsAppPreview(undefined)).toBe('');
      expect(formatWhatsAppPreview('')).toBe('');

      const codeMsg = 'Resumen:\n```\nDetalles del pedido...\n```\nTotal: $250';
      const previewCode = formatWhatsAppPreview(codeMsg, 60);
      expect(previewCode).toContain('[código]');
      expect(previewCode).toContain('Total: $250');
      expect(previewCode).not.toContain('```');

      const formatted = '*Negrita* _cursiva_ ~tachado~ `codigo`';
      expect(formatWhatsAppPreview(formatted, 60)).toBe('Negrita cursiva tachado codigo');

      const massive = 'X '.repeat(10000);
      const start = performance.now();
      const previewMassive = formatWhatsAppPreview(massive, 50);
      const elapsed = performance.now() - start;

      expect(previewMassive.length).toBeLessThanOrEqual(53);
      expect(previewMassive.endsWith('...')).toBe(true);
      expect(elapsed).toBeLessThan(50);
    });
  });
});
