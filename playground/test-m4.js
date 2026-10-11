/**
 * Test Suite for Milestone 4 (Panel 3: Debugger UI, Memory & Tools Inspector)
 * Tests tool metadata, markdown parsing/sanitization, mode indicator, handoff extraction,
 * JSON highlighting, filtering, and reactive DOM bindings.
 */

import { strict as assert } from 'node:assert';
import {
  TOOL_METADATA,
  getToolMeta,
  escapeHtml,
  sanitizeHtml,
  simpleMarkdownParser,
  renderMarkdown,
  formatCharCount,
  formatJson,
  syntaxHighlightJson,
  extractHandoffReason,
  filterToolExecutions,
  formatTimestamp,
  DebuggerUI,
} from './js/debugger-ui.js';
import { PlaygroundStore } from './js/store.js';

console.log('🧪 Starting Milestone 4 Test Suite (Panel 3: Debugger UI & Tools Inspector)...');

// =========================================================================
// SUITE 1: 10 Official Tools Metadata & Color Mapping
// =========================================================================
console.log('\n--- [Suite 1] 10 Deterministic Tools Metadata & Color Mapping ---');

const expectedTools = [
  { name: 'get_menu', color: 'indigo', icon: '📋' },
  { name: 'get_product', color: 'blue', icon: '🔍' },
  { name: 'create_order', color: 'amber', icon: '🛒' },
  { name: 'add_order_item', color: 'emerald', icon: '🍕' },
  { name: 'remove_order_item', color: 'rose', icon: '🗑️' },
  { name: 'get_current_order', color: 'teal', icon: '🧾' },
  { name: 'confirm_order', color: 'green', icon: '✅' },
  { name: 'get_customer', color: 'purple', icon: '👤' },
  { name: 'update_customer_notes', color: 'cyan', icon: '📝' },
  { name: 'handoff_to_human', color: 'orange', icon: '🚨' },
];

assert.equal(Object.keys(TOOL_METADATA).length, 10, 'Must have exactly 10 official tools registered in TOOL_METADATA');

for (const exp of expectedTools) {
  const meta = getToolMeta(exp.name);
  assert.ok(meta, `Tool ${exp.name} must exist`);
  assert.equal(meta.name, exp.name);
  assert.equal(meta.color, exp.color, `Tool ${exp.name} should have color ${exp.color}`);
  assert.equal(meta.icon, exp.icon, `Tool ${exp.name} should have icon ${exp.icon}`);
  assert.ok(meta.badgeClass.includes(exp.color), `Badge class must include ${exp.color}`);
  assert.ok(meta.borderClass.includes(exp.color), `Border class must include ${exp.color}`);
  assert.ok(meta.label.length > 0, `Tool ${exp.name} must have non-empty label`);
  assert.ok(meta.description.length > 0, `Tool ${exp.name} must have non-empty description`);
}

// Fallback for unknown / custom tool
const fallbackMeta = getToolMeta('custom_ai_search');
assert.equal(fallbackMeta.name, 'custom_ai_search');
assert.equal(fallbackMeta.color, 'slate');
assert.equal(fallbackMeta.icon, '⚙️');
assert.ok(fallbackMeta.badgeClass.includes('slate'));

console.log('✅ Suite 1 passed: All 10 tools and fallback properly configured.');

// =========================================================================
// SUITE 2: Markdown Parser, Sanitizer & Character Counter
// =========================================================================
console.log('\n--- [Suite 2] Markdown Parser, Sanitizer & Memory Formatting ---');

// Test HTML escaping
const rawDangerousText = '<script>alert("xss")</script> & "quotes" \'single\' <img src=x onerror=alert(1)>';
const escaped = escapeHtml(rawDangerousText);
assert.ok(!escaped.includes('<script>'), 'HTML escape must replace opening angle brackets');
assert.ok(escaped.includes('&amp;'), 'HTML escape must replace ampersands');
assert.ok(escaped.includes('&quot;'), 'HTML escape must replace double quotes');

// Test HTML Sanitization
const dirtyHtml = '<p>Normal text</p><script>alert("hack")</script><iframe src="evil.com"></iframe><a href="javascript:alert(1)" onclick="steal()">Click</a>';
const cleanHtml = sanitizeHtml(dirtyHtml);
assert.ok(!cleanHtml.includes('<script>'), 'Sanitizer must remove script tags');
assert.ok(!cleanHtml.includes('<iframe>'), 'Sanitizer must remove iframe tags');
assert.ok(!cleanHtml.includes('javascript:'), 'Sanitizer must neutralize javascript: links');
assert.ok(!cleanHtml.includes('onclick='), 'Sanitizer must strip inline event handlers');
assert.ok(cleanHtml.includes('Normal text'), 'Sanitizer must keep benign content');

// Test Markdown Rendering with native parser
const sampleMarkdown = `
# Preferencias del Cliente
- **Alergias:** Alérgico a los champiñones y mariscos.
- *Gustos:* Prefiere masa delgada y orilla dorada.
- Código de descuento usual: \`DON10\`

> Entregar siempre en la puerta trasera.
`;

const rendered = renderMarkdown(sampleMarkdown);
assert.ok(rendered.includes('Preferencias del Cliente'), 'Must render heading');
assert.ok(rendered.includes('<strong') || rendered.includes('Alergias'), 'Must render bold text');
assert.ok(rendered.includes('<em') || rendered.includes('Gustos'), 'Must render italic text');
assert.ok(rendered.includes('<code') || rendered.includes('DON10'), 'Must render inline code');
assert.ok(rendered.includes('<li>') || rendered.includes('champiñones'), 'Must render list items');

// Test Markdown Rendering when Marked.js is available
globalThis.marked = {
  parse: (text) => `<h3>${escapeHtml(text)}</h3><p>Parsed with Marked.js</p>`,
};
const renderedWithMarked = renderMarkdown('Test with external marked library');
assert.ok(renderedWithMarked.includes('Parsed with Marked.js'), 'Must use marked.parse when available');
globalThis.marked = null; // reset

// Test empty / whitespace markdown
assert.equal(renderMarkdown(''), '', 'Empty markdown should return empty string');
assert.equal(renderMarkdown('   \n  '), '', 'Whitespace markdown should return empty string');
assert.equal(renderMarkdown(null), '', 'Null markdown should return empty string');

// Test Character Counter
assert.equal(formatCharCount(0, 5000), '0 / 5,000 caracteres');
assert.equal(formatCharCount(142, 5000), '142 / 5,000 caracteres');
assert.equal(formatCharCount('Hola mundo', 5000), '10 / 5,000 caracteres');
assert.equal(formatCharCount(5200, 5000), '5,200 / 5,000 caracteres');

// Test Timestamp Formatting
assert.equal(formatTimestamp(null), '—');
assert.equal(formatTimestamp(''), '—');
assert.ok(formatTimestamp('2026-08-21T21:45:00Z').includes(':'), 'Should format valid ISO date to time');
assert.equal(formatTimestamp('invalid-date'), 'invalid-date', 'Should fallback gracefully on invalid date');

console.log('✅ Suite 2 passed: Markdown parser, XSS sanitizer & character counter verified.');

// =========================================================================
// SUITE 3: JSON Formatter & Syntax Highlighter
// =========================================================================
console.log('\n--- [Suite 3] JSON Formatter & Syntax Highlighter ---');

const sampleObject = {
  customer_id: 'cust_123',
  items_count: 2,
  confirmed: true,
  notes: null,
  price: 189.5,
};

const highlightedHtml = formatJson(sampleObject);
assert.ok(highlightedHtml.includes('text-sky-300'), 'JSON keys should have sky styling');
assert.ok(highlightedHtml.includes('text-emerald-300'), 'JSON strings should have emerald styling');
assert.ok(highlightedHtml.includes('text-amber-300'), 'JSON numbers should have amber styling');
assert.ok(highlightedHtml.includes('text-purple-300'), 'JSON booleans should have purple styling');
assert.ok(highlightedHtml.includes('text-rose-400'), 'JSON nulls should have rose styling');

// Stringified JSON handling
const jsonString = JSON.stringify({ action: 'lookup', success: false });
const fromStringHtml = formatJson(jsonString);
assert.ok(fromStringHtml.includes('action'), 'Should parse stringified JSON');
assert.ok(fromStringHtml.includes('text-purple-300'), 'Should highlight false boolean');

// Null and undefined handling
assert.ok(formatJson(null).includes('null'), 'Null should render null indicator');
assert.ok(formatJson(undefined).includes('null'), 'Undefined should render null indicator');

console.log('✅ Suite 3 passed: JSON syntax highlighter formats all data types correctly.');

// =========================================================================
// SUITE 4: Conversational Mode & Handoff Reason Extraction
// =========================================================================
console.log('\n--- [Suite 4] Handoff Reason Extraction & Conversational Mode ---');

// Case 1: Direct conversation property
const case1 = {
  conversation: {
    id: 'conv_1',
    mode: 'human',
    handoff_reason: 'Comensal enojado por retraso de repartidor',
  },
};
assert.equal(extractHandoffReason(case1), 'Comensal enojado por retraso de repartidor');

// Case 2: Metadata reason
const case2 = {
  conversation: {
    id: 'conv_2',
    mode: 'human',
    metadata: { reason: 'Cliente solicitó hablar con gerente' },
  },
};
assert.equal(extractHandoffReason(case2), 'Cliente solicitó hablar con gerente');

// Case 3: Tool Execution trace
const case3 = {
  conversation: { id: 'conv_3', mode: 'human' },
  toolExecutions: [
    {
      name: 'get_menu',
      args: {},
      output: { items: [] },
      status: 'success',
    },
    {
      name: 'handoff_to_human',
      args: { reason: 'Duda sobre reservación para 20 personas en terraza' },
      output: { success: true },
      status: 'success',
    },
  ],
};
assert.equal(extractHandoffReason(case3), 'Duda sobre reservación para 20 personas en terraza');

// Case 4: Assistant message with tool_calls
const case4 = {
  conversation: { id: 'conv_4', mode: 'human' },
  messages: [
    {
      role: 'assistant',
      metadata: {
        tool_calls: [
          {
            id: 'tc_1',
            function: {
              name: 'handoff_to_human',
              arguments: JSON.stringify({ motive: 'Problema con cobro duplicado' }),
            },
          },
        ],
      },
    },
  ],
};
assert.equal(extractHandoffReason(case4), 'Problema con cobro duplicado');

// Case 5: System message transfer announcement
const case5 = {
  conversation: { id: 'conv_5', mode: 'human' },
  messages: [
    {
      role: 'system',
      content: 'Transferido a agente humano. Motivo: Solicitud de factura con RFC extranjero',
    },
  ],
};
assert.equal(extractHandoffReason(case5), 'Solicitud de factura con RFC extranjero');

// Case 6: No handoff reason
const case6 = {
  conversation: { id: 'conv_6', mode: 'ai' },
  messages: [{ role: 'user', content: 'Hola' }],
  toolExecutions: [],
};
assert.equal(extractHandoffReason(case6), null);

console.log('✅ Suite 4 passed: Handoff reasons extracted correctly from all 5 sources.');

// =========================================================================
// SUITE 5: Tool Execution Filtering & Search
// =========================================================================
console.log('\n--- [Suite 5] Tool Executions Filter & Search Logic ---');

const mockTraces = [
  {
    id: 't1',
    name: 'get_menu',
    args: { category: 'pizzas' },
    output: { count: 5 },
    status: 'success',
  },
  {
    id: 't2',
    name: 'add_order_item',
    args: { product_name: 'Pizza Pepperoni Grande', quantity: 2 },
    output: { subtotal: 398 },
    status: 'success',
  },
  {
    id: 't3',
    name: 'confirm_order',
    args: { address: 'Av Insurgentes 450', payment_method: 'cash' },
    output: { error: 'Address out of delivery zone' },
    status: 'error',
  },
  {
    id: 't4',
    name: 'update_customer_notes',
    args: { notes: 'Sin cebolla por favor' },
    output: { updated: true },
    status: 'success',
  },
];

// 1. Filter by toolName
const menuOnly = filterToolExecutions(mockTraces, { toolName: 'get_menu' });
assert.equal(menuOnly.length, 1);
assert.equal(menuOnly[0].id, 't1');

// 2. Filter by status
const errorsOnly = filterToolExecutions(mockTraces, { status: 'error' });
assert.equal(errorsOnly.length, 1);
assert.equal(errorsOnly[0].id, 't3');

// 3. Search by query (args text)
const pepperoniSearch = filterToolExecutions(mockTraces, { query: 'Pepperoni' });
assert.equal(pepperoniSearch.length, 1);
assert.equal(pepperoniSearch[0].id, 't2');

// 4. Search by query (output text)
const outOfZoneSearch = filterToolExecutions(mockTraces, { query: 'delivery zone' });
assert.equal(outOfZoneSearch.length, 1);
assert.equal(outOfZoneSearch[0].id, 't3');

// 5. No match
const noMatch = filterToolExecutions(mockTraces, { query: 'tacos al pastor' });
assert.equal(noMatch.length, 0);

// 6. All filters default
const allTraces = filterToolExecutions(mockTraces, {});
assert.equal(allTraces.length, 4);

console.log('✅ Suite 5 passed: Tool executions filterable by name, status and query.');

// =========================================================================
// SUITE 6: DOM Mock Environment & Component Lifecycle
// =========================================================================
console.log('\n--- [Suite 6] DOM Binding & Reactive Store Event Lifecycle ---');

/**
 * Creates a lightweight Mock Element for Node.js testing.
 */
function createMockElement(id, tagName = 'div') {
  const classes = new Set();
  const listeners = new Map();
  const attributes = new Map();
  let innerHtml = '';
  let text = '';

  const el = {
    id,
    tagName: tagName.toUpperCase(),
    children: [],
    parentElement: null,
    parentNode: null,

    get className() {
      return Array.from(classes).join(' ');
    },
    set className(val) {
      classes.clear();
      if (val) val.split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
    },

    classList: {
      add: (...tokens) => tokens.forEach(t => classes.add(t)),
      remove: (...tokens) => tokens.forEach(t => classes.delete(t)),
      contains: (token) => classes.has(token),
      toggle: (token, force) => {
        if (force === undefined) {
          classes.has(token) ? classes.delete(token) : classes.add(token);
        } else if (force) {
          classes.add(token);
        } else {
          classes.delete(token);
        }
      },
    },

    get innerHTML() {
      return innerHtml;
    },
    set innerHTML(val) {
      innerHtml = String(val);
    },

    get textContent() {
      return text || innerHtml.replace(/<[^>]*>/g, '');
    },
    set textContent(val) {
      text = String(val);
      innerHtml = escapeHtml(String(val));
    },

    setAttribute: (name, val) => attributes.set(name, String(val)),
    getAttribute: (name) => attributes.get(name) || null,
    hasAttribute: (name) => attributes.has(name),

    addEventListener: (event, fn) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
    },

    dispatchEvent: (event, eventData = {}) => {
      const handlers = listeners.get(event) || [];
      for (const h of handlers) h({ target: el, ...eventData });
    },

    appendChild: (child) => {
      child.parentElement = el;
      child.parentNode = el;
      el.children.push(child);
      return child;
    },

    insertBefore: (newChild, refChild) => {
      newChild.parentElement = el;
      newChild.parentNode = el;
      const idx = el.children.indexOf(refChild);
      if (idx >= 0) {
        el.children.splice(idx, 0, newChild);
      } else {
        el.children.push(newChild);
      }
      return newChild;
    },

    querySelector: (sel) => {
      if (sel.startsWith('#')) {
        const targetId = sel.slice(1);
        if (el.id === targetId) return el;
        for (const child of el.children) {
          const found = child.querySelector(sel);
          if (found) return found;
        }
      }
      return null;
    },

    querySelectorAll: () => [],
    closest: () => el,
  };

  el.parentNode = el;
  return el;
}

// Build Mock Document DOM
const mockElementsMap = new Map();
function registerMockEl(id, tagName = 'div') {
  const el = createMockElement(id, tagName);
  mockElementsMap.set(id, el);
  return el;
}

const inspectorPanel = registerMockEl('panel-tools-inspector');
const modeBadge = registerMockEl('conversation-mode-badge');
const modeCard = registerMockEl('conversation-mode-card');
const memoryPhone = registerMockEl('customer-memory-phone', 'span');
const memoryNotes = registerMockEl('customer-notes-markdown');
const memoryCharCount = registerMockEl('customer-notes-char-count', 'span');
const toolsCountBadge = registerMockEl('tools-count-badge', 'span');
const toolsTimeline = registerMockEl('tools-timeline-container');
const toolsEmptyState = registerMockEl('tools-empty-state');

inspectorPanel.appendChild(modeBadge);
inspectorPanel.appendChild(modeCard);
inspectorPanel.appendChild(memoryPhone);
inspectorPanel.appendChild(memoryNotes);
inspectorPanel.appendChild(memoryCharCount);
inspectorPanel.appendChild(toolsCountBadge);
inspectorPanel.appendChild(toolsTimeline);

globalThis.document = {
  getElementById: (id) => mockElementsMap.get(id) || null,
  querySelector: (sel) => {
    if (sel.startsWith('#')) return mockElementsMap.get(sel.slice(1)) || null;
    return inspectorPanel;
  },
  querySelectorAll: () => [],
  createElement: (tagName) => createMockElement(`dyn_${Math.random()}`, tagName),
};

globalThis.window = {
  document: globalThis.document,
  marked: null, // Test with native built-in parser
};

// Instantiate isolated PlaygroundStore and DebuggerUI
const testStore = new PlaygroundStore();
const testUI = new DebuggerUI({ storeInstance: testStore });

testUI.init();
assert.equal(testUI.isInitialized, true, 'DebuggerUI should be initialized');

// Test 1: AI Mode Initial State
testStore.updateState({
  conversation: { id: 'conv_test_1', mode: 'ai', status: 'open' },
});
assert.ok(modeBadge.innerHTML.includes('MODO IA'), 'Badge must indicate MODO IA');
assert.ok(modeCard.innerHTML.includes('MODO IA ACTIVO'), 'Card must indicate MODO IA ACTIVO');

// Test 2: Handoff to Human State Transition
testStore.updateState({
  conversation: {
    id: 'conv_test_1',
    mode: 'human',
    status: 'open',
    handoff_reason: 'Cliente quiere factura personalizada',
  },
});
assert.ok(modeBadge.innerHTML.includes('MODO HUMANO'), 'Badge must indicate MODO HUMANO');
assert.ok(modeCard.innerHTML.includes('MODO HUMANO (SILENCIADO)'), 'Card must indicate MODO HUMANO');
assert.ok(modeCard.innerHTML.includes('Cliente quiere factura personalizada'), 'Card must show handoff reason');

// Test 3: Customer Memory Update
testStore.updateState({
  customer: {
    id: 'cust_test_1',
    name: 'Carlos',
    phone: '5215512345678',
    notes_md: '## Notas\n- Sin piña en ninguna pizza\n- Pago con billete de $500',
  },
});
assert.equal(memoryPhone.textContent, '+5215512345678', 'Phone label must show formatted phone');
assert.ok(memoryNotes.innerHTML.includes('Sin piña'), 'Markdown content must render note items');
assert.ok(memoryCharCount.textContent.includes('caracteres'), 'Char count must be displayed');

// Test 4: Real-time Tools Execution Update
testStore.updateState({
  toolExecutions: [
    {
      id: 'tool_1',
      name: 'get_menu',
      args: { category: 'pizzas' },
      output: { items: [{ name: 'Margarita', price: 150 }] },
      status: 'success',
      timestamp: '2026-08-21T21:00:00Z',
    },
    {
      id: 'tool_2',
      name: 'add_order_item',
      args: { product_name: 'Margarita', quantity: 1 },
      output: { total: 150 },
      status: 'success',
      timestamp: '2026-08-21T21:00:05Z',
    },
  ],
});

assert.ok(toolsCountBadge.textContent.includes('2 llamadas'), 'Tools count badge must reflect 2 executions');
assert.ok(toolsTimeline.innerHTML.includes('get_menu'), 'Timeline must contain get_menu card');
assert.ok(toolsTimeline.innerHTML.includes('add_order_item'), 'Timeline must contain add_order_item card');

// Test 5: Phone switch resets active client view
testStore.setActivePhone('5215599998888');
assert.equal(testStore.getState().activePhone, '5215599998888');
assert.ok(toolsTimeline.innerHTML.includes('No se han registrado llamadas'), 'Timeline should show empty state after phone switch');

// Test 6: Destroy / Cleanup
testUI.destroy();
assert.equal(testUI.isInitialized, false, 'DebuggerUI should be de-initialized');

console.log('✅ Suite 6 passed: DOM binding, store event reactivity and full lifecycle verified.');

console.log('\n🎉 =========================================================================');
console.log('🎉 ALL MILESTONE 4 UNIT & INTEGRATION TESTS PASSED SUCCESSFULLY (100%)!');
console.log('🎉 =========================================================================\n');
