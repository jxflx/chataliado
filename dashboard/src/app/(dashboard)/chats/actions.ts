'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { type ConversationMode, type ConversationStatus, type Message, type Customer } from '@/types/database';

// Esquemas Zod para validación en boundaries
const uuidSchema = z.string().uuid('ID inválido: debe ser UUID');
const phoneSchema = z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Formato de teléfono inválido');
const contentSchema = z.string().trim().min(1, 'El mensaje no puede estar vacío').max(4000, 'El mensaje no puede exceder 4,000 caracteres');

const toggleModeSchema = z.object({
  restaurantId: uuidSchema,
  conversationId: uuidSchema,
  mode: z.enum(['ai', 'human'] as const),
});

const toggleStatusSchema = z.object({
  restaurantId: uuidSchema,
  conversationId: uuidSchema,
  status: z.enum(['open', 'closed'] as const),
});

const sendMessageSchema = z.object({
  restaurantId: uuidSchema,
  conversationId: uuidSchema,
  phone: phoneSchema,
  content: contentSchema,
});

const updateNotesSchema = z.object({
  restaurantId: uuidSchema,
  customerId: uuidSchema,
  notesMd: z.string(),
});

export type ActionResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

/**
 * Valida la autenticación del usuario y su pertenencia al restaurante especificado.
 */
async function verifyUserTenantAccess(restaurantId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('UNAUTHORIZED: Sesión no válida o expirada');
  }

  const { data: rawMembership, error: membershipError } = await supabase
    .from('restaurant_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('restaurant_id', restaurantId)
    .single();

  const membership = rawMembership as unknown as { role: string } | null;

  if (membershipError || !membership) {
    throw new Error('FORBIDDEN: No tienes permisos sobre este restaurante');
  }

  return { supabase, user, role: membership.role };
}

/**
 * Server Action: Cambia el modo de la conversación (Tomar Control / Devolver a IA).
 */
export async function toggleConversationMode(
  restaurantId: string,
  conversationId: string,
  mode: ConversationMode
): Promise<ActionResponse<{ mode: ConversationMode }>> {
  try {
    const parseResult = toggleModeSchema.safeParse({ restaurantId, conversationId, mode });
    if (!parseResult.success) {
      return { success: false, error: parseResult.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { supabase } = await verifyUserTenantAccess(restaurantId);

    const { error: updateError } = await supabase
      .from('conversations')
      .update({
        mode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('restaurant_id', restaurantId);

    if (updateError) {
      console.error('[toggleConversationMode] Error actualizando modo en BD:', updateError);
      return { success: false, error: 'No se pudo actualizar el modo de la conversación' };
    }

    return { success: true, data: { mode } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al cambiar modo';
    return { success: false, error: message };
  }
}

/**
 * Server Action: Cambia el estado de la conversación (open / closed).
 */
export async function toggleConversationStatus(
  restaurantId: string,
  conversationId: string,
  status: ConversationStatus
): Promise<ActionResponse<{ status: ConversationStatus }>> {
  try {
    const parseResult = toggleStatusSchema.safeParse({ restaurantId, conversationId, status });
    if (!parseResult.success) {
      return { success: false, error: parseResult.error.issues[0]?.message || 'Datos inválidos' };
    }

    const { supabase } = await verifyUserTenantAccess(restaurantId);

    const { error: updateError } = await supabase
      .from('conversations')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('restaurant_id', restaurantId);

    if (updateError) {
      console.error('[toggleConversationStatus] Error actualizando estado en BD:', updateError);
      return { success: false, error: 'No se pudo actualizar el estado de la conversación' };
    }

    return { success: true, data: { status } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al cambiar estado';
    return { success: false, error: message };
  }
}

/**
 * Server Action: Envía un mensaje redactado por un operador humano hacia WhatsApp
 * a través del Cloudflare Worker (POST /api/messages/send) a $0.00 de costo de LLM.
 *
 * El token secreto del Worker (WEBHOOK_VERIFY_TOKEN) permanece 100% en el servidor.
 */
export async function sendHumanMessage(params: {
  restaurantId: string;
  conversationId: string;
  phone: string;
  content: string;
}): Promise<ActionResponse<{ messageId?: string; message?: Message }>> {
  try {
    const parseResult = sendMessageSchema.safeParse(params);
    if (!parseResult.success) {
      return { success: false, error: parseResult.error.issues[0]?.message || 'Datos de mensaje inválidos' };
    }

    const { restaurantId, conversationId, phone, content } = parseResult.data;

    // 1. Verificar sesión y autorización en Supabase
    await verifyUserTenantAccess(restaurantId);

    // 2. Comunicar con el Cloudflare Worker de forma segura
    const workerUrl = process.env.WORKER_API_URL || process.env.NEXT_PUBLIC_WORKER_URL || 'http://127.0.0.1:8787';
    const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN || process.env.WORKER_VERIFY_TOKEN || 'test-webhook-verify-token-123';

    const response = await fetch(`${workerUrl.replace(/\/$/, '')}/api/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${verifyToken}`,
      },
      body: JSON.stringify({
        restaurant_id: restaurantId,
        conversation_id: conversationId,
        phone: phone.replace(/^\+/, ''),
        content,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      console.error('[sendHumanMessage] Worker error response:', errorBody);
      return {
        success: false,
        error: (errorBody as { error?: string }).error || `Error del servidor de mensajería (HTTP ${response.status})`,
      };
    }

    const result = (await response.json()) as { success: boolean; messageId?: string; message?: Message };
    return {
      success: true,
      data: {
        messageId: result.messageId,
        message: result.message,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al despachar mensaje';
    console.error('[sendHumanMessage] Exception:', err);
    return { success: false, error: message };
  }
}

/**
 * Server Action: Actualiza las notas en formato Markdown del cliente ("Libreta del Mesero").
 * Aplica aislamiento multi-tenant estricto mediante verificación de tenant y filtro restaurant_id.
 */
export async function updateCustomerNotes(
  restaurantId: string,
  customerId: string,
  notesMd: string
): Promise<ActionResponse<{ success: boolean; customer?: Customer }>> {
  try {
    const parseResult = updateNotesSchema.safeParse({ restaurantId, customerId, notesMd });
    if (!parseResult.success) {
      return { success: false, error: parseResult.error.issues[0]?.message || 'Datos de notas inválidos' };
    }

    const { supabase } = await verifyUserTenantAccess(restaurantId);

    const { data, error: updateError } = await supabase
      .from('customers')
      .update({ notes_md: notesMd })
      .eq('id', customerId)
      .eq('restaurant_id', restaurantId);

    if (updateError) {
      console.error('[updateCustomerNotes] Error actualizando notas en BD:', updateError);
      return { success: false, error: 'No se pudieron actualizar las notas del cliente' };
    }

    return {
      success: true,
      data: {
        success: true,
        customer: (data as unknown as Customer) ?? undefined,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al actualizar notas';
    return { success: false, error: message };
  }
}

