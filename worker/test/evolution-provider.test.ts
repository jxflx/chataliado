import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EvolutionWhatsAppProvider,
  EvolutionProviderError,
} from '../src/providers/whatsapp/evolution';

describe('EvolutionWhatsAppProvider', () => {
  const baseUrl = 'https://evo.test.com';
  const apiKey = 'test-secret-key-123';
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  describe('Constructor & Configuration', () => {
    it('should throw EvolutionProviderError if baseUrl is empty', () => {
      expect(() => new EvolutionWhatsAppProvider({ baseUrl: '', apiKey })).toThrow(
        EvolutionProviderError
      );
    });

    it('should throw EvolutionProviderError if apiKey is empty', () => {
      expect(
        () => new EvolutionWhatsAppProvider({ baseUrl: 'https://evo.test.com', apiKey: '' })
      ).toThrow(EvolutionProviderError);
    });

    it('should strip trailing slash from baseUrl', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ key: { id: 'MSG_1' } }), { status: 200 })
      );

      const provider = new EvolutionWhatsAppProvider({
        baseUrl: 'https://evo.test.com///',
        apiKey,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      await provider.sendTextMessage('inst-1', '5215512345678', 'Hola');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://evo.test.com/message/sendText/inst-1',
        expect.any(Object)
      );
    });
  });

  describe('sendTextMessage', () => {
    it('should send text message with correct headers, url and payload', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            key: { remoteJid: '5215512345678@s.whatsapp.net', fromMe: true, id: 'MSG_999' },
            message: { conversation: 'Hola pizza' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const provider = new EvolutionWhatsAppProvider({
        baseUrl,
        apiKey,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await provider.sendTextMessage('pizzeria-centro', '5215512345678', 'Hola pizza', {
        delay: 2000,
        linkPreview: true,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://evo.test.com/message/sendText/pizzeria-centro',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: 'test-secret-key-123',
          },
          body: JSON.stringify({
            number: '5215512345678',
            text: 'Hola pizza',
            delay: 2000,
            linkPreview: true,
          }),
        }
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('MSG_999');
      expect(result.rawResponse).toBeDefined();
    });

    it('should use default delay (1200ms) and linkPreview (false) when options omitted', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ key: { id: 'MSG_DEFAULT' } }), { status: 200 })
      );

      const provider = new EvolutionWhatsAppProvider({
        baseUrl,
        apiKey,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      await provider.sendTextMessage('inst-1', '5215512345678', 'Texto simple');

      const callBody = JSON.parse(mockFetch.mock.calls[0]![1].body);
      expect(callBody.delay).toBe(1200);
      expect(callBody.linkPreview).toBe(false);
    });

    it('should throw EvolutionProviderError on HTTP 400/401/500 errors', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Unauthorized', message: 'Invalid API Key' }), {
          status: 401,
          statusText: 'Unauthorized',
        })
      );

      const provider = new EvolutionWhatsAppProvider({
        baseUrl,
        apiKey,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      await expect(
        provider.sendTextMessage('inst-1', '5215512345678', 'Fallo auth')
      ).rejects.toThrow(EvolutionProviderError);
    });

    it('should throw EvolutionProviderError on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const provider = new EvolutionWhatsAppProvider({
        baseUrl,
        apiKey,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      await expect(
        provider.sendTextMessage('inst-1', '5215512345678', 'Fallo red')
      ).rejects.toThrow(EvolutionProviderError);
    });
  });

  describe('sendMediaMessage', () => {
    it('should send media message with correct url, headers and payload', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ key: { id: 'MEDIA_001' } }), { status: 200 })
      );

      const provider = new EvolutionWhatsAppProvider({
        baseUrl,
        apiKey,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await provider.sendMediaMessage(
        'pizzeria-centro',
        '5215512345678',
        'https://menu.com/menu.pdf',
        {
          caption: 'Consulta nuestro menú',
          mediaType: 'document',
          mimetype: 'application/pdf',
          fileName: 'menu-2026.pdf',
        }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://evo.test.com/message/sendMedia/pizzeria-centro',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: 'test-secret-key-123',
          },
          body: JSON.stringify({
            number: '5215512345678',
            media: 'https://menu.com/menu.pdf',
            mediatype: 'document',
            caption: 'Consulta nuestro menú',
            mimetype: 'application/pdf',
            fileName: 'menu-2026.pdf',
          }),
        }
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('MEDIA_001');
    });
  });

  describe('markAsRead', () => {
    it('should mark message as read using correct endpoint and body', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      const provider = new EvolutionWhatsAppProvider({
        baseUrl,
        apiKey,
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await provider.markAsRead(
        'pizzeria-centro',
        '5215512345678@s.whatsapp.net',
        'MSG_TO_READ_123'
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://evo.test.com/chat/markMessageAsRead/pizzeria-centro',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: 'test-secret-key-123',
          },
          body: JSON.stringify({
            remoteJid: '5215512345678@s.whatsapp.net',
            id: 'MSG_TO_READ_123',
            fromMe: false,
          }),
        }
      );

      expect(result).toBe(true);
    });
  });
});
