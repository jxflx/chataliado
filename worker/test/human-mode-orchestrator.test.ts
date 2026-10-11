import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type SupabaseClient } from '@supabase/supabase-js';
import {
  type Database,
  type Restaurant,
  type Customer,
  type Conversation,
} from '../src/types/database';
import { type Env } from '../src/types/env';
import { type LLMProvider, type LLMResponse } from '../src/providers/llm/interface';
import { type WhatsAppProvider } from '../src/providers/whatsapp/interface';
import { type ChatwootProvider } from '../src/providers/chatwoot/interface';
import { AgentOrchestrator } from '../src/services/agent/orchestrator';
import { ConversationRepository } from '../src/services/db/conversation-repository';
import { MessageRepository } from '../src/services/db/message-repository';
import { RestaurantRepository } from '../src/services/db/restaurant-repository';
import { CustomerRepository } from '../src/services/db/customer-repository';
import { OrderRepository } from '../src/services/db/order-repository';

describe('AgentOrchestrator — Human Mode Silencing & Chatwoot Forwarding', () => {
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

  const mockRestaurant: Restaurant = {
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

  const mockCustomer: Customer = {
    id: '00000000-0000-0000-0000-000000000002',
    restaurant_id: mockRestaurant.id,
    phone: '+5215512345678',
    name: 'Zam',
    address_default: 'Av del río 234',
    notes_md: '- Sin orégano',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  let mockLLMProvider: LLMProvider;
  let mockWhatsAppProvider: WhatsAppProvider;
  let mockChatwootProvider: ChatwootProvider;
  let savedMessages: Array<Record<string, unknown>>;
  let currentConversation: Conversation;

  beforeEach(() => {
    savedMessages = [];
    currentConversation = {
      id: '00000000-0000-0000-0000-000000000003',
      restaurant_id: mockRestaurant.id,
      customer_id: mockCustomer.id,
      mode: 'human', // Inicialmente en modo humano
      status: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockLLMProvider = {
      chat: vi.fn().mockResolvedValue({
        content: 'Respuesta de prueba IA',
      } as LLMResponse),
    };

    mockWhatsAppProvider = {
      sendTextMessage: vi.fn().mockResolvedValue({ success: true, messageId: 'wa-1' }),
      sendMediaMessage: vi.fn(),
      markAsRead: vi.fn(),
    };

    mockChatwootProvider = {
      findOrCreateContact: vi.fn().mockResolvedValue({
        id: 42,
        name: 'Zam',
        phone: '+5215512345678',
      }),
      findOrCreateConversation: vi.fn().mockResolvedValue({
        id: 105,
        status: 'open',
      }),
      postPrivateNote: vi.fn().mockResolvedValue({ id: 1, content: 'note' }),
      forwardIncomingMessage: vi.fn().mockResolvedValue({ id: 2, content: 'msg' }),
      toggleStatus: vi.fn().mockResolvedValue({ success: true, current_status: 'resolved' }),
    };
  });

  const createMockOrchestrator = (mode: 'human' | 'ai') => {
    currentConversation.mode = mode;

    const mockConvoRepo = {
      getById: vi.fn().mockResolvedValue(currentConversation),
      getOrCreateActiveConversation: vi.fn().mockResolvedValue(currentConversation),
      setMode: vi.fn((_restId, _id, m) => {
        currentConversation.mode = m;
        return Promise.resolve(currentConversation);
      }),
      setStatus: vi.fn(),
    } as unknown as ConversationRepository;

    const mockMsgRepo = {
      saveMessage: vi.fn(async (restId, data: Record<string, unknown>) => {
        savedMessages.push({ ...data, restId });
        return {
          id: 'msg-' + savedMessages.length,
          restaurant_id: restId,
          ...data,
          created_at: new Date().toISOString(),
        };
      }),
      getRecentMessages: vi.fn().mockResolvedValue([]),
    } as unknown as MessageRepository;

    const mockRestaurantRepo = {
      getByIdOrSlug: vi.fn().mockResolvedValue(mockRestaurant),
      getAgentConfig: vi.fn().mockResolvedValue(null),
      getLastCompletedOrder: vi.fn().mockResolvedValue(null),
    } as unknown as RestaurantRepository;

    const mockCustomerRepo = {
      getByPhone: vi.fn().mockResolvedValue(mockCustomer),
      upsert: vi.fn().mockResolvedValue(mockCustomer),
      updateNotesMd: vi.fn(),
    } as unknown as CustomerRepository;

    const mockOrderRepo = {
      getActiveDraftOrder: vi.fn().mockResolvedValue(null),
    } as unknown as OrderRepository;

    const mockDb = {} as SupabaseClient<Database>;

    return new AgentOrchestrator({
      db: mockDb,
      env: mockEnv,
      llmProvider: mockLLMProvider,
      whatsAppProvider: mockWhatsAppProvider,
      chatwootProvider: mockChatwootProvider,
      conversationRepo: mockConvoRepo,
      messageRepo: mockMsgRepo,
      restaurantRepo: mockRestaurantRepo,
      customerRepo: mockCustomerRepo,
      orderRepo: mockOrderRepo,
    });
  };

  it('cuando conversation.mode === "human", el bot NO invoca al LLM y reenvía el mensaje a Chatwoot', async () => {
    const orchestrator = createMockOrchestrator('human');

    const result = await orchestrator.processIncomingMessage({
      restaurant: mockRestaurant,
      customer: mockCustomer,
      conversationId: currentConversation.id,
      messageText: '¿Alguien me puede atender?',
      providerMessageId: 'msg-wa-999',
    });

    // 1. Estado retornado debe ser silenced_human_mode
    expect(result.status).toBe('silenced_human_mode');

    // 2. El LLM NUNCA fue llamado ($0.00 en costo de inferencia)
    expect(mockLLMProvider.chat).not.toHaveBeenCalled();

    // 3. El mensaje entrante fue persistido con role: 'user'
    expect(savedMessages.length).toBe(1);
    expect(savedMessages[0]?.role).toBe('user');
    expect(savedMessages[0]?.content).toBe('¿Alguien me puede atender?');

    // 4. Se buscó/creó contacto y conversación en Chatwoot y se reenvió el mensaje
    expect(mockChatwootProvider.findOrCreateContact).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '+5215512345678',
        restaurantId: mockRestaurant.id,
      })
    );
    expect(mockChatwootProvider.findOrCreateConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: 42,
        restaurantId: mockRestaurant.id,
        conversationId: currentConversation.id,
      })
    );
    expect(mockChatwootProvider.forwardIncomingMessage).toHaveBeenCalledWith({
      conversationId: 105,
      messageText: '¿Alguien me puede atender?',
    });

    // 5. No se envía respuesta de IA por WhatsApp
    expect(mockWhatsAppProvider.sendTextMessage).not.toHaveBeenCalled();
  });

  it('cuando conversation.mode === "ai", el bot responde normalmente vía LLM', async () => {
    const orchestrator = createMockOrchestrator('ai');

    const result = await orchestrator.processIncomingMessage({
      restaurant: mockRestaurant,
      customer: mockCustomer,
      conversationId: currentConversation.id,
      messageText: '¿Qué pizzas tienen?',
      providerMessageId: 'msg-wa-1000',
    });

    expect(result.status).toBe('responded');
    expect(mockLLMProvider.chat).toHaveBeenCalledTimes(1);
    expect(mockWhatsAppProvider.sendTextMessage).toHaveBeenCalledWith(
      mockRestaurant.slug,
      mockCustomer.phone,
      'Respuesta de prueba IA'
    );
  });
});
