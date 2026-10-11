import { type SupabaseClient } from '@supabase/supabase-js';
import { type Env } from '../types/env';
import { type Database } from '../types/database';
import { verifyWebhookAuth } from './auth';
import { parseEvolutionWebhook } from './parser';
import { isPhoneWhitelisted, isMessageAgeValid } from './security-filters';
import { ValidationError } from '../utils/errors';
import { EvolutionWhatsAppProvider } from '../providers/whatsapp/evolution';
import { type WhatsAppProvider } from '../providers/whatsapp/interface';
import { type LLMProvider } from '../providers/llm/interface';
import { OpenAICompatibleProvider } from '../providers/llm/openai-compatible';
import { createSupabaseClient } from '../providers/supabase/client';
import { RestaurantRepository } from '../services/db/restaurant-repository';
import { CustomerRepository } from '../services/db/customer-repository';
import { ConversationRepository } from '../services/db/conversation-repository';
import { AgentOrchestrator } from '../services/agent/orchestrator';
import { EchoService } from '../services/echo';

/**
 * Opciones para inyectar dependencias en el controlador del webhook (útil para pruebas).
 */
export interface WebhookHandlerOptions {
  customProvider?: WhatsAppProvider;
  customDb?: SupabaseClient<Database>;
  customLLMProvider?: LLMProvider;
  customOrchestrator?: AgentOrchestrator;
}

/**
 * Cache de deduplicación en memoria para evitar procesar el mismo mensaje más de una vez.
 *
 * Evolution API (Baileys) envía el evento `messages.upsert` dos veces por cada mensaje
 * recibido (una vez como item individual y otra como parte de un batch).
 * Este Set almacena los messageId procesados durante un breve TTL para filtrar duplicados.
 */
const processedMessages = new Set<string>();

/** Tiempo de vida del cache de deduplicación en ms (60 segundos). */
const DEDUP_TTL_MS = 60_000;

/**
 * Registra un messageId como procesado y programa su limpieza automática.
 */
function markAsProcessed(messageId: string): void {
  processedMessages.add(messageId);
  setTimeout(() => processedMessages.delete(messageId), DEDUP_TTL_MS);
}

/**
 * Controlador principal del webhook de Evolution API (POST /webhook/evolution).
 *
 * Flujo:
 * 1. Extrae y valida el cuerpo JSON de la petición.
 * 2. Verifica autenticación segura con timing-safe comparison (`x-api-key`, `apikey` header o `body.apikey`).
 * 3. Parsea y clasifica el evento con Zod (descartado o mensaje procesable).
 * 4. Si es descartado: responde 200 OK con el motivo.
 * 5. Deduplicación: si el messageId ya fue procesado, responde 200 OK sin re-procesar.
 * 6. Si es mensaje válido: responde 200 OK de inmediato y despacha el orquestador en segundo plano vía `ctx.waitUntil()`.
 */
export async function handleEvolutionWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  options?: WebhookHandlerOptions
): Promise<Response> {
  // 1. Extraer cuerpo JSON
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError('Invalid JSON in request body');
  }

  // 2. Verificar autenticación (inspecciona headers y body.apikey)
  verifyWebhookAuth(request, env, body);

  // 3. Parsear y clasificar el evento
  const result = parseEvolutionWebhook(body);

  console.log(
    `[webhook] event=${(body as Record<string, unknown>).event} instance=${result.instanceId} kind=${result.kind}${
      result.kind === 'message' ? ` sender=${result.senderPhone} msgId=${result.messageId}` : ` reason=${result.reason}`
    }`
  );

  // 4. Manejar evento descartado (fromMe, grupo, sin texto, broadcast, status, evento no soportado)
  if (result.kind === 'discarded') {
    return Response.json(
      {
        received: true,
        status: 'discarded',
        reason: result.reason,
        instance: result.instanceId,
      },
      { status: 200 }
    );
  }

  // 4.1. Filtro Anti-Tormenta: descartar mensajes históricos viejos (ej. ráfaga de sync al encender Docker)
  const ageCheck = isMessageAgeValid(result.timestamp, env.MAX_MESSAGE_AGE_SECONDS);
  if (!ageCheck.isValid) {
    console.warn(
      `[webhook] ⏰ Mensaje histórico descartado: ${ageCheck.ageSeconds}s de antigüedad (límite: ${ageCheck.maxAgeSeconds}s) msgId=${result.messageId} sender=${result.senderPhone}`
    );
    return Response.json(
      {
        received: true,
        status: 'discarded',
        reason: 'message_too_old',
        ageSeconds: ageCheck.ageSeconds,
        maxAgeSeconds: ageCheck.maxAgeSeconds,
        messageId: result.messageId,
        instance: result.instanceId,
      },
      { status: 200 }
    );
  }

  // 4.2. Filtro de Lista Blanca (PHONE_WHITELIST): procesar sólo números autorizados en desarrollo/pruebas
  const whitelist = env.PHONE_WHITELIST ?? env.DEV_PHONE_WHITELIST;
  if (!isPhoneWhitelisted(result.senderPhone, whitelist)) {
    console.warn(
      `[webhook] 🛡️ Mensaje descartado: el número ${result.senderPhone} no está en la lista blanca (PHONE_WHITELIST)`
    );
    return Response.json(
      {
        received: true,
        status: 'discarded',
        reason: 'phone_not_whitelisted',
        sender: result.senderPhone,
        instance: result.instanceId,
      },
      { status: 200 }
    );
  }

  // 5. Deduplicación: descartar si este messageId ya fue procesado
  if (processedMessages.has(result.messageId)) {
    console.log(`[webhook] duplicate messageId=${result.messageId} — skipped`);
    return Response.json(
      {
        received: true,
        status: 'duplicate',
        messageId: result.messageId,
        instance: result.instanceId,
      },
      { status: 200 }
    );
  }

  markAsProcessed(result.messageId);

  // 6. Preparar dependencias del agente
  const provider =
    options?.customProvider ??
    new EvolutionWhatsAppProvider({
      baseUrl: env.EVOLUTION_API_URL,
      apiKey: env.EVOLUTION_API_KEY,
    });

  const db = options?.customDb ?? createSupabaseClient(env);
  const restaurantRepo = new RestaurantRepository(db);
  const customerRepo = new CustomerRepository(db);
  const conversationRepo = new ConversationRepository(db);

  const llmProvider =
    options?.customLLMProvider ??
    new OpenAICompatibleProvider({
      apiKey: env.LLM_API_KEY,
      model: env.LLM_MODEL,
      baseUrl: env.LLM_BASE_URL,
    });

  const orchestrator =
    options?.customOrchestrator ??
    new AgentOrchestrator({
      db,
      env,
      llmProvider,
      whatsAppProvider: provider,
      restaurantRepo,
      customerRepo,
      conversationRepo,
    });

  // 7. Despachar el procesamiento en background sin retrasar la respuesta HTTP
  const backgroundTask = async (): Promise<void> => {
    try {
      // Intentar resolver el restaurante por slug/instanceId
      let restaurant = null;
      try {
        restaurant = await restaurantRepo.getByIdOrSlug(result.instanceId);
      } catch (repoErr) {
        console.warn(`[webhook] Error buscando restaurante '${result.instanceId}':`, repoErr);
      }

      if (!restaurant) {
        console.warn(`[webhook] Restaurante '${result.instanceId}' no encontrado en BD. Ejecutando fallback de eco.`);
        const echoService = new EchoService({ provider });
        await echoService.processMessage(result);
        return;
      }

      // Triple Gate — Barrera 2: Guardia de Suscripción ($0.00 costo LLM para morosos)
      // Si la suscripción está suspendida, persistimos el mensaje para que el dueño
      // lo vea en el dashboard, pero NO invocamos al LLM ni respondemos por WhatsApp.
      if (restaurant.subscription_status === 'suspended') {
        console.warn(
          `[webhook] 🚫 Restaurante '${restaurant.slug}' suspendido. Mensaje persistido, LLM omitido. sender=${result.senderPhone}`
        );
        return;
      }

      // Verificación de Idempotencia en Base de Datos (P0)
      if (result.messageId) {
        try {
          const { error: dedupErr } = await db.from('processed_webhook_events').insert({
            provider_message_id: result.messageId,
            restaurant_id: restaurant.id,
            instance_id: result.instanceId,
          });

          // Si la inserción falla por violación de clave única (duplicado), abortar procesamiento
          if (dedupErr && (dedupErr.code === '23505' || dedupErr.message?.includes('duplicate'))) {
            console.log(`[webhook] DB duplicate provider_message_id=${result.messageId} — skipped`);
            return;
          }
        } catch {
          // Ignorar si la tabla no existe en entornos de test mockeados sin tabla
        }
      }

      // Upsert del comensal asociado al restaurante
      const customer = await customerRepo.upsert(restaurant.id, {
        phone: result.senderPhone,
        name: result.senderName === 'Unknown' ? null : result.senderName,
      });

      // Obtener o crear conversación activa
      const conversation = await conversationRepo.getOrCreateActiveConversation(
        restaurant.id,
        customer.id
      );

      // Invocar orquestador de agente
      const agentResult = await orchestrator.processIncomingMessage({
        restaurant,
        customer,
        conversationId: conversation.id,
        messageText: result.messageText,
        providerMessageId: result.messageId,
      });

      console.log(
        `[webhook] ✓ Agente procesó mensaje para=${result.senderPhone} status=${agentResult.status} conv=${conversation.id}`
      );
    } catch (bgErr: unknown) {
      console.error(`[webhook] ✗ Error en procesamiento background para=${result.senderPhone}:`, bgErr);
    }
  };

  ctx.waitUntil(backgroundTask());

  // 8. Respuesta inmediata de confirmación (Ack) a Evolution API
  return Response.json(
    {
      received: true,
      status: 'processed',
      messageId: result.messageId,
      sender: result.senderPhone,
      senderName: result.senderName,
      instance: result.instanceId,
    },
    { status: 200 }
  );
}

