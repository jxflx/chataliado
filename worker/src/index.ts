import { type Env } from './types/env';
import { handleEvolutionWebhook } from './webhooks/handler';
import { handleChatwootWebhook } from './webhooks/chatwoot';
import { handleDispatchMessage } from './api/message-dispatch';
import { WorkerError, AuthenticationError, ValidationError } from './utils/errors';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, apikey, x-api-key, x-webhook-token, Authorization',
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // Manejo de preflight CORS (OPTIONS)
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      // 1. Health Check
      if (method === 'GET' && pathname === '/health') {
        return withCors(Response.json({
          status: 'ok',
          service: 'chataliado-worker',
          timestamp: new Date().toISOString(),
        }));
      }

      // 2. Webhook de Evolution API
      if (method === 'POST' && pathname === '/webhook/evolution') {
        const response = await handleEvolutionWebhook(request, env, ctx);
        return withCors(response);
      }

      // 3. Webhook de Chatwoot (Human Handoff & Bot Reactivation)
      if (method === 'POST' && pathname === '/webhook/chatwoot') {
        const response = await handleChatwootWebhook(request, env, ctx);
        return withCors(response);
      }

      // 4. Despacho de mensajes humanos desde el Dashboard (Next.js -> Worker -> WhatsApp)
      if (method === 'POST' && pathname === '/api/messages/send') {
        const response = await handleDispatchMessage(request, env);
        return withCors(response);
      }

      // 5. Ruta no encontrada
      return withCors(Response.json(
        { error: 'Not Found', path: pathname },
        { status: 404 }
      ));
    } catch (err: unknown) {
      // Manejo centralizado de errores controlados
      if (err instanceof AuthenticationError) {
        return withCors(Response.json({ error: err.message }, { status: err.statusCode }));
      }

      if (err instanceof ValidationError) {
        return withCors(Response.json({ error: err.message }, { status: err.statusCode }));
      }

      if (err instanceof WorkerError) {
        return withCors(Response.json({ error: err.message }, { status: err.statusCode }));
      }

      // Error inesperado del servidor
      const errorMessage = err instanceof Error ? err.message : 'Internal Server Error';
      console.error('Unhandled worker error:', err);
      return withCors(Response.json({ error: errorMessage }, { status: 500 }));
    }
  },
} satisfies ExportedHandler<Env>;

