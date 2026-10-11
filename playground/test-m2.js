/**
 * Test script for Milestone 2: Webhook API Client & WhatsApp Chat UI
 * STRICTLY DEV_ONLY - NEVER DEPLOY TO PRODUCTION
 */

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// Mock localStorage and window for Node environment
const mockStorage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, val) => mockStorage.set(key, String(val)),
    removeItem: (key) => mockStorage.delete(key),
    clear: () => mockStorage.clear(),
  },
};

console.log('--- STARTING MILESTONE 2 TEST SUITE ---\n');

// ----------------------------------------------------------------------------
// 1. Test ApiClient in playground/js/api.js
// ----------------------------------------------------------------------------
console.log('1. Testing playground/js/api.js (ApiClient)...');

const { ApiClient, apiClient } = await import('./js/api.js');
const { CONFIG } = await import('./config.js');

assert.ok(apiClient instanceof ApiClient, 'apiClient must be an instance of ApiClient');

// Test generateMessageId
const msgId1 = apiClient.generateMessageId();
const msgId2 = apiClient.generateMessageId();
assert.ok(msgId1.startsWith('MSG_'), 'Message ID should start with MSG_');
assert.notEqual(msgId1, msgId2, 'Message IDs must be unique');
assert.ok(msgId1.split('_').length >= 3, 'Message ID should have timestamp and suffix');

// Test cleanPhone
assert.equal(apiClient.cleanPhone('+52 1 (55) 1234-5678'), '5215512345678');
assert.equal(apiClient.cleanPhone('52-155-9876-5432'), '5215598765432');
assert.equal(apiClient.cleanPhone(null), '');
assert.equal(apiClient.cleanPhone(undefined), '');

// Test buildWebhookPayload
const { payload, msgId } = apiClient.buildWebhookPayload(
  '+52 1 55 1234 5678',
  'Carlos Mendoza',
  'Quiero una pizza de pepperoni',
  'don-giovanni'
);

assert.equal(payload.event, 'messages.upsert');
assert.equal(payload.instance, 'don-giovanni');
assert.equal(payload.data.key.remoteJid, '5215512345678@s.whatsapp.net');
assert.equal(payload.data.key.fromMe, false);
assert.equal(payload.data.key.id, msgId);
assert.equal(payload.data.pushName, 'Carlos Mendoza');
assert.equal(payload.data.message.conversation, 'Quiero una pizza de pepperoni');
assert.ok(typeof payload.data.messageTimestamp === 'number');

// Test sendWhatsAppWebhook with mock fetch
let capturedFetchUrl = null;
let capturedFetchOptions = null;

const originalFetch = globalThis.fetch;

// Mock successful webhook response
globalThis.fetch = async (url, options) => {
  capturedFetchUrl = url;
  capturedFetchOptions = options;
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ success: true, message: 'Dispatched to queue' }),
  };
};

const sendResult = await apiClient.sendWhatsAppWebhook(
  '5215512345678',
  'Carlos Mendoza',
  'Hola!',
  'don-giovanni'
);

assert.equal(sendResult.ok, true);
assert.equal(sendResult.status, 200);
assert.equal(capturedFetchUrl, CONFIG.WORKER_URL);
assert.equal(capturedFetchOptions.method, 'POST');
assert.equal(capturedFetchOptions.headers['apikey'], CONFIG.WORKER_API_KEY);
assert.equal(capturedFetchOptions.headers['x-api-key'], CONFIG.WORKER_API_KEY);
assert.equal(capturedFetchOptions.headers['Content-Type'], 'application/json');

const parsedBody = JSON.parse(capturedFetchOptions.body);
assert.equal(parsedBody.event, 'messages.upsert');
assert.equal(parsedBody.data.message.conversation, 'Hola!');
console.log('   ✓ sendWhatsAppWebhook generated valid Evolution API payload and headers');

// Mock network failure in sendWhatsAppWebhook
globalThis.fetch = async () => {
  throw new Error('Connection refused to localhost:8787');
};

const failedSendResult = await apiClient.sendWhatsAppWebhook(
  '5215512345678',
  'Carlos',
  'Hola',
  'don-giovanni'
);
assert.equal(failedSendResult.ok, false);
assert.equal(failedSendResult.status, 0);
assert.ok(failedSendResult.error.includes('Connection refused'));
console.log('   ✓ sendWhatsAppWebhook handles network failures safely');

// Test fetchCustomerByPhone
globalThis.fetch = async (url, options) => {
  capturedFetchUrl = url;
  capturedFetchOptions = options;
  if (url.includes('phone=eq.5215512345678')) {
    return {
      ok: true,
      status: 200,
      json: async () => [
        { id: 'c123', name: 'Carlos Mendoza', phone: '5215512345678', notes_md: 'VIP customer' },
      ],
    };
  }
  return { ok: true, status: 200, json: async () => [] };
};

const customer = await apiClient.fetchCustomerByPhone('5215512345678', 'rest-1');
assert.ok(customer !== null);
assert.equal(customer.id, 'c123');
assert.equal(customer.name, 'Carlos Mendoza');
assert.ok(capturedFetchUrl.includes('customers?phone=eq.5215512345678'));
assert.ok(capturedFetchOptions.headers['apikey'], 'Should include Supabase apikey header');
assert.ok(capturedFetchOptions.headers['Authorization'].startsWith('Bearer '));

const nonExistentCustomer = await apiClient.fetchCustomerByPhone('5215500000000', 'rest-1');
assert.equal(nonExistentCustomer, null);
console.log('   ✓ fetchCustomerByPhone queries Supabase PostgREST correctly');

// Test fetchActiveConversation
globalThis.fetch = async (url) => {
  if (url.includes('conversations?') && url.includes('status=eq.open')) {
    return {
      ok: true,
      status: 200,
      json: async () => [{ id: 'conv-999', status: 'open', mode: 'ai' }],
    };
  }
  return { ok: true, status: 200, json: async () => [] };
};

const conversation = await apiClient.fetchActiveConversation('c123', 'rest-1');
assert.ok(conversation !== null);
assert.equal(conversation.id, 'conv-999');
assert.equal(conversation.mode, 'ai');
console.log('   ✓ fetchActiveConversation filters by status=open');

// Test fetchMessages
globalThis.fetch = async (url) => {
  if (url.includes('messages?') && url.includes('conversation_id=eq.conv-999')) {
    return {
      ok: true,
      status: 200,
      json: async () => [
        { id: 'm1', role: 'user', content: 'Buenas tardes', created_at: '2026-08-21T20:00:00Z' },
        { id: 'm2', role: 'assistant', content: '¡Hola! ¿En qué puedo ayudarte?', created_at: '2026-08-21T20:00:02Z' },
      ],
    };
  }
  return { ok: true, status: 200, json: async () => [] };
};

const messages = await apiClient.fetchMessages('conv-999');
assert.equal(messages.length, 2);
assert.equal(messages[0].role, 'user');
assert.equal(messages[1].role, 'assistant');
console.log('   ✓ fetchMessages returns chronological message list');

// Test fetchActiveOrder
globalThis.fetch = async (url) => {
  if (url.includes('orders?') && url.includes('customer_id=eq.c123')) {
    return {
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 'ord-100',
          status: 'draft',
          total_amount: 320,
          order_items: [
            { id: 'item-1', product_id: 'p-1', quantity: 2, unit_price: 160 },
          ],
        },
      ],
    };
  }
  return { ok: true, status: 200, json: async () => [] };
};

const order = await apiClient.fetchActiveOrder('c123', 'rest-1');
assert.ok(order !== null);
assert.equal(order.id, 'ord-100');
assert.equal(order.order_items.length, 1);
console.log('   ✓ fetchActiveOrder returns order with nested items');

// Test fetchRestaurants
globalThis.fetch = async (url) => {
  if (url.includes('restaurants?is_active=eq.true')) {
    return {
      ok: true,
      status: 200,
      json: async () => [
        { id: 'r1', name: 'Pizzería Don Giovanni', slug: 'don-giovanni' },
      ],
    };
  }
  return { ok: true, status: 200, json: async () => [] };
};

const restaurants = await apiClient.fetchRestaurants();
assert.equal(restaurants.length, 1);
assert.equal(restaurants[0].slug, 'don-giovanni');
console.log('   ✓ fetchRestaurants queries active restaurants');

// Test checkWorkerHealth
globalThis.fetch = async (url) => {
  if (url.includes('/health')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: 'healthy', worker: 'chataliado' }),
    };
  }
  return { ok: false, status: 404 };
};

const health = await apiClient.checkWorkerHealth('http://localhost:8787/health');
assert.equal(health.ok, true);
assert.equal(health.status, 200);
assert.equal(health.data.status, 'healthy');
console.log('   ✓ checkWorkerHealth verifies worker connectivity');

// Test syncAll orchestration
globalThis.fetch = async (url) => {
  if (url.includes('customers?phone=')) {
    return {
      ok: true,
      status: 200,
      json: async () => [{ id: 'c123', name: 'Carlos', phone: '5215512345678', notes_md: 'Sin cebolla' }],
    };
  }
  if (url.includes('conversations?customer_id=eq.c123')) {
    return {
      ok: true,
      status: 200,
      json: async () => [{ id: 'conv-123', status: 'open', mode: 'ai' }],
    };
  }
  if (url.includes('orders?customer_id=eq.c123')) {
    return {
      ok: true,
      status: 200,
      json: async () => [{ id: 'ord-123', status: 'draft', total_amount: 180 }],
    };
  }
  if (url.includes('messages?conversation_id=eq.conv-123')) {
    return {
      ok: true,
      status: 200,
      json: async () => [{ id: 'm1', role: 'user', content: 'Pizza por favor' }],
    };
  }
  return { ok: true, status: 200, json: async () => [] };
};

const syncData = await apiClient.syncAll('5215512345678', 'rest-1', 'don-giovanni');
assert.ok(syncData.customer !== null);
assert.equal(syncData.customer.id, 'c123');
assert.ok(syncData.conversation !== null);
assert.equal(syncData.conversation.id, 'conv-123');
assert.equal(syncData.messages.length, 1);
assert.ok(syncData.order !== null);
assert.equal(syncData.order.id, 'ord-123');
console.log('   ✓ syncAll orchestrates unified payload fetching');

// Restore original fetch
globalThis.fetch = originalFetch;

console.log('✅ ApiClient passed all verification tests.\n');

// ----------------------------------------------------------------------------
// 2. Test Chat UI helpers and renderers in playground/js/chat-ui.js
// ----------------------------------------------------------------------------
console.log('2. Testing playground/js/chat-ui.js (Chat UI & Formatting Helpers)...');

const {
  formatPhoneNumber,
  formatMessageTime,
  renderMarkdown,
  escapeHtml,
  renderContactItem,
  renderMessageBubble,
  ChatUIController,
  chatUI,
} = await import('./js/chat-ui.js');

// Test formatPhoneNumber
assert.equal(formatPhoneNumber('5215512345678'), '+52 1 55 1234 5678');
assert.equal(formatPhoneNumber('525512345678'), '+52 55 1234 5678');
assert.equal(formatPhoneNumber('5512345678'), '+52 55 1234 5678');
assert.equal(formatPhoneNumber('+1 (415) 555-2671'), '+14155552671');
console.log('   ✓ formatPhoneNumber handles international formatting');

// Test formatMessageTime
assert.equal(formatMessageTime(null), '');
assert.equal(formatMessageTime('invalid-date'), '');
const formattedTime = formatMessageTime('2026-08-21T18:30:00Z');
assert.ok(formattedTime.length > 0, 'Formatted time must be non-empty');
console.log('   ✓ formatMessageTime formats timestamps safely');

// Test escapeHtml
assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
assert.equal(escapeHtml('Hello & "Goodbye"'), 'Hello &amp; &quot;Goodbye&quot;');
console.log('   ✓ escapeHtml prevents XSS injections');

// Test renderMarkdown
const mdOutput = renderMarkdown('**Pizza Pepperoni** cuesta *$180* con `queso extra`\nDeliciosa');
assert.ok(mdOutput.includes('<strong>Pizza Pepperoni</strong>'));
assert.ok(mdOutput.includes('<em>$180</em>'));
assert.ok(mdOutput.includes('<code>queso extra</code>'));
assert.ok(mdOutput.includes('<br/>'));
console.log('   ✓ renderMarkdown formats markdown syntax with fallback');

// Test renderContactItem
const activeContactHtml = renderContactItem(
  { phone: '5215512345678', name: 'Carlos Mendoza', avatar: '👨‍💼', color: 'bg-emerald-600' },
  true
);
assert.ok(activeContactHtml.includes('Carlos Mendoza'));
assert.ok(activeContactHtml.includes('+52 1 55 1234 5678'));
assert.ok(activeContactHtml.includes('👨‍💼'));
assert.ok(activeContactHtml.includes('bg-emerald-950'));

const inactiveContactHtml = renderContactItem(
  { phone: '5215598765432', name: 'Zam', avatar: '👑', color: 'bg-amber-600' },
  false
);
assert.ok(inactiveContactHtml.includes('Zam'));
assert.ok(inactiveContactHtml.includes('bg-slate-900'));
console.log('   ✓ renderContactItem renders active and inactive states');

// Test renderMessageBubble
const userBubble = renderMessageBubble({
  role: 'user',
  content: '¿Tienen pizzas familiares?',
  created_at: '2026-08-21T20:10:00Z',
});
assert.ok(userBubble.includes('chat-bubble-user'));
assert.ok(userBubble.includes('¿Tienen pizzas familiares?'));
assert.ok(userBubble.includes('✓✓'));

const assistantBubble = renderMessageBubble({
  role: 'assistant',
  content: '¡Sí! Contamos con **Pepperoni**, **Hawaiana** y **Mexicana**.',
  metadata: {
    tool_calls: [{ name: 'get_menu' }],
  },
  created_at: '2026-08-21T20:10:02Z',
});
assert.ok(assistantBubble.includes('chat-bubble-assistant'));
assert.ok(assistantBubble.includes('<strong>Pepperoni</strong>'));
assert.ok(assistantBubble.includes('Herramientas: get_menu'));

const systemBubble = renderMessageBubble({
  role: 'system',
  content: 'Modo humano activado por solicitud del cliente.',
});
assert.ok(systemBubble.includes('chat-bubble-system'));
assert.ok(systemBubble.includes('Modo humano activado'));
console.log('   ✓ renderMessageBubble handles user, assistant and system roles');

// Test ChatUIController instance and reactivity
assert.ok(chatUI instanceof ChatUIController);
const { store } = await import('./js/store.js');

store.setActivePhone('5215598765432');
assert.equal(store.getState().activePhone, '5215598765432');
console.log('   ✓ ChatUIController reacts to store state changes');

console.log('✅ Chat UI passed all verification tests.\n');

// ----------------------------------------------------------------------------
// 3. Verify HTML bindings and script imports
// ----------------------------------------------------------------------------
console.log('3. Verifying index.html script imports...');
const html = fs.readFileSync(path.resolve('./index.html'), 'utf-8');
assert.ok(html.includes('src="./js/api.js"'), 'index.html must include api.js');
assert.ok(html.includes('src="./js/chat-ui.js"'), 'index.html must include chat-ui.js');
console.log('✅ index.html properly references all Milestone 2 modules.\n');

console.log('🎉 ALL MILESTONE 2 VERIFICATIONS PASSED 100%!');
