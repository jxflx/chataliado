import { type Env } from '../types/env';
import { AuthenticationError } from '../utils/errors';

/**
 * Comparación de strings en tiempo constante para mitigar ataques de temporización (timing attacks).
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
 * Verifica que la petición del webhook esté autenticada.
 *
 * Soporta:
 * 1. `x-api-key` en headers: Verificado en tiempo constante contra `env.WEBHOOK_VERIFY_TOKEN`.
 * 2. `apikey` en headers, `body.apikey`, o `Authorization: Bearer <token>`:
 *    Verificado en tiempo constante contra `env.EVOLUTION_API_KEY` o `env.WEBHOOK_VERIFY_TOKEN`.
 *
 * @throws {AuthenticationError} Si el token no es válido o está ausente.
 */
export function verifyWebhookAuth(request: Request, env: Env, body?: unknown): void {
  const xApiKey = request.headers.get('x-api-key');
  const apikeyHeader = request.headers.get('apikey') ?? request.headers.get('apiKey');
  const authHeader = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  const bodyApiKey =
    body &&
    typeof body === 'object' &&
    'apikey' in body &&
    typeof (body as { apikey?: unknown }).apikey === 'string'
      ? (body as { apikey: string }).apikey
      : null;

  const token = xApiKey ?? apikeyHeader ?? authHeader ?? bodyApiKey;

  if (!token) {
    throw new AuthenticationError('Missing authentication token');
  }

  const matchesApiKey =
    Boolean(env.EVOLUTION_API_KEY) && timingSafeEqual(token, env.EVOLUTION_API_KEY);

  const matchesVerifyToken =
    Boolean(env.WEBHOOK_VERIFY_TOKEN) && timingSafeEqual(token, env.WEBHOOK_VERIFY_TOKEN);

  if (!matchesApiKey && !matchesVerifyToken) {
    throw new AuthenticationError('Invalid webhook token');
  }
}
