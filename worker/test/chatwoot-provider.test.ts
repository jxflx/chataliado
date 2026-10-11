import { describe, it, expect, vi } from 'vitest';
import { ChatwootHttpClient, ChatwootProviderError } from '../src/providers/chatwoot/client';

describe('ChatwootHttpClient (ChatwootProvider)', () => {
  const baseConfig = {
    baseUrl: 'https://chatwoot.example.com',
    apiToken: 'test-api-token-xyz',
    accountId: 1,
    inboxId: 10,
    timeoutMs: 2000,
  };

  describe('findOrCreateContact', () => {
    it('debe devolver contacto existente si search retorna coincidencias', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        expect(url).toContain('/contacts/search?q=%2B5215512345678');
        expect(init?.headers).toMatchObject({
          api_access_token: 'test-api-token-xyz',
        });

        return new Response(
          JSON.stringify({
            payload: [
              {
                id: 42,
                name: 'Zam Existente',
                phone_number: '+5215512345678',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const client = new ChatwootHttpClient({
        ...baseConfig,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const contact = await client.findOrCreateContact({
        phone: '+5215512345678',
        name: 'Zam',
        restaurantId: 'rest-uuid',
      });

      expect(contact.id).toBe(42);
      expect(contact.name).toBe('Zam Existente');
      expect(contact.phone).toBe('+5215512345678');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('debe crear contacto si search no encuentra resultados', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes('/contacts/search')) {
          return new Response(JSON.stringify({ payload: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (url.endsWith('/contacts') && init?.method === 'POST') {
          const body = JSON.parse(init.body as string);
          expect(body.phone_number).toBe('+5215598765432');
          expect(body.name).toBe('Nuevo Cliente');
          expect(body.custom_attributes.restaurant_id).toBe('rest-uuid-abc');

          return new Response(
            JSON.stringify({
              payload: {
                contact: {
                  id: 101,
                  name: 'Nuevo Cliente',
                  phone_number: '+5215598765432',
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response('Not found', { status: 404 });
      });

      const client = new ChatwootHttpClient({
        ...baseConfig,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const contact = await client.findOrCreateContact({
        phone: '+5215598765432',
        name: 'Nuevo Cliente',
        restaurantId: 'rest-uuid-abc',
        restaurantSlug: 'pizzeria-napoli',
      });

      expect(contact.id).toBe(101);
      expect(contact.name).toBe('Nuevo Cliente');
      expect(contact.phone).toBe('+5215598765432');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('findOrCreateConversation', () => {
    it('debe enviar payload correcto a POST /conversations con custom_attributes', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        expect(url).toBe('https://chatwoot.example.com/api/v1/accounts/1/conversations');
        expect(init?.method).toBe('POST');
        const body = JSON.parse(init?.body as string);
        expect(body.inbox_id).toBe(10);
        expect(body.contact_id).toBe(42);
        expect(body.custom_attributes.restaurant_id).toBe('rest-123');
        expect(body.custom_attributes.conversation_id).toBe('conv-789');
        expect(body.custom_attributes.handoff_reason).toBe('Quiere factura');

        return new Response(
          JSON.stringify({
            id: 505,
            status: 'open',
            inbox_id: 10,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const client = new ChatwootHttpClient({
        ...baseConfig,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const conv = await client.findOrCreateConversation({
        contactId: 42,
        restaurantId: 'rest-123',
        conversationId: 'conv-789',
        customerPhone: '+5215512345678',
        reason: 'Quiere factura',
      });

      expect(conv.id).toBe(505);
      expect(conv.status).toBe('open');
    });
  });

  describe('postPrivateNote', () => {
    it('debe enviar mensaje con private: true y message_type: outgoing', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        expect(url).toBe('https://chatwoot.example.com/api/v1/accounts/1/conversations/505/messages');
        expect(init?.method).toBe('POST');
        const body = JSON.parse(init?.body as string);
        expect(body.private).toBe(true);
        expect(body.message_type).toBe('outgoing');
        expect(body.content).toContain('NOTA INTERNA');

        return new Response(
          JSON.stringify({
            id: 888,
            content: body.content,
            conversation_id: 505,
            message_type: 'outgoing',
            private: true,
            created_at: 1756134000,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const client = new ChatwootHttpClient({
        ...baseConfig,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const note = await client.postPrivateNote({
        conversationId: 505,
        content: 'NOTA INTERNA: Cliente VIP',
      });

      expect(note.id).toBe(888);
      expect(note.content).toContain('Cliente VIP');
    });
  });

  describe('forwardIncomingMessage', () => {
    it('debe enviar mensaje con private: false y message_type: incoming', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        expect(url).toBe('https://chatwoot.example.com/api/v1/accounts/1/conversations/505/messages');
        expect(init?.method).toBe('POST');
        const body = JSON.parse(init?.body as string);
        expect(body.private).toBe(false);
        expect(body.message_type).toBe('incoming');
        expect(body.content).toBe('¿Tienen servicio a domicilio?');

        return new Response(
          JSON.stringify({
            id: 889,
            content: body.content,
            conversation_id: 505,
            message_type: 'incoming',
            private: false,
            created_at: 1756134000,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const client = new ChatwootHttpClient({
        ...baseConfig,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const msg = await client.forwardIncomingMessage({
        conversationId: 505,
        messageText: '¿Tienen servicio a domicilio?',
      });

      expect(msg.id).toBe(889);
      expect(msg.content).toBe('¿Tienen servicio a domicilio?');
    });
  });

  describe('toggleStatus', () => {
    it('debe cambiar estado a resolved vía POST /toggle_status', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        expect(url).toBe('https://chatwoot.example.com/api/v1/accounts/1/conversations/505/toggle_status');
        expect(init?.method).toBe('POST');
        const body = JSON.parse(init?.body as string);
        expect(body.status).toBe('resolved');

        return new Response(
          JSON.stringify({
            payload: {
              success: true,
              current_status: 'resolved',
              conversation_id: 505,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const client = new ChatwootHttpClient({
        ...baseConfig,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const res = await client.toggleStatus({
        conversationId: 505,
        status: 'resolved',
      });

      expect(res.current_status).toBe('resolved');
      expect(res.success).toBe(true);
    });
  });

  describe('Manejo Defensivo de Errores', () => {
    it('debe lanzar ChatwootProviderError con status 401 en credenciales inválidas', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
      );

      const client = new ChatwootHttpClient({
        ...baseConfig,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      await expect(
        client.postPrivateNote({ conversationId: 505, content: 'test' })
      ).rejects.toThrow(ChatwootProviderError);

      try {
        await client.postPrivateNote({ conversationId: 505, content: 'test' });
      } catch (err) {
        expect(err).toBeInstanceOf(ChatwootProviderError);
        expect((err as ChatwootProviderError).status).toBe(401);
      }
    });

    it('debe capturar errores de timeout o red', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network connection failed'));

      const client = new ChatwootHttpClient({
        ...baseConfig,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      await expect(
        client.postPrivateNote({ conversationId: 505, content: 'test' })
      ).rejects.toThrow('Error de conexión con Chatwoot');
    });
  });
});
