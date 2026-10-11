import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database } from '../src/types/database';
import { type Env } from '../src/types/env';
import { type ToolContext } from '../src/tools/interface';
import {
  handoffToHumanTool,
  handoffToHumanToolSchema,
} from '../src/tools/escalation/handoff-to-human';

describe('handoffToHumanTool', () => {
  const mockEnvWithoutChatwoot: Env = {
    EVOLUTION_API_URL: 'https://evo.test.com',
    EVOLUTION_API_KEY: 'test-key',
    WEBHOOK_VERIFY_TOKEN: 'test-verify',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    LLM_API_KEY: 'llm-key',
    LLM_MODEL: 'gpt-4o-mini',
    LLM_BASE_URL: 'https://api.openai.com/v1',
  };

  const mockEnvWithChatwoot: Env = {
    ...mockEnvWithoutChatwoot,
    CHATWOOT_BASE_URL: 'https://chatwoot.test.com',
    CHATWOOT_API_TOKEN: 'cw-token-123',
    CHATWOOT_ACCOUNT_ID: '1',
    CHATWOOT_INBOX_ID: '10',
    CHATWOOT_WEBHOOK_TOKEN: 'cw-webhook-secret',
  };

  let mockDb: SupabaseClient<Database>;
  let modeUpdated = '';
  let savedMessages: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    modeUpdated = '';
    savedMessages = [];

    mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'conversations') {
          return {
            update: vi.fn((payload: Record<string, unknown>) => {
              modeUpdated = payload.mode as string;
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                      single: vi.fn().mockResolvedValue({
                        data: {
                          id: 'conv-uuid-123',
                          mode: payload.mode,
                          status: 'open',
                        },
                        error: null,
                      }),
                    })),
                  })),
                })),
              };
            }),
          };
        }

        if (table === 'messages') {
          return {
            insert: vi.fn((payload: Record<string, unknown>) => {
              savedMessages.push(payload);
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'msg-uuid-1', ...payload },
                    error: null,
                  }),
                })),
              };
            }),
          };
        }

        if (table === 'customers') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: 'cust-uuid-123',
                      name: 'Zam',
                      phone: '+5215512345678',
                      notes_md: '- Sin cebolla\n- Prefiere masa delgada',
                    },
                    error: null,
                  }),
                })),
              })),
            })),
          };
        }

        if (table === 'restaurants') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'rest-uuid-123',
                    name: 'Pizzería Napoli',
                    slug: 'pizzeria-napoli',
                  },
                  error: null,
                }),
              })),
            })),
          };
        }

        if (table === 'orders') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: {
                            id: 'order-1',
                            subtotal: 220,
                            total: 255,
                            order_items: [
                              {
                                product_id: 'prod-1',
                                quantity: 1,
                                subtotal: 220,
                              },
                            ],
                          },
                          error: null,
                        }),
                      })),
                    })),
                  })),
                })),
              })),
            })),
          };
        }

        return {} as unknown;
      }),
    } as unknown as SupabaseClient<Database>;
  });

  describe('Schema Validation', () => {
    it('debe requerir reason como string no vacío', () => {
      expect(
        handoffToHumanToolSchema.safeParse({ reason: 'Cliente pide humano' }).success
      ).toBe(true);

      expect(handoffToHumanToolSchema.safeParse({ reason: '' }).success).toBe(false);
      expect(handoffToHumanToolSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('Execution without Chatwoot credentials', () => {
    it('debe actualizar modo a human y guardar mensaje de sistema en Supabase', async () => {
      const context: ToolContext = {
        restaurantId: '00000000-0000-0000-0000-000000000001',
        customerId: '00000000-0000-0000-0000-000000000002',
        conversationId: '00000000-0000-0000-0000-000000000003',
        db: mockDb,
        env: mockEnvWithoutChatwoot,
      };

      const result = await handoffToHumanTool.execute(
        { reason: 'Cliente solicita asesor' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.mode).toBe('human');
      expect(result.reason).toBe('Cliente solicita asesor');
      expect(modeUpdated).toBe('human');
      expect(savedMessages.length).toBeGreaterThanOrEqual(1);
      expect(savedMessages[0]?.role).toBe('system');
      expect(savedMessages[0]?.content).toContain('[HANDOFF]');
    });
  });

  describe('Execution with Chatwoot credentials', () => {
    it('debe buscar/crear contacto, crear conversación y publicar nota privada estructurada', async () => {
      const fetchCalls: Array<{ url: string; method: string; body: unknown }> = [];

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : undefined;
        fetchCalls.push({ url, method: init?.method ?? 'GET', body });

        if (url.includes('/contacts/search')) {
          return new Response(JSON.stringify({ payload: [] }), { status: 200 });
        }
        if (url.endsWith('/contacts')) {
          return new Response(
            JSON.stringify({
              payload: { contact: { id: 88, name: 'Zam', phone_number: '+5215512345678' } },
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/conversations')) {
          return new Response(JSON.stringify({ id: 999, status: 'open' }), { status: 200 });
        }
        if (url.includes('/messages')) {
          return new Response(
            JSON.stringify({ id: 1000, content: (body as Record<string, string>)?.content }),
            { status: 200 }
          );
        }
        return new Response('Not Found', { status: 404 });
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      try {
        const context: ToolContext = {
          restaurantId: '00000000-0000-0000-0000-000000000001',
          customerId: '00000000-0000-0000-0000-000000000002',
          conversationId: '00000000-0000-0000-0000-000000000003',
          db: mockDb,
          env: mockEnvWithChatwoot,
        };

        const result = await handoffToHumanTool.execute(
          { reason: 'Modificación de pedido en curso' },
          context
        );

        expect(result.success).toBe(true);
        expect(result.mode).toBe('human');
        expect(modeUpdated).toBe('human');

        // Verificar que se haya enviado la nota privada con memoria del cliente y carrito
        const messagePostCall = fetchCalls.find((c) => c.url.includes('/messages'));
        expect(messagePostCall).toBeDefined();
        const noteBody = messagePostCall?.body as { content: string; private: boolean };
        expect(noteBody.private).toBe(true);
        expect(noteBody.content).toContain('TRANSFERENCIA A AGENTE HUMANO');
        expect(noteBody.content).toContain('Modificación de pedido en curso');
        expect(noteBody.content).toContain('Sin cebolla');
        expect(noteBody.content).toContain('Subtotal:');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
