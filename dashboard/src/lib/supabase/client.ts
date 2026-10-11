import { createBrowserClient } from '@supabase/ssr';
import { type Database } from '@/types/database';

/**
 * Crea un cliente Supabase para ejecutarse en el navegador (Client Components).
 * Mantiene la sesión autenticada usando cookies del navegador de forma transparente.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Faltan las variables NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
