/**
 * Tipado de las variables de entorno (bindings) del Cloudflare Worker.
 * Todas las variables sensibles se inyectan via `wrangler secret` o `.dev.vars`.
 */
export interface Env {
  /** URL base de la instancia de Evolution API (ej: https://evo.tudominio.com) */
  EVOLUTION_API_URL: string;
  /** API Key global de Evolution API */
  EVOLUTION_API_KEY: string;
  /** Token secreto compartido para verificar webhooks entrantes de Evolution */
  WEBHOOK_VERIFY_TOKEN: string;
  /** URL del proyecto Supabase */
  SUPABASE_URL: string;
  /** Clave anónima de Supabase (para operaciones con RLS) */
  SUPABASE_ANON_KEY: string;
  /** Clave de servicio de Supabase (para operaciones administrativas) */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** API Key del proveedor de LLM (OpenAI, Groq, OpenRouter, etc.) */
  LLM_API_KEY: string;
  /** Modelo de LLM a utilizar (ej: gpt-4o-mini, llama-3.3-70b-versatile, etc.) */
  LLM_MODEL: string;
  /** URL base del endpoint compatible con OpenAI (ej: https://api.openai.com/v1) */
  LLM_BASE_URL: string;
  /** URL base de la instancia de Chatwoot (ej: https://app.chatwoot.com o https://chatwoot.tudominio.com) */
  CHATWOOT_BASE_URL?: string;
  /** Token de acceso API del bot/agente en Chatwoot */
  CHATWOOT_API_TOKEN?: string;
  /** ID de la cuenta en Chatwoot (Account ID) */
  CHATWOOT_ACCOUNT_ID?: string;
  /** ID del Inbox asignado a WhatsApp en Chatwoot */
  CHATWOOT_INBOX_ID?: string;
  /** Token secreto para verificar webhooks entrantes de Chatwoot */
  CHATWOOT_WEBHOOK_TOKEN?: string;
  /** Lista blanca de números telefónicos autorizados para responder (separados por coma). Si no se define, se permiten todos. */
  PHONE_WHITELIST?: string;
  /** Alias de PHONE_WHITELIST para entorno de desarrollo */
  DEV_PHONE_WHITELIST?: string;
  /** Límite máximo de antigüedad de mensajes en segundos (anti-ráfagas de sincronización). Por defecto: 120 */
  MAX_MESSAGE_AGE_SECONDS?: string | number;
}
