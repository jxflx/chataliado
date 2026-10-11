import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleEvolutionWebhook } from '../src/webhooks/handler';
import { type WhatsAppProvider } from '../src/providers/whatsapp/interface';
import { type Env } from '../src/types/env';
import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database } from '../src/types/database';
import { AgentOrchestrator } from '../src/services/agent/orchestrator';

const baseEnv: Env = {
  EVOLUTION_API_URL: 'https://evo.test.com',
  EVOLUTION_API_KEY: 'test-evo-key',
  WEBHOOK_VERIFY_TOKEN: 'secret-token-123',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  LLM_API_KEY: 'test-llm-key',
  LLM_MODEL: 'gpt-4o-mini',
  LLM_BASE_URL: 'https://api.openai.com/v1',
};

function createMockExecutionContext(): ExecutionContext & { backgroundPromises: Promise<unknown>[] } {
  const backgroundPromises: Promise<unknown>[] = [];
  return {
    backgroundPromises,
    waitUntil(promise: Promise<unknown>) {
      backgroundPromises.push(promise);
    },
    passThroughOnException() {},
  } as unknown as ExecutionContext & { backgroundPromises: Promise<unknown>[] };
}

describe('Webhook Guardrails: Phone Whitelist & Anti-Storm Message Age Filters', () => {
  let mockProvider: WhatsAppProvider;
  let mockDb: SupabaseClient<Database>;
  let mockOrchestrator: AgentOrchestrator;
  let processIncomingMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockProvider = {
      sendTextMessage: vi.fn().mockResolvedValue({ success: true, messageId: 'OUT_1' }),
      sendMediaMessage: vi.fn(),
      markAsRead: vi.fn(),
    };
    processIncomingMessageMock = vi.fn().mockResolvedValue({
      status: 'responded',
      conversationId: 'conv-123',
      replyText: 'Respuesta del bot',
    });
    mockOrchestrator = {
      processIncomingMessage: processIncomingMessageMock,
    } as unknown as AgentOrchestrator;
    mockDb = {} as unknown as SupabaseClient<Database>;
  });

  describe('PHONE_WHITELIST Guardrail', () => {
    it('debe descartar silenciosamente con HTTP 200 si el número NO está en la lista blanca', async () => {
      const envWithWhitelist: Env = {
        ...baseEnv,
        PHONE_WHITELIST: '5512345678, 5588888888', // Solo estos números
      };
      const ctx = createMockExecutionContext();

      const req = new Request('http://localhost/webhook/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'secret-token-123' },
        body: JSON.stringify({
          event: 'messages.upsert',
          instance: 'pizzeria-napoli',
          data: {
            key: {
              remoteJid: '5215599999999@s.whatsapp.net', // Número no autorizado
              fromMe: false,
              id: 'MSG_NON_WHITELIST',
            },
            pushName: 'Contacto Desconocido',
            message: { conversation: 'Hola, ¿tienen servicio?' },
            messageTimestamp: Math.floor(Date.now() / 1000),
          },
        }),
      });

      const response = await handleEvolutionWebhook(req, envWithWhitelist, ctx, {
        customProvider: mockProvider,
        customDb: mockDb,
        customOrchestrator: mockOrchestrator,
      });

      expect(response.status).toBe(200);
      const json = await response.json<{ status: string; reason: string; sender: string }>();
      expect(json.status).toBe('discarded');
      expect(json.reason).toBe('phone_not_whitelisted');
      expect(json.sender).toBe('5215599999999');

      // Verificar que el orquestador JAMÁS fue llamado
      expect(processIncomingMessageMock).not.toHaveBeenCalled();
      expect(mockProvider.sendTextMessage).not.toHaveBeenCalled();
    });

    it('debe procesar el mensaje normalmente si el número está en la lista blanca', async () => {
      const envWithWhitelist: Env = {
        ...baseEnv,
        PHONE_WHITELIST: '5512345678',
      };
      const ctx = createMockExecutionContext();

      const req = new Request('http://localhost/webhook/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'secret-token-123' },
        body: JSON.stringify({
          event: 'messages.upsert',
          instance: 'pizzeria-napoli',
          data: {
            key: {
              remoteJid: '5215512345678@s.whatsapp.net', // Número autorizado
              fromMe: false,
              id: 'MSG_WHITELIST_OK',
            },
            pushName: 'Dueño / Tester',
            message: { conversation: 'Prueba de bot' },
            messageTimestamp: Math.floor(Date.now() / 1000),
          },
        }),
      });

      const response = await handleEvolutionWebhook(req, envWithWhitelist, ctx, {
        customProvider: mockProvider,
        customDb: mockDb,
        customOrchestrator: mockOrchestrator,
      });

      expect(response.status).toBe(200);
      const json = await response.json<{ status: string }>();
      expect(json.status).toBe('processed');
    });

    it('debe soportar DEV_PHONE_WHITELIST como alias de PHONE_WHITELIST', async () => {
      const envWithDevWhitelist: Env = {
        ...baseEnv,
        DEV_PHONE_WHITELIST: '5577777777',
      };
      const ctx = createMockExecutionContext();

      const reqBlocked = new Request('http://localhost/webhook/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'secret-token-123' },
        body: JSON.stringify({
          event: 'messages.upsert',
          instance: 'pizzeria-napoli',
          data: {
            key: { remoteJid: '5215533333333@s.whatsapp.net', fromMe: false, id: 'MSG_BLOCKED' },
            pushName: 'No Permitido',
            message: { conversation: 'Hola' },
          },
        }),
      });

      const resBlocked = await handleEvolutionWebhook(reqBlocked, envWithDevWhitelist, ctx, {
        customProvider: mockProvider,
        customDb: mockDb,
        customOrchestrator: mockOrchestrator,
      });

      expect((await resBlocked.json<{ status: string }>()).status).toBe('discarded');
    });
  });

  describe('Anti-Storm MAX_MESSAGE_AGE_SECONDS Guardrail', () => {
    it('debe descartar mensajes antiguos de sincronización de WhatsApp (ej. de hace 10 minutos)', async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const oldTimestamp = nowSeconds - 600; // 10 minutos de antigüedad

      const ctx = createMockExecutionContext();
      const req = new Request('http://localhost/webhook/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'secret-token-123' },
        body: JSON.stringify({
          event: 'messages.upsert',
          instance: 'pizzeria-napoli',
          data: {
            key: { remoteJid: '5215512345678@s.whatsapp.net', fromMe: false, id: 'MSG_HISTORIC_SYNC' },
            pushName: 'Valeria',
            message: { conversation: 'Mensaje viejo de hace 10 minutos' },
            messageTimestamp: oldTimestamp,
          },
        }),
      });

      const response = await handleEvolutionWebhook(req, baseEnv, ctx, {
        customProvider: mockProvider,
        customDb: mockDb,
        customOrchestrator: mockOrchestrator,
      });

      expect(response.status).toBe(200);
      const json = await response.json<{ status: string; reason: string; ageSeconds: number }>();
      expect(json.status).toBe('discarded');
      expect(json.reason).toBe('message_too_old');
      expect(json.ageSeconds).toBeGreaterThanOrEqual(590);

      // No debe ejecutar orquestador ni responder
      expect(processIncomingMessageMock).not.toHaveBeenCalled();
    });

    it('debe descartar actualizaciones de estado de WhatsApp (status@broadcast)', async () => {
      const ctx = createMockExecutionContext();
      const req = new Request('http://localhost/webhook/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': 'secret-token-123' },
        body: JSON.stringify({
          event: 'messages.upsert',
          instance: 'pizzeria-napoli',
          data: {
            key: { remoteJid: 'status@broadcast', fromMe: false, id: 'STATUS_MSG' },
            message: { conversation: 'Mi nuevo estado' },
          },
        }),
      });

      const response = await handleEvolutionWebhook(req, baseEnv, ctx, {
        customProvider: mockProvider,
        customDb: mockDb,
        customOrchestrator: mockOrchestrator,
      });

      expect(response.status).toBe(200);
      const json = await response.json<{ status: string; reason: string }>();
      expect(json.status).toBe('discarded');
      expect(json.reason).toBe('status_update');
    });
  });
});
