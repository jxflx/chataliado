import { describe, it, expect } from 'vitest';
import {
  chatwootMessageTypeSchema,
  chatwootConversationStatusSchema,
  createContactRequestSchema,
  createContactResponseSchema,
  searchContactsResponseSchema,
  createConversationRequestSchema,
  createConversationResponseSchema,
  toggleConversationStatusRequestSchema,
  toggleConversationStatusResponseSchema,
  createMessageRequestSchema,
  createMessageResponseSchema,
  chatwootMessageCreatedWebhookSchema,
  chatwootConversationStatusChangedWebhookSchema,
  parseChatwootWebhook,
} from '../src/schemas/chatwoot';

describe('Chatwoot Schemas & Parser', () => {
  describe('Primitivas y Enums', () => {
    it('debe parsear tipos de mensajes string y Rails integer enums', () => {
      expect(chatwootMessageTypeSchema.parse('incoming')).toBe('incoming');
      expect(chatwootMessageTypeSchema.parse('outgoing')).toBe('outgoing');
      expect(chatwootMessageTypeSchema.parse('activity')).toBe('activity');
      expect(chatwootMessageTypeSchema.parse('template')).toBe('template');

      expect(chatwootMessageTypeSchema.parse(0)).toBe('incoming');
      expect(chatwootMessageTypeSchema.parse(1)).toBe('outgoing');
      expect(chatwootMessageTypeSchema.parse(2)).toBe('activity');
      expect(chatwootMessageTypeSchema.parse(3)).toBe('template');

      expect(() => chatwootMessageTypeSchema.parse('invalid_type')).toThrow();
      expect(() => chatwootMessageTypeSchema.parse(99)).toThrow();
    });

    it('debe validar estados de conversación', () => {
      expect(chatwootConversationStatusSchema.parse('open')).toBe('open');
      expect(chatwootConversationStatusSchema.parse('resolved')).toBe('resolved');
      expect(chatwootConversationStatusSchema.parse('pending')).toBe('pending');
      expect(chatwootConversationStatusSchema.parse('snoozed')).toBe('snoozed');

      expect(() => chatwootConversationStatusSchema.parse('unknown')).toThrow();
    });
  });

  describe('Outbound API Schemas', () => {
    it('debe validar createContactRequestSchema', () => {
      const valid = {
        name: 'Zam',
        phone_number: '+5215512345678',
        custom_attributes: { restaurant_id: 'rest-123' },
      };
      expect(createContactRequestSchema.parse(valid)).toEqual(valid);

      expect(() =>
        createContactRequestSchema.parse({ name: 'Zam' })
      ).toThrow();
    });

    it('debe validar createContactResponseSchema y searchContactsResponseSchema', () => {
      const contactRes = {
        payload: {
          contact: {
            id: 42,
            name: 'Zam',
            phone_number: '+5215512345678',
          },
        },
      };
      expect(createContactResponseSchema.parse(contactRes)).toBeDefined();

      const searchRes = {
        payload: [
          {
            id: 42,
            name: 'Zam',
            phone_number: '+5215512345678',
          },
        ],
        meta: { count: 1 },
      };
      expect(searchContactsResponseSchema.parse(searchRes)).toBeDefined();
    });

    it('debe validar createConversationRequestSchema y toggleConversationStatusRequestSchema', () => {
      const convReq = {
        inbox_id: 1,
        contact_id: 42,
        custom_attributes: {
          restaurant_id: 'rest-uuid',
          customer_phone: '+5215512345678',
        },
      };
      expect(createConversationRequestSchema.parse(convReq)).toBeDefined();

      const toggleReq = { status: 'resolved' as const };
      expect(toggleConversationStatusRequestSchema.parse(toggleReq)).toBeDefined();
    });

    it('debe validar createMessageRequestSchema y createMessageResponseSchema', () => {
      const msgReq = {
        content: 'Hola mundo',
        private: true,
        message_type: 'outgoing' as const,
      };
      expect(createMessageRequestSchema.parse(msgReq)).toBeDefined();

      const msgRes = {
        id: 99,
        content: 'Hola mundo',
        conversation_id: 105,
        message_type: 'outgoing' as const,
        created_at: '2026-08-25T12:00:00Z',
        private: true,
      };
      expect(createMessageResponseSchema.parse(msgRes)).toBeDefined();
    });
  });

  describe('parseChatwootWebhook', () => {
    it('debe clasificar agent_message para mensaje saliente público de agente humano', () => {
      const raw = {
        event: 'message_created',
        id: 999,
        content: 'Hola, en 15 minutos llega tu pizza.',
        message_type: 'outgoing',
        private: false,
        sender: {
          id: 5,
          name: 'Carlos (Asesor)',
          type: 'user',
        },
        contact: {
          id: 42,
          phone_number: '+5215512345678',
        },
        conversation: {
          id: 105,
          status: 'open',
          custom_attributes: {
            restaurant_id: 'rest-uuid-123',
            conversation_id: 'conv-uuid-789',
          },
        },
      };

      const result = parseChatwootWebhook(raw);
      expect(result.kind).toBe('agent_message');
      if (result.kind === 'agent_message') {
        expect(result.restaurantId).toBe('rest-uuid-123');
        expect(result.customerPhone).toBe('+5215512345678');
        expect(result.conversationId).toBe('conv-uuid-789');
        expect(result.messageText).toBe('Hola, en 15 minutos llega tu pizza.');
        expect(result.agentName).toBe('Carlos (Asesor)');
        expect(result.chatwootMessageId).toBe('999');
        expect(result.chatwootConversationId).toBe('105');
      }
    });

    it('debe descartar notas privadas (private: true)', () => {
      const raw = {
        event: 'message_created',
        id: 999,
        content: 'Nota interna sobre el comensal',
        message_type: 'outgoing',
        private: true,
        conversation: {
          id: 105,
          custom_attributes: { restaurant_id: 'rest-uuid-123' },
        },
      };

      const result = parseChatwootWebhook(raw);
      expect(result.kind).toBe('discarded');
      if (result.kind === 'discarded') {
        expect(result.reason).toBe('private_note');
      }
    });

    it('debe descartar mensajes entrantes (message_type: incoming)', () => {
      const raw = {
        event: 'message_created',
        id: 998,
        content: 'Mensaje que el comensal ya envió',
        message_type: 'incoming',
        private: false,
        conversation: {
          id: 105,
          custom_attributes: { restaurant_id: 'rest-uuid-123' },
        },
      };

      const result = parseChatwootWebhook(raw);
      expect(result.kind).toBe('discarded');
      if (result.kind === 'discarded') {
        expect(result.reason).toBe('incoming_message');
      }
    });

    it('debe descartar mensajes enviados por bot (sender.type: agent_bot)', () => {
      const raw = {
        event: 'message_created',
        id: 997,
        content: 'Respuesta automática de bot',
        message_type: 'outgoing',
        private: false,
        sender: { id: 1, type: 'agent_bot' },
        conversation: {
          id: 105,
          custom_attributes: { restaurant_id: 'rest-uuid-123' },
        },
      };

      const result = parseChatwootWebhook(raw);
      expect(result.kind).toBe('discarded');
      if (result.kind === 'discarded') {
        expect(result.reason).toBe('bot_sender');
      }
    });

    it('debe descartar mensajes sin restaurant_id', () => {
      const raw = {
        event: 'message_created',
        id: 996,
        content: 'Texto sin tenant',
        message_type: 'outgoing',
        private: false,
        contact: { phone_number: '+5215512345678' },
        conversation: { id: 105 },
      };

      const result = parseChatwootWebhook(raw);
      expect(result.kind).toBe('discarded');
      if (result.kind === 'discarded') {
        expect(result.reason).toBe('missing_tenant_id');
      }
    });

    it('debe clasificar conversation_resolved cuando status === resolved', () => {
      const raw = {
        event: 'conversation_status_changed',
        id: 105,
        status: 'resolved',
        conversation: {
          id: 105,
          status: 'resolved',
          custom_attributes: {
            restaurant_id: 'rest-uuid-123',
            conversation_id: 'conv-uuid-789',
            customer_phone: '+5215512345678',
          },
        },
      };

      const result = parseChatwootWebhook(raw);
      expect(result.kind).toBe('conversation_resolved');
      if (result.kind === 'conversation_resolved') {
        expect(result.restaurantId).toBe('rest-uuid-123');
        expect(result.conversationId).toBe('conv-uuid-789');
        expect(result.chatwootConversationId).toBe('105');
      }
    });

    it('debe descartar conversation_status_changed cuando status !== resolved', () => {
      const raw = {
        event: 'conversation_status_changed',
        id: 105,
        status: 'open',
        conversation: {
          id: 105,
          status: 'open',
          custom_attributes: { restaurant_id: 'rest-uuid-123' },
        },
      };

      const result = parseChatwootWebhook(raw);
      expect(result.kind).toBe('discarded');
    });

    it('debe clasificar conversation_updated con status resolved', () => {
      const raw = {
        event: 'conversation_updated',
        id: 105,
        status: 'resolved',
        custom_attributes: {
          restaurant_id: 'rest-uuid-123',
          conversation_id: 'conv-uuid-789',
        },
      };

      const result = parseChatwootWebhook(raw);
      expect(result.kind).toBe('conversation_resolved');
    });
  });
});
