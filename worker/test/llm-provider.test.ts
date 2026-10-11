import { describe, it, expect, vi } from 'vitest';
import {
  OpenAICompatibleProvider,
  type LLMMessage,
  type LLMToolDefinition,
} from '../src/providers/llm';
import { LLMProviderError } from '../src/utils/errors';

describe('OpenAICompatibleProvider', () => {
  const defaultOptions = {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test-secret-key-123456789',
    model: 'gpt-4o-mini',
    temperature: 0.1,
    timeoutMs: 5000,
  };

  describe('Constructor Validation', () => {
    it('debe inicializarse correctamente con opciones válidas', () => {
      const provider = new OpenAICompatibleProvider(defaultOptions);
      expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    });

    it('debe arrojar LLMProviderError si baseUrl está vacía', () => {
      expect(
        () => new OpenAICompatibleProvider({ ...defaultOptions, baseUrl: '   ' })
      ).toThrowError(LLMProviderError);
    });

    it('debe arrojar LLMProviderError si apiKey está vacía', () => {
      expect(
        () => new OpenAICompatibleProvider({ ...defaultOptions, apiKey: '' })
      ).toThrowError(LLMProviderError);
    });

    it('debe arrojar LLMProviderError si model está vacío', () => {
      expect(
        () => new OpenAICompatibleProvider({ ...defaultOptions, model: ' ' })
      ).toThrowError(LLMProviderError);
    });

    it('debe limpiar las barras finales de baseUrl', () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: '¡Hola!' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const provider = new OpenAICompatibleProvider({
        ...defaultOptions,
        baseUrl: 'https://openrouter.ai/api/v1///',
        fetchFn: fetchMock,
      });

      return provider.chat([{ role: 'user', content: 'Hola' }]).then(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          'https://openrouter.ai/api/v1/chat/completions',
          expect.any(Object)
        );
      });
    });
  });

  describe('Chat Completions — Text Response', () => {
    it('debe enviar mensajes con headers de autorización y retornar respuesta de texto plana', async () => {
      const mockResponseBody = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1724240000,
        model: 'gpt-4o-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '¡Hola! Bienvenido a Pizzería Napolitana. ¿Qué te gustaría ordenar hoy?',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 20,
          total_tokens: 35,
        },
      };

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponseBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const provider = new OpenAICompatibleProvider({
        ...defaultOptions,
        fetchFn: fetchMock,
      });

      const messages: LLMMessage[] = [
        { role: 'system', content: 'Eres el mesero virtual.' },
        { role: 'user', content: 'Hola buenas tardes' },
      ];

      const result = await provider.chat(messages);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];

      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(requestInit.method).toBe('POST');
      expect(requestInit.headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer sk-test-secret-key-123456789',
      });

      const parsedBody = JSON.parse(requestInit.body as string);
      expect(parsedBody.model).toBe('gpt-4o-mini');
      expect(parsedBody.temperature).toBe(0.1);
      expect(parsedBody.messages).toHaveLength(2);
      expect(parsedBody.messages[0]).toEqual({ role: 'system', content: 'Eres el mesero virtual.' });
      expect(parsedBody.messages[1]).toEqual({ role: 'user', content: 'Hola buenas tardes' });

      expect(result.content).toBe(
        '¡Hola! Bienvenido a Pizzería Napolitana. ¿Qué te gustaría ordenar hoy?'
      );
      expect(result.tool_calls).toBeUndefined();
      expect(result.usage).toEqual({
        prompt_tokens: 15,
        completion_tokens: 20,
        total_tokens: 35,
      });
    });

    it('debe rechazar llamadas con lista vacía de mensajes', async () => {
      const provider = new OpenAICompatibleProvider(defaultOptions);
      await expect(provider.chat([])).rejects.toThrowError(
        'Se requiere al menos un mensaje para invocar el LLM'
      );
    });
  });

  describe('Chat Completions — Tool Calling (Function Calling)', () => {
    it('debe enviar definiciones de herramientas y parsear respuesta con tool_calls', async () => {
      const mockResponseBody = {
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_get_menu_001',
                  type: 'function',
                  function: {
                    name: 'get_menu',
                    arguments: '{"category":"Pizzas"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 40, completion_tokens: 18, total_tokens: 58 },
      };

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponseBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const provider = new OpenAICompatibleProvider({
        ...defaultOptions,
        fetchFn: fetchMock,
      });

      const tools: LLMToolDefinition[] = [
        {
          type: 'function',
          function: {
            name: 'get_menu',
            description: 'Consulta las pizzas del menú',
            parameters: {
              type: 'object',
              properties: { category: { type: 'string' } },
            },
          },
        },
      ];

      const messages: LLMMessage[] = [
        { role: 'user', content: '¿Qué pizzas tienen disponibles?' },
      ];

      const result = await provider.chat(messages, tools);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      const parsedBody = JSON.parse(requestInit.body as string);

      expect(parsedBody.tools).toEqual(tools);
      expect(result.content).toBeNull();
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls?.[0]).toEqual({
        id: 'call_get_menu_001',
        type: 'function',
        function: {
          name: 'get_menu',
          arguments: '{"category":"Pizzas"}',
        },
      });
    });

    it('debe formatear mensajes de turnos previos con tool_calls y respuestas de tool', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Tenemos Pizza Pepperoni a $189 y Pizza Hawaiana a $179.',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const provider = new OpenAICompatibleProvider({
        ...defaultOptions,
        fetchFn: fetchMock,
      });

      const messages: LLMMessage[] = [
        { role: 'user', content: '¿Qué pizzas tienen?' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_abc_123',
              type: 'function',
              function: { name: 'get_menu', arguments: '{"category":"pizzas"}' },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_abc_123',
          content: JSON.stringify({
            items: [
              { name: 'Pizza Pepperoni', price: 189 },
              { name: 'Pizza Hawaiana', price: 179 },
            ],
          }),
        },
      ];

      const result = await provider.chat(messages);

      expect(result.content).toContain('Pizza Pepperoni');
      const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      const parsedBody = JSON.parse(requestInit.body as string);

      expect(parsedBody.messages).toHaveLength(3);
      expect(parsedBody.messages[1].tool_calls).toBeDefined();
      expect(parsedBody.messages[2].tool_call_id).toBe('call_abc_123');
    });
  });

  describe('Security & Error Handling', () => {
    it('debe capturar errores HTTP 401 y sanitizar la clave de API para no filtrarla', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message:
                'Incorrect API key provided: sk-test-secret-key-123456789. You can find your API key at https://platform.openai.com/account/api-keys.',
              type: 'invalid_request_error',
              code: 'invalid_api_key',
            },
          }),
          { status: 401, statusText: 'Unauthorized' }
        )
      );

      const provider = new OpenAICompatibleProvider({
        ...defaultOptions,
        fetchFn: fetchMock,
      });

      try {
        await provider.chat([{ role: 'user', content: 'Hola' }]);
        expect.unreachable('Debería haber lanzado LLMProviderError');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(LLMProviderError);
        const error = err as LLMProviderError;
        expect(error.statusCode).toBe(401);
        expect(error.message).not.toContain('sk-test-secret-key-123456789');
        expect(error.message).toContain('[REDACTED]');
      }
    });

    it('debe manejar errores HTTP 500 del proveedor transformando a 502', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'The server had an error processing your request. Sorry about that!',
          }),
          { status: 500, statusText: 'Internal Server Error' }
        )
      );

      const provider = new OpenAICompatibleProvider({
        ...defaultOptions,
        fetchFn: fetchMock,
      });

      await expect(provider.chat([{ role: 'user', content: 'Hola' }])).rejects.toThrowError(
        LLMProviderError
      );
    });

    it('debe manejar fallos de red o desconexiones con código 502', async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValue(new Error('Connection refused to api.openai.com'));

      const provider = new OpenAICompatibleProvider({
        ...defaultOptions,
        fetchFn: fetchMock,
      });

      try {
        await provider.chat([{ role: 'user', content: 'Hola' }]);
        expect.unreachable('Debería haber lanzado');
      } catch (err) {
        expect(err).toBeInstanceOf(LLMProviderError);
        expect((err as LLMProviderError).statusCode).toBe(502);
        expect((err as LLMProviderError).message).toContain('Error de red al comunicarse con el LLM');
      }
    });

    it('debe rechazar respuestas con cuerpo malformado o sin choices', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const provider = new OpenAICompatibleProvider({
        ...defaultOptions,
        fetchFn: fetchMock,
      });

      await expect(provider.chat([{ role: 'user', content: 'Hola' }])).rejects.toThrowError(
        'Respuesta malformada del proveedor LLM: choices vacío'
      );
    });
  });
});
