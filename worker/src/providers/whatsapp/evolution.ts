import {
  type WhatsAppProvider,
  type SendTextOptions,
  type SendMediaOptions,
  type SendMessageResult,
} from './interface';
import { WorkerError } from '../../utils/errors';

/**
 * Error específico arrojado por el proveedor de Evolution API.
 */
export class EvolutionProviderError extends WorkerError {
  public readonly details?: unknown;

  constructor(message: string, statusCode: number = 500, details?: unknown) {
    super(message, statusCode);
    this.name = 'EvolutionProviderError';
    this.details = details;
  }
}

/**
 * Configuración necesaria para inicializar el proveedor de Evolution API.
 */
export interface EvolutionProviderConfig {
  /** URL base de la instancia de Evolution API (ej: "https://evo.tudominio.com" o "http://localhost:8080") */
  baseUrl: string;
  /** API Key global de Evolution API */
  apiKey: string;
  /** Función fetch inyectable (útil para testing y mocks) */
  fetchFn?: typeof fetch;
}

/**
 * Implementación de WhatsAppProvider para Evolution API v2.
 * Realiza llamadas HTTP autenticadas mediante el header `apikey`.
 */
export class EvolutionWhatsAppProvider implements WhatsAppProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: EvolutionProviderConfig) {
    if (!config.baseUrl) {
      throw new EvolutionProviderError('Evolution API baseUrl is required', 500);
    }
    if (!config.apiKey) {
      throw new EvolutionProviderError('Evolution API apiKey is required', 500);
    }

    // Eliminar barra final si existe para consistencia en rutas
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Envía un mensaje de texto usando POST /message/sendText/{instance}
   */
  async sendTextMessage(
    instance: string,
    to: string,
    text: string,
    options?: SendTextOptions
  ): Promise<SendMessageResult> {
    const url = `${this.baseUrl}/message/sendText/${encodeURIComponent(instance)}`;

    const body: Record<string, unknown> = {
      number: to,
      text: text,
      delay: options?.delay ?? 1200,
      linkPreview: options?.linkPreview ?? false,
    };

    const responseData = await this.request(url, 'POST', body);

    const messageId =
      responseData &&
      typeof responseData === 'object' &&
      'key' in responseData &&
      responseData.key &&
      typeof responseData.key === 'object' &&
      'id' in responseData.key &&
      typeof responseData.key.id === 'string'
        ? responseData.key.id
        : undefined;

    return {
      success: true,
      messageId,
      rawResponse: responseData,
    };
  }

  /**
   * Envía un archivo multimedia usando POST /message/sendMedia/{instance}
   */
  async sendMediaMessage(
    instance: string,
    to: string,
    mediaUrl: string,
    options?: SendMediaOptions
  ): Promise<SendMessageResult> {
    const url = `${this.baseUrl}/message/sendMedia/${encodeURIComponent(instance)}`;

    const body: Record<string, unknown> = {
      number: to,
      media: mediaUrl,
      mediatype: options?.mediaType ?? 'image',
      caption: options?.caption,
      mimetype: options?.mimetype,
      fileName: options?.fileName,
    };

    const responseData = await this.request(url, 'POST', body);

    const messageId =
      responseData &&
      typeof responseData === 'object' &&
      'key' in responseData &&
      responseData.key &&
      typeof responseData.key === 'object' &&
      'id' in responseData.key &&
      typeof responseData.key.id === 'string'
        ? responseData.key.id
        : undefined;

    return {
      success: true,
      messageId,
      rawResponse: responseData,
    };
  }

  /**
   * Marca un mensaje como leído usando POST /chat/markMessageAsRead/{instance}
   */
  async markAsRead(
    instance: string,
    remoteJid: string,
    messageId: string
  ): Promise<boolean> {
    const url = `${this.baseUrl}/chat/markMessageAsRead/${encodeURIComponent(instance)}`;

    const body = {
      remoteJid,
      id: messageId,
      fromMe: false,
    };

    await this.request(url, 'POST', body);
    return true;
  }

  /**
   * Método interno para realizar peticiones HTTP autenticadas a Evolution API con reintentos y backoff.
   */
  private async request(
    url: string,
    method: string,
    body?: unknown,
    maxRetries: number = 3
  ): Promise<unknown> {
    let lastError: unknown;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.fetchFn(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            apikey: this.apiKey,
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        let data: unknown;
        const responseText = await response.text();
        try {
          data = responseText ? JSON.parse(responseText) : {};
        } catch {
          data = responseText;
        }

        if (response.ok) {
          return data;
        }

        // Errores de cliente 4xx (excepto 429 Rate Limit) no deben reintentarse
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          const errorDetail =
            data && typeof data === 'object' && 'response' in data
              ? JSON.stringify(data)
              : responseText || response.statusText;

          throw new EvolutionProviderError(
            `Evolution API HTTP error ${response.status}: ${errorDetail}`,
            response.status,
            data
          );
        }

        lastError = new EvolutionProviderError(
          `Evolution API HTTP error ${response.status}: ${responseText || response.statusText}`,
          response.status,
          data
        );
      } catch (err: unknown) {
        if (err instanceof EvolutionProviderError && err.statusCode < 500 && err.statusCode !== 429) {
          throw err;
        }
        lastError = err;
      }

      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 150 + Math.random() * 50;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    throw new EvolutionProviderError(
      `Failed to connect to Evolution API: ${errorMessage}`,
      502,
      lastError
    );
  }
}
