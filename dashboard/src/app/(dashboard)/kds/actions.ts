'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { type OrderStatus } from '@/types/database';

// Esquemas Zod para validación en boundaries
const uuidSchema = z.string().uuid('ID inválido: debe ser UUID');
const orderStatusSchema = z.enum([
  'draft',
  'confirmed',
  'preparing',
  'ready',
  'delivered',
  'cancelled',
] as const);

const advanceOrderSchema = z.object({
  restaurantId: uuidSchema,
  orderId: uuidSchema,
  fromStatus: orderStatusSchema,
  toStatus: orderStatusSchema,
});

const recallOrderSchema = z.object({
  restaurantId: uuidSchema,
  orderId: uuidSchema,
  fromStatus: orderStatusSchema,
  toStatus: orderStatusSchema,
});

export type ActionResponse<T = unknown> = {
  success: boolean;
  data?: T;
  conflict?: boolean;
  error?: string;
};

const ACTION_TIMEOUT_MS = 8000;

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, errorMsg: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`TIMEOUT: ${errorMsg}`));
    }, ms);
  });
  return Promise.race([
    Promise.resolve(promise),
    timeoutPromise,
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

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
 * Server Action: Avanza atómicamente el estado de una orden en cocina (Bump).
 * Invoca el RPC de PostgreSQL `rpc_advance_order_status` con bloqueo pesimista (SELECT FOR UPDATE).
 * Detecta y reporta conflictos de concurrencia entre tablets.
 */
export async function advanceOrderStatus(
  restaurantId: string,
  orderId: string,
  fromStatus: OrderStatus,
  toStatus: OrderStatus
): Promise<ActionResponse<{ orderId: string; previousStatus: string; newStatus: string }>> {
  try {
    const parseResult = advanceOrderSchema.safeParse({
      restaurantId,
      orderId,
      fromStatus,
      toStatus,
    });

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.issues[0]?.message || 'Datos de orden inválidos',
      };
    }

    const { supabase } = await verifyUserTenantAccess(restaurantId);

    const { data, error } = await withTimeout(
      supabase.rpc('rpc_advance_order_status', {
        p_restaurant_id: restaurantId,
        p_order_id: orderId,
        p_from_status: fromStatus,
        p_to_status: toStatus,
      }),
      ACTION_TIMEOUT_MS,
      'El servidor tardó demasiado en responder al despachar comanda'
    );

    if (error) {
      const errorMsg = error.message || '';

      if (errorMsg.includes('STATUS_CONFLICT')) {
        return {
          success: false,
          conflict: true,
          error: 'Conflicto: La orden ya fue actualizada por otra pantalla de cocina',
        };
      }

      if (errorMsg.includes('ORDER_NOT_FOUND')) {
        return {
          success: false,
          error: 'Orden no encontrada o no pertenece a este restaurante',
        };
      }

      if (errorMsg.includes('INVALID_TRANSITION')) {
        return {
          success: false,
          error: `Transición inválida de "${fromStatus}" a "${toStatus}"`,
        };
      }

      return {
        success: false,
        error: 'Error al avanzar estado de la orden',
      };
    }

    return {
      success: true,
      data: {
        orderId,
        previousStatus: fromStatus,
        newStatus: toStatus,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al despachar orden';
    return { success: false, error: message };
  }
}

/**
 * Server Action: Revierte atómicamente el estado de una orden en cocina (Recall / Deshacer).
 * Invoca el RPC de PostgreSQL `rpc_recall_order_status`.
 */
export async function recallOrderStatus(
  restaurantId: string,
  orderId: string,
  fromStatus: OrderStatus,
  toStatus: OrderStatus
): Promise<ActionResponse<{ orderId: string; previousStatus: string; newStatus: string }>> {
  try {
    const parseResult = recallOrderSchema.safeParse({
      restaurantId,
      orderId,
      fromStatus,
      toStatus,
    });

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.issues[0]?.message || 'Datos de reversión inválidos',
      };
    }

    const { supabase } = await verifyUserTenantAccess(restaurantId);

    const { data, error } = await withTimeout(
      supabase.rpc('rpc_recall_order_status', {
        p_restaurant_id: restaurantId,
        p_order_id: orderId,
        p_from_status: fromStatus,
        p_to_status: toStatus,
      }),
      ACTION_TIMEOUT_MS,
      'El servidor tardó demasiado en responder al revertir comanda'
    );

    if (error) {
      const errorMsg = error.message || '';

      if (errorMsg.includes('STATUS_CONFLICT')) {
        return {
          success: false,
          conflict: true,
          error: 'Conflicto: El pedido ya cambió de estado antes del recall',
        };
      }

      if (errorMsg.includes('ORDER_NOT_FOUND')) {
        return {
          success: false,
          error: 'Orden no encontrada o no pertenece a este restaurante',
        };
      }

      if (errorMsg.includes('INVALID_TRANSITION')) {
        return {
          success: false,
          error: `No se puede revertir de "${fromStatus}" a "${toStatus}"`,
        };
      }

      return {
        success: false,
        error: 'Error al revertir orden',
      };
    }

    return {
      success: true,
      data: {
        orderId,
        previousStatus: fromStatus,
        newStatus: toStatus,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al revertir comanda';
    return { success: false, error: message };
  }
}