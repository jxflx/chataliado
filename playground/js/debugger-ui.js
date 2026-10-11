/**
 * ChatAliado Playground - Debugger UI (Panel 3)
 * Real-time LLM Tools Execution Inspector, Live Customer Markdown Memory & Mode Indicator.
 */

import { store } from './store.js';
import { apiClient } from './api.js';

/**
 * 10 Official Deterministic LLM Tools Metadata Map
 */
export const TOOL_METADATA = {
  get_menu: {
    name: 'get_menu',
    label: 'Consultar Menú',
    category: 'menu',
    icon: '📋',
    color: 'indigo',
    badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    borderClass: 'border-indigo-500/40',
    bgClass: 'bg-indigo-950/20',
    dotClass: 'bg-indigo-400',
    description: 'Obtiene el catálogo de productos disponibles y categorías activas.',
  },
  get_product: {
    name: 'get_product',
    label: 'Consultar Producto',
    category: 'menu',
    icon: '🔍',
    color: 'blue',
    badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    borderClass: 'border-blue-500/40',
    bgClass: 'bg-blue-950/20',
    dotClass: 'bg-blue-400',
    description: 'Consulta detalles específicos, precios y variantes de un producto.',
  },
  create_order: {
    name: 'create_order',
    label: 'Crear Pedido',
    category: 'orders',
    icon: '🛒',
    color: 'amber',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    borderClass: 'border-amber-500/40',
    bgClass: 'bg-amber-950/20',
    dotClass: 'bg-amber-400',
    description: 'Inicia un nuevo borrador de pedido (draft) para el comensal.',
  },
  add_order_item: {
    name: 'add_order_item',
    label: 'Agregar Ítem',
    category: 'orders',
    icon: '🍕',
    color: 'emerald',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    borderClass: 'border-emerald-500/40',
    bgClass: 'bg-emerald-950/20',
    dotClass: 'bg-emerald-400',
    description: 'Añade productos y cantidades con recálculo determinista de subtotales.',
  },
  remove_order_item: {
    name: 'remove_order_item',
    label: 'Eliminar Ítem',
    category: 'orders',
    icon: '🗑️',
    color: 'rose',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    borderClass: 'border-rose-500/40',
    bgClass: 'bg-rose-950/20',
    dotClass: 'bg-rose-400',
    description: 'Remueve un ítem de la orden activa y recalcula los totales.',
  },
  get_current_order: {
    name: 'get_current_order',
    label: 'Consultar Orden',
    category: 'orders',
    icon: '🧾',
    color: 'teal',
    badgeClass: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
    borderClass: 'border-teal-500/40',
    bgClass: 'bg-teal-950/20',
    dotClass: 'bg-teal-400',
    description: 'Recupera el resumen financiero y desglose de la comanda actual.',
  },
  confirm_order: {
    name: 'confirm_order',
    label: 'Confirmar Pedido',
    category: 'orders',
    icon: '✅',
    color: 'green',
    badgeClass: 'bg-green-500/20 text-green-300 border-green-500/30',
    borderClass: 'border-green-500/40',
    bgClass: 'bg-green-950/20',
    dotClass: 'bg-green-400',
    description: 'Pasa la orden a confirmada con dirección de entrega y método de pago.',
  },
  get_customer: {
    name: 'get_customer',
    label: 'Consultar Cliente',
    category: 'customer',
    icon: '👤',
    color: 'purple',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    borderClass: 'border-purple-500/40',
    bgClass: 'bg-purple-950/20',
    dotClass: 'bg-purple-400',
    description: 'Obtiene el perfil del comensal, notas previas y preferencias.',
  },
  update_customer_notes: {
    name: 'update_customer_notes',
    label: 'Actualizar Memoria',
    category: 'customer',
    icon: '📝',
    color: 'cyan',
    badgeClass: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    borderClass: 'border-cyan-500/40',
    bgClass: 'bg-cyan-950/20',
    dotClass: 'bg-cyan-400',
    description: 'Guarda alergias, gustos y notas en el bloc de notas del mesero (notes_md).',
  },
  handoff_to_human: {
    name: 'handoff_to_human',
    label: 'Escalar a Humano',
    category: 'escalation',
    icon: '🚨',
    color: 'orange',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    borderClass: 'border-orange-500/40',
    bgClass: 'bg-orange-950/20',
    dotClass: 'bg-orange-400',
    description: 'Transfiere la conversación a un agente humano y silencia al bot.',
  },
};

/**
 * Returns metadata for a tool by name with fallback for unknown tools.
 * @param {string} toolName
 */
export function getToolMeta(toolName) {
  if (toolName && TOOL_METADATA[toolName]) {
    return TOOL_METADATA[toolName];
  }
  return {
    name: toolName || 'unknown_tool',
    label: toolName || 'Herramienta Desconocida',
    category: 'general',
    icon: '⚙️',
    color: 'slate',
    badgeClass: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    borderClass: 'border-slate-500/40',
    bgClass: 'bg-slate-900/40',
    dotClass: 'bg-slate-400',
    description: 'Herramienta personalizada o no estándar.',
  };
}

/**
 * Safely escapes HTML special characters to prevent XSS.
 * @param {string} str
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitizes an HTML string by removing unsafe tags and attributes.
 * @param {string} html
 */
export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<\/?(iframe|object|embed|link|meta|style|form|input|button|textarea|select|applet|base)\b[^>]*>/gi, '')
    .replace(/\b(href|src|action)\s*=\s*["']?\s*(?:javascript|data):[^"'>\s]*/gi, '$1="#"')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

/**
 * Built-in fallback Markdown parser when Marked.js is not present.
 * @param {string} md
 */
export function simpleMarkdownParser(md) {
  if (!md || typeof md !== 'string') return '';
  const lines = md.split('\n');
  const output = [];
  let inList = false;
  let listType = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trimEnd();

    const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);

    if (ulMatch || olMatch) {
      const isUl = Boolean(ulMatch);
      const content = isUl ? ulMatch[2] : olMatch[2];
      const targetListType = isUl ? 'ul' : 'ol';

      if (!inList || listType !== targetListType) {
        if (inList) output.push(`</${listType}>`);
        output.push(`<${targetListType} class="list-disc pl-5 my-1 space-y-0.5">`);
        inList = true;
        listType = targetListType;
      }
      output.push(`<li>${formatInlineMarkdown(content)}</li>`);
      continue;
    }

    if (inList) {
      output.push(`</${listType}>`);
      inList = false;
      listType = null;
    }

    if (!line.trim()) continue;

    if (line.startsWith('### ')) {
      output.push(`<h3 class="text-xs font-bold text-slate-200 mt-2 mb-1">${formatInlineMarkdown(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      output.push(`<h2 class="text-sm font-bold text-white mt-2.5 mb-1">${formatInlineMarkdown(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      output.push(`<h1 class="text-base font-bold text-white mt-3 mb-1.5">${formatInlineMarkdown(line.slice(2))}</h1>`);
    } else if (line.startsWith('> ')) {
      output.push(`<blockquote class="border-l-2 border-cyan-500 pl-2 text-slate-400 italic my-1">${formatInlineMarkdown(line.slice(2))}</blockquote>`);
    } else {
      output.push(`<p class="my-1 text-slate-300 leading-relaxed">${formatInlineMarkdown(line)}</p>`);
    }
  }

  if (inList) output.push(`</${listType}>`);
  return output.join('\n');
}

/**
 * Formats inline markdown.
 * @param {string} text
 */
function formatInlineMarkdown(text) {
  let safe = escapeHtml(text);
  safe = safe.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 font-mono text-[11px]">$1</code>');
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-sky-400">$1</strong>');
  safe = safe.replace(/__([^_]+)__/g, '<strong class="font-bold text-sky-400">$1</strong>');
  safe = safe.replace(/\*([^*]+)\*/g, '<em class="italic text-slate-300">$1</em>');
  safe = safe.replace(/_([^_]+)_/g, '<em class="italic text-slate-300">$1</em>');
  return safe;
}

/**
 * Main markdown renderer: Uses Marked.js if available, otherwise simpleMarkdownParser.
 * @param {string} markdownText
 */
export function renderMarkdown(markdownText) {
  if (!markdownText || typeof markdownText !== 'string' || !markdownText.trim()) {
    return '';
  }
  let rawHtml = '';
  const globalMarked = (typeof window !== 'undefined' && window.marked) || (typeof globalThis !== 'undefined' && globalThis.marked);

  if (globalMarked && typeof globalMarked.parse === 'function') {
    try {
      rawHtml = globalMarked.parse(markdownText, { breaks: true, gfm: true });
    } catch {
      rawHtml = simpleMarkdownParser(markdownText);
    }
  } else {
    rawHtml = simpleMarkdownParser(markdownText);
  }
  return sanitizeHtml(rawHtml);
}

/**
 * Formats character count indicator for Customer Memory.
 * @param {number|string} currentCount
 * @param {number} maxCount
 */
export function formatCharCount(currentCount = 0, maxCount = 5000) {
  const count = typeof currentCount === 'string' ? currentCount.length : Number(currentCount) || 0;
  return `${count.toLocaleString()} / ${maxCount.toLocaleString()} caracteres`;
}

/**
 * Formats and syntax-highlights JSON data.
 * @param {any} data
 */
export function formatJson(data) {
  if (data === undefined || data === null) {
    return '<span class="text-slate-500 italic">null</span>';
  }
  let parsed = data;
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        parsed = JSON.parse(data);
      } catch {
        return `<span class="text-slate-300 font-mono">${escapeHtml(data)}</span>`;
      }
    } else {
      return `<span class="text-slate-300 font-mono">${escapeHtml(data)}</span>`;
    }
  }
  try {
    const jsonString = JSON.stringify(parsed, null, 2);
    return syntaxHighlightJson(jsonString);
  } catch {
    return `<span class="text-rose-400 font-mono">[Error al serializar JSON]</span>`;
  }
}

/**
 * Colorizes raw JSON string for dark theme display.
 * @param {string} json
 */
export function syntaxHighlightJson(json) {
  if (!json || typeof json !== 'string') return '';
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'text-amber-300';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-sky-300 font-medium';
        } else {
          cls = 'text-emerald-300';
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-purple-300 font-semibold';
      } else if (/null/.test(match)) {
        cls = 'text-rose-400 italic';
      }
      return `<span class="${cls}">${escapeHtml(match)}</span>`;
    }
  );
}

/**
 * Extracts handoff reason from conversation state, tool calls, or message logs.
 * @param {{ conversation?: any, messages?: Array<any>, toolExecutions?: Array<any> } | Array<any>} source
 */
export function extractHandoffReason(source) {
  if (!source) return null;

  if (source.handoff_reason && typeof source.handoff_reason === 'string') {
    return source.handoff_reason.trim();
  }
  if (source.metadata?.reason && typeof source.metadata.reason === 'string') {
    return source.metadata.reason.trim();
  }

  const conversation = source.conversation;
  if (conversation?.handoff_reason && typeof conversation.handoff_reason === 'string') {
    return conversation.handoff_reason.trim();
  }
  if (conversation?.metadata?.reason && typeof conversation.metadata.reason === 'string') {
    return conversation.metadata.reason.trim();
  }

  const toolExecutions = source.toolExecutions || (Array.isArray(source) ? source : []);
  for (let i = toolExecutions.length - 1; i >= 0; i--) {
    const trace = toolExecutions[i];
    if (trace && (trace.name === 'handoff_to_human' || trace.toolName === 'handoff_to_human')) {
      const args = trace.args || trace.parameters || {};
      const reason = args.reason || args.motive || args.motivo || args.notes || args.nota;
      if (reason && typeof reason === 'string') return reason.trim();
      const output = trace.output || trace.result || {};
      const outReason = output.reason || output.motive || output.message;
      if (outReason && typeof outReason === 'string' && !outReason.toLowerCase().includes('success')) {
        return outReason.trim();
      }
    }
  }

  const messages = source.messages || (Array.isArray(source) ? source : []);
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg) continue;

    if (msg.role === 'assistant' && msg.metadata?.tool_calls) {
      const toolCalls = Array.isArray(msg.metadata.tool_calls) ? msg.metadata.tool_calls : [];
      for (const tc of toolCalls) {
        const fnName = tc.function?.name || tc.name;
        if (fnName === 'handoff_to_human') {
          let args = tc.function?.arguments || tc.arguments || {};
          if (typeof args === 'string') {
            try { args = JSON.parse(args); } catch { /* ignore */ }
          }
          const reason = args.reason || args.motive || args.motivo;
          if (reason && typeof reason === 'string') return reason.trim();
        }
      }
    }

    if (msg.role === 'system' && typeof msg.content === 'string') {
      const content = msg.content;
      if (content.toLowerCase().includes('humano') || content.toLowerCase().includes('transfer') || content.toLowerCase().includes('handoff')) {
        const match = content.match(/motivo:?\s*(.+)$/i) || content.match(/razón:?\s*(.+)$/i);
        if (match && match[1]) return match[1].trim();
        return content.trim();
      }
    }
  }

  return null;
}

/**
 * Filter tool executions by search query, tool name, or status.
 * @param {Array<any>} traces
 * @param {{ query?: string, toolName?: string, status?: string }} filter
 */
export function filterToolExecutions(traces = [], filter = {}) {
  if (!Array.isArray(traces)) return [];
  const { query = '', toolName = 'all', status = 'all' } = filter;
  const cleanQuery = String(query).trim().toLowerCase();

  return traces.filter((trace) => {
    if (!trace) return false;
    if (toolName && toolName !== 'all' && trace.name !== toolName) return false;
    if (status && status !== 'all' && trace.status !== status) return false;
    if (cleanQuery) {
      const name = String(trace.name || '').toLowerCase();
      const argsStr = JSON.stringify(trace.args || {}).toLowerCase();
      const outputStr = JSON.stringify(trace.output || {}).toLowerCase();
      const id = String(trace.id || '').toLowerCase();
      return name.includes(cleanQuery) || argsStr.includes(cleanQuery) || outputStr.includes(cleanQuery) || id.includes(cleanQuery);
    }
    return true;
  });
}

/**
 * Formats a timestamp into human-readable local time string.
 * @param {string|Date|number} timestamp
 */
export function formatTimestamp(timestamp) {
  if (!timestamp) return '—';
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return String(timestamp);
    return d.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return String(timestamp);
  }
}

/**
 * Main DebuggerUI Component binding Panel 3 to Reactive State Store.
 */
export class DebuggerUI {
  constructor(options = {}) {
    this.store = options.storeInstance || store;
    this.unsubscribers = [];
    this.activeFilter = { query: '', toolName: 'all', status: 'all' };
    this.expandedCards = new Set();
    this.lastNotesMd = null;
    this.isInitialized = false;

    this._handleToolsUpdated = this._handleToolsUpdated.bind(this);
    this._handleCustomerUpdated = this._handleCustomerUpdated.bind(this);
    this._handleConversationUpdated = this._handleConversationUpdated.bind(this);
    this._handlePhoneChanged = this._handlePhoneChanged.bind(this);
    this._handleMessagesUpdated = this._handleMessagesUpdated.bind(this);
    this._handleStateReset = this._handleStateReset.bind(this);
  }

  init() {
    if (this.isInitialized) return;
    this.unsubscribers.push(
      this.store.on('tools:updated', this._handleToolsUpdated),
      this.store.on('customer:updated', this._handleCustomerUpdated),
      this.store.on('conversation:updated', this._handleConversationUpdated),
      this.store.on('phone:changed', this._handlePhoneChanged),
      this.store.on('messages:updated', this._handleMessagesUpdated),
      this.store.on('state:reset', this._handleStateReset)
    );
    this._setupFilterControls();
    this.render();
    this.isInitialized = true;
  }

  destroy() {
    for (const unsub of this.unsubscribers) {
      try { unsub(); } catch { /* ignore */ }
    }
    this.unsubscribers = [];
    this.isInitialized = false;
  }

  render() {
    const state = this.store.getState();
    this.renderModeIndicator(state.conversation, state.messages, state.toolExecutions);
    this.renderCustomerMemory(state.customer, state.activePhone);
    this.renderToolsTimeline(state.toolExecutions);
  }

  _setupFilterControls() {
    if (typeof document === 'undefined') return;
    const timelineContainer = document.getElementById('tools-timeline-container');
    if (!timelineContainer || document.getElementById('tools-filter-controls')) return;

    const filterBar = document.createElement('div');
    filterBar.id = 'tools-filter-controls';
    filterBar.className = 'flex flex-wrap items-center gap-2 mb-3 text-xs';

    const toolOptionsHtml = Object.keys(TOOL_METADATA)
      .map(t => `<option value="${t}">${TOOL_METADATA[t].icon} ${t}</option>`)
      .join('');

    filterBar.innerHTML = `
      <div class="relative flex-1 min-w-[130px]">
        <input
          id="tools-search-input"
          type="text"
          placeholder="Filtrar por texto o args..."
          class="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
        />
        <button id="tools-search-clear" class="hidden absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs font-bold">&times;</button>
      </div>

      <select id="tools-name-filter" class="bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-cyan-500">
        <option value="all">Todas las Tools</option>
        ${toolOptionsHtml}
      </select>

      <select id="tools-status-filter" class="bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-cyan-500">
        <option value="all">Todos los Estados</option>
        <option value="success">✅ Éxito</option>
        <option value="error">❌ Error</option>
        <option value="pending">⏳ Pendiente</option>
      </select>

      <div class="flex items-center gap-1">
        <button id="tools-expand-all" title="Expandir todos los acordeones" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 rounded text-[11px] text-slate-300 transition">
          Expandir
        </button>
        <button id="tools-collapse-all" title="Colapsar todos los acordeones" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 rounded text-[11px] text-slate-300 transition">
          Colapsar
        </button>
      </div>
    `;

    timelineContainer.parentNode.insertBefore(filterBar, timelineContainer);

    const searchInput = document.getElementById('tools-search-input');
    const searchClear = document.getElementById('tools-search-clear');
    const nameFilter = document.getElementById('tools-name-filter');
    const statusFilter = document.getElementById('tools-status-filter');
    const expandAllBtn = document.getElementById('tools-expand-all');
    const collapseAllBtn = document.getElementById('tools-collapse-all');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.activeFilter.query = e.target.value;
        if (searchClear) searchClear.classList.toggle('hidden', !e.target.value);
        this.renderToolsTimeline(this.store.getState().toolExecutions);
      });
    }

    if (searchClear && searchInput) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        this.activeFilter.query = '';
        searchClear.classList.add('hidden');
        this.renderToolsTimeline(this.store.getState().toolExecutions);
      });
    }

    if (nameFilter) {
      nameFilter.addEventListener('change', (e) => {
        this.activeFilter.toolName = e.target.value;
        this.renderToolsTimeline(this.store.getState().toolExecutions);
      });
    }

    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        this.activeFilter.status = e.target.value;
        this.renderToolsTimeline(this.store.getState().toolExecutions);
      });
    }

    if (expandAllBtn) {
      expandAllBtn.addEventListener('click', () => {
        const traces = this.store.getState().toolExecutions || [];
        traces.forEach(t => this.expandedCards.add(t.id));
        this.renderToolsTimeline(traces);
      });
    }

    if (collapseAllBtn) {
      collapseAllBtn.addEventListener('click', () => {
        this.expandedCards.clear();
        this.renderToolsTimeline(this.store.getState().toolExecutions);
      });
    }
  }

  renderModeIndicator(conversation, messages = [], toolExecutions = []) {
    if (typeof document === 'undefined') return;
    const mode = (conversation?.mode || 'ai').toLowerCase();
    const isHuman = mode === 'human';
    const handoffReason = extractHandoffReason({ conversation, messages, toolExecutions });

    const headerBadge = document.getElementById('conversation-mode-badge');
    if (headerBadge) {
      if (isHuman) {
        headerBadge.className = 'text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 pulse-amber';
        headerBadge.innerHTML = `<span>👤</span> MODO HUMANO`;
      } else {
        headerBadge.className = 'text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1';
        headerBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 pulse-emerald inline-block"></span><span>🤖</span> MODO IA`;
      }
    }

    let modeCard = document.getElementById('conversation-mode-card') || document.getElementById('mode-card');
    const scrollContainer = document.querySelector('#panel-tools-inspector .overflow-y-auto') || document.getElementById('debugger-panel');

    if (!modeCard && scrollContainer) {
      modeCard = document.createElement('div');
      modeCard.id = 'conversation-mode-card';
      modeCard.className = 'rounded-xl p-4 shadow-sm border transition-colors duration-300';
      scrollContainer.insertBefore(modeCard, scrollContainer.firstChild);
    }

    if (modeCard) {
      if (isHuman) {
        modeCard.className = 'bg-amber-950/20 border border-amber-500/40 rounded-xl p-4 shadow-sm space-y-2.5';
        modeCard.innerHTML = `
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="text-lg">👤</span>
              <div>
                <h3 class="text-xs font-bold text-amber-300 uppercase tracking-wider">Modo de Conversación</h3>
                <p class="text-[11px] font-semibold text-amber-400">👤 MODO HUMANO (SILENCIADO)</p>
              </div>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 pulse-amber">
              BOT SILENCIADO
            </span>
          </div>

          <p class="text-xs text-slate-300 leading-relaxed">
            Transferido a agente humano (<code class="text-amber-300 font-mono">handoff_to_human</code>). El bot está silenciado y no responderá automáticamente a nuevos mensajes.
          </p>

          ${
            handoffReason
              ? `
            <div class="bg-slate-950/90 border border-amber-500/30 rounded-lg p-2.5 text-xs text-amber-200 flex items-start gap-2">
              <span class="text-amber-400 text-sm shrink-0">⚠️</span>
              <div>
                <span class="font-bold text-amber-300">Motivo del Handoff:</span>
                <p class="mt-0.5 text-slate-200 italic font-mono text-[11px]">${escapeHtml(handoffReason)}</p>
              </div>
            </div>
          `
              : ''
          }

          <div class="pt-1">
            <button id="btn-toggle-handoff" class="w-full py-2 px-3 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center justify-center gap-1.5 shadow cursor-pointer">
              <span>🤖</span>
              <span>Reactivar Agente IA (Desactivar Modo Humano)</span>
            </button>
          </div>
        `;
      } else {
        modeCard.className = 'bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-2.5';
        modeCard.innerHTML = `
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="text-lg">🤖</span>
              <div>
                <h3 class="text-xs font-bold text-slate-300 uppercase tracking-wider">Modo de Conversación</h3>
                <p class="text-[11px] font-semibold text-emerald-400">🤖 MODO IA ACTIVO</p>
              </div>
            </div>
            <span class="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              ACTIVO
            </span>
          </div>

          <p class="text-xs text-slate-400 leading-relaxed">
            El agente LLM responderá automáticamente a los mensajes del comensal utilizando tools deterministas.
          </p>

          <div class="pt-1">
            <button id="btn-toggle-handoff" class="w-full py-2 px-3 rounded-lg text-xs font-medium bg-amber-950/80 hover:bg-amber-900/90 text-amber-300 hover:text-amber-200 border border-amber-600/40 transition flex items-center justify-center gap-1.5 shadow cursor-pointer">
              <span>👤</span>
              <span>Pausar Bot y Activar Modo Humano Manual</span>
            </button>
          </div>
        `;
      }

      const toggleBtn = modeCard.querySelector('#btn-toggle-handoff');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const targetMode = isHuman ? 'ai' : 'human';
          toggleBtn.disabled = true;
          toggleBtn.innerHTML = `<span>⏳</span> <span>Guardando...</span>`;

          const convId = conversation?.id;
          if (convId) {
            await apiClient.updateConversationMode(convId, targetMode);
          }
          store.setConversationMode(targetMode);
        });
      }
    }
  }

  renderCustomerMemory(customer, activePhone = '') {
    if (typeof document === 'undefined') return;

    const phoneLabel = document.getElementById('customer-memory-phone');
    if (phoneLabel) {
      const displayPhone = customer?.phone || activePhone || '—';
      phoneLabel.textContent = displayPhone ? `+${displayPhone}` : '—';
    }

    let charCountEl = document.getElementById('customer-notes-char-count') || document.getElementById('memory-char-count');
    const memoryCard = document.querySelector('#customer-notes-markdown')?.closest('.bg-slate-900') || document.getElementById('memory-card');

    if (!charCountEl && memoryCard) {
      const headerRow = memoryCard.querySelector('.flex.items-center.justify-between');
      if (headerRow) {
        charCountEl = document.createElement('span');
        charCountEl.id = 'customer-notes-char-count';
        charCountEl.className = 'text-[11px] font-mono text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30';
        headerRow.appendChild(charCountEl);
      }
    }

    const rawNotes = customer?.notes_md || '';
    const charCountText = formatCharCount(rawNotes.length, 5000);
    if (charCountEl) charCountEl.textContent = charCountText;

    const notesContainer = document.getElementById('customer-notes-markdown');
    if (notesContainer) {
      if (!rawNotes.trim()) {
        notesContainer.innerHTML = `
          <div class="py-4 text-center text-slate-500 space-y-1">
            <p class="text-xl">📝</p>
            <p class="text-xs italic text-slate-400 font-medium">Sin notas registradas para este cliente.</p>
            <p class="text-[11px] text-slate-500 max-w-xs mx-auto">
              Cuando el cliente exprese gustos, alergias o preferencias (ej. <em>"sin cebolla"</em>, <em>"es alérgico al gluten"</em>), el LLM las guardará aquí automáticamente vía <code class="text-sky-400 font-mono">update_customer_notes</code>.
            </p>
          </div>
        `;
      } else {
        const parsedHtml = renderMarkdown(rawNotes);
        notesContainer.innerHTML = parsedHtml;
      }

      if (this.lastNotesMd !== null && this.lastNotesMd !== rawNotes) {
        this.highlightMemoryUpdate(notesContainer.parentElement || notesContainer);
      }
      this.lastNotesMd = rawNotes;
    }
  }

  highlightMemoryUpdate(element) {
    if (!element || typeof element.classList === 'undefined') return;
    element.classList.add('ring-2', 'ring-cyan-400', 'bg-cyan-950/40', 'transition-all', 'duration-300');
    setTimeout(() => {
      element.classList.remove('ring-2', 'ring-cyan-400', 'bg-cyan-950/40');
    }, 1200);
  }

  renderToolsTimeline(toolExecutions = []) {
    if (typeof document === 'undefined') return;
    const traces = Array.isArray(toolExecutions) ? toolExecutions : [];

    const countBadge = document.getElementById('tools-count-badge');
    if (countBadge) {
      const total = traces.length;
      countBadge.textContent = `${total} ${total === 1 ? 'llamada' : 'llamadas'}`;
      countBadge.className = total > 0
        ? 'text-xs font-mono px-2 py-0.5 rounded bg-sky-950/60 text-sky-400 border border-sky-500/40'
        : 'text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700';
    }

    const container = document.getElementById('tools-timeline-container');
    if (!container) return;

    const filteredTraces = filterToolExecutions(traces, this.activeFilter);

    if (filteredTraces.length === 0) {
      if (traces.length === 0) {
        container.innerHTML = `
          <div id="tools-empty-state" class="py-10 text-center text-slate-500 text-xs space-y-1.5">
            <p class="text-3xl mb-1">🔍</p>
            <p class="font-semibold text-slate-400">No se han registrado llamadas a herramientas en esta conversación.</p>
            <p class="text-[11px] text-slate-500">
              Cuando el cliente envíe un mensaje (ej. <em>"muéstrame el menú"</em> o <em>"quiero una pizza"</em>), el agente LLM invocará las tools correspondientes y aparecerán aquí.
            </p>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div class="py-8 text-center text-slate-500 text-xs">
            <p class="text-2xl mb-1">🔎</p>
            <p class="text-slate-400">No hay herramientas que coincidan con los filtros seleccionados.</p>
            <button id="btn-reset-tool-filters" class="mt-2 text-cyan-400 hover:text-cyan-300 underline text-xs">
              Restablecer filtros
            </button>
          </div>
        `;
        const resetBtn = document.getElementById('btn-reset-tool-filters');
        if (resetBtn) {
          resetBtn.addEventListener('click', () => {
            this.activeFilter = { query: '', toolName: 'all', status: 'all' };
            const sInput = document.getElementById('tools-search-input');
            const nSelect = document.getElementById('tools-name-filter');
            const stSelect = document.getElementById('tools-status-filter');
            if (sInput) sInput.value = '';
            if (nSelect) nSelect.value = 'all';
            if (stSelect) stSelect.value = 'all';
            this.renderToolsTimeline(traces);
          });
        }
      }
      return;
    }

    const cardsHtml = filteredTraces
      .map((trace, idx) => this._renderToolCardHtml(trace, idx, filteredTraces.length))
      .join('');

    container.innerHTML = cardsHtml;
    this._attachAccordionListeners(container);
  }

  _renderToolCardHtml(trace, index, total) {
    const meta = getToolMeta(trace.name);
    const traceId = trace.id || `tool_${index + 1}`;
    const isExpanded = this.expandedCards.has(traceId) || this.expandedCards.size === 0;
    const status = trace.status || 'success';
    const isSuccess = status === 'success';
    const isError = status === 'error';

    const statusBadge = isSuccess
      ? '<span class="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">✅ Éxito</span>'
      : isError
      ? '<span class="inline-flex items-center gap-1 text-[11px] text-rose-400 font-semibold bg-rose-950/60 px-2 py-0.5 rounded border border-rose-500/30">❌ Error</span>'
      : '<span class="inline-flex items-center gap-1 text-[11px] text-amber-400 font-semibold bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/30">⏳ Pendiente</span>';

    const timeStr = formatTimestamp(trace.timestamp);
    const iterationBadge = trace.iteration ? `#${trace.iteration}` : `#${index + 1}`;
    const durationStr = trace.durationMs ? `${trace.durationMs}ms` : null;

    const formattedArgs = formatJson(trace.args || trace.parameters || {});
    const formattedOutput = formatJson(trace.output || trace.result || null);

    return `
      <div
        id="tool-card-${traceId}"
        class="bg-slate-900 border ${meta.borderClass} rounded-xl overflow-hidden shadow-sm transition hover:border-slate-600"
      >
        <div
          class="tool-accordion-toggle p-3 flex items-center justify-between cursor-pointer select-none bg-slate-850 hover:bg-slate-800/80 transition"
          data-trace-id="${traceId}"
        >
          <div class="flex items-center space-x-2.5 overflow-hidden">
            <span class="text-base shrink-0">${meta.icon}</span>
            <div class="truncate">
              <div class="flex items-center gap-2">
                <span class="font-mono text-xs font-bold text-white">${escapeHtml(trace.name)}</span>
                <span class="text-[10px] px-1.5 py-0.2 rounded font-semibold ${meta.badgeClass}">
                  ${meta.category}
                </span>
              </div>
              <p class="text-[11px] text-slate-400 truncate">${meta.label} · ${meta.description}</p>
            </div>
          </div>

          <div class="flex items-center space-x-2 shrink-0">
            ${statusBadge}
            <div class="text-right text-[10px] font-mono text-slate-400">
              <span>${iterationBadge}</span>
              <span class="mx-0.5">·</span>
              <span>${timeStr}</span>
              ${durationStr ? `<span class="block text-slate-500">${durationStr}</span>` : ''}
            </div>
            <span class="accordion-arrow text-slate-400 text-xs transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}">
              ▼
            </span>
          </div>
        </div>

        <div
          id="tool-body-${traceId}"
          class="tool-accordion-body border-t border-slate-800 p-3 bg-slate-950 space-y-3 ${isExpanded ? '' : 'hidden'}"
        >
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <span>📥</span> Parámetros de Entrada (Input Arguments)
              </span>
              <button
                class="btn-copy-json text-[10px] font-mono text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 transition"
                data-copy="${escapeHtml(JSON.stringify(trace.args || {}, null, 2))}"
              >
                Copiar JSON
              </button>
            </div>
            <pre class="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 text-[11px] font-mono overflow-x-auto max-h-48 scrollbar-thin text-slate-300"><code>${formattedArgs}</code></pre>
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <span>📤</span> Resultado Devuelto al LLM (Output Result)
              </span>
              <button
                class="btn-copy-json text-[10px] font-mono text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 transition"
                data-copy="${escapeHtml(JSON.stringify(trace.output || {}, null, 2))}"
              >
                Copiar JSON
              </button>
            </div>
            <pre class="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 text-[11px] font-mono overflow-x-auto max-h-56 scrollbar-thin text-slate-300"><code>${formattedOutput}</code></pre>
          </div>
        </div>
      </div>
    `;
  }

  _attachAccordionListeners(container) {
    if (!container) return;

    const toggles = container.querySelectorAll('.tool-accordion-toggle');
    toggles.forEach((toggle) => {
      toggle.addEventListener('click', (e) => {
        if (e.target.closest('.btn-copy-json')) return;
        const traceId = toggle.getAttribute('data-trace-id');
        const body = document.getElementById(`tool-body-${traceId}`);
        const arrow = toggle.querySelector('.accordion-arrow');

        if (body) {
          const isCurrentlyHidden = body.classList.contains('hidden');
          if (isCurrentlyHidden) {
            body.classList.remove('hidden');
            arrow?.classList.add('rotate-180');
            this.expandedCards.add(traceId);
          } else {
            body.classList.add('hidden');
            arrow?.classList.remove('rotate-180');
            this.expandedCards.delete(traceId);
          }
        }
      });
    });

    const copyBtns = container.querySelectorAll('.btn-copy-json');
    copyBtns.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const textToCopy = btn.getAttribute('data-copy');
        if (!textToCopy) return;
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard) {
            await navigator.clipboard.writeText(textToCopy);
            const originalText = btn.textContent;
            btn.textContent = '¡Copiado! ✓';
            btn.classList.add('text-emerald-400', 'border-emerald-500');
            setTimeout(() => {
              btn.textContent = originalText;
              btn.classList.remove('text-emerald-400', 'border-emerald-500');
            }, 1500);
          }
        } catch { /* fallback */ }
      });
    });
  }

  _handleToolsUpdated(data) {
    this.renderToolsTimeline(data?.toolExecutions || this.store.getState().toolExecutions);
  }

  _handleCustomerUpdated(data) {
    this.renderCustomerMemory(data?.customer, this.store.getState().activePhone);
  }

  _handleConversationUpdated(data) {
    const state = this.store.getState();
    this.renderModeIndicator(data?.conversation || state.conversation, state.messages, state.toolExecutions);
  }

  _handlePhoneChanged(data) {
    this.lastNotesMd = null;
    this.render();
  }

  _handleMessagesUpdated(data) {
    const state = this.store.getState();
    this.renderModeIndicator(state.conversation, data?.messages || state.messages, state.toolExecutions);
  }

  _handleStateReset() {
    this.lastNotesMd = null;
    this.expandedCards.clear();
    this.render();
  }
}

export const debuggerUI = new DebuggerUI();
