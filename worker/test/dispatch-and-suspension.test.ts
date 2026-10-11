import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index';
import { type Env } from '../src/types/env';
import { type WhatsAppProvider } from '../src/providers/whatsapp/interface';
import { handleDispatchMessage } from '../src/api/message-dispatch';

describe('Worker — Message Dispatch & SaaS Subscription Guard', () => {
  const mockEnv: Env = {
    EVOLUTION_API_URL: 'http://localhost:8080',
    EVOLUTION_API_KEY: 'test-evo-api-key',
    WEBHOOK_VERIFY_TOKEN: 'secret-service-token-999',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    LLM_API_KEY: 'test-llm-key',
    LLM_MODEL: 'gpt-4o-mini',
    LLM_BASE_URL: 'https://api.openai.com/v1',
  };

  const validPayload = {
    restaurant_id: 'a0000000-0000-0000-0000-000000000001',
    conversation_id: 'b0000000-0000-0000-0000-000000000001',
    phone: '5215512345678',
    content: 'Hola! Su pedido va en camino.',
  };

  it('POST /api/messages/send debe rechazar peticiones sin token con 401', async () => {
    const req = new Request('http://localhost/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });

    const ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    const res = await worker.fetch(req, mockEnv, ctx);
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('Token');
  });

  it('POST /api/messages/send debe rechazar token inválido con 401', async () => {
    const req = new Request('http://localhost/api/messages/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-token',
      },
      body: JSON.stringify(validPayload),
    });

    const ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    const res = await worker.fetch(req, mockEnv, ctx);
    expect(res.status).toBe(401);
  });

  it('POST /api/messages/send debe rechazar payload con datos inválidos con 400', async () => {
    const req = new Request('http://localhost/api/messages/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret-service-token-999',
      },
      body: JSON.stringify({
        restaurant_id: 'not-a-uuid',
        conversation_id: 'not-a-uuid',
        phone: 'invalid',
        content: '',
      }),
    });

    const ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    } as unknown as ExecutionContext;

    const res = await worker.fetch(req, mockEnv, ctx);
    expect(res.status).toBe(400);
  });

  it('handleDispatchMessage despacha mensaje a WhatsAppProvider y persiste en Supabase', async () => {
    const mockSendTextMessage = vi.fn().mockResolvedValue({
      messageId: 'evo-msg-12345',
      status: 'sent',
    });

    const mockProvider: WhatsAppProvider = {
      sendTextMessage: mockSendTextMessage,
      sendMediaMessage: vi.fn(),
      markAsRead: vi.fn(),
    };

    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'restaurants') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'a0000000-0000-0000-0000-000000000001',
                slug: 'pizzeria-don-giovanni',
                is_active: true,
                subscription_status: 'active',
              },
              error: null,
            }),
          };
        }
        if (table === 'messages') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'msg-uuid-999',
                role: 'human_agent',
                content: 'Hola! Su pedido va en camino.',
                provider_message_id: 'evo-msg-12345',
              },
              error: null,
            }),
          };
        }
        return {};
      }),
    } as unknown as any;

    const req = new Request('http://localhost/api/messages/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret-service-token-999',
      },
      body: JSON.stringify(validPayload),
    });

    const res = await handleDispatchMessage(req, mockEnv, {
      customProvider: mockProvider,
      customDb: mockDb,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; messageId: string };
    expect(body.success).toBe(true);
    expect(body.messageId).toBe('evo-msg-12345');
    expect(mockSendTextMessage).toHaveBeenCalledWith(
      'pizzeria-don-giovanni',
      '5215512345678',
      'Hola! Su pedido va en camino.'
    );
  });

  it('handleDispatchMessage rechaza con 403 si el restaurante está suspendido', async () => {
    const mockProvider: WhatsAppProvider = {
      sendTextMessage: vi.fn(),
      sendMediaMessage: vi.fn(),
      markAsRead: vi.fn(),
    };

    const mockDb = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: 'a0000000-0000-0000-0000-000000000001',
            slug: 'pizzeria-morosa',
            is_active: true,
            subscription_status: 'suspended',
          },
          error: null,
        }),
      })),
    } as unknown as any;

    const req = new Request('http://localhost/api/messages/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret-service-token-999',
      },
      body: JSON.stringify(validPayload),
    });

    await expect(
      handleDispatchMessage(req, mockEnv, {
        customProvider: mockProvider,
        customDb: mockDb,
      })
    ).rejects.toThrow('suspendida por falta de pago');
  });
});
