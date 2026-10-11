/**
 * ChatAliado Playground - API Client
 * Handles Evolution API Webhook dispatching and Supabase PostgREST queries.
 * STRICTLY DEV_ONLY - NEVER DEPLOY TO PRODUCTION
 */

import { CONFIG } from '../config.js';

export class ApiClient {
  /**
   * @param {typeof CONFIG} [config]
   */
  constructor(config = CONFIG) {
    this.config = config;
  }

  /**
   * Generates a unique message ID matching WhatsApp / Evolution API format.
   * @returns {string}
   */
  generateMessageId() {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 9).toUpperCase();
    return `MSG_${timestamp}_${randomSuffix}`;
  }

  /**
   * Cleans and standardizes phone number (digits only).
   * @param {string} phone
   * @returns {string}
   */
  cleanPhone(phone) {
    return String(phone || '').replace(/\D/g, '');
  }

  /**
   * Builds standardized Evolution API messages.upsert payload.
   * @param {string} phone
   * @param {string} name
   * @param {string} text
   * @param {string} [instanceSlug]
   * @returns {{ payload: any, msgId: string }}
   */
  buildWebhookPayload(phone, name, text, instanceSlug) {
    const cleanNumber = this.cleanPhone(phone);
    const msgId = this.generateMessageId();
    const slug = instanceSlug || this.config.DEFAULT_RESTAURANT_SLUG || 'don-giovanni';

    const payload = {
      event: 'messages.upsert',
      instance: slug,
      apikey: this.config.WORKER_API_KEY || 'test-evo-api-key',
      data: {
        key: {
          remoteJid: `${cleanNumber}@s.whatsapp.net`,
          fromMe: false,
          id: msgId,
        },
        pushName: name || `Cliente +${cleanNumber}`,
        message: {
          conversation: text,
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
      },
    };

    return { payload, msgId };
  }

  /**
   * Sends a simulated WhatsApp message via POST to the local Cloudflare Worker webhook.
   * @param {string} phone
   * @param {string} name
   * @param {string} text
   * @param {string} [instanceSlug]
   * @returns {Promise<{ ok: boolean, status: number, msgId: string, payload: any, data?: any, error?: string }>}
   */
  async sendWhatsAppWebhook(phone, name, text, instanceSlug) {
    const { payload, msgId } = this.buildWebhookPayload(phone, name, text, instanceSlug);
    const workerUrl = this.config.WORKER_URL || 'http://localhost:8787/webhook/evolution';
    const apiKey = this.config.WORKER_API_KEY || 'test-evo-api-key';

    try {
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
          'x-api-key': apiKey,
        },
        body: JSON.stringify(payload),
      });

      let responseData = null;
      try {
        const textResp = await response.text();
        if (textResp) {
          responseData = JSON.parse(textResp);
        }
      } catch {
        // response might not be JSON
      }

      return {
        ok: response.ok,
        status: response.status,
        msgId,
        payload,
        data: responseData,
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        msgId,
        payload,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Supabase PostgREST request helper.
   * @param {string} pathAndQuery - e.g. '/rest/v1/customers?...'
   * @param {RequestInit} [options]
   * @returns {Promise<any>}
   */
  async _supabaseFetch(pathAndQuery, options = {}) {
    const baseUrl = this.config.SUPABASE_URL?.replace(/\/+$/, '');
    const supabaseKey = this.config.SUPABASE_KEY;

    if (!baseUrl || !supabaseKey) {
      throw new Error('Supabase URL or Key not configured.');
    }

    const url = `${baseUrl}${pathAndQuery}`;
    const headers = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Accept': 'application/json',
      ...(options.headers || {}),
    };

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`Supabase request failed (${res.status}): ${errorText || res.statusText}`);
    }

    const json = await res.json().catch(() => null);
    return json;
  }

  /**
   * Fetches customer record by clean phone and restaurant ID.
   * @param {string} phone
   * @param {string} restaurantId
   * @returns {Promise<any | null>}
   */
  async fetchCustomerByPhone(phone, restaurantId) {
    const clean = this.cleanPhone(phone);
    if (!clean || !restaurantId) return null;

    try {
      const query = `/rest/v1/customers?phone=eq.${encodeURIComponent(clean)}&restaurant_id=eq.${encodeURIComponent(restaurantId)}&select=*`;
      const data = await this._supabaseFetch(query);
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    } catch (err) {
      console.warn('[ApiClient] fetchCustomerByPhone error:', err);
      return null;
    }
  }

  /**
   * Fetches the active open conversation for a customer in a restaurant.
   * @param {string} customerId
   * @param {string} restaurantId
   * @returns {Promise<any | null>}
   */
  async fetchActiveConversation(customerId, restaurantId) {
    if (!customerId || !restaurantId) return null;

    try {
      const query = `/rest/v1/conversations?customer_id=eq.${encodeURIComponent(customerId)}&restaurant_id=eq.${encodeURIComponent(restaurantId)}&status=eq.open&order=created_at.desc&limit=1&select=*`;
      const data = await this._supabaseFetch(query);
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    } catch (err) {
      console.warn('[ApiClient] fetchActiveConversation error:', err);
      return null;
    }
  }

  /**
   * Fetches chronological messages for a conversation.
   * @param {string} conversationId
   * @returns {Promise<Array<any>>}
   */
  async fetchMessages(conversationId) {
    if (!conversationId) return [];

    try {
      const query = `/rest/v1/messages?conversation_id=eq.${encodeURIComponent(conversationId)}&order=created_at.asc&select=*`;
      const data = await this._supabaseFetch(query);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('[ApiClient] fetchMessages error:', err);
      return [];
    }
  }

  /**
   * Fetches the active/latest order for a customer including order items and menu items.
   * @param {string} customerId
   * @param {string} restaurantId
   * @returns {Promise<any | null>}
   */
  async fetchActiveOrder(customerId, restaurantId) {
    if (!customerId || !restaurantId) return null;

    try {
      const query = `/rest/v1/orders?customer_id=eq.${encodeURIComponent(customerId)}&restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=created_at.desc&limit=1&select=*,order_items(*,menu_items(*))`;
      const data = await this._supabaseFetch(query);
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    } catch (err) {
      console.warn('[ApiClient] fetchActiveOrder error:', err);
      return null;
    }
  }

  /**
   * Fetches all active restaurants.
   * @returns {Promise<Array<any>>}
   */
  async fetchRestaurants() {
    try {
      const query = `/rest/v1/restaurants?is_active=eq.true&select=id,name,slug,address,timezone`;
      const data = await this._supabaseFetch(query);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('[ApiClient] fetchRestaurants error:', err);
      return [];
    }
  }

  /**
   * Updates conversational mode ('ai' | 'human') in Supabase.
   * @param {string} conversationId
   * @param {'ai' | 'human'} mode
   * @returns {Promise<boolean>}
   */
  async updateConversationMode(conversationId, mode) {
    if (!conversationId) return false;
    try {
      await this._supabaseFetch(`/rest/v1/conversations?id=eq.${encodeURIComponent(conversationId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ mode, updated_at: new Date().toISOString() }),
      });
      return true;
    } catch (err) {
      console.error('[ApiClient] updateConversationMode failed:', err);
      return false;
    }
  }

  /**
   * Checks health status of the Cloudflare Worker.
   * @param {string} [customUrl]
   * @returns {Promise<{ ok: boolean, status: number, data?: any }>}
   */
  async checkWorkerHealth(customUrl) {
    const defaultHealthUrl = this.config.WORKER_URL
      ? this.config.WORKER_URL.replace(/\/webhook\/.*$/, '/health')
      : 'http://localhost:8787/health';
    const targetUrl = customUrl || defaultHealthUrl;

    try {
      const res = await fetch(targetUrl, { method: 'GET' });
      let data = null;
      try {
        data = await res.json();
      } catch {
        // may be non-json
      }
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { ok: false, status: 0, data: null };
    }
  }

  /**
   * Checks health status of Supabase connectivity.
   * @returns {Promise<{ ok: boolean, status: number }>}
   */
  async checkSupabaseHealth() {
    try {
      await this._supabaseFetch('/rest/v1/restaurants?limit=1&select=id');
      return { ok: true, status: 200 };
    } catch {
      return { ok: false, status: 0 };
    }
  }

  /**
   * Orchestrates full data sync for a phone and restaurant.
   * Fetches customer, active conversation, messages, and active order.
   * @param {string} phone
   * @param {string} restaurantId
   * @param {string} [restaurantSlug]
   * @returns {Promise<{ customer: any | null, conversation: any | null, messages: Array<any>, order: any | null }>}
   */
  async syncAll(phone, restaurantId, restaurantSlug) {
    const clean = this.cleanPhone(phone);
    if (!clean || !restaurantId) {
      return { customer: null, conversation: null, messages: [], order: null };
    }

    // 1. Fetch customer
    const customer = await this.fetchCustomerByPhone(clean, restaurantId);
    if (!customer) {
      return { customer: null, conversation: null, messages: [], order: null };
    }

    // 2. Fetch active conversation & active order in parallel
    const [conversation, order] = await Promise.all([
      this.fetchActiveConversation(customer.id, restaurantId),
      this.fetchActiveOrder(customer.id, restaurantId),
    ]);

    // 3. Fetch messages if conversation exists
    let messages = [];
    if (conversation?.id) {
      messages = await this.fetchMessages(conversation.id);
    }

    return {
      customer,
      conversation,
      messages,
      order,
    };
  }
}

// Singleton instance
export const apiClient = new ApiClient();
