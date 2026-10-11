import { z } from 'zod';
import { type ParsedChatwootEvent } from '../types/chatwoot';

// ============================================================================
// 1. PRIMITIVAS Y COMPONENTES COMUNES
// ============================================================================

/** Tipos de mensaje soportados (soporta string y enteros de enum Rails) */
export const chatwootMessageTypeSchema = z.union([
  z.literal('incoming'),
  z.literal('outgoing'),
  z.literal('activity'),
  z.literal('template'),
  z.literal(0).transform(() => 'incoming' as const),
  z.literal(1).transform(() => 'outgoing' as const),
  z.literal(2).transform(() => 'activity' as const),
  z.literal(3).transform(() => 'template' as const),
]);

export type ChatwootMessageType = z.infer<typeof chatwootMessageTypeSchema>;

/** Estados conversacionales de Chatwoot */
export const chatwootConversationStatusSchema = z.enum([
  'open',
  'resolved',
  'pending',
  'snoozed',
]);

export type ChatwootConversationStatus = z.infer<typeof chatwootConversationStatusSchema>;

/** Atributos personalizados genéricos */
export const chatwootCustomAttributesSchema = z.record(z.unknown()).default({});

/** Esquema del emisor (Sender) */
export const chatwootSenderSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  name: z.string().nullable().optional().default('Desconocido'),
  email: z.string().nullable().optional(),
  type: z.enum(['user', 'agent', 'contact', 'agent_bot']).optional().default('user'),
  avatar_url: z.string().nullable().optional(),
  phone_number: z.string().nullable().optional(),
});

export type ChatwootSender = z.infer<typeof chatwootSenderSchema>;

/** Esquema del contacto (Contact) */
export const chatwootContactSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  name: z.string().nullable().optional(),
  phone_number: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  identifier: z.string().nullable().optional(),
  thumbnail: z.string().nullable().optional(),
  custom_attributes: chatwootCustomAttributesSchema.optional(),
  additional_attributes: z.record(z.unknown()).optional(),
  created_at: z.union([z.string(), z.number()]).optional(),
});

export type ChatwootContact = z.infer<typeof chatwootContactSchema>;

/** Esquema de la conversación embebida en payloads */
export const chatwootConversationSchema = z.object({
  id: z.union([z.number(), z.string()]),
  display_id: z.union([z.number(), z.string()]).optional(),
  inbox_id: z.union([z.number(), z.string()]).optional(),
  status: chatwootConversationStatusSchema.optional().default('open'),
  custom_attributes: chatwootCustomAttributesSchema.optional(),
  additional_attributes: z.record(z.unknown()).optional(),
  unread_count: z.number().optional(),
  meta: z.record(z.unknown()).optional(),
  messages: z.array(z.record(z.unknown())).optional(),
  created_at: z.union([z.string(), z.number()]).optional(),
});

export type ChatwootConversation = z.infer<typeof chatwootConversationSchema>;

/** Esquema de cuenta e inbox */
export const chatwootAccountSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string().optional(),
});

export const chatwootInboxSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string().optional(),
});

// ============================================================================
// 2. ESQUEMAS DE OUTBOUND REST API (PETICIONES Y RESPUESTAS)
// ============================================================================

// --- 2.1. Contactos ---
export const createContactRequestSchema = z.object({
  inbox_id: z.union([z.number(), z.string()]).optional(),
  name: z.string().min(1, 'El nombre es obligatorio').optional().nullable(),
  phone_number: z.string().min(1, 'El teléfono es obligatorio'),
  email: z.string().email().optional(),
  identifier: z.string().optional().nullable(),
  custom_attributes: z.record(z.unknown()).optional(),
  additional_attributes: z.record(z.unknown()).optional(),
});

export type CreateContactRequest = z.infer<typeof createContactRequestSchema>;

export const createContactResponseSchema = z.object({
  payload: z.object({
    contact: chatwootContactSchema,
  }),
});

export type CreateContactResponse = z.infer<typeof createContactResponseSchema>;

export const searchContactsResponseSchema = z.object({
  payload: z.array(chatwootContactSchema),
  meta: z
    .object({
      count: z.number().optional(),
      current_page: z.number().optional(),
      total_pages: z.number().optional(),
    })
    .optional(),
});

export type SearchContactsResponse = z.infer<typeof searchContactsResponseSchema>;

// --- 2.2. Conversaciones ---
export const createConversationRequestSchema = z.object({
  inbox_id: z.union([z.number(), z.string()]),
  contact_id: z.union([z.number(), z.string()]),
  source_id: z.string().optional(),
  status: chatwootConversationStatusSchema.optional().default('open'),
  custom_attributes: z.record(z.unknown()).optional(),
  additional_attributes: z.record(z.unknown()).optional(),
});

export type CreateConversationRequest = z.infer<typeof createConversationRequestSchema>;

export const createConversationResponseSchema = chatwootConversationSchema.extend({
  messages: z.array(z.record(z.unknown())).optional(),
  meta: z
    .object({
      sender: chatwootSenderSchema.optional(),
    })
    .optional(),
});

export type CreateConversationResponse = z.infer<typeof createConversationResponseSchema>;

export const toggleConversationStatusRequestSchema = z.object({
  status: chatwootConversationStatusSchema,
  snoozed_until: z.number().optional(),
});

export type ToggleConversationStatusRequest = z.infer<typeof toggleConversationStatusRequestSchema>;

export const toggleConversationStatusResponseSchema = z.object({
  payload: z
    .object({
      success: z.boolean().optional(),
      current_status: chatwootConversationStatusSchema.optional(),
      conversation_id: z.union([z.number(), z.string()]).optional(),
    })
    .optional(),
  current_status: chatwootConversationStatusSchema.optional(),
  success: z.boolean().optional(),
});

export type ToggleConversationStatusResponse = z.infer<typeof toggleConversationStatusResponseSchema>;

// --- 2.3. Mensajes ---
export const createMessageRequestSchema = z.object({
  content: z.string().min(1, 'El contenido del mensaje no puede estar vacío'),
  message_type: z.enum(['incoming', 'outgoing']).default('outgoing'),
  private: z.boolean().default(false),
  content_type: z.enum(['text', 'input_select', 'cards', 'form']).optional().default('text'),
  content_attributes: z.record(z.unknown()).optional(),
});

export type CreateMessageRequest = z.infer<typeof createMessageRequestSchema>;

export const createMessageResponseSchema = z.object({
  id: z.union([z.number(), z.string()]),
  content: z.string(),
  inbox_id: z.union([z.number(), z.string()]).optional(),
  conversation_id: z.union([z.number(), z.string()]),
  message_type: chatwootMessageTypeSchema,
  content_type: z.string().optional().default('text'),
  content_attributes: z.record(z.unknown()).optional(),
  created_at: z.union([z.number(), z.string()]),
  private: z.boolean().default(false),
  sender: chatwootSenderSchema.optional(),
});

export type CreateMessageResponse = z.infer<typeof createMessageResponseSchema>;

// ============================================================================
// 3. ESQUEMAS DE INBOUND WEBHOOKS (PAYLOADS RECIBIDOS)
// ============================================================================

/** Payload del evento `message_created` */
export const chatwootMessageCreatedWebhookSchema = z.object({
  event: z.literal('message_created'),
  id: z.union([z.number(), z.string()]),
  content: z.string().nullable().optional().default(''),
  created_at: z.string().optional(),
  message_type: chatwootMessageTypeSchema,
  content_type: z.string().optional().default('text'),
  content_attributes: z.record(z.unknown()).optional(),
  private: z.boolean().optional().default(false),
  sender: chatwootSenderSchema.optional(),
  contact: chatwootContactSchema.optional(),
  conversation: chatwootConversationSchema,
  account: chatwootAccountSchema.optional(),
  inbox: chatwootInboxSchema.optional(),
});

export type ChatwootMessageCreatedWebhook = z.infer<typeof chatwootMessageCreatedWebhookSchema>;

/** Payload del evento `conversation_status_changed` */
export const chatwootConversationStatusChangedWebhookSchema = z.object({
  event: z.literal('conversation_status_changed'),
  id: z.union([z.number(), z.string()]),
  display_id: z.union([z.number(), z.string()]).optional(),
  status: chatwootConversationStatusSchema,
  contact: chatwootContactSchema.optional(),
  conversation: chatwootConversationSchema.optional(),
  custom_attributes: chatwootCustomAttributesSchema.optional(),
  account: chatwootAccountSchema.optional(),
  inbox_id: z.union([z.number(), z.string()]).optional(),
  created_at: z.string().optional(),
});

export type ChatwootConversationStatusChangedWebhook = z.infer<
  typeof chatwootConversationStatusChangedWebhookSchema
>;

/** Payload del evento `conversation_updated` */
export const chatwootConversationUpdatedWebhookSchema = z.object({
  event: z.literal('conversation_updated'),
  id: z.union([z.number(), z.string()]),
  display_id: z.union([z.number(), z.string()]).optional(),
  status: chatwootConversationStatusSchema.optional(),
  contact: chatwootContactSchema.optional(),
  conversation: chatwootConversationSchema.optional(),
  custom_attributes: chatwootCustomAttributesSchema.optional(),
  account: chatwootAccountSchema.optional(),
  inbox_id: z.union([z.number(), z.string()]).optional(),
});

export type ChatwootConversationUpdatedWebhook = z.infer<
  typeof chatwootConversationUpdatedWebhookSchema
>;

/** Esquema genérico para cualquier otro webhook */
export const chatwootGenericWebhookSchema = z
  .object({
    event: z.string(),
    id: z.union([z.number(), z.string()]).optional(),
    conversation: chatwootConversationSchema.optional(),
    contact: chatwootContactSchema.optional(),
    account: chatwootAccountSchema.optional(),
  })
  .passthrough();

export type ChatwootGenericWebhook = z.infer<typeof chatwootGenericWebhookSchema>;

/** Unión de todos los esquemas de webhook de Chatwoot */
export const chatwootWebhookPayloadSchema = z.union([
  chatwootMessageCreatedWebhookSchema,
  chatwootConversationStatusChangedWebhookSchema,
  chatwootConversationUpdatedWebhookSchema,
  chatwootGenericWebhookSchema,
]);

export type ChatwootWebhookPayload = z.infer<typeof chatwootWebhookPayloadSchema>;

// ============================================================================
// 4. PARSER Y CLASIFICADOR CENTRALIZADO DE WEBHOOKS
// ============================================================================

export function parseChatwootWebhook(rawBody: unknown): ParsedChatwootEvent {
  const parseResult = chatwootWebhookPayloadSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return {
      kind: 'discarded',
      reason: 'unsupported_event',
      event: 'unknown',
      details: parseResult.error.issues.map((i) => i.message).join(', '),
    };
  }

  const payload = parseResult.data;

  // 1. Mensajes creados (message_created)
  if (payload.event === 'message_created') {
    const msg = payload as ChatwootMessageCreatedWebhook;

    // A. Filtrar notas privadas internas
    if (msg.private) {
      return { kind: 'discarded', reason: 'private_note', event: msg.event };
    }

    // B. Filtrar mensajes entrantes (originados por el comensal)
    if (msg.message_type === 'incoming') {
      return { kind: 'discarded', reason: 'incoming_message', event: msg.event };
    }

    // C. Filtrar actividades del sistema o plantillas
    if (msg.message_type === 'activity' || msg.message_type === 'template') {
      return { kind: 'discarded', reason: 'activity_message', event: msg.event };
    }

    // D. Filtrar si el emisor es un bot
    if (msg.sender?.type === 'agent_bot') {
      return { kind: 'discarded', reason: 'bot_sender', event: msg.event };
    }

    // E. Extraer texto del mensaje
    const messageText = (msg.content ?? '').trim();
    if (!messageText) {
      return { kind: 'discarded', reason: 'empty_content', event: msg.event };
    }

    // F. Extraer restaurant_id (Aislamiento Multi-Tenant)
    const convCustom = msg.conversation?.custom_attributes as Record<string, unknown> | undefined;
    const contactCustom = msg.contact?.custom_attributes as Record<string, unknown> | undefined;
    const restaurantId = (convCustom?.restaurant_id ??
      contactCustom?.restaurant_id ??
      convCustom?.restaurant_slug ??
      contactCustom?.restaurant_slug) as string | undefined;

    if (!restaurantId) {
      return { kind: 'discarded', reason: 'missing_tenant_id', event: msg.event };
    }

    // G. Extraer teléfono del comensal (desde contact, conversation custom attributes o meta.sender)
    const convMeta = (msg.conversation as Record<string, unknown> | undefined)?.meta as
      | Record<string, unknown>
      | undefined;
    const metaSender = convMeta?.sender as Record<string, unknown> | undefined;

    const customerPhone =
      (msg.contact?.phone_number as string | undefined) ??
      (convCustom?.customer_phone as string | undefined) ??
      (metaSender?.phone_number as string | undefined);

    if (!customerPhone) {
      return { kind: 'discarded', reason: 'missing_phone', event: msg.event };
    }

    const conversationId = convCustom?.conversation_id as string | undefined;

    return {
      kind: 'agent_message',
      restaurantId,
      customerPhone,
      conversationId,
      messageText,
      chatwootMessageId: String(msg.id),
      chatwootConversationId: String(msg.conversation?.id ?? ''),
      agentName: msg.sender?.name ?? 'Asesor Humano',
    };
  }

  // 2. Cambio de estado / Actualización de conversación
  if (payload.event === 'conversation_status_changed' || payload.event === 'conversation_updated') {
    const status =
      (payload as { status?: string }).status ??
      (payload as { conversation?: { status?: string } }).conversation?.status;

    if (status === 'resolved') {
      const conv = (payload as { conversation?: ChatwootConversation }).conversation;
      const convCustom = (conv?.custom_attributes ??
        (payload as { custom_attributes?: Record<string, unknown> }).custom_attributes) as
        | Record<string, unknown>
        | undefined;
      const contactCustom = (payload as { contact?: ChatwootContact }).contact?.custom_attributes as
        | Record<string, unknown>
        | undefined;

      const restaurantId = (convCustom?.restaurant_id ??
        contactCustom?.restaurant_id ??
        convCustom?.restaurant_slug ??
        contactCustom?.restaurant_slug) as string | undefined;
      if (!restaurantId) {
        return { kind: 'discarded', reason: 'missing_tenant_id', event: payload.event };
      }

      const convMeta = (conv as unknown as Record<string, unknown> | undefined)?.meta as
        | Record<string, unknown>
        | undefined;
      const metaSender = convMeta?.sender as Record<string, unknown> | undefined;

      const customerPhone =
        (payload as { contact?: ChatwootContact }).contact?.phone_number ??
        (convCustom?.customer_phone as string | undefined) ??
        (metaSender?.phone_number as string | undefined);

      return {
        kind: 'conversation_resolved',
        restaurantId,
        customerPhone,
        conversationId: convCustom?.conversation_id as string | undefined,
        chatwootConversationId: String(payload.id ?? conv?.id),
      };
    }
  }

  return {
    kind: 'discarded',
    reason: 'unsupported_event',
    event: payload.event,
  };
}
