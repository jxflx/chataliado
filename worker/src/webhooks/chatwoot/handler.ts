import { type SupabaseClient } from '@supabase/supabase-js';
import { type Env } from '../../types/env';
import { type Database, type Message } from '../../types/database';
import { verifyChatwootWebhookAuth } from './auth';
import { parseChatwootWebhook } from './parser';
import { ValidationError } from '../../utils/errors';
import { type WhatsAppProvider } from '../../providers/whatsapp/interface';
import { EvolutionWhatsAppProvider } from '../../providers/whatsapp/evolution';
import { createSupabaseClient } from '../../providers/supabase/client';
import { RestaurantRepository } from '../../services/db/restaurant-repository';
import { CustomerRepository } from '../../services/db/customer-repository';
import { ConversationRepository } from '../../services/db/conversation-repository';
import { MessageRepository } from '../../services/db/message-repository';

/**
 * Opciones para inyectar dependencias en el controlador del webhook de Chatwoot (para tests).
 */
export interface ChatwootWebhookHandlerOptions {
  customProvider?: WhatsAppProvider;
  customDb?: SupabaseClient<Database>;
  customRestaurantRepo?: RestaurantRepository;
  customCustomerRepo?: CustomerRepository;
  customConversationRepo?: ConversationRepository;
  customMessageRepo?: MessageRepository;
}

/**
 * Controlador principal del webhook de Chatwoot (POST /webhook/chatwoot).
 *
 * Flujo:
 * 1. Extrae y valida el cuerpo JSON.
 * 2. Verifica autenticación segura con timingSafeEqual contra CHATWOOT_WEBHOOK_TOKEN.
 * 3. Parsea y clasifica el evento (descartado, agent_message, conversation_resolved).
 * 4. Si es descartado (nota privada, incoming, activity, bot): responde 200 OK inmediatamente.
 * 5. Si es conversation_resolved: cambia conversations.mode = 'ai' y registra mensaje de auditoría.
 * 6. Si es agent_message (respuesta de asesor humano): guarda en Supabase con role 'human_agent' y despacha a WhatsApp.
 */
export async function handleChatwootWebhook(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
  options?: ChatwootWebhookHandlerOptions
): Promise<Response> {
  // 1. Extraer cuerpo JSON
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError('Invalid JSON in request body');
  }

  // 2. Verificar autenticación timing-safe
  verifyChatwootWebhookAuth(request, env, body);

  // 3. Parsear y clasificar el evento
  const result = parseChatwootWebhook(body);

  // 4. Manejar evento descartado (notas privadas, ecos del comensal, actividades, etc.)
  if (result.kind === 'discarded') {
    return Response.json(
      {
        received: true,
        status: 'discarded',
        reason: result.reason,
        event: result.event,
        details: result.details,
      },
      { status: 200 }
    );
  }

  // Inicializar dependencias de persistencia
  const db = options?.customDb ?? createSupabaseClient(env);
  const restaurantRepo = options?.customRestaurantRepo ?? new RestaurantRepository(db);
  const customerRepo = options?.customCustomerRepo ?? new CustomerRepository(db);
  const conversationRepo = options?.customConversationRepo ?? new ConversationRepository(db);
  const messageRepo = options?.customMessageRepo ?? new MessageRepository(db);

  const backgroundTask = async (): Promise<void> => {
    try {
      // 5. Manejar resolución de conversación (Ticket cerrado -> Reactivar Bot IA)
      if (result.kind === 'conversation_resolved') {
        let resolvedConversationId = result.conversationId;

        if (!resolvedConversationId && result.customerPhone) {
          try {
            const customer = await customerRepo.getByPhone(result.restaurantId, result.customerPhone);
            if (customer) {
              const activeConv = await conversationRepo.getOrCreateActiveConversation(
                result.restaurantId,
                customer.id
              );
              resolvedConversationId = activeConv.id;
            }
          } catch (findErr) {
            console.warn('[handleChatwootWebhook] Error buscando cliente por teléfono:', findErr);
          }
        }

        if (resolvedConversationId) {
          try {
            await conversationRepo.setMode(result.restaurantId, resolvedConversationId, 'ai');
            await messageRepo.saveMessage(result.restaurantId, {
              conversation_id: resolvedConversationId,
              role: 'system',
              content: '[CHATWOOT] Conversación resuelta por operador humano. Modo IA reactivado.',
              metadata: {
                handoff_resolved: true,
                chatwoot_conversation_id: result.chatwootConversationId,
                resolved_at: new Date().toISOString(),
              },
            });
          } catch (convoErr) {
            console.warn('[handleChatwootWebhook] Error actualizando modo en BD:', convoErr);
          }
        }
      }

      // 6. Manejar mensaje de agente humano -> Guardar y despachar a WhatsApp
      if (result.kind === 'agent_message') {
        const provider =
          options?.customProvider ??
          new EvolutionWhatsAppProvider({
            baseUrl: env.EVOLUTION_API_URL,
            apiKey: env.EVOLUTION_API_KEY,
          });

        // Resolver slug del restaurante (para la instancia de WhatsApp)
        let restaurantSlug = result.restaurantId;
        try {
          const rest = await restaurantRepo.getByIdOrSlug(result.restaurantId);
          if (rest?.slug) {
            restaurantSlug = rest.slug;
          }
        } catch (restErr) {
          console.warn('[handleChatwootWebhook] No se pudo resolver slug del restaurante:', restErr);
        }

        // Resolver ID de conversación para persistencia de turnos
        let convId = result.conversationId;
        if (!convId) {
          try {
            const customer = await customerRepo.getByPhone(result.restaurantId, result.customerPhone);
            if (customer) {
              const conv = await conversationRepo.getOrCreateActiveConversation(
                result.restaurantId,
                customer.id
              );
              convId = conv.id;
            }
          } catch (convErr) {
            console.warn('[handleChatwootWebhook] Error resolviendo conversación activa:', convErr);
          }
        }

        // Persistir mensaje con role = 'human_agent'
        let savedMsg: Message | null = null;
        if (convId) {
          try {
            savedMsg = await messageRepo.saveMessage(result.restaurantId, {
              conversation_id: convId,
              role: 'human_agent',
              content: result.messageText,
              metadata: {
                chatwoot_message_id: result.chatwootMessageId,
                chatwoot_conversation_id: result.chatwootConversationId,
                agent_name: result.agentName,
                delivery_status: 'pending',
                dispatched_at: new Date().toISOString(),
              },
            });
          } catch (saveErr) {
            console.warn('[handleChatwootWebhook] Error guardando mensaje human_agent en BD:', saveErr);
          }
        }

        // Despachar texto al WhatsApp del comensal
        try {
          const sendResult = await provider.sendTextMessage(
            restaurantSlug,
            result.customerPhone,
            result.messageText
          );
          if (savedMsg && typeof messageRepo.updateDeliveryStatus === 'function') {
            try {
              if (sendResult.success) {
                await messageRepo.updateDeliveryStatus(result.restaurantId, {
                  messageId: savedMsg.id,
                  status: 'sent',
                  providerMessageId: sendResult.messageId,
                  rawResponse: sendResult.rawResponse,
                });
              } else {
                await messageRepo.updateDeliveryStatus(result.restaurantId, {
                  messageId: savedMsg.id,
                  status: 'failed',
                  error: 'WhatsApp delivery rejected by provider',
                  rawResponse: sendResult.rawResponse,
                });
              }
            } catch (updateErr) {
              console.error('[handleChatwootWebhook] Error actualizando delivery status:', updateErr);
            }
          }
        } catch (sendErr) {
          console.error('[handleChatwootWebhook] Error enviando mensaje a WhatsApp:', sendErr);
          if (savedMsg && typeof messageRepo.updateDeliveryStatus === 'function') {
            try {
              await messageRepo.updateDeliveryStatus(result.restaurantId, {
                messageId: savedMsg.id,
                status: 'failed',
                error: sendErr instanceof Error ? sendErr.message : String(sendErr),
              });
            } catch (updateErr) {
              console.error('[handleChatwootWebhook] Error actualizando delivery status en fallo:', updateErr);
            }
          }
        }
      }
    } catch (bgErr) {
      console.error('[handleChatwootWebhook] Error en backgroundTask:', bgErr);
    }
  };

  if (ctx) {
    ctx.waitUntil(backgroundTask());
  } else {
    await backgroundTask();
  }

  if (result.kind === 'conversation_resolved') {
    return Response.json(
      {
        received: true,
        status: 'resolved_mode_ai',
        restaurantId: result.restaurantId,
        conversationId: result.conversationId,
        chatwootConversationId: result.chatwootConversationId,
      },
      { status: 200 }
    );
  }

  if (result.kind === 'agent_message') {
    return Response.json(
      {
        received: true,
        status: 'dispatched_to_whatsapp',
        messageId: result.chatwootMessageId,
        to: result.customerPhone,
        agent: result.agentName,
      },
      { status: 200 }
    );
  }

  return Response.json({ received: true, status: 'unhandled' }, { status: 200 });
}
