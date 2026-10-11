import { type Env } from '../../types/env';
import { AuthenticationError } from '../../utils/errors';

/**
 * Comparación de strings en tiempo constante para mitigar ataques de temporización.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);

  let mismatch = 0;
  for (let i = 0; i < aBuf.length; i++) {
    const aByte = aBuf[i] ?? 0;
    const bByte = bBuf[i] ?? 0;
    mismatch |= aByte ^ bByte;
  }

  return mismatch === 0;
}

/**
 * Verifica la autenticidad del webhook entrante de Chatwoot.
 *
 * Busca el token en:
 * 1. Query parameter: `?token=<secret>`
 * 2. Headers: `x-webhook-token`, `x-api-key`, `apikey`, `apiKey`, o `Authorization: Bearer <secret>`
 * 3. Body: `body.token` o `body.apikey`
 *
 * @throws {AuthenticationError} Si el token es inválido o no existe.
 */
export function verifyChatwootWebhookAuth(
  request: Request,
  env: Env,
  body?: unknown
): void {
  const url = new URL(request.url);
  const tokenFromQuery = url.searchParams.get('token');

  const tokenFromHeader =
    request.headers.get('x-webhook-token') ??
    request.headers.get('x-api-key') ??
    request.headers.get('apikey') ??
    request.headers.get('apiKey') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  let tokenFromBody: string | null = null;
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b.token === 'string') {
      tokenFromBody = b.token;
    } else if (typeof b.apikey === 'string') {
      tokenFromBody = b.apikey;
    }
  }

  const token = tokenFromQuery ?? tokenFromHeader ?? tokenFromBody;

  if (!token) {
    throw new AuthenticationError('Missing Chatwoot webhook authentication token');
  }

  if (!env.CHATWOOT_WEBHOOK_TOKEN) {
    throw new AuthenticationError('Chatwoot webhook token is not configured on server');
  }

  const matches = timingSafeEqual(token, env.CHATWOOT_WEBHOOK_TOKEN);
  if (!matches) {
    throw new AuthenticationError('Invalid Chatwoot webhook token');
  }
}
