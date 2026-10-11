import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database } from '../src/types/database';
import { type Env } from '../src/types/env';
import { AuthenticationError } from '../src/utils/errors';
import { verifyChatwootWebhookAuth } from '../src/webhooks/chatwoot/auth';
import { handleChatwootWebhook } from '../src/webhooks/chatwoot/handler';
import { type WhatsAppProvider } from '../src/providers/whatsapp/interface';
import { ConversationRepository } from '../src/services/db/conversation-repository';
import { MessageRepository } from '../src/services/db/message-repository';
import { RestaurantRepository } from '../src/services/db/restaurant-repository';

describe('Chatwoot Webhook Handler & Auth', () => {
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
    CHATWOOT_WEBHOOK_TOKEN: 'secret-chatwoot-webhook-token-456',
  };

  describe('verifyChatwootWebhookAuth', () => {
    it('debe autenticar exitosamente con query parameter ?token=', () => {
      const request = new Request(
        'http://localhost/webhook/chatwoot?token=secret-chatwoot-webhook-token-456',
        { method: 'POST' }
      );
      expect(() => verifyChatwootWebhookAuth(request, mockEnv)).not.toThrow();
    });

    it('debe autenticar exitosamente con header x-webhook-token', () => {
      const request = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: { 'x-webhook-token': 'secret-chatwoot-webhook-token-456' },
      });
      expect(() => verifyChatwootWebhookAuth(request, mockEnv)).not.toThrow();
    });

    it('debe autenticar exitosamente con header apikey', () => {
      const request = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: { apikey: 'secret-chatwoot-webhook-token-456' },
      });
      expect(() => verifyChatwootWebhookAuth(request, mockEnv)).not.toThrow();
    });

    it('debe autenticar exitosamente con Authorization: Bearer <token>', () => {
      const request = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret-chatwoot-webhook-token-456',
        },
      });
      expect(() => verifyChatwootWebhookAuth(request, mockEnv)).not.toThrow();
    });

    it('debe autenticar exitosamente con token en body', () => {
      const request = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
      });
      const body = {
        token: 'secret-chatwoot-webhook-token-456',
        event: 'message_created',
      };
      expect(() => verifyChatwootWebhookAuth(request, mockEnv, body)).not.toThrow();
    });

    it('debe rechazar con AuthenticationError si no se envía ningún token', () => {
      const request = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
      });
      expect(() => verifyChatwootWebhookAuth(request, mockEnv)).toThrow(AuthenticationError);
      expect(() => verifyChatwootWebhookAuth(request, mockEnv)).toThrow('Missing Chatwoot webhook');
    });

    it('debe rechazar con AuthenticationError si el token es inválido', () => {
      const request = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: { 'x-webhook-token': 'wrong-token-abc' },
      });
      expect(() => verifyChatwootWebhookAuth(request, mockEnv)).toThrow(AuthenticationError);
      expect(() => verifyChatwootWebhookAuth(request, mockEnv)).toThrow('Invalid Chatwoot webhook token');
    });
  });

  describe('handleChatwootWebhook', () => {
    let mockWhatsAppProvider: WhatsAppProvider;
    let savedMessages: Array<Record<string, unknown>>;
    let conversationModes: Record<string, 'ai' | 'human'>;

    beforeEach(() => {
      savedMessages = [];
      conversationModes = {
        '11111111-2222-3333-4444-555555555555': 'human',
      };

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
      getOrCreateActiveConversation: vi.fn(),
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
      getByIdOrSlug: vi.fn(async (idOrSlug: string) => {
        return {
          id: '00000000-0000-0000-0000-000000000001',
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

    it('debe descartar eventos no deseados (ej: nota privada) con HTTP 200 y status: discarded', async () => {
      const payload = {
        event: 'message_created',
        id: 1001,
        content: 'Esta es una nota interna entre operadores',
        private: true,
        message_type: 'outgoing',
        conversation: {
          id: 50,
          custom_attributes: { restaurant_id: '00000000-0000-0000-0000-000000000001' },
        },
      };

      const request = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': 'secret-chatwoot-webhook-token-456',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const response = await handleChatwootWebhook(request, mockEnv, undefined, {
        customProvider: mockWhatsAppProvider,
        customConversationRepo: mockConvoRepo,
        customMessageRepo: mockMsgRepo,
        customRestaurantRepo: mockRestaurantRepo,
      });

      expect(response.status).toBe(200);
      const json = await response.json<{ status: string; reason: string }>();
      expect(json.status).toBe('discarded');
      expect(json.reason).toBe('private_note');
      expect(mockWhatsAppProvider.sendTextMessage).not.toHaveBeenCalled();
    });

    it('debe procesar message_created de agente humano, guardarlo con role: human_agent y enviarlo a WhatsApp', async () => {
      const payload = {
        event: 'message_created',
        id: 777,
        content: '¡Hola! Ya pusimos tu pizza en el horno, sale en 10 minutos.',
        private: false,
        message_type: 'outgoing',
        sender: {
          id: 9,
          name: 'Marco (Cocinero)',
          type: 'user',
        },
        contact: {
          id: 44,
          phone_number: '+5215512345678',
        },
        conversation: {
          id: 50,
          custom_attributes: {
            restaurant_id: '00000000-0000-0000-0000-000000000001',
            conversation_id: '11111111-2222-3333-4444-555555555555',
          },
        },
      };

      const request = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': 'secret-chatwoot-webhook-token-456',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const response = await handleChatwootWebhook(request, mockEnv, undefined, {
        customProvider: mockWhatsAppProvider,
        customConversationRepo: mockConvoRepo,
        customMessageRepo: mockMsgRepo,
        customRestaurantRepo: mockRestaurantRepo,
      });

      expect(response.status).toBe(200);
      const json = await response.json<{ status: string; messageId: string }>();
      expect(json.status).toBe('dispatched_to_whatsapp');
      expect(json.messageId).toBe('777');

      // Verificar persistencia en Supabase con role: 'human_agent'
      expect(mockMsgRepo.saveMessage).toHaveBeenCalledWith(
        '00000000-0000-0000-0000-000000000001',
        expect.objectContaining({
          conversation_id: '11111111-2222-3333-4444-555555555555',
          role: 'human_agent',
          content: '¡Hola! Ya pusimos tu pizza en el horno, sale en 10 minutos.',
        })
      );

      // Verificar despacho a WhatsApp vía WhatsAppProvider
      expect(mockWhatsAppProvider.sendTextMessage).toHaveBeenCalledWith(
        'pizzeria-napoli',
        '+5215512345678',
        '¡Hola! Ya pusimos tu pizza en el horno, sale en 10 minutos.'
      );
    });

    it('debe reactivar conversations.mode = ai al recibir evento conversation_status_changed (resolved)', async () => {
      const payload = {
        event: 'conversation_status_changed',
        id: 50,
        status: 'resolved',
        conversation: {
          id: 50,
          status: 'resolved',
          custom_attributes: {
            restaurant_id: '00000000-0000-0000-0000-000000000001',
            conversation_id: '11111111-2222-3333-4444-555555555555',
          },
        },
      };

      const request = new Request('http://localhost/webhook/chatwoot', {
        method: 'POST',
        headers: {
          'x-webhook-token': 'secret-chatwoot-webhook-token-456',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const response = await handleChatwootWebhook(request, mockEnv, undefined, {
        customProvider: mockWhatsAppProvider,
        customConversationRepo: mockConvoRepo,
        customMessageRepo: mockMsgRepo,
        customRestaurantRepo: mockRestaurantRepo,
      });

      expect(response.status).toBe(200);
      const json = await response.json<{ status: string; restaurantId: string }>();
      expect(json.status).toBe('resolved_mode_ai');
      expect(json.restaurantId).toBe('00000000-0000-0000-0000-000000000001');

      // Verificar que se actualizó el modo a 'ai'
      expect(mockConvoRepo.setMode).toHaveBeenCalledWith(
        '00000000-0000-0000-0000-000000000001',
        '11111111-2222-3333-4444-555555555555',
        'ai'
      );
      expect(conversationModes['11111111-2222-3333-4444-555555555555']).toBe('ai');

      // Verificar que se registró mensaje del sistema
      expect(mockMsgRepo.saveMessage).toHaveBeenCalledWith(
        '00000000-0000-0000-0000-000000000001',
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('Modo IA reactivado'),
        })
      );
    });
  });
});
