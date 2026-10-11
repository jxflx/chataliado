import {
  evolutionWebhookSchema,
  messageDataSchema,
  type WebhookParseResult,
  type ParsedMessage,
  type DiscardedMessage,
} from './schemas';
import { ValidationError } from '../utils/errors';

/**
 * Extrae el número de teléfono limpio de un JID de WhatsApp.
 * Ejemplo: "5215512345678@s.whatsapp.net" → "5215512345678"
 */
function extractPhone(jid: string): string {
  return jid.split('@')[0] ?? jid;
}

/**
 * Extrae el texto del mensaje desde las distintas ubicaciones posibles
 * dentro del payload de Evolution API.
 */
function extractText(message: Record<string, unknown> | undefined): string | null {
  if (!message) return null;

  // 1. Simple text message
  if (typeof message['conversation'] === 'string' && message['conversation'].length > 0) {
    return message['conversation'];
  }

  // 2. Extended text (links, quotes, replies)
  const extended = message['extendedTextMessage'];
  if (extended && typeof extended === 'object' && 'text' in extended) {
    const text = (extended as { text?: string }).text;
    if (typeof text === 'string' && text.length > 0) return text;
  }

  // 3. Image with caption
  const image = message['imageMessage'];
  if (image && typeof image === 'object' && 'caption' in image) {
    const caption = (image as { caption?: string }).caption;
    if (typeof caption === 'string' && caption.length > 0) return caption;
  }

  return null;
}

/**
 * Parsea y normaliza un payload entrante del webhook de Evolution API.
 *
 * - Valida la estructura con Zod.
 * - Filtra eventos que no son de mensajes (connection.update, contacts.update, etc.) retornando 'discarded'.
 * - Filtra mensajes irrelevantes (propios, de grupo, sin texto).
 * - Retorna un resultado discriminado: ParsedMessage o DiscardedMessage.
 *
 * @throws {ValidationError} Si el payload no cumple el esquema base de Zod o si un evento de mensaje viene corrupto.
 */
export function parseEvolutionWebhook(body: unknown): WebhookParseResult {
  // 1. Validar envoltorio general del evento
  const parsed = evolutionWebhookSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      `Invalid webhook payload: ${parsed.error.issues.map(i => i.message).join(', ')}`
    );
  }

  const payload = parsed.data;
  const instanceId = payload.instance;

  // 2. Si no es un evento de mensaje entrante (ej: contacts.update, chats.update, connection.update), descartar silenciosamente con 200 OK
  if (payload.event !== 'messages.upsert' && payload.event !== 'MESSAGES_UPSERT') {
    return {
      kind: 'discarded',
      reason: 'unsupported_event',
      instanceId,
    } satisfies DiscardedMessage;
  }

  // 3. Validar `data` para eventos de mensaje
  const rawData = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  const parsedData = messageDataSchema.safeParse(rawData);

  if (!parsedData.success) {
    throw new ValidationError(
      `Invalid webhook payload: missing or malformed message data in messages.upsert`
    );
  }

  const { key, pushName, message, messageTimestamp } = parsedData.data;

  // 4. Descartar mensajes enviados por el bot mismo (fromMe: true)
  if (key.fromMe) {
    return {
      kind: 'discarded',
      reason: 'from_me',
      instanceId,
    } satisfies DiscardedMessage;
  }

  // 5. Descartar mensajes de grupos (@g.us)
  if (key.remoteJid.endsWith('@g.us')) {
    return {
      kind: 'discarded',
      reason: 'group_message',
      instanceId,
    } satisfies DiscardedMessage;
  }

  // 5.1. Descartar actualizaciones de estado de WhatsApp (Stories)
  if (key.remoteJid.startsWith('status@') || key.remoteJid === 'status@broadcast') {
    return {
      kind: 'discarded',
      reason: 'status_update',
      instanceId,
    } satisfies DiscardedMessage;
  }

  // 5.2. Descartar mensajes de listas de difusión (@broadcast)
  if (key.remoteJid.endsWith('@broadcast')) {
    return {
      kind: 'discarded',
      reason: 'broadcast_message',
      instanceId,
    } satisfies DiscardedMessage;
  }

  // 6. Extraer texto del mensaje
  const messageText = extractText(message as Record<string, unknown> | undefined);
  if (!messageText) {
    return {
      kind: 'discarded',
      reason: 'no_text_content',
      instanceId,
    } satisfies DiscardedMessage;
  }

  // 7. Normalizar timestamp
  const timestamp = typeof messageTimestamp === 'string'
    ? parseInt(messageTimestamp, 10)
    : (messageTimestamp ?? Math.floor(Date.now() / 1000));

  return {
    kind: 'message',
    instanceId,
    senderPhone: extractPhone(key.remoteJid),
    senderName: pushName ?? 'Unknown',
    messageText,
    messageId: key.id,
    timestamp,
  } satisfies ParsedMessage;
}
