import { type SupabaseClient } from '@supabase/supabase-js';
import { type z } from 'zod';
import { type Database } from '../types/database';
import { type Env } from '../types/env';

/**
 * Contexto de ejecución inyectado por el backend para cada herramienta invocada por el LLM.
 *
 * GARANTÍA DE SEGURIDAD: El LLM jamás suministra ni puede manipular `restaurantId` ni `customerId`.
 * Todo aislamiento multi-tenant se deriva exclusivamente de este contexto verificado.
 */
export interface ToolContext {
  readonly restaurantId: string;
  readonly customerId: string;
  readonly conversationId: string;
  readonly db: SupabaseClient<Database>;
  readonly env: Env;
}

/**
 * Definición modular y fuertemente tipada de una herramienta (Tool) del agente LLM.
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly parameters: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  execute(input: TInput, context: ToolContext): Promise<TOutput>;
}
