import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleEvolutionWebhook } from '../src/webhooks/handler';
import { type WhatsAppProvider, type SendMessageResult } from '../src/providers/whatsapp/interface';
import { type Env } from '../src/types/env';
import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database, type Restaurant, type Customer, type Conversation } from '../src/types/database';
import { AgentOrchestrator } from '../src/services/agent/orchestrator';
import { type LLMProvider } from '../src/providers/llm/interface';

const mockEnv: Env = {
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

const mockRestaurant: Restaurant = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Pizzería Napoli',
  slug: 'pizzeria-napoli',
  phone: '+525512345678',
  address: 'Av. Insurgentes Sur 123, CDMX',
  timezone: 'America/Mexico_City',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockCustomer: Customer = {
  id: '22222222-2222-4222-8222-222222222222',
  restaurant_id: '11111111-1111-4111-8111-111111111111',
  phone: '5215598765432',
  name: 'Valeria Gómez',
  address_default: 'Col. Roma Norte 45',
  notes_md: '- Cliente frecuente',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockConversation: Conversation = {
  id: '33333333-3333-4333-8333-333333333333',
  restaurant_id: '11111111-1111-4111-8111-111111111111',
  customer_id: '22222222-2222-4222-8222-222222222222',
  mode: 'ai',
  status: 'open',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
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

function createIntegrationMockDb(): SupabaseClient<Database> {
  const createBuilder = (table: string): Record<string, unknown> => {
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      update: vi.fn(() => builder),
      upsert: vi.fn(() => builder),
      delete: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      single: vi.fn(async () => {
        if (table === 'restaurants') return { data: mockRestaurant, error: null };
        if (table === 'customers') return { data: mockCustomer, error: null };
        if (table === 'conversations') return { data: mockConversation, error: null };
        if (table === 'messages') {
          return {
            data: {
              id: '44444444-4444-4444-8444-444444444444',
              restaurant_id: mockRestaurant.id,
              conversation_id: mockConversation.id,
              role: 'user',
              content: 'test',
              created_at: new Date().toISOString(),
            },
            error: null,
          };
        }
        return { data: null, error: null };
      }),
      maybeSingle: vi.fn(async () => {
        if (table === 'restaurants') return { data: mockRestaurant, error: null };
        if (table === 'customers') return { data: mockCustomer, error: null };
        if (table === 'conversations') return { data: mockConversation, error: null };
        return { data: null, error: null };
      }),
    };
    return builder;
  };

  return {
    from: vi.fn((table: string) => createBuilder(table)),
  } as unknown as SupabaseClient<Database>;
}

describe('Milestone 4 — Webhook Integration with AgentOrchestrator (R7)', () => {
  let mockProvider: WhatsAppProvider;
  let sendTextMessageMock: ReturnType<typeof vi.fn>;
  let mockDb: SupabaseClient<Database>;
  let mockLLMProvider: LLMProvider;

  beforeEach(() => {
    sendTextMessageMock = vi.fn().mockResolvedValue({ success: true, messageId: 'MSG_OUT_001' } satisfies SendMessageResult);
    mockProvider = { sendTextMessage: sendTextMessageMock, sendMediaMessage: vi.fn(), markAsRead: vi.fn() };
    mockLLMProvider = {
      chat: vi.fn().mockResolvedValue({
        content: '¡Hola Valeria! Con gusto te preparo tu pizza.',
        usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
      }),
    };
    mockDb = createIntegrationMockDb();
  });

  it('should process webhook, resolve restaurant, customer & conversation, and dispatch AgentOrchestrator', async () => {
    const ctx = createMockExecutionContext();
    const request = new Request('http://localhost/webhook/evolution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'secret-token-123' },
      body: JSON.stringify({
        event: 'messages.upsert',
        instance: 'pizzeria-napoli',
        data: {
          key: { remoteJid: '5215598765432@s.whatsapp.net', fromMe: false, id: 'MSG_WEBHOOK_001' },
          pushName: 'Valeria Gómez',
          message: { conversation: 'Hola, buenas tardes' },
        },
      }),
    });

    const response = await handleEvolutionWebhook(request, mockEnv, ctx, {
      customProvider: mockProvider,
      customDb: mockDb,
      customLLMProvider: mockLLMProvider,
    });

    expect(response.status).toBe(200);
    const body = await response.json<{ received: boolean; status: string; instance: string; sender: string }>();
    expect(body.received).toBe(true);
    expect(body.status).toBe('processed');
    expect(body.instance).toBe('pizzeria-napoli');
    expect(body.sender).toBe('5215598765432');

    await Promise.all(ctx.backgroundPromises);

    expect(mockLLMProvider.chat).toHaveBeenCalledTimes(1);
    expect(sendTextMessageMock).toHaveBeenCalledWith('pizzeria-napoli', '5215598765432', '¡Hola Valeria! Con gusto te preparo tu pizza.');
  });

  it('should support injecting customOrchestrator in WebhookHandlerOptions', async () => {
    const ctx = createMockExecutionContext();
    const customOrchestratorMock = {
      processIncomingMessage: vi.fn().mockResolvedValue({
        status: 'responded',
        conversationId: '33333333-3333-4333-8333-333333333333',
        replyText: 'Respuesta custom',
      }),
    } as unknown as AgentOrchestrator;

    const request = new Request('http://localhost/webhook/evolution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'secret-token-123' },
      body: JSON.stringify({
        event: 'messages.upsert',
        instance: 'pizzeria-napoli',
        data: {
          key: { remoteJid: '5215598765432@s.whatsapp.net', fromMe: false, id: 'MSG_CUSTOM_ORCH' },
          pushName: 'Valeria Gómez',
          message: { conversation: 'Test custom orchestrator' },
        },
      }),
    });

    const response = await handleEvolutionWebhook(request, mockEnv, ctx, {
      customProvider: mockProvider,
      customDb: mockDb,
      customOrchestrator: customOrchestratorMock,
    });

    expect(response.status).toBe(200);
    await Promise.all(ctx.backgroundPromises);

    expect(customOrchestratorMock.processIncomingMessage).toHaveBeenCalledTimes(1);
    expect(customOrchestratorMock.processIncomingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurant: expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111', slug: 'pizzeria-napoli' }),
        customer: expect.objectContaining({ id: '22222222-2222-4222-8222-222222222222', phone: '5215598765432' }),
        conversationId: '33333333-3333-4333-8333-333333333333',
        messageText: 'Test custom orchestrator',
        providerMessageId: 'MSG_CUSTOM_ORCH',
      })
    );
  });

  it('should ignore duplicate messageId and return status duplicate', async () => {
    const ctx = createMockExecutionContext();
    const payload = {
      event: 'messages.upsert',
      instance: 'pizzeria-napoli',
      data: {
        key: { remoteJid: '5215598765432@s.whatsapp.net', fromMe: false, id: 'MSG_DEDUP_TEST_999' },
        pushName: 'Valeria Gómez',
        message: { conversation: 'Primer envío' },
      },
    };

    const req1 = new Request('http://localhost/webhook/evolution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'secret-token-123' },
      body: JSON.stringify(payload),
    });

    const res1 = await handleEvolutionWebhook(req1, mockEnv, ctx, {
      customProvider: mockProvider,
      customDb: mockDb,
      customLLMProvider: mockLLMProvider,
    });
    expect(res1.status).toBe(200);
    expect((await res1.json<{ status: string }>()).status).toBe('processed');

    const req2 = new Request('http://localhost/webhook/evolution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'secret-token-123' },
      body: JSON.stringify(payload),
    });

    const res2 = await handleEvolutionWebhook(req2, mockEnv, ctx, {
      customProvider: mockProvider,
      customDb: mockDb,
      customLLMProvider: mockLLMProvider,
    });
    expect(res2.status).toBe(200);
    expect((await res2.json<{ status: string }>()).status).toBe('duplicate');
  });
});
