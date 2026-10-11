import { z } from 'zod';

// --- Evolution API Webhook Schemas ---

/**
 * Esquema del objeto `key` dentro de `data`.
 * Identifica al remitente y al mensaje.
 */
export const messageKeySchema = z.object({
  remoteJid: z.string(),
  fromMe: z.boolean(),
  id: z.string(),
  participant: z.string().optional(),
});

/**
 * Esquema del objeto `message` dentro de `data`.
 * El texto puede venir en distintas ubicaciones dependiendo del tipo de mensaje.
 */
export const messageContentSchema = z.object({
  conversation: z.string().optional(),
  extendedTextMessage: z.object({
    text: z.string().optional(),
  }).optional(),
  imageMessage: z.object({
    caption: z.string().optional(),
    mimetype: z.string().optional(),
    url: z.string().optional(),
  }).optional(),
}).passthrough();

/**
 * Esquema del objeto `data` del evento MESSAGES_UPSERT.
 */
export const messageDataSchema = z.object({
  key: messageKeySchema,
  pushName: z.string().optional(),
  message: messageContentSchema.optional(),
  messageType: z.string().optional(),
  messageTimestamp: z.union([z.number(), z.string()]).optional(),
});

/**
 * Esquema general para cualquier webhook de Evolution API.
 * Acepta cualquier evento (messages.upsert, connection.update, contacts.update, etc.)
 */
export const evolutionWebhookSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.unknown(),
  sender: z.string().optional(),
  serverUrl: z.string().optional(),
  server_url: z.string().optional(),
  apikey: z.string().optional(),
  destination: z.string().optional(),
  date_time: z.string().optional(),
});

export type EvolutionWebhookPayload = z.infer<typeof evolutionWebhookSchema>;

// --- Normalized Message Types ---

/** Razones por las que un mensaje se descarta. */
export type DiscardReason =
  | 'from_me'
  | 'group_message'
  | 'broadcast_message'
  | 'status_update'
  | 'no_text_content'
  | 'unsupported_event'
  | 'phone_not_whitelisted'
  | 'message_too_old';

/** Mensaje descartado — no requiere procesamiento. */
export interface DiscardedMessage {
  kind: 'discarded';
  reason: DiscardReason;
  instanceId: string;
}

/** Mensaje procesable — contiene texto extraído y datos del remitente. */
export interface ParsedMessage {
  kind: 'message';
  instanceId: string;
  senderPhone: string;
  senderName: string;
  messageText: string;
  messageId: string;
  timestamp: number;
}

export type WebhookParseResult = ParsedMessage | DiscardedMessage;
