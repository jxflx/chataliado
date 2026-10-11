import {
  type FindOrCreateContactInput,
  type CreateConversationInput,
  type PostPrivateNoteInput,
  type ForwardIncomingMessageInput,
  type ToggleStatusInput,
} from '../../types/chatwoot';

/**
 * Contrato agnóstico y desacoplado para el proveedor de Chatwoot.
 */
export interface ChatwootProvider {
  /**
   * Busca un contacto existente por teléfono o lo crea en Chatwoot.
   */
  findOrCreateContact(
    input: FindOrCreateContactInput
  ): Promise<{ id: number | string; name?: string | null; phone?: string | null }>;

  /**
   * Busca una conversación activa para el contacto o crea una nueva.
   */
  findOrCreateConversation(
    input: CreateConversationInput
  ): Promise<{ id: number | string; status: string }>;

  /**
   * Publica una nota privada interna en la conversación (invisible para el comensal).
   */
  postPrivateNote(
    input: PostPrivateNoteInput
  ): Promise<{ id: number | string; content: string }>;

  /**
   * Reenvía un mensaje entrante del comensal a la conversación de Chatwoot.
   */
  forwardIncomingMessage(
    input: ForwardIncomingMessageInput
  ): Promise<{ id: number | string; content: string }>;

  /**
   * Modifica el estado de una conversación ('open', 'resolved', 'pending', 'snoozed').
   */
  toggleStatus(
    input: ToggleStatusInput
  ): Promise<{ success?: boolean; current_status: string }>;
}
