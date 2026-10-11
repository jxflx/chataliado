/**
 * Notes Parser para ChatAliado Live Chat ("Libreta del Mesero").
 * 
 * Regla Estricta: CERO emojis en la interfaz. Cualquier emoji almacenado
 * históricamente en notes_md (ej. pin de mapa, advertencia, paquete) es estrictamente purgado
 * en tiempo de parseo. Los bloques visuales emplean iconos Lucide React de 1.5px.
 */

export interface CustomerNoteBlocks {
  delivery: string | null;
  allergies: string | null;
  preferences: string | null;
  lastOrder: string | null;
  raw: string;
}

type BlockKey = 'delivery' | 'allergies' | 'preferences' | 'lastOrder';

/**
 * Expresión regular universal para purgar emojis y caracteres gráficos Unicode.
 * Incluye Pictogramas Extendidos, Variaciones de Emoji, Presentaciones de Símbolos,
 * modificadores de tono de piel y zero-width joiners.
 */
const EMOJI_REGEX = /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}])[\uFE00-\uFE0F\u200D]*/gu;

/**
 * Elimina cualquier emoji o pictograma de un texto de forma determinista y segura.
 */
export function stripEmojis(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(EMOJI_REGEX, '')
    .replace(/[\uFE00-\uFE0F\u200D\u200B\u200C]/g, '') // Selectores de variación y zero-width spaces
    .replace(/[ \t]{2,}/g, ' ') // Colapsar múltiples espacios horizontales
    .replace(/^\s+$/gm, '') // Remover líneas vacías compuestas solo por espacios
    .trim();
}

interface HeaderPattern {
  key: BlockKey;
  regex: RegExp;
}

const HEADER_PATTERNS: HeaderPattern[] = [
  {
    key: 'delivery',
    regex: /^\s*[-*•]?\s*[*_]*\s*(?:Entrega|Direcci[oó]n|Ubicaci[oó]n|Delivery|Address)\s*[*_]*\s*:\s*[*_]*\s*(.*)$/i,
  },
  {
    key: 'allergies',
    regex: /^\s*[-*•]?\s*[*_]*\s*(?:Restricciones(?:\s*[\/|y]\s*|\s+)Alergias|Restricciones|Alergias|Allergies|Dietary)\s*[*_]*\s*:\s*[*_]*\s*(.*)$/i,
  },
  {
    key: 'preferences',
    regex: /^\s*[-*•]?\s*[*_]*\s*(?:Preferencias(?:\s+Habituales)?|Gustos|Preferences)\s*[*_]*\s*:\s*[*_]*\s*(.*)$/i,
  },
  {
    key: 'lastOrder',
    regex: /^\s*[-*•]?\s*[*_]*\s*(?:[UÚ]ltimo\s+Pedido(?:\s+Confirmado)?|[UÚ]ltima\s+Orden(?:\s+Confirmad[ao])?|Last\s+Order(?:\s+Confirmed)?)\s*[*_]*\s*:\s*[*_]*\s*(.*)$/i,
  },
];

/**
 * Parsea el campo `notes_md` de un cliente en 4 bloques semánticos estructurados,
 * purgando estrictamente cualquier emoji y tolerando formatos bulleted y texto libre.
 */
export function parseCustomerNotes(rawNotes: string | null | undefined): CustomerNoteBlocks {
  if (!rawNotes || typeof rawNotes !== 'string' || !rawNotes.trim()) {
    return {
      delivery: null,
      allergies: null,
      preferences: null,
      lastOrder: null,
      raw: '',
    };
  }

  // 1. Limpieza universal de emojis en todo el texto base
  const sanitizedRaw = stripEmojis(rawNotes);
  if (!sanitizedRaw) {
    return {
      delivery: null,
      allergies: null,
      preferences: null,
      lastOrder: null,
      raw: '',
    };
  }

  const lines = sanitizedRaw.split('\n');
  const sections: Record<BlockKey, string[]> = {
    delivery: [],
    allergies: [],
    preferences: [],
    lastOrder: [],
  };

  let currentKey: BlockKey | null = null;
  let hasStructuredHeaders = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Verificar si la línea coincide con alguna cabecera canónica
    let matchedPattern = false;
    for (const pattern of HEADER_PATTERNS) {
      const match = line.match(pattern.regex);
      if (match) {
        matchedPattern = true;
        currentKey = pattern.key;
        hasStructuredHeaders = true;

        const content = stripEmojis(match[1] ?? '').trim();
        if (content) {
          sections[currentKey].push(content);
        }
        break;
      }
    }

    // Si no es una nueva cabecera pero estamos dentro de una sección activa, añadir línea subordinada
    if (!matchedPattern && currentKey !== null) {
      const cleanSubLine = stripEmojis(line.replace(/^\s*[-*•]\s*/, '')).trim();
      if (cleanSubLine) {
        sections[currentKey].push(cleanSubLine);
      }
    }
  }

  // Si no se detectaron cabeceras estructuradas, tratamos todo como texto libre en raw
  if (!hasStructuredHeaders) {
    return {
      delivery: null,
      allergies: null,
      preferences: null,
      lastOrder: null,
      raw: sanitizedRaw,
    };
  }

  const formatBlock = (linesList: string[]): string | null => {
    if (!linesList.length) return null;
    const joined = linesList.join('\n').trim();
    return joined.length > 0 ? joined : null;
  };

  return {
    delivery: formatBlock(sections.delivery),
    allergies: formatBlock(sections.allergies),
    preferences: formatBlock(sections.preferences),
    lastOrder: formatBlock(sections.lastOrder),
    raw: sanitizedRaw,
  };
}

/**
 * Serializa los 4 bloques estructurados a formato Markdown limpio y sobrio,
 * garantizando cero emojis en las cabeceras generadas.
 */
export function serializeCustomerNotes(blocks: {
  delivery?: string | null;
  allergies?: string | null;
  preferences?: string | null;
  lastOrder?: string | null;
}): string {
  const parts: string[] = [];

  if (blocks.delivery?.trim()) {
    parts.push(`- **Entrega:** ${stripEmojis(blocks.delivery).trim()}`);
  }
  if (blocks.allergies?.trim()) {
    parts.push(`- **Restricciones/Alergias:** ${stripEmojis(blocks.allergies).trim()}`);
  }
  if (blocks.preferences?.trim()) {
    parts.push(`- **Preferencias Habituales:** ${stripEmojis(blocks.preferences).trim()}`);
  }
  if (blocks.lastOrder?.trim()) {
    parts.push(`- **Último Pedido Confirmado:** ${stripEmojis(blocks.lastOrder).trim()}`);
  }

  return parts.join('\n');
}
