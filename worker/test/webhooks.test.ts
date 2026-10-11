import { describe, it, expect } from 'vitest';
import { parseEvolutionWebhook } from '../src/webhooks/parser';
import { verifyWebhookAuth } from '../src/webhooks/auth';
import { ValidationError, AuthenticationError } from '../src/utils/errors';
import type { ParsedMessage, DiscardedMessage } from '../src/webhooks/schemas';

// --- Helper to build Evolution API payloads ---
function buildPayload(overrides: Record<string, unknown> = {}) {
  return {
    event: 'messages.upsert',
    instance: 'pizzeria-test',
    data: {
      key: {
        remoteJid: '5215512345678@s.whatsapp.net',
        fromMe: false,
        id: 'MSG_001',
      },
      pushName: 'Juan',
      message: {
        conversation: 'Quiero una pepperoni grande',
      },
      messageType: 'conversation',
      messageTimestamp: 1724080000,
    },
    sender: '5215512345678@s.whatsapp.net',
    apikey: 'test-key',
    ...overrides,
  };
}

// --- parseEvolutionWebhook tests ---

describe('parseEvolutionWebhook', () => {
  describe('valid text messages', () => {
    it('should parse a simple conversation message', () => {
      const result = parseEvolutionWebhook(buildPayload());
      expect(result.kind).toBe('message');

      const msg = result as ParsedMessage;
      expect(msg.instanceId).toBe('pizzeria-test');
      expect(msg.senderPhone).toBe('5215512345678');
      expect(msg.senderName).toBe('Juan');
      expect(msg.messageText).toBe('Quiero una pepperoni grande');
      expect(msg.messageId).toBe('MSG_001');
      expect(msg.timestamp).toBe(1724080000);
    });

    it('should parse an extendedTextMessage', () => {
      const payload = buildPayload({
        data: {
          key: {
            remoteJid: '5215512345678@s.whatsapp.net',
            fromMe: false,
            id: 'MSG_002',
          },
          pushName: 'Carlos',
          message: {
            extendedTextMessage: {
              text: 'Hola, quiero hacer un pedido https://menu.com',
            },
          },
          messageType: 'extendedTextMessage',
          messageTimestamp: 1724080100,
        },
      });

      const result = parseEvolutionWebhook(payload);
      expect(result.kind).toBe('message');

      const msg = result as ParsedMessage;
      expect(msg.senderName).toBe('Carlos');
      expect(msg.messageText).toBe('Hola, quiero hacer un pedido https://menu.com');
    });

    it('should parse an image message with caption', () => {
      const payload = buildPayload({
        data: {
          key: {
            remoteJid: '5215598765432@s.whatsapp.net',
            fromMe: false,
            id: 'MSG_003',
          },
          pushName: 'Maria',
          message: {
            imageMessage: {
              caption: 'Este es el comprobante de pago',
              mimetype: 'image/jpeg',
            },
          },
          messageType: 'imageMessage',
          messageTimestamp: 1724080200,
        },
      });

      const result = parseEvolutionWebhook(payload);
      expect(result.kind).toBe('message');

      const msg = result as ParsedMessage;
      expect(msg.senderName).toBe('Maria');
      expect(msg.messageText).toBe('Este es el comprobante de pago');
    });

    it('should handle string timestamps', () => {
      const payload = buildPayload({
        data: {
          key: {
            remoteJid: '5215512345678@s.whatsapp.net',
            fromMe: false,
            id: 'MSG_004',
          },
          pushName: 'Pedro',
          message: { conversation: 'Hola' },
          messageTimestamp: '1724080300',
        },
      });

      const result = parseEvolutionWebhook(payload);
      expect(result.kind).toBe('message');
      expect((result as ParsedMessage).timestamp).toBe(1724080300);
    });

    it('should default senderName to Unknown when pushName is missing', () => {
      const payload = buildPayload({
        data: {
          key: {
            remoteJid: '5215512345678@s.whatsapp.net',
            fromMe: false,
            id: 'MSG_005',
          },
          message: { conversation: 'Hola' },
          messageTimestamp: 1724080000,
        },
      });

      const result = parseEvolutionWebhook(payload);
      expect(result.kind).toBe('message');
      expect((result as ParsedMessage).senderName).toBe('Unknown');
    });
  });

  describe('discarded messages', () => {
    it('should discard messages from the bot itself (fromMe: true)', () => {
      const payload = buildPayload({
        data: {
          key: {
            remoteJid: '5215512345678@s.whatsapp.net',
            fromMe: true,
            id: 'MSG_SELF',
          },
          message: { conversation: 'Auto-reply' },
          messageTimestamp: 1724080000,
        },
      });

      const result = parseEvolutionWebhook(payload);
      expect(result.kind).toBe('discarded');
      expect((result as DiscardedMessage).reason).toBe('from_me');
    });

    it('should discard group messages (@g.us)', () => {
      const payload = buildPayload({
        data: {
          key: {
            remoteJid: '120363012345678@g.us',
            fromMe: false,
            id: 'MSG_GROUP',
          },
          pushName: 'GroupUser',
          message: { conversation: 'Hello group' },
          messageTimestamp: 1724080000,
        },
      });

      const result = parseEvolutionWebhook(payload);
      expect(result.kind).toBe('discarded');
      expect((result as DiscardedMessage).reason).toBe('group_message');
    });

    it('should discard messages without text content', () => {
      const payload = buildPayload({
        data: {
          key: {
            remoteJid: '5215512345678@s.whatsapp.net',
            fromMe: false,
            id: 'MSG_STICKER',
          },
          pushName: 'Ana',
          message: {
            stickerMessage: { url: 'https://sticker.url' },
          },
          messageType: 'stickerMessage',
          messageTimestamp: 1724080000,
        },
      });

      const result = parseEvolutionWebhook(payload);
      expect(result.kind).toBe('discarded');
      expect((result as DiscardedMessage).reason).toBe('no_text_content');
    });

    it('should discard unsupported events', () => {
      const payload = buildPayload({ event: 'connection.update' });

      const result = parseEvolutionWebhook(payload);
      expect(result.kind).toBe('discarded');
      expect((result as DiscardedMessage).reason).toBe('unsupported_event');
    });
  });

  describe('invalid payloads', () => {
    it('should throw ValidationError for completely invalid payload', () => {
      expect(() => parseEvolutionWebhook({ garbage: true })).toThrow(ValidationError);
    });

    it('should throw ValidationError for null payload', () => {
      expect(() => parseEvolutionWebhook(null)).toThrow(ValidationError);
    });

    it('should throw ValidationError for missing data.key', () => {
      expect(() => parseEvolutionWebhook({
        event: 'messages.upsert',
        instance: 'test',
        data: { message: { conversation: 'hi' } },
      })).toThrow(ValidationError);
    });
  });
});

// --- verifyWebhookAuth tests ---

describe('verifyWebhookAuth', () => {
  const mockEnv = {
    EVOLUTION_API_URL: 'https://evo.test.com',
    EVOLUTION_API_KEY: 'test-evo-key',
    WEBHOOK_VERIFY_TOKEN: 'super-secret-token-123',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    LLM_API_KEY: 'test-llm-key',
    LLM_MODEL: 'gpt-4o-mini',
    LLM_BASE_URL: 'https://api.openai.com/v1',
    CHATWOOT_BASE_URL: 'https://app.chatwoot.com',
    CHATWOOT_API_TOKEN: 'test-chatwoot-token',
    CHATWOOT_ACCOUNT_ID: '1',
    CHATWOOT_INBOX_ID: '1',
    CHATWOOT_WEBHOOK_TOKEN: 'test-chatwoot-webhook-token',
  };

  it('should pass with a valid x-api-key header', () => {
    const request = new Request('http://localhost/webhook/evolution', {
      method: 'POST',
      headers: { 'x-api-key': 'super-secret-token-123' },
    });

    expect(() => verifyWebhookAuth(request, mockEnv)).not.toThrow();
  });

  it('should throw AuthenticationError when no auth is provided at all', () => {
    const request = new Request('http://localhost/webhook/evolution', {
      method: 'POST',
    });

    expect(() => verifyWebhookAuth(request, mockEnv)).toThrow(AuthenticationError);
    expect(() => verifyWebhookAuth(request, mockEnv)).toThrow('Missing authentication token');
  });

  it('should throw AuthenticationError when x-api-key is incorrect', () => {
    const request = new Request('http://localhost/webhook/evolution', {
      method: 'POST',
      headers: { 'x-api-key': 'wrong-token' },
    });

    expect(() => verifyWebhookAuth(request, mockEnv)).toThrow(AuthenticationError);
    expect(() => verifyWebhookAuth(request, mockEnv)).toThrow('Invalid webhook token');
  });

  it('should throw AuthenticationError when x-api-key is empty string', () => {
    const request = new Request('http://localhost/webhook/evolution', {
      method: 'POST',
      headers: { 'x-api-key': '' },
    });

    expect(() => verifyWebhookAuth(request, mockEnv)).toThrow(AuthenticationError);
  });

  it('should pass when body.apikey matches EVOLUTION_API_KEY', () => {
    const request = new Request('http://localhost/webhook/evolution', {
      method: 'POST',
    });
    const body = { apikey: 'test-evo-key', event: 'messages.upsert' };

    expect(() => verifyWebhookAuth(request, mockEnv, body)).not.toThrow();
  });

  it('should pass when body.apikey matches WEBHOOK_VERIFY_TOKEN', () => {
    const request = new Request('http://localhost/webhook/evolution', {
      method: 'POST',
    });
    const body = { apikey: 'super-secret-token-123', event: 'messages.upsert' };

    expect(() => verifyWebhookAuth(request, mockEnv, body)).not.toThrow();
  });

  it('should throw AuthenticationError when body.apikey is an unconfigured UUID (Zero-Trust)', () => {
    const request = new Request('http://localhost/webhook/evolution', {
      method: 'POST',
    });
    const body = { apikey: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', event: 'messages.upsert' };

    expect(() => verifyWebhookAuth(request, mockEnv, body)).toThrow(AuthenticationError);
    expect(() => verifyWebhookAuth(request, mockEnv, body)).toThrow('Invalid webhook token');
  });

  it('should throw AuthenticationError when body.apikey is completely wrong', () => {
    const request = new Request('http://localhost/webhook/evolution', {
      method: 'POST',
    });
    const body = { apikey: 'completely-wrong-key', event: 'messages.upsert' };

    expect(() => verifyWebhookAuth(request, mockEnv, body)).toThrow(AuthenticationError);
    expect(() => verifyWebhookAuth(request, mockEnv, body)).toThrow('Invalid webhook token');
  });

  it('should pass when apikey header matches EVOLUTION_API_KEY', () => {
    const request = new Request('http://localhost/webhook/evolution', {
      method: 'POST',
      headers: { 'apikey': 'test-evo-key' },
    });

    expect(() => verifyWebhookAuth(request, mockEnv)).not.toThrow();
  });
});
