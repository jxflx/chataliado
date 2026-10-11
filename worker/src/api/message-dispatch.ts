import { type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { type Env } from '../types/env';
import { type Database } from '../types/database';
import { uuidSchema, phoneSchema } from '../schemas/database';
import { ValidationError, AuthenticationError, WorkerError } from '../utils/errors';
import { EvolutionWhatsAppProvider } from '../providers/whatsapp/evolution';
import { type WhatsAppProvider } from '../providers/whatsapp/interface';
import { createSupabaseClient } from '../providers/supabase/client';
import { RestaurantRepository } from '../services/db/restaurant-repository';

/**
 * Esquema de validación para el payload de despacho de mensaje humano.
 */
export const dispatchMessageSchema = z.object({
  restaurant_id: uuidSchema,
  conversation_id: uuidSchema,
  phone: phoneSchema,
  content: z.string().min(1, 'El mensaje no puede estar vacío').max(4000, 'El mensaje no puede exceder 4,000 caracteres'),
});

export type DispatchMessageInput = z.infer<typeof dispatchMessageSchema>;

export interface DispatchMessageOptions {
  customProvider?: WhatsAppProvider;
  customDb?: SupabaseClient<Database>;
}

/**
 * Comparación segura de strings en tiempo constante.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);
  let mismatch = 0;
  for (let i = 0; i < aBuf.length; i++) {
    mismatch |= (aBuf[i] ?? 0) ^ (bBuf[i] ?? 0);
  }
  return mismatch === 0;
}

/**
 * Valida la autenticación de llamadas internas/dashboard al Worker.
 */
function verifyDispatchAuth(request: Request, env: Env): void {
  const authHeader = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const xApiKey = request.headers.get('x-api-key');
  const token = authHeader ?? xApiKey;

  if (!token) {
    throw new AuthenticationError('Token de autenticación requerido');
  }

  const validToken = env.WEBHOOK_VERIFY_TOKEN;
  if (!validToken || !timingSafeEqual(token, validToken)) {
    throw new AuthenticationError('Token de autenticación inválido');
  }
}

/**
 * Controlador para enviar mensajes de WhatsApp desde el Dashboard (Operador Humano).
 * Desacoplado: Next.js -> Worker -> WhatsAppProvider ($0 costo de LLM).
 */
export async function handleDispatchMessage(
  request: Request,
  env: Env,
  options?: DispatchMessageOptions
): Promise<Response> {
  // 1. Verificar autenticación segura
  verifyDispatchAuth(request, env);

  // 2. Parsear y validar cuerpo JSON
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError('Cuerpo de petición JSON inválido');
  }

  const parseResult = dispatchMessageSchema.safeParse(body);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new ValidationError(`Validación fallida: ${errorDetails}`);
  }

  const { restaurant_id, conversation_id, phone, content } = parseResult.data;

  // 3. Inicializar DB y repositorios
  const db = options?.customDb ?? createSupabaseClient(env);
  const restaurantRepo = new RestaurantRepository(db);

  // 4. Verificar existencia y estado activo del restaurante
  const restaurant = await restaurantRepo.getByIdOrSlug(restaurant_id);
  if (!restaurant) {
    throw new WorkerError('Restaurante no encontrado o inactivo', 404);
  }

  if (restaurant.subscription_status === 'suspended') {
    throw new WorkerError('La cuenta del restaurante se encuentra suspendida por falta de pago', 403);
  }

  // 5. Enviar mensaje vía WhatsAppProvider
  const provider =
    options?.customProvider ??
    new EvolutionWhatsAppProvider({
      baseUrl: env.EVOLUTION_API_URL,
      apiKey: env.EVOLUTION_API_KEY,
    });

  const sendResult = await provider.sendTextMessage(
    restaurant.slug,
    phone,
    content
  );

  // 6. Persistir mensaje humano en Supabase
  const { data: savedMessage, error: insertError } = await db
    .from('messages')
    .insert({
      restaurant_id,
      conversation_id,
      role: 'human_agent',
      content,
      provider_message_id: sendResult.messageId ?? null,
      metadata: { dispatched_by: 'dashboard_human_agent' },
    })
    .select()
    .single();

  if (insertError) {
    console.error('[handleDispatchMessage] Error guardando mensaje en BD:', insertError);
    // El mensaje ya fue enviado por WhatsApp, devolvemos éxito con advertencia
    return Response.json({
      success: true,
      messageId: sendResult.messageId,
      dbWarning: 'Mensaje enviado a WhatsApp pero falló la persistencia local',
    });
  }

  return Response.json({
    success: true,
    messageId: sendResult.messageId,
    message: savedMessage,
  });
}
