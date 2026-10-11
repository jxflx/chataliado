import { type SupabaseClient } from '@supabase/supabase-js';
import {
  type Database,
  type Conversation,
  type ConversationMode,
  type ConversationStatus,
  type TablesInsert,
  type TablesUpdate,
} from '../../types/database';
import {
  uuidSchema,
  conversationModeSchema,
  conversationStatusSchema,
} from '../../schemas/database';
import { ValidationError, WorkerError } from '../../utils/errors';

/**
 * Repositorio de Conversaciones con Aislamiento Multi-Tenant Estricto.
 * Gestiona el ciclo de vida de los hilos de chat, su modo de atención (IA vs Humano)
 * y su estado de apertura/cierre.
 */
export class ConversationRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  /**
   * Busca una conversación activa (status = 'open') para el cliente en el restaurante.
   * Si no existe ninguna abierta, inserta una nueva con mode = 'ai' y status = 'open'.
   */
  async getOrCreateActiveConversation(
    restaurantId: string,
    customerId: string
  ): Promise<Conversation> {
    const validatedTenant = uuidSchema.parse(restaurantId);
    const validatedCustomer = uuidSchema.parse(customerId);

    // 1. Buscar conversación activa existente
    const { data: existing, error: findError } = await this.db
      .from('conversations')
      .select('*')
      .eq('restaurant_id', validatedTenant)
      .eq('customer_id', validatedCustomer)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError) {
      console.error('[ConversationRepository.getOrCreateActiveConversation] find', findError);
      throw new WorkerError('Error interno al consultar conversación activa', 500);
    }

    if (existing) {
      return existing as Conversation;
    }

    // 2. Si no existe, crear nueva conversación
    const insertPayload: TablesInsert<'conversations'> = {
      restaurant_id: validatedTenant,
      customer_id: validatedCustomer,
      status: 'open',
      mode: 'ai',
    };

    const { data: created, error: insertError } = await this.db
      .from('conversations')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError || !created) {
      console.error('[ConversationRepository.getOrCreateActiveConversation] insert', insertError);
      throw new WorkerError('Error interno al crear conversación', 500);
    }

    return created as Conversation;
  }

  /**
   * Actualiza el modo de atención de la conversación ('ai' | 'human').
   * Garantiza aislamiento estricto por restaurant_id.
   */
  async setMode(
    restaurantId: string,
    conversationId: string,
    mode: ConversationMode
  ): Promise<Conversation> {
    const validatedTenant = uuidSchema.parse(restaurantId);
    const validatedConvo = uuidSchema.parse(conversationId);
    const validatedMode = conversationModeSchema.parse(mode);

    const updatePayload: TablesUpdate<'conversations'> = {
      mode: validatedMode,
    };

    const { data, error } = await this.db
      .from('conversations')
      .update(updatePayload)
      .eq('id', validatedConvo)
      .eq('restaurant_id', validatedTenant)
      .select('*')
      .single();

    if (error || !data) {
      console.error('[ConversationRepository.setMode]', error);
      throw new ValidationError('Conversación no encontrada o no pertenece a este restaurante');
    }

    return data as Conversation;
  }

  /**
   * Actualiza el estado de la conversación ('open' | 'closed').
   * Garantiza aislamiento estricto por restaurant_id.
   */
  async setStatus(
    restaurantId: string,
    conversationId: string,
    status: ConversationStatus
  ): Promise<Conversation> {
    const validatedTenant = uuidSchema.parse(restaurantId);
    const validatedConvo = uuidSchema.parse(conversationId);
    const validatedStatus = conversationStatusSchema.parse(status);

    const updatePayload: TablesUpdate<'conversations'> = {
      status: validatedStatus,
    };

    const { data, error } = await this.db
      .from('conversations')
      .update(updatePayload)
      .eq('id', validatedConvo)
      .eq('restaurant_id', validatedTenant)
      .select('*')
      .single();

    if (error || !data) {
      console.error('[ConversationRepository.setStatus]', error);
      throw new ValidationError('Conversación no encontrada o no pertenece a este restaurante');
    }

    return data as Conversation;
  }

  /**
   * Consulta una conversación por ID asegurando pertenencia al restaurante.
   */
  async getById(
    restaurantId: string,
    conversationId: string
  ): Promise<Conversation | null> {
    const validatedTenant = uuidSchema.parse(restaurantId);
    const validatedConvo = uuidSchema.parse(conversationId);

    const { data, error } = await this.db
      .from('conversations')
      .select('*')
      .eq('id', validatedConvo)
      .eq('restaurant_id', validatedTenant)
      .maybeSingle();

    if (error) {
      console.error('[ConversationRepository.getById]', error);
      throw new WorkerError('Error interno al consultar conversación', 500);
    }

    return data ? (data as Conversation) : null;
  }
}
