import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type Env } from '../../types/env';
import { type Database } from '../../types/database';

/**
 * Crea una instancia tipada del cliente Supabase para el Cloudflare Worker.
 *
 * Configuración segura para workerd runtime:
 * - `globalThis.fetch.bind(globalThis)` para evitar errores de 'Illegal invocation'.
 * - `persistSession: false` y `autoRefreshToken: false` para optimizar entornos serverless sin estado.
 */
export function createSupabaseClient(
  env: Env,
  customFetch?: typeof fetch
): SupabaseClient<Database> {
  const fetchFn = customFetch ?? globalThis.fetch.bind(globalThis);

  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: fetchFn,
    },
  });
}
