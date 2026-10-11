import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database } from '../src/types/database';
import { type Env } from '../src/types/env';
import { AuthenticationError, ValidationError } from '../src/utils/errors';
import { verifyChatwootWebhookAuth } from '../src/webhooks/chatwoot/auth';
import { handleChatwootWebhook } from '../src/webhooks/chatwoot/handler';
import { parseChatwootWebhook } from '../src/schemas/chatwoot';
import { type WhatsAppProvider } from '../src/providers/whatsapp/interface';
import { ConversationRepository } from '../src/services/db/conversation-repository';
import { MessageRepository } from '../src/services/db/message-repository';
import { RestaurantRepository } from '../src/services/db/restaurant-repository';
import { CustomerRepository } from '../src/services/db/customer-repository';

describe('CHALLENGER-1 ADVERSARIAL FUZZING SUITE: Inbound Webhook Security & Payload Robustness', () => {
  const VALID_TOKEN = 'secret-chatwoot-webhook-token-456';
  const RESTAURANT_ID = '00000000-0000-0000-0000-000000000001';
  const CONVERSATION_ID = '11111111-2222-3333-4444-555555555555';
  const CUSTOMER_PHONE = '+5215512345678';

  const mockEnv: Env = {
    EVOLUTION_API_URL: 'https://evo.test.com',
    EVOLUTION_API_KEY: 'test-evo-key',
    WEBHOOK_VERIFY_TOKEN: 'test-verify-token',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    LLM_API_KEY: 'test-llm-key',
    LLM_MODEL: 'gpt-4o-mini',
    LLM_BASE_URL: 'https://api.openai.com/v1',
    CHATWOOT_BASE_URL: 'https://chatwoot.test.com',
    CHATWOOT_API_TOKEN: 'test-cw-token',
    CHATWOOT_ACCOUNT_ID: '1',
    CHATWOOT_INBOX_ID: '1',
    CHATWOOT_WEBHOOK_TOKEN: VALID_TOKEN,
  };

  let mockWhatsAppProvider: WhatsAppProvider;
  let savedMessages: Array<Record<string, unknown>>;
  let conversationModes: Record<string, 'ai' | 'human'>;

  beforeEach(() => {
    savedMessages = [];
    conversationModes = { [CONVERSATION_ID]: 'human' };

    mockWhatsAppProvider = {
      sendTextMessage: vi.fn().mockResolvedValue({
        success: true,
        messageId: 'wa-msg-123',
      }),
      sendMediaMessage: vi.fn(),
      markAsRead: vi.fn(),
    };
  });

  const mockConvoRepo = {
    setMode: vi.fn(async (restaurantId: string, convId: string, mode: 'ai' | 'human') => {
      conversationModes[convId] = mode;
      return {
        id: convId,
        restaurant_id: restaurantId,
        mode,
        status: 'open' as const,
        customer_id: 'cust-123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }),
    getOrCreateActiveConversation: vi.fn().mockResolvedValue({
      id: CONVERSATION_ID,
      restaurant_id: RESTAURANT_ID,
      customer_id: 'cust-123',
      mode: 'human',
      status: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    getById: vi.fn(),
    setStatus: vi.fn(),
  } as unknown as ConversationRepository;

  const mockMsgRepo = {
    saveMessage: vi.fn(async (restaurantId: string, data: Record<string, unknown>) => {
      savedMessages.push({ ...data, restaurantId });
      return {
        id: 'msg-uuid-' + savedMessages.length,
        restaurant_id: restaurantId,
        ...data,
        created_at: new Date().toISOString(),
      };
    }),
    getRecentMessages: vi.fn(),
  } as unknown as MessageRepository;

  const mockRestaurantRepo = {
    getByIdOrSlug: vi.fn(async (_idOrSlug: string) => {
      return {
        id: RESTAURANT_ID,
        name: 'Pizzería Napoli',
        slug: 'pizzeria-napoli',
        phone: '5215512345678',
        address: 'Av Reforma 123',
        timezone: 'America/Mexico_City',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
    }),
    getAgentConfig: vi.fn(),
    getLastCompletedOrder: vi.fn(),
  } as unknown as RestaurantRepository;

  const mockCustomerRepo = {
    getByPhone: vi.fn(async () => ({
      id: 'cust-123',
      restaurant_id: RESTAURANT_ID,
      phone: CUSTOMER_PHONE,
      name: 'Cliente Test',
      address_default: null,
      notes_md: '',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })),
  } as unknown as CustomerRepository;

  /* ========================================================================== */
  /* CHALLENGE 1: Inbound Webhook Authentication & Timing-Safe Token Fuzzing    */
  /* ========================================================================== */
  describe('Challenge 1: Webhook Auth Security & Timing-Safe Verification', () => {
    it('1.1: debe rechazar tokens con longitudes distintas (vacío, 1 char, 10,000 chars)', () => {
      const shortReq = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: { 'x-webhook-token': 's' },
      });
      expect(() => verifyChatwootWebhookAuth(shortReq, mockEnv)).toThrow(AuthenticationError);

      const longReq = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: { 'x-webhook-token': 's'.repeat(10000) },
      });
      expect(() => verifyChatwootWebhookAuth(longReq, mockEnv)).toThrow(AuthenticationError);
    });

    it('1.2: debe rechazar tokens de igual longitud pero con 1 byte de diferencia', () => {
      const almostValidToken = VALID_TOKEN.slice(0, -1) + '7'; // 456 -> 457
      expect(almostValidToken.length).toBe(VALID_TOKEN.length);

      const req = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: { 'x-webhook-token': almostValidToken },
      });
      expect(() => verifyChatwootWebhookAuth(req, mockEnv)).toThrow(AuthenticationError);
      expect(() => verifyChatwootWebhookAuth(req, mockEnv)).toThrow('Invalid Chatwoot webhook token');
    });

    it('1.3: debe rechazar tokens que difieren solo por mayúsculas/minúsculas', () => {
      const upperToken = VALID_TOKEN.toUpperCase();
      const req = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: { 'x-webhook-token': upperToken },
      });
      expect(() => verifyChatwootWebhookAuth(req, mockEnv)).toThrow(AuthenticationError);
    });

    it('1.4: debe rechazar si el servidor no tiene CHATWOOT_WEBHOOK_TOKEN configurado', () => {
      const unconfiguredEnv = { ...mockEnv, CHATWOOT_WEBHOOK_TOKEN: '' };
      const req = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: { 'x-webhook-token': VALID_TOKEN },
      });
      expect(() => verifyChatwootWebhookAuth(req, unconfiguredEnv)).toThrow(
        'Chatwoot webhook token is not configured on server'
      );
    });

    it('1.5: debe resistir fuzzing de caracteres Unicode, Emojis y bytes en tokens vía query/body/headers', () => {
      const unicodeTokens = [
        'secret-chatwoot-webhook-token-🍕',
        'secret-chatwoot-token-🌮',
        'secret-chatwoot-webhook-token-456\r\n',
        ' secret-chatwoot-webhook-token-456 ',
      ];

      for (const token of unicodeTokens) {
        // Query param
        const queryReq = new Request(`http://localhost/webhook/chatwoot?token=${encodeURIComponent(token)}`, {
          method: 'POST',
        });
        expect(() => verifyChatwootWebhookAuth(queryReq, mockEnv)).toThrow(AuthenticationError);

        // Body token
        const bodyReq = new Request('http://localhost/webhook/chatwoot', { method: 'POST' });
        expect(() => verifyChatwootWebhookAuth(bodyReq, mockEnv, { token })).toThrow(AuthenticationError);
      }

      // ASCII header variations
      const headerTokens = ['secret-token-123', 'wrong-header-token', ''];
      for (const token of headerTokens) {
        const req = new Request('http://localhost/webhook/chatwoot', {
          method: 'POST',
          headers: { 'x-webhook-token': token },
        });
        expect(() => verifyChatwootWebhookAuth(req, mockEnv)).toThrow(AuthenticationError);
      }
    });

    it('1.6: debe soportar todos los vectores legítimos de token (query, headers, body)', () => {
      // Query
      const queryReq = new Request(`http://localhost/webhook/chatwoot?token=${VALID_TOKEN}`, {
        method: 'POST',
      });
      expect(() => verifyChatwootWebhookAuth(queryReq, mockEnv)).not.toThrow();

      // Headers
      const headersToTest = ['x-webhook-token', 'x-api-key', 'apikey', 'apiKey'];
      for (const h of headersToTest) {
        const hReq = new Request('http://localhost/webhook/chatwoot', {
          method: 'POST',
          headers: { [h]: VALID_TOKEN },
        });
        expect(() => verifyChatwootWebhookAuth(hReq, mockEnv)).not.toThrow();
      }

      // Authorization: Bearer
      const bearerReq = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      });
      expect(() => verifyChatwootWebhookAuth(bearerReq, mockEnv)).not.toThrow();

      // Body token y apikey
      const bodyReq = new Request('http://localhost/webhook/chatwoot', { method: 'POST' });
      expect(() => verifyChatwootWebhookAuth(bodyReq, mockEnv, { token: VALID_TOKEN })).not.toThrow();
      expect(() => verifyChatwootWebhookAuth(bodyReq, mockEnv, { apikey: VALID_TOKEN })).not.toThrow();
    });

    it('1.7: Type Confusion Defense: debe ignorar tokens no string en body (números, booleanos, arrays, objetos)', () => {
      const malformedBodies = [
        { token: 123456 },
        { token: true },
        { token: [VALID_TOKEN] },
        { token: { secret: VALID_TOKEN } },
        { token: null },
        { apikey: 99999 },
        { apikey: false },
      ];

      const req = new Request('http://localhost/webhook/chatwoot', { method: 'POST' });

      for (const b of malformedBodies) {
        expect(() => verifyChatwootWebhookAuth(req, mockEnv, b)).toThrow(AuthenticationError);
      }
    });
  });

  /* ========================================================================== */
  /* CHALLENGE 2: Malformed Payloads, Non-JSON Bodies & Unknown Event Types     */
  /* ========================================================================== */
  describe('Challenge 2: Malformed Payloads & Schema Fuzzing', () => {
    it('2.1: debe arrojar ValidationError con HTTP 400 en cuerpos no-JSON o sintácticamente corruptos', async () => {
      const corruptBodies = [
        '{invalid json',
        '<xml><event>message_created</event></xml>',
        'Plain text payload',
        '{"event": "message_created",',
        '{"event": "message_created", "id": 1,,}',
        '',
      ];

      for (const bodyStr of corruptBodies) {
        const req = new Request('http://localhost/webhook/chatwoot', {
          method: 'POST',
          headers: {
            'x-webhook-token': VALID_TOKEN,
            'Content-Type': 'application/json',
          },
          body: bodyStr,
        });

        await expect(handleChatwootWebhook(req, mockEnv)).rejects.toThrow(ValidationError);
        await expect(handleChatwootWebhook(req, mockEnv)).rejects.toThrow('Invalid JSON in request body');
      }
    });

    it('2.2: debe descartar con HTTP 200 y status: discarded si el JSON es un primitivo o array', async () => {
      const nonObjectJSONs = ['12345', '"hello"', 'true', 'null', '["array", "of", "items"]'];

      for (const jsonStr of nonObjectJSONs) {
        const req = new Request('http://localhost/webhook/chatwoot', {
          method: 'POST',
          headers: {
            'x-webhook-token': VALID_TOKEN,
            'Content-Type': 'application/json',
          },
          body: jsonStr,
        });

        const res = await handleChatwootWebhook(req, mockEnv);
        expect(res.status).toBe(200);
        const data = await res.json<{ status: string; reason: string }>();
        expect(data.status).toBe('discarded');
        expect(data.reason).toBe('unsupported_event');
      }
    });

    it('2.3: debe descartar limpiamente eventos desconocidos o no soportados de Chatwoot', async () => {
      const unsupportedEvents = [
        { event: 'conversation_created', id: 100 },
        { event: 'contact_created', id: 200 },
        { event: 'webwidget_triggered', id: 300 },
        { event: 'message_updated', id: 400 },
        { event: 'custom_fuzz_event_xyz', id: 500 },
        { event: '' },
      ];

      for (const payload of unsupportedEvents) {
        const req = new Request('http://localhost/webhook/chatwoot', {
          method: 'POST',
          headers: {
            'x-webhook-token': VALID_TOKEN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const res = await handleChatwootWebhook(req, mockEnv);
        expect(res.status).toBe(200);
        const data = await res.json<{ status: string; reason: string }>();
        expect(data.status).toBe('discarded');
        expect(data.reason).toBe('unsupported_event');
      }
    });

    it('2.4: parseChatwootWebhook debe clasificar como descartado y no crashear con payloads incompletos o corruptos', () => {
      const brokenPayloads = [
        {},
        { event: 'message_created' }, // sin id ni conversation ni content -> discarded
        { event: 'message_created', id: 1 }, // sin conversation -> discarded
        { event: 'conversation_status_changed' }, // sin id ni status -> discarded
        { event: 'conversation_status_changed', id: 1, status: 'invalid_status_enum' },
      ];

      for (const p of brokenPayloads) {
        const parsed = parseChatwootWebhook(p);
        expect(parsed.kind).toBe('discarded');
        if (parsed.kind === 'discarded') {
          expect(['unsupported_event', 'empty_content', 'missing_tenant_id']).toContain(parsed.reason);
        }
      }
    });
  });

  /* ========================================================================== */
  /* CHALLENGE 3: Private Notes Leak Prevention & Filtering                     */
  /* ========================================================================== */
  describe('Challenge 3: Private Notes Strict Isolation & Zero WhatsApp Leaks', () => {
    it('3.1: debe descartar notas privadas (private: true) y NUNCA enviarlas a WhatsApp ni guardarlas como human_agent', async () => {
      const privateNotePayload = {
        event: 'message_created',
        id: 9001,
        content: '🔒 NOTA PRIVADA CONFIDENCIAL: El comensal es intolerante al gluten y pidió descuento',
        private: true,
        message_type: 'outgoing',
        conversation: {
          id: 50,
          custom_attributes: {
            restaurant_id: RESTAURANT_ID,
            conversation_id: CONVERSATION_ID,
          },
        },
        contact: {
          phone_number: CUSTOMER_PHONE,
        },
      };

      const req = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': VALID_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(privateNotePayload),
      });

      const res = await handleChatwootWebhook(req, mockEnv, undefined, {
        customProvider: mockWhatsAppProvider,
        customConversationRepo: mockConvoRepo,
        customMessageRepo: mockMsgRepo,
        customRestaurantRepo: mockRestaurantRepo,
        customCustomerRepo: mockCustomerRepo,
      });

      expect(res.status).toBe(200);
      const data = await res.json<{ status: string; reason: string }>();
      expect(data.status).toBe('discarded');
      expect(data.reason).toBe('private_note');

      // VERIFICACIÓN EMPÍRICA CRÍTICA: CERO ENVÍOS A WHATSAPP
      expect(mockWhatsAppProvider.sendTextMessage).not.toHaveBeenCalled();

      // CERO MENSAJES GUARDADOS COMO HUMAN_AGENT
      expect(savedMessages).toHaveLength(0);
    });

    it('3.2: debe descartar mensajes con message_type = activity o template', async () => {
      const activityPayload = {
        event: 'message_created',
        id: 9002,
        content: 'Marco se asignó la conversación',
        private: false,
        message_type: 'activity',
        conversation: {
          id: 50,
          custom_attributes: { restaurant_id: RESTAURANT_ID },
        },
        contact: { phone_number: CUSTOMER_PHONE },
      };

      const req = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': VALID_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(activityPayload),
      });

      const res = await handleChatwootWebhook(req, mockEnv, undefined, {
        customProvider: mockWhatsAppProvider,
      });

      expect(res.status).toBe(200);
      const data = await res.json<{ status: string; reason: string }>();
      expect(data.status).toBe('discarded');
      expect(data.reason).toBe('activity_message');
      expect(mockWhatsAppProvider.sendTextMessage).not.toHaveBeenCalled();
    });

    it('3.3: debe descartar mensajes con emisor bot (sender.type = "agent_bot")', async () => {
      const botMsgPayload = {
        event: 'message_created',
        id: 9003,
        content: 'Mensaje generado por bot secundario',
        private: false,
        message_type: 'outgoing',
        sender: {
          id: 1,
          name: 'Chatwoot Bot',
          type: 'agent_bot',
        },
        conversation: {
          id: 50,
          custom_attributes: { restaurant_id: RESTAURANT_ID },
        },
        contact: { phone_number: CUSTOMER_PHONE },
      };

      const req = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': VALID_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(botMsgPayload),
      });

      const res = await handleChatwootWebhook(req, mockEnv, undefined, {
        customProvider: mockWhatsAppProvider,
      });

      expect(res.status).toBe(200);
      const data = await res.json<{ status: string; reason: string }>();
      expect(data.status).toBe('discarded');
      expect(data.reason).toBe('bot_sender');
      expect(mockWhatsAppProvider.sendTextMessage).not.toHaveBeenCalled();
    });

    it('3.4: debe descartar mensajes con contenido vacío o compuesto exclusivamente de espacios en blanco', async () => {
      const emptyPayload = {
        event: 'message_created',
        id: 9004,
        content: '   \n\t  ',
        private: false,
        message_type: 'outgoing',
        conversation: {
          id: 50,
          custom_attributes: { restaurant_id: RESTAURANT_ID },
        },
        contact: { phone_number: CUSTOMER_PHONE },
      };

      const req = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': VALID_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emptyPayload),
      });

      const res = await handleChatwootWebhook(req, mockEnv, undefined, {
        customProvider: mockWhatsAppProvider,
      });

      expect(res.status).toBe(200);
      const data = await res.json<{ status: string; reason: string }>();
      expect(data.status).toBe('discarded');
      expect(data.reason).toBe('empty_content');
      expect(mockWhatsAppProvider.sendTextMessage).not.toHaveBeenCalled();
    });
  });

  /* ========================================================================== */
  /* CHALLENGE 4: Customer Echoes & Infinite Loop Prevention                    */
  /* ========================================================================== */
  describe('Challenge 4: Echo Loop Prevention & State Transition Safety', () => {
    it('4.1: debe descartar mensajes entrantes del comensal (message_type: "incoming") para prevenir loops de eco', async () => {
      const incomingPayload = {
        event: 'message_created',
        id: 8888,
        content: 'Hola, ¿a qué hora cierran?',
        private: false,
        message_type: 'incoming', // Emisor es el comensal
        conversation: {
          id: 50,
          custom_attributes: {
            restaurant_id: RESTAURANT_ID,
            conversation_id: CONVERSATION_ID,
          },
        },
        contact: { phone_number: CUSTOMER_PHONE },
      };

      const req = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': VALID_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(incomingPayload),
      });

      const res = await handleChatwootWebhook(req, mockEnv, undefined, {
        customProvider: mockWhatsAppProvider,
        customMessageRepo: mockMsgRepo,
      });

      expect(res.status).toBe(200);
      const data = await res.json<{ status: string; reason: string }>();
      expect(data.status).toBe('discarded');
      expect(data.reason).toBe('incoming_message');

      // No dispara WhatsApp ni genera turnos duplicados
      expect(mockWhatsAppProvider.sendTextMessage).not.toHaveBeenCalled();
      expect(savedMessages).toHaveLength(0);
    });

    it('4.2: conversation_status_changed con status != "resolved" (ej: "open", "pending", "snoozed") NO debe reactivar modo AI', async () => {
      const pendingPayload = {
        event: 'conversation_status_changed',
        id: 50,
        status: 'pending',
        conversation: {
          id: 50,
          status: 'pending',
          custom_attributes: {
            restaurant_id: RESTAURANT_ID,
            conversation_id: CONVERSATION_ID,
          },
        },
      };

      const req = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': VALID_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pendingPayload),
      });

      const res = await handleChatwootWebhook(req, mockEnv, undefined, {
        customConversationRepo: mockConvoRepo,
      });

      expect(res.status).toBe(200);
      const data = await res.json<{ status: string; reason: string }>();
      expect(data.status).toBe('discarded');
      expect(data.reason).toBe('unsupported_event');

      // El modo sigue en 'human'
      expect(conversationModes[CONVERSATION_ID]).toBe('human');
      expect(mockConvoRepo.setMode).not.toHaveBeenCalled();
    });

    it('4.3: conversation_status_changed con status == "resolved" reactiva conversations.mode = "ai"', async () => {
      const resolvedPayload = {
        event: 'conversation_status_changed',
        id: 50,
        status: 'resolved',
        conversation: {
          id: 50,
          status: 'resolved',
          custom_attributes: {
            restaurant_id: RESTAURANT_ID,
            conversation_id: CONVERSATION_ID,
          },
        },
      };

      const req = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': VALID_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(resolvedPayload),
      });

      const res = await handleChatwootWebhook(req, mockEnv, undefined, {
        customConversationRepo: mockConvoRepo,
        customMessageRepo: mockMsgRepo,
      });

      expect(res.status).toBe(200);
      const data = await res.json<{ status: string; restaurantId: string }>();
      expect(data.status).toBe('resolved_mode_ai');
      expect(data.restaurantId).toBe(RESTAURANT_ID);

      // Verificación empírica de mutación de modo
      expect(mockConvoRepo.setMode).toHaveBeenCalledWith(RESTAURANT_ID, CONVERSATION_ID, 'ai');
      expect(conversationModes[CONVERSATION_ID]).toBe('ai');
    });
  });

  /* ========================================================================== */
  /* CHALLENGE 5: Multi-Tenant Boundary Enforcement & Phone Resolution         */
  /* ========================================================================== */
  describe('Challenge 5: Multi-Tenant Boundary & Phone Resolution', () => {
    it('5.1: debe descartar de inmediato si falta restaurant_id en custom_attributes de conversación y contacto', async () => {
      const noTenantPayload = {
        event: 'message_created',
        id: 5555,
        content: 'Hola, soy un asesor respondiendo a una conversación huérfana',
        private: false,
        message_type: 'outgoing',
        conversation: {
          id: 50,
          custom_attributes: {}, // sin restaurant_id
        },
        contact: {
          phone_number: CUSTOMER_PHONE,
          custom_attributes: {}, // sin restaurant_id
        },
      };

      const req = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': VALID_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(noTenantPayload),
      });

      const res = await handleChatwootWebhook(req, mockEnv, undefined, {
        customProvider: mockWhatsAppProvider,
        customMessageRepo: mockMsgRepo,
      });

      expect(res.status).toBe(200);
      const data = await res.json<{ status: string; reason: string }>();
      expect(data.status).toBe('discarded');
      expect(data.reason).toBe('missing_tenant_id');

      // No se tocó la base de datos ni WhatsApp
      expect(mockWhatsAppProvider.sendTextMessage).not.toHaveBeenCalled();
      expect(savedMessages).toHaveLength(0);
    });

    it('5.2: debe descartar si falta el teléfono del comensal', async () => {
      const noPhonePayload = {
        event: 'message_created',
        id: 5556,
        content: 'Hola sin teléfono',
        private: false,
        message_type: 'outgoing',
        conversation: {
          id: 50,
          custom_attributes: { restaurant_id: RESTAURANT_ID },
        },
        contact: {
          // sin phone_number
        },
      };

      const req = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': VALID_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(noPhonePayload),
      });

      const res = await handleChatwootWebhook(req, mockEnv, undefined, {
        customProvider: mockWhatsAppProvider,
      });

      expect(res.status).toBe(200);
      const data = await res.json<{ status: string; reason: string }>();
      expect(data.status).toBe('discarded');
      expect(data.reason).toBe('missing_phone');
      expect(mockWhatsAppProvider.sendTextMessage).not.toHaveBeenCalled();
    });

    it('5.3: debe resolver conversación activa por teléfono si conversation_id no viene en custom_attributes', async () => {
      const fallbackPayload = {
        event: 'message_created',
        id: 7777,
        content: 'Mensaje de asesor con resolución de conversación por teléfono',
        private: false,
        message_type: 'outgoing',
        sender: { id: 3, name: 'Operador Soporte' },
        conversation: {
          id: 50,
          custom_attributes: {
            restaurant_id: RESTAURANT_ID,
            // conversation_id ausente
          },
        },
        contact: {
          phone_number: CUSTOMER_PHONE,
        },
      };

      const req = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': VALID_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fallbackPayload),
      });

      const res = await handleChatwootWebhook(req, mockEnv, undefined, {
        customProvider: mockWhatsAppProvider,
        customCustomerRepo: mockCustomerRepo,
        customConversationRepo: mockConvoRepo,
        customMessageRepo: mockMsgRepo,
        customRestaurantRepo: mockRestaurantRepo,
      });

      expect(res.status).toBe(200);
      const data = await res.json<{ status: string; messageId: string }>();
      expect(data.status).toBe('dispatched_to_whatsapp');
      expect(data.messageId).toBe('7777');

      // Verificamos que se buscó cliente por teléfono
      expect(mockCustomerRepo.getByPhone).toHaveBeenCalledWith(RESTAURANT_ID, CUSTOMER_PHONE);
      expect(mockConvoRepo.getOrCreateActiveConversation).toHaveBeenCalledWith(RESTAURANT_ID, 'cust-123');

      // Verificamos que el mensaje fue guardado con role 'human_agent'
      expect(mockMsgRepo.saveMessage).toHaveBeenCalledWith(
        RESTAURANT_ID,
        expect.objectContaining({
          conversation_id: CONVERSATION_ID,
          role: 'human_agent',
          content: 'Mensaje de asesor con resolución de conversación por teléfono',
        })
      );

      // Verificamos envío a WhatsApp
      expect(mockWhatsAppProvider.sendTextMessage).toHaveBeenCalledWith(
        'pizzeria-napoli',
        CUSTOMER_PHONE,
        'Mensaje de asesor con resolución de conversación por teléfono'
      );
    });
  });
});
