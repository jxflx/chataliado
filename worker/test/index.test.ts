import { describe, it, expect, beforeEach } from 'vitest';
import { SELF, fetchMock } from 'cloudflare:test';

const VALID_TOKEN = 'test-webhook-verify-token-123';

function buildMessagePayload(overrides: Record<string, unknown> = {}) {
  return {
    event: 'messages.upsert',
    instance: 'pizzeria-test',
    data: {
      key: {
        remoteJid: '5215512345678@s.whatsapp.net',
        fromMe: false,
        id: 'MSG_WEBHOOK_001',
      },
      pushName: 'Juan Pérez',
      message: {
        conversation: 'Hola, buenas tardes',
      },
      messageType: 'conversation',
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
    sender: '5215512345678@s.whatsapp.net',
    apikey: 'test-key',
    ...overrides,
  };
}

describe('ChatAliado Worker — End-to-End HTTP Router', () => {
  beforeEach(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock
      .get('http://evolution-api:8080')
      .intercept({ path: /^\/message\//, method: 'POST' })
      .reply(200, { key: { id: 'MSG_ECHO_OUTBOUND_123' } })
      .persist();
  });
  describe('GET /health', () => {
    it('should return 200 with ok status and timestamp', async () => {
      const response = await SELF.fetch('http://localhost/health');
      expect(response.status).toBe(200);

      const body = await response.json<{ status: string; service: string; timestamp: string }>();
      expect(body.status).toBe('ok');
      expect(body.service).toBe('chataliado-worker');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('POST /webhook/evolution — Authentication', () => {
    it('should return 401 when no authentication is provided (no headers, no body.apikey)', async () => {
      const response = await SELF.fetch('http://localhost/webhook/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildMessagePayload({ apikey: undefined })),
      });

      expect(response.status).toBe(401);
      const body = await response.json<{ error: string }>();
      expect(body.error).toBe('Missing authentication token');
    });

    it('should return 200 when body.apikey matches EVOLUTION_API_KEY (no header needed)', async () => {
      // Evolution API sends its global apikey in the webhook body
      const response = await SELF.fetch('http://localhost/webhook/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildMessagePayload({ apikey: 'test-evo-api-key' })),
      });

      expect(response.status).toBe(200);
      const body = await response.json<{ received: boolean; status: string }>();
      expect(body.received).toBe(true);
      expect(body.status).toBe('processed');
    });

    it('should return 401 when x-api-key header is incorrect', async () => {
      const response = await SELF.fetch('http://localhost/webhook/evolution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'wrong-secret-token',
        },
        body: JSON.stringify(buildMessagePayload()),
      });

      expect(response.status).toBe(401);
      const body = await response.json<{ error: string }>();
      expect(body.error).toBe('Invalid webhook token');
    });
  });

  describe('POST /webhook/evolution — Payload Validation', () => {
    it('should return 400 when body is not valid JSON', async () => {
      const response = await SELF.fetch('http://localhost/webhook/evolution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': VALID_TOKEN,
        },
        body: 'invalid-non-json-string{',
      });

      expect(response.status).toBe(400);
      const body = await response.json<{ error: string }>();
      expect(body.error).toBe('Invalid JSON in request body');
    });

    it('should return 400 when payload does not meet Zod schema requirements', async () => {
      const response = await SELF.fetch('http://localhost/webhook/evolution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': VALID_TOKEN,
        },
        body: JSON.stringify({ invalid: 'payload' }),
      });

      expect(response.status).toBe(400);
      const body = await response.json<{ error: string }>();
      expect(body.error).toContain('Invalid webhook payload');
    });
  });

  describe('POST /webhook/evolution — Successful Processing', () => {
    it('should return 200 with status: processed for valid incoming user message', async () => {
      const response = await SELF.fetch('http://localhost/webhook/evolution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': VALID_TOKEN,
        },
        body: JSON.stringify(buildMessagePayload({
          data: {
            key: {
              remoteJid: '5215512345678@s.whatsapp.net',
              fromMe: false,
              id: 'MSG_PROCESS_TEST_001',
            },
            pushName: 'Juan Pérez',
            message: { conversation: 'Hola, buenas tardes' },
            messageType: 'conversation',
            messageTimestamp: Math.floor(Date.now() / 1000),
          },
        })),
      });

      expect(response.status).toBe(200);
      const body = await response.json<{
        received: boolean;
        status: string;
        messageId: string;
        sender: string;
        senderName: string;
        instance: string;
      }>();

      expect(body.received).toBe(true);
      expect(body.status).toBe('processed');
      expect(body.messageId).toBe('MSG_PROCESS_TEST_001');
      expect(body.sender).toBe('5215512345678');
      expect(body.senderName).toBe('Juan Pérez');
      expect(body.instance).toBe('pizzeria-test');
    });

    it('should return 200 with status: discarded when message is from bot itself (fromMe: true)', async () => {
      const payload = buildMessagePayload({
        data: {
          key: {
            remoteJid: '5215512345678@s.whatsapp.net',
            fromMe: true,
            id: 'MSG_FROM_ME',
          },
          pushName: 'Bot',
          message: { conversation: 'Respuesta automática' },
        },
      });

      const response = await SELF.fetch('http://localhost/webhook/evolution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': VALID_TOKEN,
        },
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(200);
      const body = await response.json<{
        received: boolean;
        status: string;
        reason: string;
        instance: string;
      }>();

      expect(body.received).toBe(true);
      expect(body.status).toBe('discarded');
      expect(body.reason).toBe('from_me');
      expect(body.instance).toBe('pizzeria-test');
    });

    it('should return 200 with status: discarded for group messages (@g.us)', async () => {
      const payload = buildMessagePayload({
        data: {
          key: {
            remoteJid: '120363012345678@g.us',
            fromMe: false,
            id: 'MSG_GROUP',
          },
          pushName: 'GroupMember',
          message: { conversation: 'Mensaje de grupo' },
        },
      });

      const response = await SELF.fetch('http://localhost/webhook/evolution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': VALID_TOKEN,
        },
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(200);
      const body = await response.json<{
        received: boolean;
        status: string;
        reason: string;
      }>();

      expect(body.received).toBe(true);
      expect(body.status).toBe('discarded');
      expect(body.reason).toBe('group_message');
    });
  });

  describe('Unknown routes and methods', () => {
    it('should return 404 for unknown route', async () => {
      const response = await SELF.fetch('http://localhost/api/unknown');
      expect(response.status).toBe(404);

      const body = await response.json<{ error: string; path: string }>();
      expect(body.error).toBe('Not Found');
      expect(body.path).toBe('/api/unknown');
    });

    it('should return 404 for unsupported method on known route', async () => {
      const response = await SELF.fetch('http://localhost/health', {
        method: 'PUT',
      });
      expect(response.status).toBe(404);
    });
  });
});
