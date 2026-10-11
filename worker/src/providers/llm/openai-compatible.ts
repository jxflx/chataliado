import {
  type LLMProvider,
  type LLMProviderOptions,
  type LLMMessage,
  type LLMToolDefinition,
  type LLMResponse,
  type LLMToolCall,
  type LLMUsage,
} from './interface';
import { LLMProviderError } from '../../utils/errors';

/**
 * Proveedor de LLM desacoplado y compatible con el protocolo OpenAI Chat Completions.
 * Funciona de manera agnóstica con OpenAI, OpenRouter, Groq y Google Gemini OpenAI endpoint.
 *
 * Utiliza `globalThis.fetch` nativo para compatibilidad estricta con Cloudflare Workers (`workerd`).
 */
export class OpenAICompatibleProvider implements LLMProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly temperature: number;
  private readonly maxTokens?: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: LLMProviderOptions) {
    if (!options.baseUrl || options.baseUrl.trim() === '') {
      throw new LLMProviderError('LLM baseUrl es requerida', 500);
    }
    if (!options.apiKey || options.apiKey.trim() === '') {
      throw new LLMProviderError('LLM apiKey es requerida', 500);
    }
    if (!options.model || options.model.trim() === '') {
      throw new LLMProviderError('LLM model es requerido', 500);
    }

    this.baseUrl = options.baseUrl.trim().replace(/\/+$/, '');
    this.apiKey = options.apiKey.trim();
    this.model = options.model.trim();
    this.timeoutMs = options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : 30000;
    this.temperature = options.temperature !== undefined ? options.temperature : 0.1;
    this.maxTokens = options.maxTokens;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Ejecuta una llamada de completitud de chat con soporte para Function Calling / Tools.
   */
  async chat(messages: LLMMessage[], tools?: LLMToolDefinition[]): Promise<LLMResponse> {
    if (!messages || messages.length === 0) {
      throw new LLMProviderError('Se requiere al menos un mensaje para invocar el LLM', 400);
    }

    const url = `${this.baseUrl}/chat/completions`;

    const formattedMessages = messages.map((m) => {
      const payloadMsg: Record<string, unknown> = {
        role: m.role,
        content: m.content,
      };

      if ('tool_calls' in m && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        payloadMsg.tool_calls = m.tool_calls;
      }
      if ('tool_call_id' in m && typeof m.tool_call_id === 'string') {
        payloadMsg.tool_call_id = m.tool_call_id;
      }
      if ('name' in m && typeof m.name === 'string') {
        payloadMsg.name = m.name;
      }

      return payloadMsg;
    });

    const requestBody: Record<string, unknown> = {
      model: this.model,
      messages: formattedMessages,
      temperature: this.temperature,
    };

    if (this.maxTokens !== undefined) {
      requestBody.max_tokens = this.maxTokens;
    }

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (controller.signal.aborted) {
        throw new LLMProviderError(
          `Tiempo de espera agotado al comunicarse con el LLM (${this.timeoutMs}ms)`,
          504
        );
      }
      const rawError = err instanceof Error ? err.message : String(err);
      throw new LLMProviderError(
        `Error de red al comunicarse con el LLM: ${this.sanitizeMessage(rawError)}`,
        502
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const responseText = await response.text();
    let responseJson: unknown;
    try {
      responseJson = responseText ? JSON.parse(responseText) : {};
    } catch {
      responseJson = null;
    }

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status} ${response.statusText}`;

      if (responseJson && typeof responseJson === 'object') {
        const errorObj = responseJson as Record<string, unknown>;
        if (typeof errorObj.error === 'string') {
          errorMessage = errorObj.error;
        } else if (
          errorObj.error &&
          typeof errorObj.error === 'object' &&
          'message' in errorObj.error &&
          typeof (errorObj.error as Record<string, unknown>).message === 'string'
        ) {
          errorMessage = String((errorObj.error as Record<string, unknown>).message);
        }
      } else if (responseText) {
        errorMessage = responseText.slice(0, 300);
      }

      const sanitized = this.sanitizeMessage(errorMessage);
      throw new LLMProviderError(
        `LLM Provider error (${response.status}): ${sanitized}`,
        response.status >= 500 ? 502 : response.status
      );
    }

    if (!responseJson || typeof responseJson !== 'object') {
      throw new LLMProviderError('Respuesta malformada del proveedor LLM: JSON inválido', 502);
    }

    const payload = responseJson as Record<string, unknown>;
    const choices = payload.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new LLMProviderError('Respuesta malformada del proveedor LLM: choices vacío', 502);
    }

    const firstChoice = choices[0] as Record<string, unknown> | undefined;
    const message = firstChoice?.message as Record<string, unknown> | undefined;
    if (!message || typeof message !== 'object') {
      throw new LLMProviderError('Respuesta malformada del proveedor LLM: falta message', 502);
    }

    const content = typeof message.content === 'string' ? message.content : null;

    let toolCalls: LLMToolCall[] | undefined;
    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      toolCalls = message.tool_calls.map((tc: unknown, idx: number): LLMToolCall => {
        const item = tc && typeof tc === 'object' ? (tc as Record<string, unknown>) : {};
        const fn =
          item.function && typeof item.function === 'object'
            ? (item.function as Record<string, unknown>)
            : {};

        const fnName = typeof fn.name === 'string' ? fn.name : '';
        let fnArgs = typeof fn.arguments === 'string' ? fn.arguments : '';
        if (!fnArgs && fn.arguments && typeof fn.arguments === 'object') {
          fnArgs = JSON.stringify(fn.arguments);
        }

        return {
          id: typeof item.id === 'string' ? item.id : `call_${idx}_${Date.now()}`,
          type: 'function',
          function: {
            name: fnName,
            arguments: fnArgs,
          },
        };
      });
    }

    let usage: LLMUsage | undefined;
    if (payload.usage && typeof payload.usage === 'object') {
      const u = payload.usage as Record<string, unknown>;
      usage = {
        prompt_tokens: typeof u.prompt_tokens === 'number' ? u.prompt_tokens : 0,
        completion_tokens: typeof u.completion_tokens === 'number' ? u.completion_tokens : 0,
        total_tokens: typeof u.total_tokens === 'number' ? u.total_tokens : 0,
      };
    }

    return {
      content,
      tool_calls: toolCalls,
      usage,
      rawResponse: responseJson,
    };
  }

  /**
   * Sanitiza cualquier cadena para que nunca se filtre la clave de API ni tokens Bearer.
   */
  private sanitizeMessage(text: string): string {
    if (!text) return '';
    let sanitized = text;
    if (this.apiKey) {
      sanitized = sanitized.split(this.apiKey).join('[REDACTED]');
    }
    // Sanitizar posibles tokens en formato Bearer xxxx
    sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
    return sanitized;
  }
}
