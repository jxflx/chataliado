import React from 'react';

// URLs válidas estrictas con http:// o https://
const URL_REGEX = /(https?:\/\/[^\s<>"'{}|\\^`[\]]+)/g;

// Límite de seguridad contra ataques de Payload Overflow / DoS en el navegador.
// WhatsApp Business API limita estrictamente los mensajes a 4,096 caracteres.
const MAX_MESSAGE_PARSE_LENGTH = 4096;

/**
 * Valida y sanitiza una URL para prevenir esquemas maliciosos como javascript:, data:, etc.
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Convierte un texto plano en nodos de React aplicando formato de WhatsApp:
 * - ```bloque de código```
 * - `código en línea`
 * - *negrita*
 * - _cursiva_
 * - ~tachado~
 * - Enlaces seguros http/https con rel="noopener noreferrer"
 * - Saltos de línea \n
 *
 * NOTA DE SEGURIDAD CRÍTICA:
 * Todo el texto que no sea un tag formateado se renderiza como React String Node puro.
 * React escapa automáticamente cualquier tag HTML (<script>, <img>, etc.),
 * garantizando inmunidad total contra ataques XSS sin necesidad de dangerouslySetInnerHTML.
 */
export function parseWhatsAppMessage(content: string | null | undefined): React.ReactNode {
  if (!content) return null;

  // Defensa contra ReDoS / Client-side DoS: truncar si supera el umbral de seguridad
  const safeContent =
    content.length > MAX_MESSAGE_PARSE_LENGTH
      ? content.slice(0, MAX_MESSAGE_PARSE_LENGTH) + '\n... [Mensaje truncado por seguridad]'
      : content;

  // 1. Manejo de bloques de código (```...```) solo si contiene delimitadores
  const codeBlockParts = safeContent.includes('```')
    ? safeContent.split(/(```[\s\S]*?```)/g)
    : [safeContent];

  return codeBlockParts.map((part, blockIdx) => {
    if (!part) return null;

    if (part.startsWith('```') && part.endsWith('```') && part.length >= 6) {
      const codeContent = part.slice(3, -3).replace(/^\n+|\n+$/g, '');
      return (
        <pre
          key={`code-block-${blockIdx}`}
          className="bg-slate-100 border border-slate-200 rounded-lg p-2.5 my-1.5 font-mono text-[11px] text-ink-primary overflow-x-auto whitespace-pre-wrap"
        >
          <code>{codeContent}</code>
        </pre>
      );
    }

    // 2. Procesamiento por líneas
    const lines = part.split('\n');
    return (
      <React.Fragment key={`block-${blockIdx}`}>
        {lines.map((line, lineIdx) => (
          <React.Fragment key={`line-${blockIdx}-${lineIdx}`}>
            {lineIdx > 0 && <br />}
            {parseInlineElements(line, `${blockIdx}-${lineIdx}`)}
          </React.Fragment>
        ))}
      </React.Fragment>
    );
  });
}

/**
 * Parsea elementos en línea: código inline, enlaces, negrita, cursiva y tachado.
 */
function parseInlineElements(text: string, keyPrefix: string): React.ReactNode[] {
  if (!text) return [];

  // Fast-path: Si no contiene backticks, URLs ni caracteres de formato, retornar texto plano
  if (
    !text.includes('`') &&
    !text.includes('http://') &&
    !text.includes('https://') &&
    !text.includes('*') &&
    !text.includes('_') &&
    !text.includes('~')
  ) {
    return [text];
  }

  // Segmentar por código inline primero (`...`) solo si hay backticks
  const inlineCodeParts = text.includes('`') ? text.split(/(`[^`\n]+`)/g) : [text];

  return inlineCodeParts.flatMap((segment, segIdx) => {
    if (!segment) return [];

    if (segment.startsWith('`') && segment.endsWith('`') && segment.length >= 2) {
      const inlineCode = segment.slice(1, -1);
      return (
        <code
          key={`${keyPrefix}-code-${segIdx}`}
          className="bg-slate-100 text-emerald-700 font-mono text-[11px] px-1.5 py-0.5 rounded border border-slate-200"
        >
          {inlineCode}
        </code>
      );
    }

    // Segmentar por URLs solo si contiene esquemas http/https
    const hasUrls = segment.includes('http://') || segment.includes('https://');
    const urlParts = hasUrls ? segment.split(URL_REGEX) : [segment];

    return urlParts.flatMap((urlSegment, urlIdx) => {
      if (!urlSegment) return [];

      if (hasUrls && URL_REGEX.test(urlSegment) && isSafeUrl(urlSegment)) {
        // Reset lastIndex for stateful global regex
        URL_REGEX.lastIndex = 0;
        return (
          <a
            key={`${keyPrefix}-url-${segIdx}-${urlIdx}`}
            href={urlSegment}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 hover:text-emerald-700 underline underline-offset-2 break-all inline transition-colors"
          >
            {urlSegment}
          </a>
        );
      }
      URL_REGEX.lastIndex = 0;

      // Segmentar por formato de texto WhatsApp: *bold*, _italic_, ~strike~
      return parseFormattedText(urlSegment, `${keyPrefix}-${segIdx}-${urlIdx}`);
    });
  });
}

/**
 * Tokenizador determinista para *negrita*, _cursiva_ y ~tachado~ sin regex anidadas vulnerables a ReDoS.
 */
function parseFormattedText(text: string, keyPrefix: string): React.ReactNode[] {
  if (!text) return [];

  // Fast-path: Si no contiene caracteres de formato, retornar texto plano directamente
  if (!text.includes('*') && !text.includes('_') && !text.includes('~')) {
    return [text];
  }

  // Regex para tokens cerrados que no contengan saltos de línea ni estén vacíos
  const tokens = text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g);

  return tokens.map((token, idx) => {
    if (!token) return null;
    const key = `${keyPrefix}-fmt-${idx}`;

    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return (
        <strong key={key} className="font-bold text-ink-primary">
          {token.slice(1, -1)}
        </strong>
      );
    }

    if (token.startsWith('_') && token.endsWith('_') && token.length > 2) {
      return (
        <em key={key} className="italic text-ink-secondary">
          {token.slice(1, -1)}
        </em>
      );
    }

    if (token.startsWith('~') && token.endsWith('~') && token.length > 2) {
      return (
        <del key={key} className="line-through text-ink-tertiary">
          {token.slice(1, -1)}
        </del>
      );
    }

    // Texto plano seguro
    return token;
  });
}

/**
 * Genera una vista previa en texto plano para el listado lateral de conversaciones,
 * eliminando etiquetas y formateos Markdown sin dejar basura visual.
 */
export function formatWhatsAppPreview(content: string | null | undefined, maxLength = 60): string {
  if (!content) return '';

  // Optimización de rendimiento: Si el contenido es enorme, recortar antes de aplicar regex
  const inputSlice = content.length > maxLength * 5 ? content.slice(0, maxLength * 5) : content;

  const cleanText = inputSlice
    .replace(/```[\s\S]*?```/g, ' [código] ')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/~([^~\n]+)~/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanText.length <= maxLength) {
    return cleanText;
  }

  return cleanText.slice(0, maxLength).trim() + '...';
}
