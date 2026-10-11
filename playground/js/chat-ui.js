/**
 * ChatAliado Playground - WhatsApp Chat UI Controller
 * Manages contact switching, message rendering, markdown parsing, and webhook dispatching.
 * STRICTLY DEV_ONLY - NEVER DEPLOY TO PRODUCTION
 */

import { CONFIG } from '../config.js';
import { store } from './store.js';
import { apiClient } from './api.js';

/**
 * Formats phone number into international readable format.
 * @param {string} phone
 * @returns {string}
 */
export function formatPhoneNumber(phone) {
  const clean = String(phone || '').replace(/\D/g, '');
  if (!clean) return '';
  if (clean.length === 13 && clean.startsWith('521')) {
    return `+52 1 ${clean.slice(3, 5)} ${clean.slice(5, 9)} ${clean.slice(9)}`;
  }
  if (clean.length === 12 && clean.startsWith('52')) {
    return `+52 ${clean.slice(2, 4)} ${clean.slice(4, 8)} ${clean.slice(8)}`;
  }
  if (clean.length === 10) {
    return `+52 ${clean.slice(0, 2)} ${clean.slice(2, 6)} ${clean.slice(6)}`;
  }
  return `+${clean}`;
}

/**
 * Formats timestamp to 12-hour / 24-hour time.
 * @param {string | number | Date} timestamp
 * @returns {string}
 */
export function formatMessageTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

/**
 * Safely parses markdown to HTML using marked.js or fallback.
 * @param {string} text
 * @returns {string}
 */
export function renderMarkdown(text) {
  if (!text) return '';
  if (typeof globalThis.marked?.parse === 'function') {
    try { return globalThis.marked.parse(text); } catch {}
  }
  const esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}

/**
 * Escapes HTML entities to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Formats full conversation into a human-readable text / markdown log.
 * @param {any} state
 * @returns {string}
 */
export function formatConversationTranscript(state) {
  const contact = state?.contacts?.find((c) => c.phone === state.activePhone) || {
    name: `Cliente +${state?.activePhone || ''}`,
    phone: state?.activePhone || '',
  };
  const customer = state?.customer;
  const conversation = state?.conversation;
  const activeOrder = state?.activeOrder;
  const messages = Array.isArray(state?.messages) ? state.messages : [];

  const lines = [];
  lines.push('================================================================================');
  lines.push('💬 TRANSCRIPCIÓN DE CONVERSACIÓN — CHATALIADO');
  lines.push('================================================================================');
  lines.push(`Restaurante : ${state?.restaurant?.name || 'Pizzería Don Giovanni'} (${state?.restaurant?.slug || 'don-giovanni'})`);
  lines.push(`Cliente     : ${contact.name} (${formatPhoneNumber(contact.phone)})`);
  lines.push(`Modo        : ${conversation?.mode === 'human' ? '👤 MODO HUMANO (BOT SILENCIADO)' : '🤖 MODO IA (ACTIVO)'}`);
  lines.push(`Fecha Log   : ${new Date().toLocaleString('es-MX')}`);
  lines.push('--------------------------------------------------------------------------------');

  if (customer?.notes_md?.trim()) {
    lines.push('\n📝 [MEMORIA DEL CLIENTE / NOTAS DEL MESERO]');
    lines.push(customer.notes_md.trim());
    lines.push('--------------------------------------------------------------------------------');
  }

  if (activeOrder) {
    lines.push(`\n🛒 [ESTADO DEL PEDIDO - ${String(activeOrder.status || '').toUpperCase()}]`);
    lines.push(`ID Pedido   : ${activeOrder.id}`);
    lines.push(`Subtotal    : $${Number(activeOrder.subtotal || 0).toFixed(2)}`);
    lines.push(`Total       : $${Number(activeOrder.total_amount || 0).toFixed(2)}`);
    if (activeOrder.delivery_address) lines.push(`Dirección   : ${activeOrder.delivery_address}`);
    if (activeOrder.payment_method) lines.push(`Método Pago : ${activeOrder.payment_method}`);
    if (Array.isArray(activeOrder.order_items) && activeOrder.order_items.length > 0) {
      lines.push('Ítems:');
      for (const item of activeOrder.order_items) {
        const prodName = item.menu_items?.name || item.product_name || 'Producto';
        lines.push(`  • ${item.quantity}x ${prodName} — $${Number(item.subtotal || 0).toFixed(2)}`);
      }
    }
    lines.push('--------------------------------------------------------------------------------');
  }

  lines.push('\n📜 [REGISTRO DE MENSAJES Y HERRAMIENTAS]');
  if (messages.length === 0) {
    lines.push('(Sin mensajes registrados en esta conversación)');
  } else {
    for (const msg of messages) {
      const time = formatMessageTime(msg.created_at || msg.timestamp || new Date());
      const role = msg.role;
      if (role === 'user') {
        lines.push(`\n[${time}] 👤 ${contact.name}:`);
        lines.push(`  ${msg.content}`);
      } else if (role === 'assistant') {
        const hasTools = Boolean(msg.metadata?.tool_calls?.length);
        lines.push(`\n[${time}] 🤖 Agente IA:`);
        lines.push(`  ${msg.content || '(Invocando herramientas...)'}`);
        if (hasTools) {
          lines.push(`  ⚡ Herramientas invocadas:`);
          for (const tc of msg.metadata.tool_calls) {
            const toolName = tc.name || tc.function?.name || 'unknown_tool';
            const args = typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments || tc.arguments || {});
            lines.push(`     • ${toolName}(${args})`);
          }
        }
      } else if (role === 'tool') {
        lines.push(`\n[${time}] ⚡ Tool Result (${msg.metadata?.tool_name || msg.name || 'tool'}):`);
        const contentStr = typeof msg.content === 'object' ? JSON.stringify(msg.content, null, 2) : String(msg.content || '');
        lines.push(`  ${contentStr}`);
      } else if (role === 'system') {
        lines.push(`\n[${time}] ℹ️ Sistema:`);
        lines.push(`  ${msg.content}`);
      } else {
        lines.push(`\n[${time}] [${String(role).toUpperCase()}]:`);
        lines.push(`  ${msg.content}`);
      }
    }
  }

  lines.push('\n================================================================================\n');
  return lines.join('\n');
}

/**
 * Builds structured JSON export payload.
 * @param {any} state
 * @returns {any}
 */
export function buildExportPayload(state) {
  const contact = state?.contacts?.find((c) => c.phone === state.activePhone) || {
    name: `Cliente +${state?.activePhone || ''}`,
    phone: state?.activePhone || '',
  };
  return {
    version: '1.0',
    exported_at: new Date().toISOString(),
    restaurant: state?.restaurant || null,
    contact,
    customer: state?.customer || null,
    conversation: state?.conversation || null,
    activeOrder: state?.activeOrder || null,
    messages: state?.messages || [],
    toolExecutions: state?.toolExecutions || [],
  };
}

/**
 * Triggers JSON download in the browser.
 * @param {string} filename
 * @param {any} data
 */
export function downloadJsonFile(filename, data) {
  if (typeof document === 'undefined') return;
  const jsonStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copies text to clipboard safely.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback to execCommand
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const res = document.execCommand('copy');
      document.body.removeChild(ta);
      return res;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Generates HTML for a contact pill in the carousel.
 */
export function renderContactItem(contact, isActive) {
  const activeClass = isActive
    ? 'bg-emerald-950/80 border-emerald-500/80 text-white ring-1 ring-emerald-500/50'
    : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:bg-slate-800/80 hover:text-white';

  return `
    <button type="button" data-phone="${escapeHtml(contact.phone)}" class="contact-pill shrink-0 flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs transition duration-150 cursor-pointer ${activeClass}">
      <span class="w-6 h-6 rounded-full ${contact.color || 'bg-slate-700'} flex items-center justify-center text-xs shrink-0">${contact.avatar || '👤'}</span>
      <div class="text-left">
        <div class="font-semibold leading-tight truncate max-w-[120px]">${escapeHtml(contact.name)}</div>
        <div class="text-[10px] text-slate-400 font-mono">${formatPhoneNumber(contact.phone)}</div>
      </div>
      ${isActive ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>' : ''}
    </button>`;
}

/**
 * Generates HTML for message bubbles.
 */
export function renderMessageBubble(msg) {
  const time = formatMessageTime(msg.created_at || msg.timestamp || new Date());

  if (msg.role === 'user') {
    return `
      <div class="flex justify-end mb-3">
        <div class="chat-bubble-user max-w-[82%] px-3.5 py-2.5 rounded-xl text-xs shadow-md">
          <div class="text-slate-100 whitespace-pre-wrap break-words leading-relaxed">${escapeHtml(msg.content)}</div>
          <div class="flex items-center justify-end space-x-1 mt-1 text-[10px] text-emerald-200/80 font-mono">
            <span>${time}</span><span class="text-emerald-300 font-bold">✓✓</span>
          </div>
        </div>
      </div>`;
  }

  if (msg.role === 'assistant') {
    const hasTools = Array.isArray(msg.metadata?.tool_calls) && msg.metadata.tool_calls.length > 0;
    return `
      <div class="flex justify-start mb-3">
        <div class="chat-bubble-assistant max-w-[85%] px-4 py-3 rounded-xl text-xs shadow-md border border-slate-750">
          <div class="flex items-center space-x-1.5 mb-1.5 text-[11px] font-semibold text-emerald-400">
            <span>🤖</span><span>Asistente Don Giovanni</span>
          </div>
          <div class="markdown-content text-slate-100 break-words leading-relaxed">${renderMarkdown(msg.content) || '<span class="italic text-slate-400">Procesando...</span>'}</div>
          ${hasTools ? `<div class="mt-2 pt-1.5 border-t border-slate-700/60 text-[10px] text-sky-400 font-mono">⚡ Herramientas: ${msg.metadata.tool_calls.map((t) => escapeHtml(t.name || t.function?.name)).join(', ')}</div>` : ''}
          <div class="text-right text-[10px] text-slate-400 font-mono mt-1.5">${time}</div>
        </div>
      </div>`;
  }

  if (msg.role === 'system' || msg.role === 'tool') {
    const contentStr = typeof msg.content === 'object' ? JSON.stringify(msg.content) : String(msg.content || '');
    return `
      <div class="flex justify-center my-2">
        <div class="chat-bubble-system max-w-[90%] px-3 py-1.5 rounded-lg text-[11px] text-slate-300 text-center font-mono">
          <span class="font-bold text-sky-400">${msg.role === 'tool' ? '⚡ Tool Output' : 'ℹ️ Sistema'}:</span>
          <span class="truncate block max-w-sm">${escapeHtml(contentStr)}</span>
        </div>
      </div>`;
  }

  return `
    <div class="flex justify-start mb-3">
      <div class="bg-amber-950/60 border border-amber-800/80 text-amber-100 max-w-[85%] px-4 py-2.5 rounded-xl text-xs shadow-md">
        <div class="flex items-center space-x-1.5 mb-1 text-[11px] font-semibold text-amber-400"><span>👨‍💻</span><span>Agente Humano</span></div>
        <div class="whitespace-pre-wrap break-words">${escapeHtml(msg.content)}</div>
        <div class="text-right text-[10px] text-amber-300/70 font-mono mt-1">${time}</div>
      </div>
    </div>`;
}

export class ChatUIController {
  constructor() {
    this._store = store;
    this.apiClient = apiClient;
    this._isInitialized = false;
    this._burstPollTimer = null;
    this._bindPhoneListener(store);
  }

  _bindPhoneListener(s) {
    if (!s || typeof s.on !== 'function') return;
    s.on('phone:changed', () => {
      if (this._burstPollTimer) {
        clearInterval(this._burstPollTimer);
        this._burstPollTimer = null;
        if (this.store && typeof this.store.setSending === 'function') {
          this.store.setSending(false);
        }
      }
    });
  }

  get store() {
    return this._store;
  }

  set store(newStore) {
    this._store = newStore;
    this._bindPhoneListener(newStore);
  }

  init() {
    if (typeof document === 'undefined' || this._isInitialized) return;
    this._isInitialized = true;
    this.bindDOMEvents();
    this.bindStoreEvents();
    this.renderAll();
  }

  bindDOMEvents() {
    // 1. Contact List click
    document.getElementById('contact-list-container')?.addEventListener('click', (e) => {
      const phone = e.target.closest('.contact-pill')?.getAttribute('data-phone');
      if (phone) this.selectContact(phone);
    });

    // 2. Add Contact Modal
    const modal = document.getElementById('add-contact-modal');
    const form = document.getElementById('add-contact-form');
    document.getElementById('btn-add-contact')?.addEventListener('click', () => {
      modal?.classList.remove('hidden');
      document.getElementById('modal-contact-phone')?.focus();
    });

    const closeModal = () => { modal?.classList.add('hidden'); form?.reset(); };
    document.getElementById('btn-close-add-contact')?.addEventListener('click', closeModal);
    document.getElementById('btn-cancel-add-contact')?.addEventListener('click', closeModal);

    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const phone = document.getElementById('modal-contact-phone')?.value?.trim();
      const name = document.getElementById('modal-contact-name')?.value?.trim();
      const avatar = document.getElementById('modal-contact-avatar')?.value?.trim() || '👤';
      if (phone && name) {
        this.store.addContact({ phone, name, avatar });
        closeModal();
        this.syncCurrentContact();
      }
    });

    // 3. Quick presets
    document.querySelectorAll('.btn-quick-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('chat-input');
        const text = btn.getAttribute('data-text');
        if (input && text) { input.value = text; input.focus(); }
      });
    });

    // 4. Chat form & enter key
    document.getElementById('chat-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSendMessage();
    });
    document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.handleSendMessage(); }
    });

    // 5. Clear chat
    document.getElementById('btn-clear-chat-view')?.addEventListener('click', () => {
      this.store.updateState({ messages: [] });
    });

    // 6. Click on header status badge to toggle AI vs Human mode
    document.getElementById('chat-header-status')?.addEventListener('click', async () => {
      const state = this.store.getState();
      const currentMode = state.conversation?.mode || 'ai';
      const targetMode = currentMode === 'human' ? 'ai' : 'human';
      const convId = state.conversation?.id;
      if (convId) {
        await this.apiClient.updateConversationMode(convId, targetMode);
      }
      this.store.setConversationMode(targetMode);
    });

    // 7. Copy full transcript to clipboard
    document.getElementById('btn-copy-transcript')?.addEventListener('click', () => {
      this.copyTranscript();
    });

    // 8. Download structured session JSON
    document.getElementById('btn-export-json')?.addEventListener('click', () => {
      this.exportJson();
    });
  }

  bindStoreEvents() {
    this.store.on('contacts:updated', () => this.renderContacts());
    this.store.on('phone:changed', () => {
      if (this._burstPollTimer) {
        clearInterval(this._burstPollTimer);
        this._burstPollTimer = null;
        this.store.setSending(false);
      }
      this.renderContacts();
      this.renderHeader();
      this.renderMessages();
      this.syncCurrentContact();
    });
    this.store.on('messages:updated', () => this.renderMessages());
    this.store.on('sending:changed', (d) => this.renderSendingStatus(d.isSending));
    this.store.on('conversation:updated', () => this.renderHeader());
  }

  selectContact(phone) {
    if (this._burstPollTimer) {
      clearInterval(this._burstPollTimer);
      this._burstPollTimer = null;
      this.store.setSending(false);
    }
    this.store.setActivePhone(phone);
  }

  async syncCurrentContact() {
    const state = this.store.getState();
    const phone = state.activePhone;
    const rId = state.restaurant?.id || CONFIG.DEFAULT_RESTAURANT_ID;
    const rSlug = state.restaurant?.slug || CONFIG.DEFAULT_RESTAURANT_SLUG;
    if (!phone || !rId) return;

    this.store.setSyncing(true);
    try {
      const data = await this.apiClient.syncAll(phone, rId, rSlug);
      if (this.store.getState().activePhone !== phone) return; // Guard against race conditions
      this.store.updateState({
        customer: data.customer,
        conversation: data.conversation,
        messages: data.messages,
        activeOrder: data.order,
        toolExecutions: this.store.parseToolExecutions(data.messages),
        supabaseOnline: true,
      });
    } catch (err) {
      console.warn('[ChatUI] Sync error:', err);
      this.store.updateState({ supabaseOnline: false });
    } finally {
      this.store.setSyncing(false);
    }
  }

  triggerBurstPolling() {
    if (this._burstPollTimer) clearInterval(this._burstPollTimer);
    const interval = CONFIG.BURST_POLL_INTERVAL_MS || 600;
    const maxCount = CONFIG.BURST_POLL_COUNT || 8;
    let count = 0;

    this._burstPollTimer = setInterval(async () => {
      count += 1;
      await this.syncCurrentContact();
      const messages = this.store.getState().messages;
      const lastMsg = messages[messages.length - 1];
      if ((lastMsg?.role === 'assistant' && lastMsg.content) || count >= maxCount) {
        clearInterval(this._burstPollTimer);
        this._burstPollTimer = null;
        this.store.setSending(false);
      }
    }, interval);
  }

  async handleSendMessage() {
    const input = document.getElementById('chat-input');
    const text = input?.value?.trim();
    if (!text || this.store.getState().isSending) return;

    const state = this.store.getState();
    const phone = state.activePhone;
    const activeContact = state.contacts.find((c) => c.phone === phone);
    const name = activeContact?.name || `Cliente +${phone}`;
    const rSlug = state.restaurant?.slug || CONFIG.DEFAULT_RESTAURANT_SLUG;

    if (input) input.value = '';

    const optimisticMsg = { id: `temp_${Date.now()}`, role: 'user', content: text, created_at: new Date().toISOString() };
    this.store.updateState({ messages: [...state.messages, optimisticMsg] });
    this.store.setSending(true);

    try {
      const res = await this.apiClient.sendWhatsAppWebhook(phone, name, text, rSlug);
      if (!res || !res.ok) {
        this.store.setSending(false);
        const errMsg = res?.error || (res?.status ? `HTTP ${res.status}` : 'Worker offline');
        if (typeof showToast === 'function') {
          showToast(`Error al enviar mensaje: ${errMsg}`, 'error', 4000);
        } else if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
          window.showToast(`Error al enviar mensaje: ${errMsg}`, 'error', 4000);
        }
        return;
      }
      this.triggerBurstPolling();
    } catch (err) {
      console.error('[ChatUI] sendWebhook failed:', err);
      this.store.setSending(false);
    }
  }

  renderContacts() {
    const container = document.getElementById('contact-list-container');
    if (!container) return;
    const state = this.store.getState();
    container.innerHTML = state.contacts
      .map((c) => renderContactItem(c, c.phone === state.activePhone))
      .join('');
  }

  renderHeader() {
    const state = this.store.getState();
    const contact = state.contacts.find((c) => c.phone === state.activePhone) || { name: `Cliente +${state.activePhone}`, phone: state.activePhone, avatar: '👤' };

    const avatarEl = document.getElementById('chat-header-avatar');
    const titleEl = document.getElementById('chat-header-title');
    const phoneEl = document.getElementById('chat-header-phone');
    const statusEl = document.getElementById('chat-header-status');

    if (avatarEl) avatarEl.textContent = contact.avatar || '👤';
    if (titleEl) titleEl.textContent = contact.name;
    if (phoneEl) phoneEl.textContent = formatPhoneNumber(contact.phone);
    if (statusEl) {
      const isHuman = state.conversation?.mode === 'human';
      statusEl.className = isHuman
        ? 'text-[11px] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 cursor-pointer hover:bg-amber-500/30 transition flex items-center gap-1 font-semibold select-none'
        : 'text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-pointer hover:bg-emerald-500/30 transition flex items-center gap-1 font-semibold select-none';
      statusEl.innerHTML = isHuman ? '<span>👤 Modo Humano</span>' : '<span>🤖 Modo IA</span>';
      statusEl.title = isHuman ? 'Click para reanudar el Agente IA' : 'Click para pausar el Bot y activar Modo Humano';
    }
  }

  renderMessages() {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;
    const messages = this.store.getState().messages || [];

    if (messages.length === 0) {
      container.innerHTML = `
        <div class="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
          <div class="w-16 h-16 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-2xl mb-3 shadow">💬</div>
          <h4 class="text-sm font-semibold text-slate-300 mb-1">Sin mensajes aún</h4>
          <p class="text-xs text-slate-400 max-w-xs mb-4">Escribe un mensaje de WhatsApp o selecciona un preset para probar la conversación.</p>
          <div class="text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-3 py-1.5 rounded-lg">⚡ Procesado en vivo por el orquestador LLM</div>
        </div>`;
      return;
    }

    container.innerHTML = messages.map((m) => renderMessageBubble(m)).join('');
    this.scrollToBottom();
  }

  renderSendingStatus(isSending) {
    const typing = document.getElementById('typing-indicator');
    const sendBtn = document.getElementById('btn-send-message');
    const sendText = document.getElementById('btn-send-text');
    const sendSpinner = document.getElementById('btn-send-spinner');
    const input = document.getElementById('chat-input');

    if (typing) typing.classList.toggle('hidden', !isSending);
    if (sendBtn) sendBtn.disabled = isSending;
    if (sendText) sendText.textContent = isSending ? 'Enviando...' : 'Enviar';
    if (sendSpinner) sendSpinner.classList.toggle('hidden', !isSending);
    if (input) input.disabled = isSending;
    this.scrollToBottom();
  }

  scrollToBottom() {
    const container = document.getElementById('chat-messages-container');
    if (container) container.scrollTop = container.scrollHeight;
  }

  /**
   * Copies formatted transcript of the active conversation to clipboard.
   */
  async copyTranscript() {
    const text = formatConversationTranscript(this.store.getState());
    const copied = await copyToClipboard(text);
    const textEl = document.getElementById('btn-copy-transcript-text');
    const iconEl = document.getElementById('btn-copy-transcript-icon');

    if (textEl && iconEl) {
      const originalText = textEl.textContent;
      const originalIcon = iconEl.textContent;
      textEl.textContent = copied ? '¡Copiado! ✓' : 'Error al copiar';
      iconEl.textContent = copied ? '✅' : '⚠️';
      setTimeout(() => {
        textEl.textContent = originalText;
        iconEl.textContent = originalIcon;
      }, 2000);
    }
  }

  /**
   * Exports full active conversation and tool execution log as JSON file.
   */
  exportJson() {
    const state = this.store.getState();
    const data = buildExportPayload(state);
    const phone = state.activePhone || 'cliente';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `chataliado_log_${phone}_${timestamp}.json`;
    downloadJsonFile(filename, data);
  }

  renderAll() {
    this.renderContacts();
    this.renderHeader();
    this.renderMessages();
    this.renderSendingStatus(this.store.getState().isSending);
  }
}

export const chatUI = new ChatUIController();

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => chatUI.init());
  } else {
    chatUI.init();
  }
}
