import { WorkerError } from '../../utils/errors';
import {
  type ChatwootConfig,
  type FindOrCreateContactInput,
  type CreateConversationInput,
  type PostPrivateNoteInput,
  type ForwardIncomingMessageInput,
  type ToggleStatusInput,
} from '../../types/chatwoot';
import {
  createContactResponseSchema,
  searchContactsResponseSchema,
  createConversationResponseSchema,
  createMessageResponseSchema,
  toggleConversationStatusResponseSchema,
} from '../../schemas/chatwoot';
import { type ChatwootProvider } from './interface';

/**
 * Error especializado para fallos en la interacción con la API REST de Chatwoot.
 */
export class ChatwootProviderError extends WorkerError {
  public readonly status: number;
  public readonly responseBody?: string;

  constructor(message: string, status: number = 502, responseBody?: string) {
    super(`[ChatwootProvider] ${message}`, status);
    this.name = 'ChatwootProviderError';
    this.status = status;
    this.responseBody = responseBody;
  }
}

/**
 * Cliente HTTP para interactuar con la API REST v1 de Chatwoot.
 * Compatible con Cloudflare Workers (workerd) y 100% testeable con mocks offline.
 */
export class ChatwootHttpClient implements ChatwootProvider {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly accountId: string;
  private readonly defaultInboxId?: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: ChatwootConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiToken = config.apiToken;
    this.accountId = String(config.accountId);
    this.defaultInboxId = config.inboxId !== undefined ? String(config.inboxId) : undefined;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /** Realiza una petición HTTP con autenticación y manejo defensivo de errores */
  private async request<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      body?: unknown;
    } = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1/accounts/${this.accountId}${path}`;
    const method = options.method ?? 'GET';

    const headers: Record<string, string> = {
      api_access_token: this.apiToken,
      Accept: 'application/json',
    };

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let controller: AbortController | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      controller = new AbortController();
      timeoutId = setTimeout(() => controller?.abort(), this.timeoutMs);

      const response = await this.fetchFn(url, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch {
          errorBody = 'Unable to read response body';
        }

        throw new ChatwootProviderError(
          `HTTP ${response.status} en ${method} ${path}: ${errorBody}`,
          response.status,
          errorBody
        );
      }

      const json = await response.json();
      return json as T;
    } catch (err: unknown) {
      if (timeoutId) clearTimeout(timeoutId);

      if (err instanceof ChatwootProviderError) {
        throw err;
      }

      const isAbort =
        (err instanceof Error && err.name === 'AbortError') ||
        String(err).includes('aborted');

      if (isAbort) {
        throw new ChatwootProviderError(
          `Timeout de ${this.timeoutMs}ms agotado al llamar a Chatwoot en ${path}`,
          504
        );
      }

      const errMsg = err instanceof Error ? err.message : String(err);
      throw new ChatwootProviderError(
        `Error de conexión con Chatwoot en ${path}: ${errMsg}`,
        502
      );
    }
  }

  /**
   * Busca un contacto existente por teléfono o lo crea en Chatwoot.
   */
  async findOrCreateContact(
    input: FindOrCreateContactInput
  ): Promise<{ id: number | string; name?: string | null; phone?: string | null }> {
    const rawPhone = input.phone.trim();

    // 1. Intentar buscar contacto existente
    try {
      const searchRes = await this.request<unknown>(
        `/contacts/search?q=${encodeURIComponent(rawPhone)}`
      );

      const parsedSearch = searchContactsResponseSchema.safeParse(searchRes);
      if (parsedSearch.success && parsedSearch.data.payload && parsedSearch.data.payload.length > 0) {
        const found = parsedSearch.data.payload[0];
        if (found && found.id) {
          return {
            id: found.id,
            name: found.name ?? input.name,
            phone: found.phone_number ?? input.phone,
          };
        }
      }
    } catch (searchErr) {
      console.warn('[ChatwootHttpClient.findOrCreateContact] Búsqueda falló, intentando creación:', searchErr);
    }

    // 2. Si no se encuentra, crear nuevo contacto
    const inboxId = this.defaultInboxId ? Number(this.defaultInboxId) : undefined;
    const createBody = {
      inbox_id: inboxId,
      name: input.name?.trim() || input.phone,
      phone_number: input.phone,
      identifier: input.identifier ?? undefined,
      custom_attributes: {
        restaurant_id: input.restaurantId,
        ...(input.restaurantSlug ? { restaurant_slug: input.restaurantSlug } : {}),
        ...(input.customAttributes ?? {}),
      },
    };

    const createRes = await this.request<unknown>('/contacts', {
      method: 'POST',
      body: createBody,
    });

    const parsedCreate = createContactResponseSchema.safeParse(createRes);
    if (parsedCreate.success && parsedCreate.data.payload.contact) {
      const created = parsedCreate.data.payload.contact;
      if (created.id !== undefined) {
        return {
          id: created.id,
          name: created.name ?? input.name,
          phone: created.phone_number ?? input.phone,
        };
      }
    }

    // Fallback si la respuesta no tiene el wrapper payload.contact
    if (createRes && typeof createRes === 'object' && 'id' in createRes) {
      const direct = createRes as { id: number | string; name?: string; phone_number?: string };
      return {
        id: direct.id,
        name: direct.name ?? input.name,
        phone: direct.phone_number ?? input.phone,
      };
    }

    throw new ChatwootProviderError('Respuesta inesperada al crear contacto en Chatwoot', 502);
  }

  /**
   * Crea una nueva conversación asociada al contacto e inbox de Chatwoot.
   */
  async findOrCreateConversation(
    input: CreateConversationInput
  ): Promise<{ id: number | string; status: string }> {
    const inboxId = Number(input.inboxId ?? this.defaultInboxId ?? 1);
    const contactId = Number(input.contactId);

    const createBody = {
      inbox_id: inboxId,
      contact_id: contactId,
      status: 'open',
      custom_attributes: {
        restaurant_id: input.restaurantId,
        ...(input.restaurantSlug ? { restaurant_slug: input.restaurantSlug } : {}),
        conversation_id: input.conversationId,
        customer_phone: input.customerPhone,
        ...(input.reason ? { handoff_reason: input.reason } : {}),
        ...(input.customAttributes ?? {}),
      },
    };

    const createRes = await this.request<unknown>('/conversations', {
      method: 'POST',
      body: createBody,
    });

    const parsed = createConversationResponseSchema.safeParse(createRes);
    if (parsed.success) {
      return {
        id: parsed.data.id,
        status: parsed.data.status ?? 'open',
      };
    }

    if (createRes && typeof createRes === 'object' && 'id' in createRes) {
      const direct = createRes as { id: number | string; status?: string };
      return {
        id: direct.id,
        status: direct.status ?? 'open',
      };
    }

    throw new ChatwootProviderError('Respuesta inesperada al crear conversación en Chatwoot', 502);
  }

  /**
   * Publica una nota privada interna en la conversación (invisible para el comensal).
   */
  async postPrivateNote(
    input: PostPrivateNoteInput
  ): Promise<{ id: number | string; content: string }> {
    const body = {
      content: input.content,
      private: true,
      message_type: 'outgoing',
    };

    const res = await this.request<unknown>(
      `/conversations/${input.conversationId}/messages`,
      {
        method: 'POST',
        body,
      }
    );

    const parsed = createMessageResponseSchema.safeParse(res);
    if (parsed.success) {
      return {
        id: parsed.data.id,
        content: parsed.data.content,
      };
    }

    if (res && typeof res === 'object' && 'id' in res) {
      const direct = res as { id: number | string; content: string };
      return {
        id: direct.id,
        content: direct.content,
      };
    }

    throw new ChatwootProviderError('Respuesta inesperada al publicar nota privada', 502);
  }

  /**
   * Reenvía un mensaje entrante del comensal a la conversación de Chatwoot.
   */
  async forwardIncomingMessage(
    input: ForwardIncomingMessageInput
  ): Promise<{ id: number | string; content: string }> {
    const body = {
      content: input.messageText,
      private: false,
      message_type: 'incoming',
    };

    const res = await this.request<unknown>(
      `/conversations/${input.conversationId}/messages`,
      {
        method: 'POST',
        body,
      }
    );

    const parsed = createMessageResponseSchema.safeParse(res);
    if (parsed.success) {
      return {
        id: parsed.data.id,
        content: parsed.data.content,
      };
    }

    if (res && typeof res === 'object' && 'id' in res) {
      const direct = res as { id: number | string; content: string };
      return {
        id: direct.id,
        content: direct.content,
      };
    }

    throw new ChatwootProviderError('Respuesta inesperada al reenviar mensaje entrante', 502);
  }

  /**
   * Modifica el estado de la conversación ('open', 'resolved', 'pending', 'snoozed').
   */
  async toggleStatus(
    input: ToggleStatusInput
  ): Promise<{ success?: boolean; current_status: string }> {
    const body = {
      status: input.status,
    };

    const res = await this.request<unknown>(
      `/conversations/${input.conversationId}/toggle_status`,
      {
        method: 'POST',
        body,
      }
    );

    const parsed = toggleConversationStatusResponseSchema.safeParse(res);
    if (parsed.success) {
      const status =
        parsed.data.payload?.current_status ?? parsed.data.current_status ?? input.status;
      return {
        success: parsed.data.payload?.success ?? parsed.data.success ?? true,
        current_status: status,
      };
    }

    return {
      success: true,
      current_status: input.status,
    };
  }
}
