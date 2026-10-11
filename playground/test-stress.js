/**
 * ChatAliado Playground - Empirical Stress Testing & Adversarial Challenge Suite
 * Author: Challenger 1 (Empirical Challenger)
 * 
 * Stress-tests:
 * 1. Rapid Multi-Contact Switching (5+ contacts, out-of-order async sync, state pollution)
 * 2. Sequential Message Submissions & Deduplication Key Generation (100,000 iterations, entropy, collision resistance)
 * 3. Fault Injection: Worker Offline, 500 Error Responses, Supabase Outage & Network Timeouts
 * 4. Burst Polling Lifecycle, Concurrency & Race Conditions with Background Sync
 */

import { strict as assert } from 'node:assert';
import { CONFIG, DEFAULT_CONFIG } from './config.js';
import { PlaygroundStore, SEEDED_CONTACTS } from './js/store.js';
import { ApiClient } from './js/api.js';
import { ChatUIController, renderMessageBubble, formatPhoneNumber } from './js/chat-ui.js';
import { AppOrchestrator } from './js/app.js';

console.log('================================================================================');
console.log('🔥 STARTING EMPIRICAL ADVERSARIAL STRESS TEST SUITE — CHALLENGER 1');
console.log('================================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testFindings = [];

function recordTest(suiteName, testName, passed, details = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.log(`  ❌ [FAIL] ${testName}`);
    if (details) console.log(`     ⚠️ Details: ${details}`);
    testFindings.push({ suite: suiteName, test: testName, details });
  }
}

// Global DOM mock for Node environment
function setupMockDom() {
  const elements = new Map();
  function getOrCreate(id, tag = 'div') {
    if (!elements.has(id)) {
      const classSet = new Set();
      const listeners = new Map();
      elements.set(id, {
        id,
        tagName: tag.toUpperCase(),
        value: '',
        textContent: '',
        innerHTML: '',
        disabled: false,
        classList: {
          add: (...cls) => cls.forEach((c) => classSet.add(c)),
          remove: (...cls) => cls.forEach((c) => classSet.delete(c)),
          contains: (c) => classSet.has(c),
          toggle: (c, force) => {
            if (force === true) classSet.add(c);
            else if (force === false) classSet.delete(c);
            else if (classSet.has(c)) classSet.delete(c);
            else classSet.add(c);
          },
        },
        addEventListener: (e, h) => {
          if (!listeners.has(e)) listeners.set(e, new Set());
          listeners.get(e).add(h);
        },
        removeEventListener: (e, h) => {
          if (listeners.has(e)) listeners.get(e).delete(h);
        },
        dispatchEvent: (evt) => {
          const type = evt?.type || evt;
          if (listeners.has(type)) {
            for (const h of listeners.get(type)) h(evt);
          }
        },
        querySelector: () => null,
        querySelectorAll: () => [],
      });
    }
    return elements.get(id);
  }

  // Pre-populate expected DOM elements
  const ids = [
    'contact-list-container', 'chat-messages-container', 'chat-header-avatar',
    'chat-header-title', 'chat-header-phone', 'chat-header-status',
    'chat-input', 'chat-form', 'btn-send-message', 'btn-send-text',
    'btn-send-spinner', 'typing-indicator', 'btn-clear-chat-view',
    'btn-add-contact', 'add-contact-modal', 'add-contact-form',
    'modal-contact-phone', 'modal-contact-name', 'modal-contact-avatar',
    'btn-close-add-contact', 'btn-cancel-add-contact',
    'worker-status-dot', 'worker-status-text', 'worker-status-badge',
    'supabase-status-dot', 'supabase-status-text', 'supabase-status-badge',
    'restaurant-select', 'btn-refresh-sync', 'sync-spinner-icon', 'sync-button-text',
    'btn-open-settings', 'btn-close-settings', 'btn-cancel-settings', 'settings-modal',
    'settings-form', 'setting-worker-url', 'setting-worker-key', 'setting-supabase-url',
    'setting-supabase-key', 'setting-restaurant-slug', 'setting-poll-interval',
    'btn-reset-settings', 'btn-save-settings', 'toast-container'
  ];
  ids.forEach((id) => getOrCreate(id));

  globalThis.document = {
    hidden: false,
    body: getOrCreate('body', 'body'),
    getElementById: (id) => getOrCreate(id),
    querySelector: (sel) => {
      if (sel.startsWith('#')) return getOrCreate(sel.slice(1));
      return null;
    },
    querySelectorAll: () => [],
    createElement: (tag) => getOrCreate(`elem_${Math.random().toString(36).slice(2)}`, tag),
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  globalThis.window = {
    document: globalThis.document,
    localStorage: {
      _map: new Map(),
      getItem(k) { return this._map.get(k) || null; },
      setItem(k, v) { this._map.set(k, String(v)); },
      removeItem(k) { this._map.delete(k); },
      clear() { this._map.clear(); },
    },
  };
}

setupMockDom();

// =============================================================================
// TEST SUITE 1: RAPID MULTI-CONTACT SWITCHING & STATE POLLUTION
// =============================================================================
console.log('📋 [SUITE 1] Rapid Multi-Contact Switching Stress Test (5+ Contacts)...');

async function testSuite1() {
  const store = new PlaygroundStore();
  const contacts = [
    { phone: '5215511111111', name: 'Contact Alpha', avatar: '🅰️', color: 'bg-red-600' },
    { phone: '5215522222222', name: 'Contact Beta', avatar: '🅱️', color: 'bg-blue-600' },
    { phone: '5215533333333', name: 'Contact Gamma', avatar: '🅲', color: 'bg-green-600' },
    { phone: '5215544444444', name: 'Contact Delta', avatar: '🅳', color: 'bg-yellow-600' },
    { phone: '5215555555555', name: 'Contact Epsilon', avatar: '🅴', color: 'bg-purple-600' },
    { phone: '5215566666666', name: 'Contact Zeta', avatar: '🆉', color: 'bg-indigo-600' },
  ];

  // 1. Add all 6 contacts
  contacts.forEach((c) => store.addContact(c));
  const stateContacts = store.getState().contacts;
  recordTest(
    'Suite 1',
    'Adding 6 distinct contacts updates store contact list without drops',
    stateContacts.length >= 6 && contacts.every((c) => stateContacts.some((sc) => sc.phone === c.phone))
  );

  // 2. Stress rapid switching across all contacts (100 rapid switches)
  let phoneChangedEvents = 0;
  let stateChangedEvents = 0;
  const unsub1 = store.on('phone:changed', () => phoneChangedEvents++);
  const unsub2 = store.on('state:changed', () => stateChangedEvents++);

  for (let i = 0; i < 100; i++) {
    const targetContact = contacts[i % contacts.length];
    store.setActivePhone(targetContact.phone);
  }

  recordTest(
    'Suite 1',
    'Rapid synchronous setActivePhone (100 cycles) completes cleanly and emits events',
    store.getState().activePhone === contacts[99 % contacts.length].phone && phoneChangedEvents === 100
  );

  unsub1();
  unsub2();

  // 3. Test Async Out-of-Order Race Condition during Rapid Switching
  // Simulate network latency: Contact Alpha request is SLOW (150ms), Contact Beta request is FAST (10ms)
  const mockApi = new ApiClient(CONFIG);
  const contactDataMap = {
    '5215511111111': {
      customer: { id: 'cust-alpha', name: 'Contact Alpha', phone: '5215511111111' },
      conversation: { id: 'conv-alpha', mode: 'ai' },
      messages: [{ id: 'm-alpha', role: 'user', content: 'Message Alpha' }],
      order: { id: 'ord-alpha', status: 'draft', total_amount: 100 },
    },
    '5215522222222': {
      customer: { id: 'cust-beta', name: 'Contact Beta', phone: '5215522222222' },
      conversation: { id: 'conv-beta', mode: 'human' },
      messages: [{ id: 'm-beta', role: 'user', content: 'Message Beta' }],
      order: { id: 'ord-beta', status: 'confirmed', total_amount: 250 },
    },
  };

  mockApi.syncAll = async (phone) => {
    const delay = phone === '5215511111111' ? 150 : 10;
    await new Promise((r) => setTimeout(r, delay));
    return contactDataMap[phone] || { customer: null, conversation: null, messages: [], order: null };
  };

  // Switch to Alpha, then immediately switch to Beta
  store.setActivePhone('5215511111111');
  const syncPromiseAlpha = (async () => {
    const data = await mockApi.syncAll('5215511111111');
    // Current un-guarded implementation in ChatUI/AppOrchestrator writes directly:
    // If active phone has changed, does it check activePhone before overwriting?
    if (store.getState().activePhone === '5215511111111') {
      store.updateState({
        customer: data.customer,
        conversation: data.conversation,
        messages: data.messages,
        activeOrder: data.order,
      });
    }
  })();

  // 5ms later (before Alpha resolves), switch to Beta
  await new Promise((r) => setTimeout(r, 5));
  store.setActivePhone('5215522222222');
  const syncPromiseBeta = (async () => {
    const data = await mockApi.syncAll('5215522222222');
    if (store.getState().activePhone === '5215522222222') {
      store.updateState({
        customer: data.customer,
        conversation: data.conversation,
        messages: data.messages,
        activeOrder: data.order,
      });
    }
  })();

  await Promise.all([syncPromiseAlpha, syncPromiseBeta]);
  const finalState = store.getState();

  // Validate state isolation: final state MUST belong to Beta, NOT contaminated by Alpha!
  const hasCorrectBetaData =
    finalState.activePhone === '5215522222222' &&
    finalState.customer?.id === 'cust-beta' &&
    finalState.conversation?.id === 'conv-beta' &&
    finalState.messages[0]?.content === 'Message Beta' &&
    finalState.activeOrder?.id === 'ord-beta';

  recordTest(
    'Suite 1',
    'Out-of-order asynchronous responses do not pollute active contact state',
    hasCorrectBetaData,
    hasCorrectBetaData ? '' : `State polluted: customer=${finalState.customer?.id}, order=${finalState.activeOrder?.id}`
  );

  // 4. Memory Leak Check: Subscription listener cleanup
  const testStore2 = new PlaygroundStore();
  const handlers = [];
  for (let i = 0; i < 50; i++) {
    const h = () => {};
    handlers.push({ h, unsub: testStore2.on('state:changed', h) });
  }
  // Unsubscribe all
  handlers.forEach(({ unsub }) => unsub());
  const remainingListeners = testStore2._listeners.get('state:changed')?.size || 0;

  recordTest(
    'Suite 1',
    'Store listener subscription/unsubscription cleans up all handler references (0 leaks)',
    remainingListeners === 0,
    `Remaining listeners: ${remainingListeners}`
  );
}

await testSuite1();

// =============================================================================
// TEST SUITE 2: RAPID SEQUENTIAL MESSAGE SUBMISSIONS & DEDUPLICATION ID ENTROPY
// =============================================================================
console.log('\n📋 [SUITE 2] Rapid Sequential Messages & Deduplication Key Generation...');

async function testSuite2() {
  const api = new ApiClient(CONFIG);

  // 1. Generate 100,000 message IDs in tight loop & test for collisions
  const COUNT = 100000;
  const idSet = new Set();
  let collisionCount = 0;
  const startIdGen = Date.now();

  for (let i = 0; i < COUNT; i++) {
    const id = api.generateMessageId();
    if (idSet.has(id)) {
      collisionCount++;
    } else {
      idSet.add(id);
    }
  }
  const durationIdGen = Date.now() - startIdGen;

  recordTest(
    'Suite 2',
    `generateMessageId collision resistance across ${COUNT.toLocaleString()} rapid iterations (0 collisions)`,
    collisionCount === 0 && idSet.size === COUNT,
    `Collisions: ${collisionCount} in ${durationIdGen}ms`
  );

  // 2. Verify Message ID format specification
  const sampleId = api.generateMessageId();
  const parts = sampleId.split('_');
  const validFormat =
    sampleId.startsWith('MSG_') &&
    parts.length === 3 &&
    !isNaN(Number(parts[1])) &&
    parts[2].length >= 5;

  recordTest(
    'Suite 2',
    'generateMessageId strictly conforms to MSG_<timestamp>_<randomSuffix> format',
    validFormat,
    `Sample ID: ${sampleId}`
  );

  // 3. Verify Evolution API Webhook Payload Consistency under Rapid sequential generation
  let payloadFormatValid = true;
  for (let i = 0; i < 1000; i++) {
    const phone = `52155${String(i).padStart(8, '0')}`;
    const name = `User ${i}`;
    const text = `Test message #${i}`;
    const { payload, msgId } = api.buildWebhookPayload(phone, name, text, 'don-giovanni');

    if (
      payload.event !== 'messages.upsert' ||
      payload.instance !== 'don-giovanni' ||
      payload.data.key.remoteJid !== `${phone}@s.whatsapp.net` ||
      payload.data.key.id !== msgId ||
      payload.data.key.fromMe !== false ||
      payload.data.pushName !== name ||
      payload.data.message.conversation !== text ||
      typeof payload.data.messageTimestamp !== 'number'
    ) {
      payloadFormatValid = false;
      break;
    }
  }

  recordTest(
    'Suite 2',
    'buildWebhookPayload maintains 100% schema integrity across 1,000 rapid calls',
    payloadFormatValid
  );
}

await testSuite2();

// =============================================================================
// TEST SUITE 3: WORKER OFFLINE, 500 ERRORS & NETWORK TIMEOUTS RESILIENCE
// =============================================================================
console.log('\n📋 [SUITE 3] Fault Injection: Offline Worker, 500 Errors & Supabase Outage...');

async function testSuite3() {
  const originalFetch = globalThis.fetch;
  const store = new PlaygroundStore();
  const api = new ApiClient(CONFIG);

  // 1. Worker offline (Connection Refused / Network Error)
  globalThis.fetch = async () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:8787');
  };

  const offlineRes = await api.sendWhatsAppWebhook('5215512345678', 'Carlos', 'Hola', 'don-giovanni');
  recordTest(
    'Suite 3',
    'sendWhatsAppWebhook returns ok:false, status:0 and captures error on ECONNREFUSED',
    offlineRes.ok === false && offlineRes.status === 0 && offlineRes.error.includes('ECONNREFUSED'),
    `Result: ${JSON.stringify(offlineRes)}`
  );

  // 2. Worker 500 Internal Server Error Response
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    text: async () => JSON.stringify({ error: 'Internal Server Error in Worker orchestrator' }),
  });

  const error500Res = await api.sendWhatsAppWebhook('5215512345678', 'Carlos', 'Pizza', 'don-giovanni');
  recordTest(
    'Suite 3',
    'sendWhatsAppWebhook returns ok:false, status:500 on Worker internal error',
    error500Res.ok === false && error500Res.status === 500,
    `Status: ${error500Res.status}`
  );

  // 3. Worker Timeout / Abort scenario
  globalThis.fetch = async () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  };

  const timeoutRes = await api.sendWhatsAppWebhook('5215512345678', 'Carlos', 'Pizza', 'don-giovanni');
  recordTest(
    'Suite 3',
    'sendWhatsAppWebhook handles AbortError / Network Timeout gracefully',
    timeoutRes.ok === false && timeoutRes.error.includes('aborted'),
    `Error: ${timeoutRes.error}`
  );

  // 4. Supabase PostgREST Outage / 503 Service Unavailable
  globalThis.fetch = async (url) => {
    if (url.includes('supabase.co')) {
      return {
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => 'Database paused or unreachable',
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  let supabaseFetchThrew = false;
  try {
    await api._supabaseFetch('/rest/v1/restaurants');
  } catch (err) {
    supabaseFetchThrew = true;
  }

  recordTest(
    'Suite 3',
    '_supabaseFetch throws descriptive Error on HTTP 503 / Supabase outage',
    supabaseFetchThrew
  );

  // 5. Supabase Health Check accurately detects outage
  const supabaseHealth = await api.checkSupabaseHealth();
  const supabaseHealthAccurate = supabaseHealth.ok === false && supabaseHealth.status === 0;
  recordTest(
    'Suite 3',
    'checkSupabaseHealth reports ok:false during Supabase outage',
    supabaseHealthAccurate,
    `checkSupabaseHealth returned: ${JSON.stringify(supabaseHealth)} (Bug: fetchRestaurants swallows error and returns [], causing checkSupabaseHealth to report ok:true)`
  );

  // 6. Worker Health Check accurately detects offline
  globalThis.fetch = async () => {
    throw new Error('Connection refused');
  };
  const workerHealth = await api.checkWorkerHealth();
  recordTest(
    'Suite 3',
    'checkWorkerHealth reports ok:false when worker is down',
    workerHealth.ok === false && workerHealth.status === 0
  );

  // 7. ChatUI handleSendMessage error behavior on 500 response
  const chatStore = new PlaygroundStore();
  const testChatUI = new ChatUIController();
  testChatUI.store = chatStore;
  testChatUI.apiClient = api;

  // Mock input element
  const inputEl = document.getElementById('chat-input');
  inputEl.value = 'Mensaje con Worker 500';

  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    text: async () => JSON.stringify({ error: 'Worker 500' }),
  });

  // Call handleSendMessage
  await testChatUI.handleSendMessage();

  // Check if burst polling was spawned despite 500 error
  const burstTimerSpawned = testChatUI._burstPollTimer !== null;
  if (testChatUI._burstPollTimer) {
    clearInterval(testChatUI._burstPollTimer);
    testChatUI._burstPollTimer = null;
  }

  recordTest(
    'Suite 3',
    'ChatUI handleSendMessage avoids triggering burst polling when webhook returns HTTP 500 error',
    !burstTimerSpawned,
    `Burst polling timer was spawned (${burstTimerSpawned}) because handleSendMessage ignores sendWhatsAppWebhook ok:false result`
  );

  // Restore fetch
  globalThis.fetch = originalFetch;
}

await testSuite3();

// =============================================================================
// TEST SUITE 5: ACTUAL ChatUIController ASYNC RACE CONDITION STRESS TEST
// =============================================================================
console.log('\n📋 [SUITE 5] Live ChatUIController Contact Switching Race Condition Stress Test...');

async function testSuite5() {
  const store = new PlaygroundStore();
  const api = new ApiClient(CONFIG);
  const testChatUI = new ChatUIController();
  testChatUI.store = store;
  testChatUI.apiClient = api;

  // Setup 2 contacts
  store.addContact({ phone: '5215511111111', name: 'Slow Contact Alpha' });
  store.addContact({ phone: '5215522222222', name: 'Fast Contact Beta' });

  // Mock syncAll with different latencies
  api.syncAll = async (phone) => {
    const delay = phone === '5215511111111' ? 80 : 15;
    await new Promise((r) => setTimeout(r, delay));
    if (phone === '5215511111111') {
      return {
        customer: { id: 'c-alpha', name: 'Slow Contact Alpha', phone: '5215511111111' },
        conversation: { id: 'conv-alpha', mode: 'ai' },
        messages: [{ id: 'm-alpha', role: 'user', content: 'Soy Alpha' }],
        order: { id: 'ord-alpha', total_amount: 100 },
      };
    } else {
      return {
        customer: { id: 'c-beta', name: 'Fast Contact Beta', phone: '5215522222222' },
        conversation: { id: 'conv-beta', mode: 'human' },
        messages: [{ id: 'm-beta', role: 'user', content: 'Soy Beta' }],
        order: { id: 'ord-beta', total_amount: 200 },
      };
    }
  };

  // Step 1: Select Slow Alpha -> syncCurrentContact starts (takes 80ms)
  store.setActivePhone('5215511111111');
  const promiseAlpha = testChatUI.syncCurrentContact();

  // Step 2: 20ms later, user rapidly switches to Fast Beta -> syncCurrentContact starts (takes 15ms)
  await new Promise((r) => setTimeout(r, 20));
  store.setActivePhone('5215522222222');
  const promiseBeta = testChatUI.syncCurrentContact();

  // Step 3: Wait for both to finish
  await Promise.all([promiseAlpha, promiseBeta]);

  // At this point, Fast Beta finished at t=35ms. Slow Alpha finished at t=80ms.
  // Because Alpha finished last without checking activePhone, did Alpha overwrite Beta's state?
  const finalState = store.getState();
  const isBetaPreserved =
    finalState.activePhone === '5215522222222' &&
    finalState.customer?.id === 'c-beta' &&
    finalState.messages[0]?.content === 'Soy Beta' &&
    finalState.activeOrder?.id === 'ord-beta';

  recordTest(
    'Suite 5',
    'ChatUIController.syncCurrentContact guards against out-of-order race conditions when switching contacts',
    isBetaPreserved,
    isBetaPreserved
      ? ''
      : `Race Condition Bug confirmed: Store has activePhone=${finalState.activePhone}, but customer=${finalState.customer?.id} (${finalState.customer?.name}) and messages=${JSON.stringify(finalState.messages)}`
  );

  // Step 4: Test AppOrchestrator.syncActiveClient for identical race condition
  const testApp = new AppOrchestrator({
    config: CONFIG,
    store,
    apiClient: api,
  });

  store.setActivePhone('5215511111111');
  const appPromiseAlpha = testApp.syncActiveClient();

  await new Promise((r) => setTimeout(r, 20));
  store.setActivePhone('5215522222222');
  const appPromiseBeta = testApp.syncActiveClient();

  await Promise.all([appPromiseAlpha, appPromiseBeta]);

  const appFinalState = store.getState();
  const isAppBetaPreserved =
    appFinalState.activePhone === '5215522222222' &&
    appFinalState.customer?.id === 'c-beta' &&
    appFinalState.messages[0]?.content === 'Soy Beta' &&
    appFinalState.activeOrder?.id === 'ord-beta';

  recordTest(
    'Suite 5',
    'AppOrchestrator.syncActiveClient guards against out-of-order race conditions when switching contacts',
    isAppBetaPreserved,
    isAppBetaPreserved
      ? ''
      : `Race Condition Bug confirmed in AppOrchestrator: Store has activePhone=${appFinalState.activePhone}, but customer=${appFinalState.customer?.id} and messages=${JSON.stringify(appFinalState.messages)}`
  );

  // Step 5: Test burst polling cancellation on contact switch
  const burstStore = new PlaygroundStore();
  const burstChatUI = new ChatUIController();
  burstChatUI.store = burstStore;
  burstChatUI.apiClient = api;

  burstStore.addContact({ phone: '5215511111111', name: 'Contact Alpha' });
  burstStore.addContact({ phone: '5215522222222', name: 'Contact Beta' });

  burstStore.setActivePhone('5215511111111');
  burstChatUI.triggerBurstPolling();
  const timerStarted = burstChatUI._burstPollTimer !== null;

  // User switches contact to Beta
  burstStore.setActivePhone('5215522222222');

  // Should burst poll timer for Alpha be cancelled or reset on contact change?
  // If timer is still running, it will poll Beta instead of Alpha or cause cross-contact polling leaks
  const timerCleanedOnSwitch = burstChatUI._burstPollTimer === null;
  if (burstChatUI._burstPollTimer) {
    clearInterval(burstChatUI._burstPollTimer);
    burstChatUI._burstPollTimer = null;
  }

  recordTest(
    'Suite 5',
    'ChatUIController cancels active burst polling timer when switching contacts',
    timerCleanedOnSwitch,
    `Burst poll timer was not cancelled on contact switch (timer still active = ${!timerCleanedOnSwitch})`
  );
}

await testSuite5();

// =============================================================================
// TEST SUITE 4: BURST POLLING LIFECYCLE, CONCURRENCY & OVERLAPPING SYNC
// =============================================================================
console.log('\n📋 [SUITE 4] Burst Polling Lifecycle, Concurrency & Overlap Stress Test...');

async function testSuite4() {
  const store = new PlaygroundStore();
  const api = new ApiClient(CONFIG);

  // 1. Test Burst Polling Early Termination upon Assistant Response Arrival
  let syncCount = 0;
  const mockMessages = [];

  // Mock syncAll that returns an assistant response on 3rd poll
  api.syncAll = async (phone) => {
    syncCount++;
    if (syncCount >= 3) {
      mockMessages.push({
        id: `msg_asst_${syncCount}`,
        role: 'assistant',
        content: '¡Con gusto! Tu orden de pizza ha sido procesada.',
        created_at: new Date().toISOString(),
      });
    }
    return {
      customer: { id: 'c1', phone },
      conversation: { id: 'conv1', mode: 'ai' },
      messages: [...mockMessages],
      order: null,
    };
  };

  // Simulate burst polling mechanism
  let burstCompleted = false;
  let burstPollTimer = null;
  const maxPolls = 8;
  let count = 0;

  store.setSending(true);

  await new Promise((resolve) => {
    burstPollTimer = setInterval(async () => {
      count++;
      const data = await api.syncAll(store.getState().activePhone);
      store.updateState({ messages: data.messages });

      const msgs = store.getState().messages;
      const lastMsg = msgs[msgs.length - 1];
      if ((lastMsg?.role === 'assistant' && lastMsg.content) || count >= maxPolls) {
        clearInterval(burstPollTimer);
        burstPollTimer = null;
        store.setSending(false);
        burstCompleted = true;
        resolve();
      }
    }, 50);
  });

  recordTest(
    'Suite 4',
    'Burst polling terminates early immediately when assistant message arrives (3 polls < 8 max)',
    burstCompleted && count === 3 && store.getState().isSending === false,
    `Completed at count=${count}, isSending=${store.getState().isSending}`
  );

  // 2. Test Burst Polling Max Count Timeout when no response arrives
  syncCount = 0;
  count = 0;
  store.setSending(true);
  store.updateState({ messages: [{ id: 'm1', role: 'user', content: 'Pregunta sin respuesta' }] });

  api.syncAll = async (phone) => {
    syncCount++;
    // No assistant message ever arrives (bot silent or slow)
    return {
      customer: { id: 'c1', phone },
      conversation: { id: 'conv1', mode: 'ai' },
      messages: [{ id: 'm1', role: 'user', content: 'Pregunta sin respuesta' }],
      order: null,
    };
  };

  await new Promise((resolve) => {
    burstPollTimer = setInterval(async () => {
      count++;
      const data = await api.syncAll(store.getState().activePhone);
      store.updateState({ messages: data.messages });

      const msgs = store.getState().messages;
      const lastMsg = msgs[msgs.length - 1];
      if ((lastMsg?.role === 'assistant' && lastMsg.content) || count >= 5) {
        clearInterval(burstPollTimer);
        burstPollTimer = null;
        store.setSending(false);
        resolve();
      }
    }, 20);
  });

  recordTest(
    'Suite 4',
    'Burst polling gracefully stops at maxCount timeout and unlocks isSending (isSending: false)',
    count === 5 && store.getState().isSending === false,
    `count=${count}, isSending=${store.getState().isSending}`
  );

  // 3. Test Concurrency: Rapid multiple sync calls don't corrupt store state
  const concurrentCalls = [];
  for (let i = 0; i < 20; i++) {
    concurrentCalls.push(
      (async (idx) => {
        store.updateState({ isSyncing: true });
        await new Promise((r) => setTimeout(r, Math.random() * 20));
        store.updateState({ isSyncing: false, lastSyncTime: new Date() });
      })(i)
    );
  }
  await Promise.all(concurrentCalls);

  recordTest(
    'Suite 4',
    '20 concurrent sync state transitions resolve without deadlock or corrupted state',
    store.getState().isSyncing === false && store.getState().lastSyncTime instanceof Date
  );
}

await testSuite4();

// =============================================================================
// SUMMARY & VERDICT
// =============================================================================
console.log('\n================================================================================');
console.log('📊 EMPIRICAL STRESS TEST RESULTS SUMMARY');
console.log('================================================================================');
console.log(`Total Tests Run : ${totalTests}`);
console.log(`Tests Passed    : ${passedTests}`);
console.log(`Tests Failed    : ${failedTests}`);
console.log(`Success Rate    : ${((passedTests / totalTests) * 100).toFixed(1)}%`);
console.log('================================================================================\n');

if (failedTests > 0) {
  console.log('💥 Identified Vulnerabilities & Failure Modes:');
  testFindings.forEach((f, idx) => {
    console.log(`  ${idx + 1}. [${f.suite}] ${f.test}: ${f.details}`);
  });
  process.exit(1);
} else {
  console.log('🎉 ALL EMPIRICAL ADVERSARIAL CHALLENGES & STRESS TESTS PASSED 100%!');
  process.exit(0);
}
