/**
 * ChatAliado Playground - Reactive State Store
 * Event-driven store with pub/sub architecture for local WhatsApp simulation.
 */

import { CONFIG } from '../config.js';

export const SEEDED_CONTACTS = [
  {
    phone: '5215512345678',
    name: 'Carlos Mendoza',
    avatar: '👨‍💼',
    color: 'bg-emerald-600',
  },
  {
    phone: '5215598765432',
    name: 'Zam (Cliente VIP)',
    avatar: '👑',
    color: 'bg-amber-600',
  },
  {
    phone: '5215511223344',
    name: 'Nuevo Cliente',
    avatar: '🍕',
    color: 'bg-indigo-600',
  },
];

/**
 * Creates initial default state.
 */
function createInitialState() {
  return {
    restaurant: {
      id: CONFIG.DEFAULT_RESTAURANT_ID,
      slug: CONFIG.DEFAULT_RESTAURANT_SLUG,
      name: CONFIG.DEFAULT_RESTAURANT_NAME || 'Pizzería Don Giovanni',
    },
    contacts: [...SEEDED_CONTACTS],
    activePhone: SEEDED_CONTACTS[0].phone,
    customer: null, // { id, name, phone, notes_md }
    conversation: null, // { id, status, mode: 'ai' | 'human' }
    messages: [], // Array of MessageRecord
    activeOrder: null, // Order with nested order_items
    toolExecutions: [], // Array of parsed tool executions
    isSending: false,
    isSyncing: false,
    lastSyncTime: null,
    workerOnline: null, // boolean | null
    supabaseOnline: null, // boolean | null
  };
}

export class PlaygroundStore {
  constructor() {
    this._listeners = new Map();
    this._state = createInitialState();
  }

  /**
   * Returns a snapshot of the current state.
   */
  getState() {
    return { ...this._state };
  }

  /**
   * Subscribes a listener callback to an event.
   * @param {string} event - Event name or '*' for all events.
   * @param {Function} handler - Callback function receiving event data and state.
   * @returns {() => void} Unsubscribe function.
   */
  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Unsubscribes a listener callback from an event.
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).delete(handler);
    }
  }

  /**
   * Emits an event to all subscribed listeners.
   * @param {string} event
   * @param {any} data
   */
  emit(event, data = null) {
    const eventPayload = { event, data, state: this.getState(), timestamp: new Date() };

    // Trigger specific event listeners
    if (this._listeners.has(event)) {
      for (const handler of this._listeners.get(event)) {
        try {
          handler(data, this.getState());
        } catch (err) {
          console.error(`[Store] Error in handler for event "${event}":`, err);
        }
      }
    }

    // Trigger wildcard listeners
    if (event !== '*' && this._listeners.has('*')) {
      for (const handler of this._listeners.get('*')) {
        try {
          handler(eventPayload, this.getState());
        } catch (err) {
          console.error('[Store] Error in wildcard handler:', err);
        }
      }
    }
  }

  /**
   * Sets the active contact phone number.
   * @param {string} phone
   */
  setActivePhone(phone) {
    const cleaned = String(phone).replace(/\D/g, '');
    if (!cleaned || this._state.activePhone === cleaned) return;

    this._state.activePhone = cleaned;
    // Reset transient client data for smooth switching
    this._state.messages = [];
    this._state.customer = null;
    this._state.conversation = null;
    this._state.activeOrder = null;
    this._state.toolExecutions = [];

    this.emit('phone:changed', { activePhone: cleaned });
    this.emit('state:changed', this.getState());
  }

  /**
   * Adds or selects a contact in the contact list.
   * @param {{ phone: string, name: string, avatar?: string, color?: string }} contact
   */
  addContact(contact) {
    const cleanedPhone = String(contact.phone).replace(/\D/g, '');
    if (!cleanedPhone) return;

    const existingIndex = this._state.contacts.findIndex(c => c.phone === cleanedPhone);
    const formattedContact = {
      phone: cleanedPhone,
      name: contact.name?.trim() || `Cliente +${cleanedPhone}`,
      avatar: contact.avatar || '👤',
      color: contact.color || 'bg-slate-600',
    };

    if (existingIndex >= 0) {
      this._state.contacts[existingIndex] = { ...this._state.contacts[existingIndex], ...formattedContact };
    } else {
      this._state.contacts.push(formattedContact);
    }

    this.emit('contacts:updated', { contacts: this._state.contacts, newContact: formattedContact });
    this.setActivePhone(cleanedPhone);
  }

  /**
   * Updates partial state and emits granular and global events.
   * @param {Partial<ReturnType<typeof createInitialState>>} partialState
   */
  updateState(partialState) {
    if (!partialState || typeof partialState !== 'object') return;

    const changedKeys = [];
    for (const [key, value] of Object.entries(partialState)) {
      if (this._state[key] !== value) {
        this._state[key] = value;
        changedKeys.push(key);
      }
    }

    if (changedKeys.length === 0) return;

    // Granular notifications
    if (changedKeys.includes('messages')) {
      this.emit('messages:updated', { messages: this._state.messages });
    }
    if (changedKeys.includes('activeOrder')) {
      this.emit('order:updated', { activeOrder: this._state.activeOrder });
    }
    if (changedKeys.includes('customer')) {
      this.emit('customer:updated', { customer: this._state.customer });
    }
    if (changedKeys.includes('conversation')) {
      this.emit('conversation:updated', { conversation: this._state.conversation });
    }
    if (changedKeys.includes('toolExecutions')) {
      this.emit('tools:updated', { toolExecutions: this._state.toolExecutions });
    }
    if (changedKeys.includes('restaurant')) {
      this.emit('restaurant:changed', { restaurant: this._state.restaurant });
    }
    if (changedKeys.includes('workerOnline') || changedKeys.includes('supabaseOnline')) {
      this.emit('connection:changed', {
        workerOnline: this._state.workerOnline,
        supabaseOnline: this._state.supabaseOnline,
      });
    }

    this.emit('state:changed', this.getState());
  }

  /**
   * Sets conversational mode ('ai' | 'human') and emits conversation:updated.
   * @param {'ai' | 'human'} mode
   */
  setConversationMode(mode) {
    const currentConv = this._state.conversation || { id: null, status: 'open', mode: 'ai' };
    const updatedConv = { ...currentConv, mode };
    this.updateState({ conversation: updatedConv });
    return updatedConv;
  }

  /**
   * Sets the isSending indicator.
   * @param {boolean} isSending
   */
  setSending(isSending) {
    this._state.isSending = Boolean(isSending);
    this.emit('sending:changed', { isSending: this._state.isSending });
    this.emit('state:changed', this.getState());
  }

  /**
   * Sets the isSyncing indicator and updates lastSyncTime when finished.
   * @param {boolean} isSyncing
   */
  setSyncing(isSyncing) {
    this._state.isSyncing = Boolean(isSyncing);
    if (!isSyncing) {
      this._state.lastSyncTime = new Date();
    }
    this.emit('sync:status', { isSyncing: this._state.isSyncing, lastSyncTime: this._state.lastSyncTime });
    this.emit('state:changed', this.getState());
  }

  /**
   * Sets active restaurant.
   * @param {{ id: string, slug: string, name: string }} restaurant
   */
  setRestaurant(restaurant) {
    this._state.restaurant = { ...restaurant };
    this.emit('restaurant:changed', { restaurant: this._state.restaurant });
    this.emit('state:changed', this.getState());
  }

  /**
   * Resets dynamic conversation state.
   */
  resetState() {
    const initialState = createInitialState();
    this._state.customer = null;
    this._state.conversation = null;
    this._state.messages = [];
    this._state.activeOrder = null;
    this._state.toolExecutions = [];
    this._state.isSending = false;
    this._state.isSyncing = false;
    this._state.lastSyncTime = null;

    this.emit('state:reset', null);
    this.emit('state:changed', this.getState());
  }

  /**
   * Utility helper to extract chronological tool calls & execution logs from messages.
   * @param {Array<any>} messages
   * @returns {Array<any>}
   */
  parseToolExecutions(messages = []) {
    if (!Array.isArray(messages)) return [];
    const traces = [];

    // Map tool_call_id to response
    const toolResults = new Map();
    for (const msg of messages) {
      if (msg.role === 'tool') {
        const callId = msg.metadata?.tool_call_id || msg.metadata?.toolCallId || msg.id;
        let content = msg.content;
        try {
          if (typeof content === 'string' && (content.startsWith('{') || content.startsWith('['))) {
            content = JSON.parse(content);
          }
        } catch {
          // keep as string
        }
        toolResults.set(callId, {
          output: content,
          timestamp: msg.created_at || msg.timestamp,
        });
      }
    }

    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.metadata?.tool_calls) {
        const toolCalls = Array.isArray(msg.metadata.tool_calls)
          ? msg.metadata.tool_calls
          : [];

        for (const tc of toolCalls) {
          const callId = tc.id;
          const name = tc.function?.name || tc.name || 'unknown_tool';
          let args = tc.function?.arguments || tc.arguments || {};
          if (typeof args === 'string') {
            try {
              args = JSON.parse(args);
            } catch {
              // keep as string
            }
          }

          const result = toolResults.get(callId);
          traces.push({
            id: callId || `tool_${traces.length + 1}`,
            name,
            args,
            output: result?.output || null,
            status: result ? 'success' : 'pending',
            timestamp: result?.timestamp || msg.created_at || new Date().toISOString(),
          });
        }
      }
    }

    return traces;
  }
}

// Singleton export
export const store = new PlaygroundStore();
