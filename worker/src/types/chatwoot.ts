/**
 * Tipos e interfaces de datos para la integración con Chatwoot API v1 y Webhooks.
 */

export type ChatwootMessageType = 'incoming' | 'outgoing' | 'activity' | 'template';

export type ChatwootConversationStatus = 'open' | 'resolved' | 'pending' | 'snoozed';

export type ChatwootSenderType = 'user' | 'agent' | 'contact' | 'agent_bot';

export interface ChatwootSender {
  id: number | string;
  name?: string | null;
  email?: string | null;
  type?: ChatwootSenderType;
  avatar_url?: string | null;
  phone_number?: string | null;
}

export interface ChatwootContact {
  id: number | string;
  name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  identifier?: string | null;
  thumbnail?: string | null;
  custom_attributes?: Record<string, unknown>;
  additional_attributes?: Record<string, unknown>;
  created_at?: string | number;
}

export interface ChatwootConversation {
  id: number | string;
  display_id?: number | string;
  inbox_id?: number | string;
  status?: ChatwootConversationStatus;
  custom_attributes?: Record<string, unknown>;
  additional_attributes?: Record<string, unknown>;
  unread_count?: number;
  meta?: {
    sender?: ChatwootSender;
    assignee?: ChatwootSender;
    team?: { id: number; name: string };
  };
  messages?: unknown[];
  created_at?: string | number;
}

export interface ChatwootAccount {
  id: number | string;
  name?: string;
}

export interface ChatwootInbox {
  id: number | string;
  name?: string;
}

export interface ChatwootMessage {
  id: number | string;
  content: string;
  inbox_id?: number | string;
  conversation_id: number | string;
  message_type: ChatwootMessageType;
  content_type?: string;
  content_attributes?: Record<string, unknown>;
  created_at: string | number;
  private: boolean;
  sender?: ChatwootSender;
}

/** Webhook: message_created */
export interface ChatwootMessageCreatedWebhook {
  event: 'message_created';
  id: number | string;
  content?: string | null;
  created_at?: string;
  message_type: ChatwootMessageType | number;
  content_type?: string;
  content_attributes?: Record<string, unknown>;
  private?: boolean;
  sender?: ChatwootSender;
  contact?: ChatwootContact;
  conversation: ChatwootConversation;
  account?: ChatwootAccount;
  inbox?: ChatwootInbox;
}

/** Webhook: conversation_status_changed */
export interface ChatwootConversationStatusChangedWebhook {
  event: 'conversation_status_changed';
  id: number | string;
  display_id?: number | string;
  status: ChatwootConversationStatus;
  contact?: ChatwootContact;
  conversation?: ChatwootConversation;
  custom_attributes?: Record<string, unknown>;
  account?: ChatwootAccount;
  inbox_id?: number | string;
  created_at?: string;
}

/** Webhook: conversation_updated */
export interface ChatwootConversationUpdatedWebhook {
  event: 'conversation_updated';
  id: number | string;
  display_id?: number | string;
  status?: ChatwootConversationStatus;
  contact?: ChatwootContact;
  conversation?: ChatwootConversation;
  custom_attributes?: Record<string, unknown>;
  account?: ChatwootAccount;
  inbox_id?: number | string;
}

/** Webhook genérico */
export interface ChatwootGenericWebhook {
  event: string;
  id?: number | string;
  conversation?: ChatwootConversation;
  contact?: ChatwootContact;
  account?: ChatwootAccount;
  [key: string]: unknown;
}

export type ChatwootWebhookPayload =
  | ChatwootMessageCreatedWebhook
  | ChatwootConversationStatusChangedWebhook
  | ChatwootConversationUpdatedWebhook
  | ChatwootGenericWebhook;

/** Resultado clasificado y normalizado del webhook */
export type ParsedChatwootEvent =
  | {
      kind: 'agent_message';
      restaurantId: string;
      customerPhone: string;
      conversationId?: string;
      messageText: string;
      chatwootMessageId: string;
      chatwootConversationId: string;
      agentName: string;
    }
  | {
      kind: 'conversation_resolved';
      restaurantId: string;
      customerPhone?: string;
      conversationId?: string;
      chatwootConversationId: string;
    }
  | {
      kind: 'discarded';
      reason:
        | 'private_note'
        | 'incoming_message'
        | 'activity_message'
        | 'bot_sender'
        | 'missing_tenant_id'
        | 'missing_phone'
        | 'empty_content'
        | 'unsupported_event';
      event: string;
      details?: string;
    };

/** Configuración del cliente Chatwoot HTTP */
export interface ChatwootConfig {
  baseUrl: string;
  apiToken: string;
  accountId: string | number;
  inboxId?: string | number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/** Parámetros para buscar o crear contacto */
export interface FindOrCreateContactInput {
  phone: string;
  name?: string | null;
  restaurantId: string;
  restaurantSlug?: string | null;
  identifier?: string | null;
  customAttributes?: Record<string, unknown>;
}

/** Parámetros para crear o buscar conversación */
export interface CreateConversationInput {
  contactId: number | string;
  restaurantId: string;
  restaurantSlug?: string | null;
  conversationId: string;
  customerPhone: string;
  inboxId?: number | string;
  reason?: string;
  customAttributes?: Record<string, unknown>;
}

/** Parámetros para publicar nota privada */
export interface PostPrivateNoteInput {
  conversationId: number | string;
  content: string;
}

/** Parámetros para reenviar mensaje entrante */
export interface ForwardIncomingMessageInput {
  conversationId: number | string;
  messageText: string;
}

/** Parámetros para cambiar estado de conversación */
export interface ToggleStatusInput {
  conversationId: number | string;
  status: ChatwootConversationStatus;
}
