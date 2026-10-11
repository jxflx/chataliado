import { z } from 'zod';
import { type ToolDefinition, type ToolContext } from '../interface';
import { ConversationRepository } from '../../services/db/conversation-repository';
import { MessageRepository } from '../../services/db/message-repository';
import { OrderRepository } from '../../services/db/order-repository';
import { ChatwootHttpClient } from '../../providers/chatwoot/client';

export const handoffToHumanToolSchema = z.object({
  reason: z
    .string()
    .min(1, { message: 'Debe especificarse el motivo de la transferencia al operador humano' })
    .describe('Motivo por el cual se escala la conversación a un agente humano'),
});

export type HandoffToHumanToolInput = z.infer<typeof handoffToHumanToolSchema>;

export interface HandoffToHumanToolOutput {
  success: boolean;
  mode: 'human';
  reason: string;
  message: string;
}

export const handoffToHumanTool: ToolDefinition<
  HandoffToHumanToolInput,
  HandoffToHumanToolOutput
> = {
  name: 'handoff_to_human',
  description:
    'Transfiere la conversación al inbox de agentes humanos y silencia las respuestas automáticas del bot.',
  parameters: handoffToHumanToolSchema,

  async execute(
    input: HandoffToHumanToolInput,
    context: ToolContext
  ): Promise<HandoffToHumanToolOutput> {
    const convoRepo = new ConversationRepository(context.db);
    const msgRepo = new MessageRepository(context.db);

    // 1. Actualizar modo en base de datos con aislamiento multi-tenant
    await convoRepo.setMode(context.restaurantId, context.conversationId, 'human');

    // 2. Sincronizar con Chatwoot si las credenciales están configuradas
    if (context.env.CHATWOOT_BASE_URL && context.env.CHATWOOT_API_TOKEN) {
      try {
        const chatwootClient = new ChatwootHttpClient({
          baseUrl: context.env.CHATWOOT_BASE_URL,
          apiToken: context.env.CHATWOOT_API_TOKEN,
          accountId: context.env.CHATWOOT_ACCOUNT_ID || '1',
          inboxId: context.env.CHATWOOT_INBOX_ID || '1',
        });

        // Obtener datos del cliente, restaurante y orden activa en paralelo
        const [customerRes, restaurantRes, draftOrder] = await Promise.all([
          context.db
            .from('customers')
            .select('*')
            .eq('id', context.customerId)
            .eq('restaurant_id', context.restaurantId)
            .maybeSingle(),
          context.db
            .from('restaurants')
            .select('*')
            .eq('id', context.restaurantId)
            .maybeSingle(),
          new OrderRepository(context.db)
            .getActiveDraftOrder(context.restaurantId, context.customerId)
            .catch(() => null),
        ]);

        const customer = customerRes.data;
        const restaurant = restaurantRes.data;
        const customerPhone = customer?.phone || 'unknown';

        // Buscar o crear contacto en Chatwoot
        const contact = await chatwootClient.findOrCreateContact({
          phone: customerPhone,
          name: customer?.name ?? null,
          restaurantId: context.restaurantId,
          restaurantSlug: restaurant?.slug ?? null,
          identifier: context.customerId,
        });

        // Buscar o crear conversación en Chatwoot
        const chatwootConvo = await chatwootClient.findOrCreateConversation({
          contactId: contact.id,
          restaurantId: context.restaurantId,
          restaurantSlug: restaurant?.slug ?? null,
          conversationId: context.conversationId,
          customerPhone,
          reason: input.reason,
        });

        // Construir resumen del carrito / orden activa
        let cartSummary = 'Sin pedido activo';
        if (draftOrder && draftOrder.items && draftOrder.items.length > 0) {
          const itemsLines = draftOrder.items
            .map(
              (item) =>
                `- ${item.quantity}x (ID: ${item.product_id}) — $${Number(item.subtotal).toFixed(2)}`
            )
            .join('\n');
          cartSummary = `${itemsLines}\n- **Subtotal:** $${Number(
            draftOrder.order.subtotal
          ).toFixed(2)}\n- **Total:** $${Number(draftOrder.order.total).toFixed(2)}`;
        }

        // Ensamblar nota privada estructurada
        const privateNote = [
          '🔔 **TRANSFERENCIA A AGENTE HUMANO (HANDOFF)**',
          `- **Restaurante:** ${restaurant?.name ?? 'Restaurante'} (${
            restaurant?.slug ?? context.restaurantId
          })`,
          `- **Cliente:** ${customer?.name ?? 'Sin nombre'} (${customerPhone})`,
          `- **Motivo:** ${input.reason}`,
          '',
          '📝 **Bloc de Notas del Mesero (Memoria):**',
          customer?.notes_md ? customer.notes_md : 'Sin notas registradas',
          '',
          '🛒 **Carrito / Pedido Activo:**',
          cartSummary,
        ].join('\n');

        // Publicar nota privada en Chatwoot
        await chatwootClient.postPrivateNote({
          conversationId: chatwootConvo.id,
          content: privateNote,
        });
      } catch (chatwootErr) {
        console.warn(
          '[handoff_to_human] No se pudo sincronizar con Chatwoot:',
          chatwootErr
        );
      }
    }

    // 3. Registrar mensaje del sistema en historial
    try {
      await msgRepo.saveMessage(context.restaurantId, {
        conversation_id: context.conversationId,
        role: 'system',
        content: `[HANDOFF] Conversación transferida a operador humano. Motivo: ${input.reason}`,
        metadata: {
          handoff: true,
          reason: input.reason,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.warn('[handoff_to_human] No se pudo registrar mensaje del sistema:', err);
    }

    return {
      success: true,
      mode: 'human',
      reason: input.reason,
      message: 'Conversación transferida a operador humano. El bot ha sido silenciado.',
    };
  },
};
