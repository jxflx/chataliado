import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, fetchMock } from 'cloudflare:test';

const VALID_CHATWOOT_TOKEN = 'test-chatwoot-webhook-token';

describe('ChatAliado Worker — End-to-End Chatwoot Webhook Route', () => {
  beforeEach(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();

    // Mock para Evolution API si se envía mensaje
    fetchMock
      .get('http://evolution-api:8080')
      .intercept({ path: /^\/message\//, method: 'POST' })
      .reply(200, { key: { id: 'MSG_OUTBOUND_WA_123' } })
      .persist();

    // Mock para Supabase REST
    fetchMock
      .get('https://local-test.supabase.co')
      .intercept({ path: /.*/, method: /.*/ })
      .reply(200, [])
      .persist();
  });

  describe('CORS Preflight (OPTIONS /webhook/chatwoot)', () => {
    it('debe responder 204 No Content con headers CORS completos', async () => {
      const response = await SELF.fetch('http://localhost/webhook/chatwoot', {
        method: 'OPTIONS',
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });
  });

  describe('POST /webhook/chatwoot — Authentication', () => {
    it('debe rechazar con HTTP 401 si no incluye token de webhook', async () => {
      const response = await SELF.fetch('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'message_created' }),
      });

      expect(response.status).toBe(401);
      const json = await response.json<{ error: string }>();
      expect(json.error).toContain('Missing Chatwoot webhook');
    });

    it('debe rechazar con HTTP 401 si el token es inválido', async () => {
      const response = await SELF.fetch('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-token': 'token-invalido-xyz',
        },
        body: JSON.stringify({ event: 'message_created' }),
      });

      expect(response.status).toBe(401);
      const json = await response.json<{ error: string }>();
      expect(json.error).toContain('Invalid Chatwoot webhook token');
    });
  });

  describe('POST /webhook/chatwoot — Event Handling', () => {
    it('debe responder HTTP 200 con status discarded para notas privadas', async () => {
      const payload = {
        event: 'message_created',
        id: 555,
        content: 'Nota interna entre agentes',
        private: true,
        message_type: 'outgoing',
        conversation: { id: 10, custom_attributes: { restaurant_id: 'rest-1' } },
      };

      const response = await SELF.fetch('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-token': VALID_CHATWOOT_TOKEN,
        },
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(200);
      const json = await response.json<{ status: string; reason: string }>();
      expect(json.status).toBe('discarded');
      expect(json.reason).toBe('private_note');
    });

    it('debe responder HTTP 200 para mensaje saliente de agente humano', async () => {
      const payload = {
        event: 'message_created',
        id: 556,
        content: 'Tu pizza ya está lista para entrega.',
        private: false,
        message_type: 'outgoing',
        sender: { id: 2, name: 'Asesor Carlos', type: 'user' },
        contact: { id: 8, phone_number: '+5215512345678' },
        conversation: {
          id: 10,
          custom_attributes: {
            restaurant_id: '00000000-0000-0000-0000-000000000001',
            restaurant_slug: 'pizzeria-napoli',
          },
        },
      };

      const response = await SELF.fetch('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-token': VALID_CHATWOOT_TOKEN,
        },
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(200);
      const json = await response.json<{ status: string }>();
      expect(json.status).toBe('dispatched_to_whatsapp');
    });

    it('debe responder HTTP 200 con status resolved_mode_ai al recibir resolución de conversación', async () => {
      const payload = {
        event: 'conversation_status_changed',
        id: 10,
        status: 'resolved',
        conversation: {
          id: 10,
          status: 'resolved',
          custom_attributes: {
            restaurant_id: '00000000-0000-0000-0000-000000000001',
            conversation_id: '11111111-2222-3333-4444-555555555555',
          },
        },
      };

      const response = await SELF.fetch('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-token': VALID_CHATWOOT_TOKEN,
        },
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(200);
      const json = await response.json<{ status: string; restaurantId: string }>();
      expect(json.status).toBe('resolved_mode_ai');
      expect(json.restaurantId).toBe('00000000-0000-0000-0000-000000000001');
    });
  });
});
