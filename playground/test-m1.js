/**
 * Test script for Milestone 1: Config, Store, HTML & CSS verification
 */

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// Mock localStorage for Node.js environment
const mockStorage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, val) => mockStorage.set(key, String(val)),
    removeItem: (key) => mockStorage.delete(key),
    clear: () => mockStorage.clear(),
  },
};

// 1. Test config.js
console.log('Testing config.js...');
const { CONFIG, DEFAULT_CONFIG, loadCustomConfig, saveCustomConfig, resetConfig } = await import('./config.js');

assert.equal(CONFIG.DEV_ONLY, true, 'CONFIG.DEV_ONLY must be true');
assert.equal(CONFIG.WORKER_URL, 'http://localhost:8787/webhook/evolution');
assert.equal(CONFIG.WORKER_API_KEY, 'test-evo-api-key');
assert.equal(CONFIG.DEFAULT_RESTAURANT_SLUG, 'don-giovanni');
assert.equal(CONFIG.DEFAULT_RESTAURANT_ID, 'a0000000-0000-0000-0000-000000000001');
assert.ok(CONFIG.SUPABASE_URL.includes('supabase.co'), 'SUPABASE_URL should be defined');
assert.ok(CONFIG.SUPABASE_KEY.length > 20, 'SUPABASE_KEY should be defined');
assert.equal(CONFIG.POLL_INTERVAL_MS, 3000);
assert.equal(CONFIG.BURST_POLL_INTERVAL_MS, 600);
assert.equal(CONFIG.BURST_POLL_COUNT, 8);

// Test saveCustomConfig
saveCustomConfig({ POLL_INTERVAL_MS: 5000, DEFAULT_RESTAURANT_SLUG: 'custom-slug' });
assert.equal(CONFIG.POLL_INTERVAL_MS, 5000);
assert.equal(CONFIG.DEFAULT_RESTAURANT_SLUG, 'custom-slug');
assert.ok(mockStorage.has('chataliado_playground_config'));

// Test resetConfig
resetConfig();
assert.equal(CONFIG.POLL_INTERVAL_MS, 3000);
assert.equal(CONFIG.DEFAULT_RESTAURANT_SLUG, 'don-giovanni');
console.log('✅ config.js passed all tests.');

// 2. Test js/store.js
console.log('Testing js/store.js...');
const { PlaygroundStore, store, SEEDED_CONTACTS } = await import('./js/store.js');

assert.ok(store instanceof PlaygroundStore, 'store should be an instance of PlaygroundStore');
const initialState = store.getState();
assert.equal(initialState.contacts.length, 3, 'Must have 3 seeded contacts');
assert.equal(initialState.activePhone, '5215512345678', 'Initial active phone should match Carlos');
assert.equal(initialState.isSending, false);
assert.equal(initialState.isSyncing, false);

// Test pub/sub events
let eventFired = false;
let eventData = null;
const unsub = store.on('phone:changed', (data) => {
  eventFired = true;
  eventData = data;
});

store.setActivePhone('5215598765432');
assert.equal(eventFired, true);
assert.equal(eventData.activePhone, '5215598765432');
assert.equal(store.getState().activePhone, '5215598765432');

// Test addContact
let contactsUpdated = false;
store.on('contacts:updated', (data) => {
  contactsUpdated = true;
});

store.addContact({
  phone: '5215500009999',
  name: 'Test Customer',
  avatar: '🧪',
});

assert.equal(contactsUpdated, true);
assert.equal(store.getState().contacts.length, 4);
assert.equal(store.getState().activePhone, '5215500009999');

// Test updateState
let messagesUpdated = false;
store.on('messages:updated', () => {
  messagesUpdated = true;
});

store.updateState({
  messages: [{ id: '1', role: 'user', content: 'Hola' }],
  customer: { id: 'c1', name: 'Test', phone: '5215500009999', notes_md: 'Likes extra cheese' },
  activeOrder: { id: 'o1', status: 'draft', total_amount: 250 },
});

assert.equal(messagesUpdated, true);
assert.equal(store.getState().messages.length, 1);
assert.equal(store.getState().customer.notes_md, 'Likes extra cheese');
assert.equal(store.getState().activeOrder.total_amount, 250);

// Test parseToolExecutions
const mockMessages = [
  {
    id: 'm1',
    role: 'assistant',
    content: null,
    metadata: {
      tool_calls: [
        {
          id: 'call_abc123',
          name: 'get_menu',
          arguments: { category: 'pizzas' },
        },
      ],
    },
    created_at: '2026-08-21T20:00:00Z',
  },
  {
    id: 'm2',
    role: 'tool',
    content: JSON.stringify({ items: [{ name: 'Pepperoni', price: 180 }] }),
    metadata: {
      tool_call_id: 'call_abc123',
    },
    created_at: '2026-08-21T20:00:01Z',
  },
];

const traces = store.parseToolExecutions(mockMessages);
assert.equal(traces.length, 1);
assert.equal(traces[0].name, 'get_menu');
assert.equal(traces[0].status, 'success');
assert.deepEqual(traces[0].output, { items: [{ name: 'Pepperoni', price: 180 }] });

// Test setSending & setSyncing
store.setSending(true);
assert.equal(store.getState().isSending, true);
store.setSending(false);
assert.equal(store.getState().isSending, false);

store.setSyncing(true);
assert.equal(store.getState().isSyncing, true);
store.setSyncing(false);
assert.equal(store.getState().isSyncing, false);
assert.ok(store.getState().lastSyncTime instanceof Date);

// Test resetState
store.resetState();
assert.equal(store.getState().messages.length, 0);
assert.equal(store.getState().customer, null);
assert.equal(store.getState().activeOrder, null);
console.log('✅ js/store.js passed all tests.');

// 3. Test index.html structure
console.log('Testing index.html...');
const htmlContent = fs.readFileSync(path.resolve('./index.html'), 'utf-8');
const requiredSelectors = [
  'id="panel-whatsapp-chat"',
  'id="panel-kitchen-orders"',
  'id="panel-tools-inspector"',
  'id="worker-status-badge"',
  'id="supabase-status-badge"',
  'id="restaurant-select"',
  'id="btn-refresh-sync"',
  'id="btn-open-settings"',
  'id="contact-list-container"',
  'id="btn-add-contact"',
  'id="chat-messages-container"',
  'id="typing-indicator"',
  'id="chat-input"',
  'id="btn-send-message"',
  'id="order-status-badge"',
  'id="order-items-table"',
  'id="order-subtotal"',
  'id="order-total-amount"',
  'id="conversation-mode-badge"',
  'id="customer-notes-markdown"',
  'id="tools-timeline-container"',
  'id="settings-modal"',
  'id="add-contact-modal"',
  'cdn.tailwindcss.com',
  'marked.min.js',
];

for (const sel of requiredSelectors) {
  assert.ok(htmlContent.includes(sel), `index.html must contain ${sel}`);
}
console.log('✅ index.html passed all tests.');

// 4. Test css/custom.css
console.log('Testing css/custom.css...');
const cssContent = fs.readFileSync(path.resolve('./css/custom.css'), 'utf-8');
assert.ok(cssContent.includes('.chat-bubble-user'), 'CSS must include .chat-bubble-user');
assert.ok(cssContent.includes('.chat-bubble-assistant'), 'CSS must include .chat-bubble-assistant');
assert.ok(cssContent.includes('.typing-dot'), 'CSS must include .typing-dot');
assert.ok(cssContent.includes('.pulse-emerald'), 'CSS must include .pulse-emerald');
assert.ok(cssContent.includes('.pulse-amber'), 'CSS must include .pulse-amber');
assert.ok(cssContent.includes('.markdown-content'), 'CSS must include .markdown-content');
console.log('✅ css/custom.css passed all tests.');

console.log('\n🎉 ALL MILESTONE 1 VERIFICATIONS PASSED SUCCESSFULLY!');
