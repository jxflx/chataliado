/**
 * Filtros de seguridad y control de tráfico para webhooks de WhatsApp.
 * - Lista blanca de números telefónicos (Whitelist para entornos de desarrollo/pruebas).
 * - Filtro anti-tormenta de sincronización para descartar mensajes históricos viejos.
 */

/**
 * Normaliza un número de teléfono para comparación uniforme:
 * - Elimina todos los caracteres no numéricos (+, -, espacios, paréntesis).
 * - Normaliza variaciones mexicanas (521XXXXXXXXXX a 52XXXXXXXXXX).
 */
export function normalizePhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  if (!digits) return '';

  // Normalización específica para números móviles de México:
  // En WhatsApp a veces viene como 52155... (13 dígitos) o 5255... (12 dígitos).
  if (digits.startsWith('521') && digits.length === 13) {
    return '52' + digits.slice(3);
  }

  return digits;
}

/**
 * Verifica si un número telefónico remitente está autorizado según la lista blanca.
 *
 * @param senderPhone - Número de teléfono del remitente (ej. "5215512345678" o "+52 55 1234 5678")
 * @param whitelistConfig - Cadena con números permitidos separados por coma, punto y coma o espacio (ej. "5512345678, 5215598765432")
 * @returns `true` si el remitente está autorizado o si no hay lista blanca configurada (modo abierto).
 */
export function isPhoneWhitelisted(
  senderPhone: string,
  whitelistConfig?: string | null
): boolean {
  // Si no hay lista blanca configurada o está vacía o es '*', se permite todo el tráfico (modo producción normal)
  if (!whitelistConfig || whitelistConfig.trim() === '' || whitelistConfig.trim() === '*') {
    return true;
  }

  const normalizedSender = normalizePhone(senderPhone);
  if (!normalizedSender) return false;

  // Extraer los últimos 10 dígitos nacionales (si tiene al menos 10 dígitos)
  const senderNational10 = normalizedSender.length >= 10 ? normalizedSender.slice(-10) : normalizedSender;

  // Separar los números configurados en la lista blanca por coma, punto y coma o saltos de línea
  const allowedList = whitelistConfig
    .split(/[,;\n\r]+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  for (const entry of allowedList) {
    const normalizedEntry = normalizePhone(entry);
    if (!normalizedEntry) continue;

    // 1. Coincidencia exacta completa
    if (normalizedSender === normalizedEntry) {
      return true;
    }

    // 2. Coincidencia de 10 dígitos nacionales (ej. "5512345678" coincide con "525512345678" o "5215512345678")
    const entryNational10 = normalizedEntry.length >= 10 ? normalizedEntry.slice(-10) : normalizedEntry;
    if (senderNational10 === entryNational10 && senderNational10.length === 10) {
      return true;
    }

    // 3. Sufijo / Prefijo si uno contiene al otro con longitud significativa (>= 10 dígitos)
    if (normalizedSender.endsWith(normalizedEntry) && normalizedEntry.length >= 10) {
      return true;
    }
    if (normalizedEntry.endsWith(normalizedSender) && normalizedSender.length >= 10) {
      return true;
    }
  }

  return false;
}

export interface MessageAgeCheckResult {
  isValid: boolean;
  ageSeconds: number;
  maxAgeSeconds: number;
}

/**
 * Valida si un mensaje es lo suficientemente reciente como para ser procesado por el bot,
 * protegiendo al sistema contra ráfagas de mensajes históricos (sync storm) al encender WhatsApp Web / Docker.
 *
 * @param messageTimestamp - Timestamp UNIX en segundos o milisegundos del mensaje
 * @param maxAgeConfig - Límite máximo de antigüedad en segundos (por defecto 120 segundos = 2 minutos)
 * @param currentTimestampSeconds - Timestamp actual en segundos (opcional, para testing determinista)
 */
export function isMessageAgeValid(
  messageTimestamp: number | string | undefined | null,
  maxAgeConfig?: number | string | null,
  currentTimestampSeconds?: number
): MessageAgeCheckResult {
  const maxAgeSeconds = typeof maxAgeConfig === 'string'
    ? parseInt(maxAgeConfig, 10) || 120
    : (typeof maxAgeConfig === 'number' && maxAgeConfig > 0 ? maxAgeConfig : 120);

  // Si no viene timestamp, consideramos que es un mensaje fresco generado en tiempo real
  if (messageTimestamp === undefined || messageTimestamp === null) {
    return { isValid: true, ageSeconds: 0, maxAgeSeconds };
  }

  let ts = typeof messageTimestamp === 'string' ? parseInt(messageTimestamp, 10) : messageTimestamp;
  if (isNaN(ts) || ts <= 0) {
    return { isValid: true, ageSeconds: 0, maxAgeSeconds };
  }

  // Si el timestamp viene en milisegundos (13 dígitos ej. 1724080000000), convertir a segundos
  if (ts > 1_000_000_000_000) {
    ts = Math.floor(ts / 1000);
  }

  const now = currentTimestampSeconds ?? Math.floor(Date.now() / 1000);
  const ageSeconds = now - ts;

  // Permitir pequeñas discrepancias de reloj en el futuro (hasta 60s)
  if (ageSeconds < -60) {
    return { isValid: true, ageSeconds: 0, maxAgeSeconds };
  }

  const isValid = ageSeconds <= maxAgeSeconds;

  return {
    isValid,
    ageSeconds: Math.max(0, ageSeconds),
    maxAgeSeconds,
  };
}
