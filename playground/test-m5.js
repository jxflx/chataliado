/**
 * Test Suite for Milestone 5: App Wiring, Documentation, Full Verification & Polish
 * Verifies AppOrchestrator lifecycle, health checks, toast notifications, polling timers,
 * visibility change handling, restaurant switching, and settings persistence.
 */

import { strict as assert } from 'node:assert';
import {
  CONFIG,
  DEFAULT_CONFIG,
  loadCustomConfig,
  saveCustomConfig,
  resetConfig,
} from './config.js';
import { PlaygroundStore } from './js/store.js';
import { ApiClient } from './js/api.js';
import { showToast, AppOrchestrator } from './js/app.js';

console.log('🧪 Starting Milestone 5 Test Suite (App Wiring, Polling, Toasts & Settings)...');

// Helper to create robust mock DOM elements
function createMockElement(id, tagName = 'div') {
  const classListSet = new Set();
  const attributes = new Map();
  const listeners = new Map();
  const children = [];

  let _innerHTML = '';
  const el = {
    id,
    tagName: tagName.toUpperCase(),
    value: '',
    textContent: '',
    get innerHTML() {
      return _innerHTML;
    },
    set innerHTML(htmlStr) {
      _innerHTML = String(htmlStr || '');
      children.length = 0;
      const tagRegex = /<([a-zA-Z0-9]+)([^>]*)>(?:([\s\S]*?)<\/\1>)?/gi;
      let match;
      while ((match = tagRegex.exec(_innerHTML)) !== null) {
        const tag = match[1];
        const attrStr = match[2];
        const inner = match[3] || '';
        const child = createMockElement(`dyn_${Math.random().toString(36).slice(2)}`, tag);
        const classMatch = attrStr.match(/class=["']([^"']*)["']/i);
        if (classMatch) {
          child.className = classMatch[1];
        }
        const idMatch = attrStr.match(/id=["']([^"']*)["']/i);
        if (idMatch) {
          child.id = idMatch[1];
        }
        if (inner.includes('<')) {
          child.innerHTML = inner;
        } else {
          child.textContent = inner;
        }
        children.push(child);
        child.parentElement = el;
      }
    },
    disabled: false,
    parentElement: null,
    children,
    dataset: {},
    classList: {
      add: (...classes) => classes.forEach((c) => classListSet.add(c)),
      remove: (...classes) => classes.forEach((c) => classListSet.delete(c)),
      toggle: (c, force) => {
        if (force === true) classListSet.add(c);
        else if (force === false) classListSet.delete(c);
        else if (classListSet.has(c)) classListSet.delete(c);
        else classListSet.add(c);
      },
      contains: (c) => classListSet.has(c),
    },
    get className() {
      return Array.from(classListSet).join(' ');
    },
    set className(val) {
      classListSet.clear();
      if (val) {
        String(val)
          .trim()
          .split(/\s+/)
          .forEach((c) => {
            if (c) classListSet.add(c);
          });
      }
    },
    setAttribute: (k, v) => attributes.set(k, String(v)),
    getAttribute: (k) => attributes.get(k) || null,
    hasAttribute: (k) => attributes.has(k),
    removeAttribute: (k) => attributes.delete(k),
    addEventListener: (evt, handler) => {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt).add(handler);
    },
    removeEventListener: (evt, handler) => {
      if (listeners.has(evt)) listeners.get(evt).delete(handler);
    },
    dispatchEvent: (evtObj) => {
      const type = evtObj?.type || evtObj;
      if (listeners.has(type)) {
        for (const h of listeners.get(type)) {
          h(evtObj);
        }
      }
    },
    appendChild: (child) => {
      if (child) {
        children.push(child);
        child.parentElement = el;
      }
      return child;
    },
    removeChild: (child) => {
      const idx = children.indexOf(child);
      if (idx >= 0) children.splice(idx, 1);
      child.parentElement = null;
      return child;
    },
    querySelector: (selector) => {
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        return findRecursive(el, (n) => n.classList.contains(cls));
      }
      if (selector.startsWith('#')) {
        const targetId = selector.slice(1);
        return findRecursive(el, (n) => n.id === targetId);
      }
      return null;
    },
    querySelectorAll: (selector) => {
      const results = [];
      findAllRecursive(el, selector, results);
      return results;
    },
    focus: () => {},
    click: function () {
      this.dispatchEvent({ type: 'click', target: this });
    },
  };

  return el;
}

function findRecursive(node, predicate) {
  for (const child of node.children) {
    if (predicate(child)) return child;
    const found = findRecursive(child, predicate);
    if (found) return found;
  }
  return null;
}

function findAllRecursive(node, selector, results) {
  for (const child of node.children) {
    if (selector.startsWith('.') && child.classList.contains(selector.slice(1))) {
      results.push(child);
    } else if (selector.startsWith('#') && child.id === selector.slice(1)) {
      results.push(child);
    }
    findAllRecursive(child, selector, results);
  }
}

// Global DOM Mock Setup
const mockElements = new Map();
function registerElement(id, tagName = 'div') {
  const el = createMockElement(id, tagName);
  mockElements.set(id, el);
  return el;
}

const workerStatusDot = registerElement('worker-status-dot', 'span');
const workerStatusText = registerElement('worker-status-text', 'span');
const workerStatusBadge = registerElement('worker-status-badge', 'div');

const supabaseStatusDot = registerElement('supabase-status-dot', 'span');
const supabaseStatusText = registerElement('supabase-status-text', 'span');
const supabaseStatusBadge = registerElement('supabase-status-badge', 'div');

const restaurantSelect = registerElement('restaurant-select', 'select');
const btnRefreshSync = registerElement('btn-refresh-sync', 'button');
const syncSpinnerIcon = registerElement('sync-spinner-icon', 'svg');
const syncButtonText = registerElement('sync-button-text', 'span');

const btnOpenSettings = registerElement('btn-open-settings', 'button');
const btnCloseSettings = registerElement('btn-close-settings', 'button');
const btnCancelSettings = registerElement('btn-cancel-settings', 'button');
const settingsModal = registerElement('settings-modal', 'div');
settingsModal.classList.add('hidden');

const settingsForm = registerElement('settings-form', 'form');
const settingWorkerUrl = registerElement('setting-worker-url', 'input');
const settingWorkerKey = registerElement('setting-worker-key', 'input');
const settingSupabaseUrl = registerElement('setting-supabase-url', 'input');
const settingSupabaseKey = registerElement('setting-supabase-key', 'input');
const settingRestaurantSlug = registerElement('setting-restaurant-slug', 'input');
const settingPollInterval = registerElement('setting-poll-interval', 'input');
const btnResetSettings = registerElement('btn-reset-settings', 'button');
const btnSaveSettings = registerElement('btn-save-settings', 'button');

const toastContainer = registerElement('toast-container', 'div');

const docListeners = new Map();
const mockBody = createMockElement('body', 'body');
mockBody.appendChild(toastContainer);

globalThis.document = {
  hidden: false,
  body: mockBody,
  getElementById: (id) => mockElements.get(id) || null,
  querySelector: (sel) => {
    if (sel.startsWith('#')) return mockElements.get(sel.slice(1)) || null;
    return null;
  },
  querySelectorAll: () => [],
  createElement: (tagName) => createMockElement(`elem_${Math.random().toString(36).slice(2)}`, tagName),
  addEventListener: (evt, handler) => {
    if (!docListeners.has(evt)) docListeners.set(evt, new Set());
    docListeners.get(evt).add(handler);
  },
  removeEventListener: (evt, handler) => {
    if (docListeners.has(evt)) docListeners.get(evt).delete(handler);
  },
  dispatchEvent: (evtObj) => {
    const type = evtObj?.type || evtObj;
    if (docListeners.has(type)) {
      for (const h of docListeners.get(type)) {
        h(evtObj);
      }
    }
  },
};

globalThis.window = {
  document: globalThis.document,
  localStorage: {
    _map: new Map(),
    getItem(k) {
      return this._map.get(k) || null;
    },
    setItem(k, v) {
      this._map.set(k, String(v));
    },
    removeItem(k) {
      this._map.delete(k);
    },
    clear() {
      this._map.clear();
    },
  },
};

globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// =========================================================================
// SUITE 1: Toast Notification System
// =========================================================================
console.log('\n--- [Suite 1] Toast Notification System ---');

const toastInfo = showToast('Operación informativa', 'info', 0);
assert.ok(toastInfo, 'showToast should return HTMLElement');
assert.ok(toastInfo.innerHTML.includes('Operación informativa'), 'Toast must contain message');
assert.ok(toastInfo.className.includes('bg-slate-900'), 'Info toast should use slate color');

const toastSuccess = showToast('Guardado correctamente', 'success', 0);
assert.ok(toastSuccess.innerHTML.includes('Guardado correctamente'));
assert.ok(toastSuccess.className.includes('bg-emerald-950'), 'Success toast must have emerald background');

const toastError = showToast('Error en webhook', 'error', 0);
assert.ok(toastError.innerHTML.includes('Error en webhook'));
assert.ok(toastError.className.includes('bg-rose-950'), 'Error toast must have rose background');

const toastWarning = showToast('Valores restablecidos', 'warning', 0);
assert.ok(toastWarning.innerHTML.includes('Valores restablecidos'));
assert.ok(toastWarning.className.includes('bg-amber-950'), 'Warning toast must have amber background');

// Test manual dismissal
const dismissBtn = toastSuccess.querySelector('.btn-dismiss-toast');
assert.ok(dismissBtn, 'Toast should have dismiss button');
dismissBtn.click();

console.log('✅ Suite 1 passed: Toast notification system renders all types with dismissibility.');

// =========================================================================
// SUITE 2: Health Check Transitions & Header Badges
// =========================================================================
console.log('\n--- [Suite 2] Health Check Transitions & Header Badges ---');

const testStore = new PlaygroundStore();
const testApiClient = new ApiClient(CONFIG);

// Mock ApiClient health checks
testApiClient.checkWorkerHealth = async () => ({ ok: true, status: 200, data: { status: 'healthy' } });
testApiClient.checkSupabaseHealth = async () => ({ ok: true, status: 200 });
testApiClient.fetchRestaurants = async () => [
  { id: 'a0000000-0000-0000-0000-000000000001', slug: 'don-giovanni', name: 'Pizzería Don Giovanni' },
  { id: 'b0000000-0000-0000-0000-000000000002', slug: 'tacos-el-pastor', name: 'Tacos El Pastor' },
];
testApiClient.syncAll = async () => ({
  customer: { id: 'c1', name: 'Carlos', phone: '5215512345678', notes_md: '# Notas\n- Sin picante' },
  conversation: { id: 'conv1', mode: 'ai', status: 'open' },
  messages: [{ id: 'm1', role: 'user', content: 'Hola' }],
  order: { id: 'ord1', status: 'draft', subtotal: 180, total_amount: 180, order_items: [] },
});

const mockChatUI = { init: () => {}, renderAll: () => {} };
const mockKitchenUI = { init: () => {}, render: () => {} };
const mockDebuggerUI = { init: () => {}, render: () => {} };

const testApp = new AppOrchestrator({
  config: CONFIG,
  store: testStore,
  apiClient: testApiClient,
  chatUI: mockChatUI,
  kitchenUI: mockKitchenUI,
  debuggerUI: mockDebuggerUI,
});

// Test Worker Status Badge Online
testApp.updateWorkerStatusBadge(true, 200);
assert.ok(workerStatusDot.classList.contains('bg-emerald-400'), 'Worker dot should be emerald when online');
assert.equal(workerStatusText.textContent, 'Online (200)');

// Test Worker Status Badge Offline
testApp.updateWorkerStatusBadge(false, 0);
assert.ok(workerStatusDot.classList.contains('bg-rose-500'), 'Worker dot should be rose when offline');
assert.equal(workerStatusText.textContent, 'Offline');

// Test Supabase Status Badge Connected
testApp.updateSupabaseStatusBadge(true, 200);
assert.ok(supabaseStatusDot.classList.contains('bg-emerald-400'), 'Supabase dot should be emerald when connected');
assert.equal(supabaseStatusText.textContent, 'Connected');

// Test Supabase Status Badge Disconnected
testApp.updateSupabaseStatusBadge(false, 0);
assert.ok(supabaseStatusDot.classList.contains('bg-rose-500'), 'Supabase dot should be rose when disconnected');
assert.equal(supabaseStatusText.textContent, 'Disconnected');

// Test checkHealth integration
await testApp.checkHealth();
assert.equal(testStore.getState().workerOnline, true, 'Store workerOnline must be true');
assert.equal(testStore.getState().supabaseOnline, true, 'Store supabaseOnline must be true');

console.log('✅ Suite 2 passed: Health checks and header status pills update accurately.');

// =========================================================================
// SUITE 3: Restaurant Selector & Multi-Tenancy Switching
// =========================================================================
console.log('\n--- [Suite 3] Restaurant Selector & Multi-Tenancy Switching ---');

await testApp.populateRestaurants();
assert.equal(testApp.restaurantsList.length, 2, 'Should populate 2 restaurants');
assert.ok(restaurantSelect.innerHTML.includes('don-giovanni'), 'Select HTML must include don-giovanni');
assert.ok(restaurantSelect.innerHTML.includes('tacos-el-pastor'), 'Select HTML must include tacos-el-pastor');

// Simulate switching to tacos-el-pastor
await testApp._handleRestaurantSelectChange({ target: { value: 'tacos-el-pastor' } });
assert.equal(testStore.getState().restaurant.slug, 'tacos-el-pastor', 'Store restaurant slug must update');
assert.equal(testStore.getState().restaurant.name, 'Tacos El Pastor', 'Store restaurant name must update');

// Switch back to don-giovanni
await testApp._handleRestaurantSelectChange({ target: { value: 'don-giovanni' } });
assert.equal(testStore.getState().restaurant.slug, 'don-giovanni');

console.log('✅ Suite 3 passed: Multi-tenant restaurant switching updates state and triggers sync.');

// =========================================================================
// SUITE 4: Background Polling & Visibility Changes
// =========================================================================
console.log('\n--- [Suite 4] Background Polling & Visibility Changes ---');

testApp.startPolling();
assert.ok(testApp.pollTimer !== null, 'Polling timer should be active');

testApp.stopPolling();
assert.equal(testApp.pollTimer, null, 'Polling timer should be cleared');

testApp.restartPolling();
assert.ok(testApp.pollTimer !== null, 'Polling timer should be restarted');

// Test tab visibility hidden
document.hidden = true;
testApp._handleVisibilityChange();
assert.equal(testApp.isTabHidden, true);
assert.equal(testApp.pollTimer, null, 'Polling must pause when tab is hidden');

// Test tab visibility visible
document.hidden = false;
testApp._handleVisibilityChange();
assert.equal(testApp.isTabHidden, false);
assert.ok(testApp.pollTimer !== null, 'Polling must resume when tab is visible');

testApp.stopPolling();

console.log('✅ Suite 4 passed: Polling timers and tab visibility transitions verified.');

// =========================================================================
// SUITE 5: Settings Modal & Configuration Persistence
// =========================================================================
console.log('\n--- [Suite 5] Settings Modal & Configuration Persistence ---');

// Open settings modal
testApp.openSettingsModal();
assert.equal(settingsModal.classList.contains('hidden'), false, 'Modal must not be hidden when opened');
assert.equal(settingWorkerUrl.value, CONFIG.WORKER_URL);
assert.equal(settingWorkerKey.value, CONFIG.WORKER_API_KEY);
assert.equal(settingSupabaseUrl.value, CONFIG.SUPABASE_URL);

// Close settings modal
testApp.closeSettingsModal();
assert.equal(settingsModal.classList.contains('hidden'), true, 'Modal must be hidden when closed');

// Save custom settings
settingWorkerUrl.value = 'http://localhost:9000/webhook/evolution';
settingPollInterval.value = '4500';
await testApp._handleSettingsSubmit({ preventDefault: () => {} });

assert.equal(CONFIG.WORKER_URL, 'http://localhost:9000/webhook/evolution');
assert.equal(CONFIG.POLL_INTERVAL_MS, 4500);

// Reset settings
await testApp._handleSettingsReset();
assert.equal(CONFIG.WORKER_URL, DEFAULT_CONFIG.WORKER_URL);
assert.equal(CONFIG.POLL_INTERVAL_MS, DEFAULT_CONFIG.POLL_INTERVAL_MS);

testApp.stopPolling();

console.log('✅ Suite 5 passed: Settings modal lifecycle and config persistence verified.');

// =========================================================================
// SUITE 6: Manual Sync Button & Full App Lifecycle
// =========================================================================
console.log('\n--- [Suite 6] Manual Sync Button & Full App Lifecycle ---');

// Trigger manual sync
let syncCalled = false;
const origSync = testApp.syncActiveClient.bind(testApp);
testApp.syncActiveClient = async (feedback) => {
  syncCalled = true;
  return origSync(feedback);
};

await testApp._handleManualSyncClick();
assert.equal(syncCalled, true, 'syncActiveClient must be called on manual sync click');
assert.equal(syncSpinnerIcon.classList.contains('animate-spin'), false, 'Spinner must stop after sync');
assert.equal(btnRefreshSync.disabled, false, 'Sync button must be re-enabled');

// Full init & destroy lifecycle
const freshApp = new AppOrchestrator({
  config: CONFIG,
  store: new PlaygroundStore(),
  apiClient: testApiClient,
  chatUI: mockChatUI,
  kitchenUI: mockKitchenUI,
  debuggerUI: mockDebuggerUI,
});

await freshApp.init();
assert.equal(freshApp.isInitialized, true, 'App must be initialized');
assert.ok(freshApp.pollTimer !== null, 'Polling timer must be active');

freshApp.destroy();
assert.equal(freshApp.isInitialized, false, 'App must be destroyed');
assert.equal(freshApp.pollTimer, null, 'Polling timer must be cleared');

console.log('✅ Suite 6 passed: Manual sync and full application lifecycle verified.');

console.log('\n🎉 =========================================================================');
console.log('🎉 ALL MILESTONE 5 UNIT & INTEGRATION TESTS PASSED SUCCESSFULLY (100%)!');
console.log('🎉 =========================================================================\n');
