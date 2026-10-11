import { type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  type Database,
  type Message,
  type MessageRole,
  type Json,
  type TablesInsert,
  type TablesUpdate,
} from '../../types/database';
import {
  uuidSchema,
  messageRoleSchema,
} from '../../schemas/database';
import { WorkerError } from '../../utils/errors';

export interface SaveMessageInput {
  conversationId?: string;
  conversation_id?: string;
  role: MessageRole;
  content: string;
  providerMessageId?: string | null;
  provider_message_id?: string | null;
  metadata?: Record<string, unknown> | Json;
}

export interface UpdateDeliveryStatusInput {
  messageId: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  providerMessageId?: string;
  error?: string;
  rawResponse?: unknown;
}

const saveMessageValidationSchema = z.object({
  role: messageRoleSchema,
  content: z.string().min(1, { message: 'El contenido del mensaje no puede estar vacío' }),
  provider_message_id: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional().default({}),
});

/**
 * Repositorio de Mensajes con Aislamiento Multi-Tenant Estricto.
 * Persiste turnos conversacionales y recupera historial cronológico para el agente LLM.
 */
export class MessageRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  /**
   * Persiste un mensaje en el historial del chat vinculando rol, contenido y metadatos JSON.
   */
  async saveMessage(
    restaurantId: string,
    input: SaveMessageInput
  ): Promise<Message> {
    const validatedTenant = uuidSchema.parse(restaurantId);
    const rawConvoId = input.conversationId ?? input.conversation_id;
    const validatedConvo = uuidSchema.parse(rawConvoId);

    const validatedInput = saveMessageValidationSchema.parse({
      role: input.role,
      content: input.content,
      provider_message_id:
        input.providerMessageId !== undefined
          ? input.providerMessageId
          : input.provider_message_id ?? null,
      metadata: input.metadata ?? {},
    });

    const insertPayload: TablesInsert<'messages'> = {
      restaurant_id: validatedTenant,
      conversation_id: validatedConvo,
      role: validatedInput.role,
      content: validatedInput.content,
      provider_message_id: validatedInput.provider_message_id ?? null,
      metadata: validatedInput.metadata as Json,
    };

    const { data, error } = await this.db
      .from('messages')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error || !data) {
      console.error('[MessageRepository.saveMessage]', error);
      throw new WorkerError('Error interno al guardar mensaje', 500);
    }

    return data as Message;
  }

  /**
   * Obtiene los últimos N mensajes (por defecto 15) de la conversación ordenados
   * cronológicamente (created_at ASC) para proveer contexto inmediato al LLM.
   */
  async getRecentMessages(
    restaurantId: string,
    conversationId: string,
    limit: number = 15
  ): Promise<Message[]> {
    const validatedTenant = uuidSchema.parse(restaurantId);
    const validatedConvo = uuidSchema.parse(conversationId);
    const validatedLimit = z.number().int().positive().default(15).parse(limit);

    // Consulta los N mensajes más recientes (orden descendente)
    const { data, error } = await this.db
      .from('messages')
      .select('*')
      .eq('restaurant_id', validatedTenant)
      .eq('conversation_id', validatedConvo)
      .order('created_at', { ascending: false })
      .limit(validatedLimit);

    if (error) {
      console.error('[MessageRepository.getRecentMessages]', error);
      throw new WorkerError('Error interno al consultar mensajes recientes', 500);
    }

    if (!data) {
      return [];
    }

    // Invertir el array para retornar el diálogo en orden cronológico natural (ASC)
    const messages = data as Message[];
    return messages.reverse();
  }

  /**
   * Actualiza el estado de entrega (delivery_status) y el identificador de proveedor de un mensaje.
   * Aplica aislamiento multi-tenant estricto por restaurant_id.
   */
  async updateDeliveryStatus(
    restaurantId: string,
    input: UpdateDeliveryStatusInput
  ): Promise<Message | null> {
    const validatedTenant = uuidSchema.parse(restaurantId);
    const validatedMsgId = uuidSchema.parse(input.messageId);

    // 1. Obtener mensaje existente para preservar y combinar metadata
    const { data: existing, error: fetchError } = await this.db
      .from('messages')
      .select('*')
      .eq('restaurant_id', validatedTenant)
      .eq('id', validatedMsgId)
      .single();

    if (fetchError || !existing) {
      if (!existing || (fetchError && (fetchError as { code?: string }).code === 'PGRST116')) {
        return null;
      }
      console.error('[MessageRepository.updateDeliveryStatus] Fetch error:', fetchError);
      throw new WorkerError('Error interno al consultar mensaje para actualizar estado', 500);
    }

    const currentMeta =
      typeof existing.metadata === 'object' && existing.metadata !== null && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};

    const updatedMeta: Record<string, unknown> = {
      ...currentMeta,
      delivery_status: input.status,
      delivery_updated_at: new Date().toISOString(),
    };

    if (input.error !== undefined) {
      updatedMeta.delivery_error = input.error;
    }

    const updatePayload: TablesUpdate<'messages'> = {
      metadata: updatedMeta as Json,
      ...(input.providerMessageId !== undefined ? { provider_message_id: input.providerMessageId } : {}),
    };

    const { data, error } = await this.db
      .from('messages')
      .update(updatePayload)
      .eq('restaurant_id', validatedTenant)
      .eq('id', validatedMsgId)
      .select('*')
      .single();

    if (error || !data) {
      console.error('[MessageRepository.updateDeliveryStatus] Update error:', error);
      throw new WorkerError('Error interno al actualizar estado de entrega', 500);
    }

    return data as Message;
  }
}
