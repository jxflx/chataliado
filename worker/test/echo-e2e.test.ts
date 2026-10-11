import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleEvolutionWebhook } from '../src/webhooks/handler';
import { type WhatsAppProvider, type SendMessageResult } from '../src/providers/whatsapp/interface';
import { type Env } from '../src/types/env';
import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database } from '../src/types/database';

const mockEnv: Env = {
  EVOLUTION_API_URL: 'https://evo.test.com',
  EVOLUTION_API_KEY: 'test-evo-key',
  WEBHOOK_VERIFY_TOKEN: 'secret-token-xyz',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  LLM_API_KEY: 'test-llm-key',
  LLM_MODEL: 'gpt-4o-mini',
  LLM_BASE_URL: 'https://api.openai.com/v1',
};

function createMockDb(): SupabaseClient<Database> {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
}

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

describe('Echo Pipeline E2E & Smoke Test', () => {
  let mockProvider: WhatsAppProvider;
  let mockDb: SupabaseClient<Database>;
  let sendTextMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockDb = createMockDb();
    sendTextMessageMock = vi.fn().mockResolvedValue({
      success: true,
      messageId: 'ECHO_REPLY_123',
    } satisfies SendMessageResult);

    mockProvider = {
      sendTextMessage: sendTextMessageMock,
      sendMediaMessage: vi.fn(),
      markAsRead: vi.fn(),
    };
  });

  it('should process incoming user message and trigger echo reply in background', async () => {
    const ctx = createMockExecutionContext();

    const request = new Request('http://localhost/webhook/evolution', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'secret-token-xyz',
      },
      body: JSON.stringify({
        event: 'messages.upsert',
        instance: 'pizzeria-norte',
        data: {
          key: {
            remoteJid: '5215598765432@s.whatsapp.net',
            fromMe: false,
            id: 'MSG_INCOMING_001',
          },
          pushName: 'Laura',
          message: {
            conversation: 'Quiero ordenar 2 pizzas medianas',
          },
          messageType: 'conversation',
          messageTimestamp: Math.floor(Date.now() / 1000),
        },
      }),
    });

    const response = await handleEvolutionWebhook(request, mockEnv, ctx, {
      customProvider: mockProvider,
      customDb: mockDb,
    });

    // 1. Verificar respuesta HTTP inmediata
    expect(response.status).toBe(200);
    const body = await response.json<{ received: boolean; status: string; sender: string }>();
    expect(body.received).toBe(true);
    expect(body.status).toBe('processed');
    expect(body.sender).toBe('5215598765432');

    // 2. Esperar a que las promesas en segundo plano (ctx.waitUntil) se completen
    await Promise.all(ctx.backgroundPromises);

    // 3. Verificar que el proveedor envió el eco exacto
    expect(sendTextMessageMock).toHaveBeenCalledTimes(1);
    expect(sendTextMessageMock).toHaveBeenCalledWith(
      'pizzeria-norte',
      '5215598765432',
      'Eco: Quiero ordenar 2 pizzas medianas',
      expect.objectContaining({ delay: 500 })
    );
  });

  it('should NOT trigger echo reply when message is discarded (fromMe: true)', async () => {
    const ctx = createMockExecutionContext();

    const request = new Request('http://localhost/webhook/evolution', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'secret-token-xyz',
      },
      body: JSON.stringify({
        event: 'messages.upsert',
        instance: 'pizzeria-norte',
        data: {
          key: {
            remoteJid: '5215598765432@s.whatsapp.net',
            fromMe: true,
            id: 'MSG_BOT_SELF',
          },
          message: {
            conversation: 'Eco: Hola',
          },
        },
      }),
    });

    const response = await handleEvolutionWebhook(request, mockEnv, ctx, {
      customProvider: mockProvider,
    });

    expect(response.status).toBe(200);
    const body = await response.json<{ status: string; reason: string }>();
    expect(body.status).toBe('discarded');
    expect(body.reason).toBe('from_me');

    await Promise.all(ctx.backgroundPromises);
    expect(sendTextMessageMock).not.toHaveBeenCalled();
  });

  it('should handle background provider failure gracefully without crashing the webhook response', async () => {
    sendTextMessageMock.mockRejectedValueOnce(new Error('Network timeout to WhatsApp'));

    const ctx = createMockExecutionContext();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = new Request('http://localhost/webhook/evolution', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'secret-token-xyz',
      },
      body: JSON.stringify({
        event: 'messages.upsert',
        instance: 'pizzeria-norte',
        data: {
          key: {
            remoteJid: '5215598765432@s.whatsapp.net',
            fromMe: false,
            id: 'MSG_FAIL_TEST',
          },
          message: {
            conversation: 'Mensaje de prueba con fallo de red',
          },
        },
      }),
    });

    const response = await handleEvolutionWebhook(request, mockEnv, ctx, {
      customProvider: mockProvider,
      customDb: mockDb,
    });

    // El webhook debe seguir respondiendo 200 OK a Evolution API
    expect(response.status).toBe(200);

    // Esperar a que el catch de la tarea en background capture el error
    await Promise.all(ctx.backgroundPromises);

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
