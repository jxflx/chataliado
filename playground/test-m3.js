/**
 * Comprehensive Test Suite for Milestone 3: Real-Time Kitchen & Orders Dashboard (Panel 2)
 * Tests formatting functions, badge mapping, options parsing, HTML rendering,
 * clipboard summary, and DOM reactive updates via PlaygroundStore.
 */

import { strict as assert } from 'node:assert';
import { PlaygroundStore } from './js/store.js';
import {
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
  STATUS_CONFIG,
  KitchenUI,
} from './js/kitchen-ui.js';

console.log('🧪 Starting Milestone 3 (Kitchen & Orders Dashboard) Test Suite...\n');

// ============================================================================
// 1. Test Currency & Number Formatting Functions
// ============================================================================
console.log('1. Testing Currency & Number Formatting...');

assert.equal(formatCurrency(180), '$180.00', '180 should format to $180.00');
assert.equal(formatCurrency(180.5), '$180.50', '180.5 should format to $180.50');
assert.equal(formatCurrency(180.99), '$180.99', '180.99 should format to $180.99');
assert.equal(formatCurrency('250.75'), '$250.75', 'String "250.75" should format to $250.75');
assert.equal(formatCurrency(180, true), '$180.00 MXN', 'With currency code should append MXN');
assert.equal(formatCurrency(0), '$0.00', '0 should format to $0.00');
assert.equal(formatCurrency(null), '$0.00', 'null should format to $0.00');
assert.equal(formatCurrency(undefined), '$0.00', 'undefined should format to $0.00');
assert.equal(formatCurrency(NaN), '$0.00', 'NaN should format to $0.00');
assert.equal(formatCurrency('invalid'), '$0.00', '"invalid" should format to $0.00');

assert.equal(formatDiscount(0), '-$0.00', '0 discount should format to -$0.00');
assert.equal(formatDiscount(25.5), '-$25.50', '25.5 discount should format to -$25.50');
assert.equal(formatDiscount(-50), '-$50.00', '-50 discount should format to -$50.00');
assert.equal(formatDiscount(null), '-$0.00', 'null discount should format to -$0.00');

console.log('   ✅ formatCurrency and formatDiscount passed all tests.');

// ============================================================================
// 2. Test Order ID & Date/Time Formatting Functions
// ============================================================================
console.log('2. Testing Order ID & Date/Time Formatting...');

assert.equal(
  formatOrderId('a0000000-0000-0000-0000-000000000001'),
  '#ORD-A0000000',
  'UUID should extract first 8 chars uppercase'
);
assert.equal(
  formatOrderId('c9f8e7d6-5432-10ab-cdef-1234567890ab'),
  '#ORD-C9F8E7D6',
  'UUID should be formatted correctly'
);
assert.equal(formatOrderId(''), 'Ninguna', 'Empty string should return "Ninguna"');
assert.equal(formatOrderId(null), 'Ninguna', 'null should return "Ninguna"');
assert.equal(formatOrderId(undefined), 'Ninguna', 'undefined should return "Ninguna"');

const testDate = '2026-08-21T20:30:00Z';
const formattedDate = formatDateTime(testDate);
assert.ok(formattedDate.length > 5, 'Date should produce formatted string');
assert.notEqual(formattedDate, '—', 'Valid date should not return dash');
assert.equal(formatDateTime(null), '—', 'null date should return dash');
assert.equal(formatDateTime('invalid-date'), '—', 'invalid date string should return dash');

console.log('   ✅ formatOrderId and formatDateTime passed all tests.');

// ============================================================================
// 3. Test Status Badges Configuration & Color Mapping
// ============================================================================
console.log('3. Testing Status Badges Mapping...');

const draftBadge = getStatusBadgeConfig('draft');
assert.equal(draftBadge.label, 'Borrador en curso');
assert.equal(draftBadge.icon, '🟡');
assert.ok(draftBadge.bgClass.includes('amber'), 'draft should have amber background');
assert.ok(draftBadge.pulseClass.includes('pulse-amber'), 'draft should have pulse-amber animation');

const confirmedBadge = getStatusBadgeConfig('confirmed');
assert.equal(confirmedBadge.label, 'Confirmado / En Cocina');
assert.equal(confirmedBadge.icon, '🟢');
assert.ok(confirmedBadge.bgClass.includes('emerald'), 'confirmed should have emerald background');

const preparingBadge = getStatusBadgeConfig('preparing');
assert.equal(preparingBadge.label, 'En Preparación');
assert.equal(preparingBadge.icon, '🔵');
assert.ok(preparingBadge.bgClass.includes('sky'), 'preparing should have sky background');

const deliveredBadge = getStatusBadgeConfig('delivered');
assert.equal(deliveredBadge.label, 'Entregado');
assert.equal(deliveredBadge.icon, '🟣');
assert.ok(deliveredBadge.bgClass.includes('purple'), 'delivered should have purple background');

const cancelledBadge = getStatusBadgeConfig('cancelled');
assert.equal(cancelledBadge.label, 'Cancelado');
assert.equal(cancelledBadge.icon, '🔴');
assert.ok(cancelledBadge.bgClass.includes('rose'), 'cancelled should have rose background');

const noneBadge = getStatusBadgeConfig(null);
assert.equal(noneBadge.label, 'Sin orden activa');
assert.equal(noneBadge.icon, '⚪');
assert.ok(noneBadge.bgClass.includes('slate'), 'none should have slate background');

console.log('   ✅ getStatusBadgeConfig passed all tests.');

// ============================================================================
// 4. Test Payment & Delivery Metadata Formatting
// ============================================================================
console.log('4. Testing Payment & Delivery Metadata Formatting...');

assert.equal(formatPaymentMethod('cash'), 'Efectivo');
assert.equal(formatPaymentMethod('transfer'), 'Transferencia SPEI');
assert.equal(formatPaymentMethod('card'), 'Tarjeta');
assert.equal(formatPaymentMethod('pending'), 'Pendiente de definir');
assert.equal(formatPaymentMethod(null), '—');
assert.equal(formatPaymentMethod('unknown'), '—');

assert.equal(formatPaymentStatus('paid'), 'Pagado');
assert.equal(formatPaymentStatus('pending'), 'Pendiente');
assert.equal(formatPaymentStatus('failed'), 'Fallido');
assert.equal(formatPaymentStatus('refunded'), 'Reembolsado');
assert.equal(formatPaymentStatus(null), '—');

assert.equal(
  formatDeliveryAddress('Av. Insurgentes Sur 123, CDMX', 'Calle Luna 45'),
  'Av. Insurgentes Sur 123, CDMX',
  'Should prefer order delivery address'
);
assert.equal(
  formatDeliveryAddress(null, 'Calle Luna 45, Col. Roma'),
  'Calle Luna 45, Col. Roma',
  'Should fallback to customer default address'
);
assert.equal(
  formatDeliveryAddress('', ''),
  'No especificada aún',
  'Should return placeholder when no address provided'
);

console.log('   ✅ Payment & delivery metadata formatters passed all tests.');

// ============================================================================
// 5. Test Options Parsing & HTML Rendering
// ============================================================================
console.log('5. Testing Options Parsing & HTML Rendering...');

// Case A: Key-value Object
const objOptions = {
  size: 'Familiar',
  crust: 'Queso',
  notes: 'Sin cebolla y bien dorada',
};
const parsedObj = parseOptions(objOptions);
assert.equal(parsedObj.length, 3);
assert.equal(parsedObj[0].label, 'Tamaño');
assert.equal(parsedObj[0].value, 'Familiar');
assert.equal(parsedObj[0].isNote, false);
assert.equal(parsedObj[1].label, 'Orilla');
assert.equal(parsedObj[1].value, 'Queso');
assert.equal(parsedObj[2].label, 'Notas');
assert.equal(parsedObj[2].value, 'Sin cebolla y bien dorada');
assert.equal(parsedObj[2].isNote, true);

// Case B: JSON String
const jsonStringOptions = JSON.stringify({
  tamano: 'Mediana',
  ingredientes: 'Pepperoni extra',
  instrucciones: 'Entregar en puerta 2',
});
const parsedJson = parseOptions(jsonStringOptions);
assert.equal(parsedJson.length, 3);
assert.equal(parsedJson[0].label, 'Tamaño');
assert.equal(parsedJson[1].label, 'Ingredientes');
assert.equal(parsedJson[2].label, 'Notas');
assert.equal(parsedJson[2].isNote, true);

// Case C: Array of structured options with price modifiers
const structuredArray = [
  { group_name: 'Tamaño', choice_label: 'Familiar', price_modifier: 50 },
  { group_name: 'Orilla', choice_label: 'Rellena de Queso', price_modifier: 25 },
  { group_name: 'Notas Especiales', choice_label: 'Cortar en 8 rebanadas' },
];
const parsedArray = parseOptions(structuredArray);
assert.equal(parsedArray.length, 3);
assert.equal(parsedArray[0].label, 'Tamaño');
assert.equal(parsedArray[0].priceModifier, 50);
assert.equal(parsedArray[1].priceModifier, 25);
assert.equal(parsedArray[2].isNote, true);

// Case D: Array of strings
const stringArray = ['Familiar', 'Orilla de Queso'];
const parsedStringArr = parseOptions(stringArray);
assert.equal(parsedStringArr.length, 2);
assert.equal(parsedStringArr[0].value, 'Familiar');

// Case E: Empty & Null inputs
assert.deepEqual(parseOptions(null), []);
assert.deepEqual(parseOptions(undefined), []);
assert.deepEqual(parseOptions(''), []);
assert.deepEqual(parseOptions('{}'), []);
assert.deepEqual(parseOptions('[]'), []);
assert.deepEqual(parseOptions('null'), []);

// Case F: HTML Rendering
const htmlOut = renderOptionsHtml(parsedObj);
assert.ok(htmlOut.includes('Tamaño: Familiar'), 'Should render size option pill');
assert.ok(htmlOut.includes('Orilla: Queso'), 'Should render crust option pill');
assert.ok(htmlOut.includes('Notas: Sin cebolla'), 'Should render notes pill');
assert.ok(htmlOut.includes('bg-amber-950/50'), 'Notes pill should have amber badge');
assert.ok(htmlOut.includes('bg-slate-800/90'), 'Standard pill should have sky badge');

assert.equal(renderOptionsHtml([]), '', 'Empty options should produce empty string');

console.log('   ✅ parseOptions and renderOptionsHtml passed all tests.');

// ============================================================================
// 6. Test Kitchen Clipboard Summary Formatting
// ============================================================================
console.log('6. Testing Kitchen Clipboard Summary Formatting...');

const sampleOrder = {
  id: 'a0000000-0000-0000-0000-000000000001',
  status: 'confirmed',
  created_at: '2026-08-21T20:30:00Z',
  subtotal: 395,
  delivery_fee: 30,
  discount: 0,
  total: 425,
  delivery_address: 'Av. Insurgentes Sur 123, Depto 4B',
  payment_method: 'cash',
  order_items: [
    {
      id: 'i1',
      quantity: 2,
      unit_price: 180,
      subtotal: 360,
      menu_items: { name: 'Pizza Pepperoni' },
      options_selected: { size: 'Familiar', crust: 'Queso' },
    },
    {
      id: 'i2',
      quantity: 1,
      unit_price: 35,
      subtotal: 35,
      name: 'Coca-Cola 600ml',
      options_selected: null,
    },
  ],
};

const sampleCustomer = {
  name: 'Carlos Mendoza',
  phone: '5215512345678',
};

const summaryText = formatKitchenClipboardSummary(sampleOrder, sampleCustomer);

assert.ok(summaryText.includes('COMANDA DE COCINA'), 'Must contain header');
assert.ok(summaryText.includes('#ORD-A0000000'), 'Must contain formatted order ID');
assert.ok(summaryText.includes('CONFIRMADO / EN COCINA'), 'Must contain status');
assert.ok(summaryText.includes('Carlos Mendoza (+5215512345678)'), 'Must contain customer info');
assert.ok(summaryText.includes('Av. Insurgentes Sur 123, Depto 4B'), 'Must contain delivery address');
assert.ok(summaryText.includes('2x Pizza Pepperoni ($180.00 c/u -> $360.00)'), 'Must list first item');
assert.ok(summaryText.includes('- Tamaño: Familiar'), 'Must list options');
assert.ok(summaryText.includes('- Orilla: Queso'), 'Must list options');
assert.ok(summaryText.includes('1x Coca-Cola 600ml ($35.00 c/u -> $35.00)'), 'Must list second item');
assert.ok(summaryText.includes('Subtotal:       $395.00'), 'Must include subtotal');
assert.ok(summaryText.includes('Envío:          $30.00'), 'Must include delivery fee');
assert.ok(summaryText.includes('TOTAL A PAGAR:  $425.00 MXN'), 'Must include total');
assert.ok(summaryText.includes('Método de Pago: Efectivo'), 'Must include payment method');

assert.equal(formatKitchenClipboardSummary(null), 'Sin orden activa.', 'Null order should format empty state message');

console.log('   ✅ formatKitchenClipboardSummary passed all tests.');

// ============================================================================
// 7. Test KitchenUI DOM Component & Reactive Store Integration
// ============================================================================
console.log('7. Testing KitchenUI DOM Component & Reactive Store Integration...');

// Lightweight DOM Mock for testing in Node.js environment
class MockClassList {
  constructor() {
    this._classes = new Set();
  }
  add(...classes) {
    for (const c of classes) if (c) this._classes.add(c);
  }
  remove(...classes) {
    for (const c of classes) if (c) this._classes.delete(c);
  }
  contains(c) {
    return this._classes.has(c);
  }
  toggle(c, force) {
    if (force !== undefined) {
      if (force) this.add(c); else this.remove(c);
      return force;
    }
    if (this.contains(c)) { this.remove(c); return false; }
    this.add(c); return true;
  }
}

class MockElement {
  constructor(id, tagName = 'div') {
    this.id = id;
    this.tagName = tagName;
    this.textContent = '';
    this.innerHTML = '';
    this.classList = new MockClassList();
    this.className = '';
    this.children = [];
    this.style = {};
    this.dataset = {};
    this._listeners = new Map();
  }

  getAttribute(attr) {
    return this[attr] || null;
  }

  setAttribute(attr, val) {
    this[attr] = val;
  }

  addEventListener(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
  }

  dispatchEvent(event) {
    const list = this._listeners.get(event) || [];
    for (const fn of list) fn();
  }

  querySelector(selector) {
    return this.children[0] || null;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) this.children.splice(idx, 1);
  }
}

const mockDomElements = new Map([
  ['panel-kitchen-orders', new MockElement('panel-kitchen-orders')],
  ['order-status-badge', new MockElement('order-status-badge')],
  ['order-id-label', new MockElement('order-id-label')],
  ['order-created-time', new MockElement('order-created-time')],
  ['order-items-count-badge', new MockElement('order-items-count-badge')],
  ['order-empty-state', new MockElement('order-empty-state')],
  ['order-items-table', new MockElement('order-items-table')],
  ['order-items-tbody', new MockElement('order-items-tbody')],
  ['order-subtotal', new MockElement('order-subtotal')],
  ['order-delivery-fee', new MockElement('order-delivery-fee')],
  ['order-discount', new MockElement('order-discount')],
  ['order-total-amount', new MockElement('order-total-amount')],
  ['order-delivery-address', new MockElement('order-delivery-address')],
  ['order-payment-method', new MockElement('order-payment-method')],
  ['order-payment-status', new MockElement('order-payment-status')],
  ['btn-refresh-sync', new MockElement('btn-refresh-sync')],
]);

globalThis.document = {
  readyState: 'complete',
  getElementById: (id) => mockDomElements.get(id) || null,
  createElement: (tag) => new MockElement(`mock_${tag}`, tag),
  body: new MockElement('body'),
};

globalThis.window = {
  document: globalThis.document,
};

// Test KitchenUI with PlaygroundStore
const testStore = new PlaygroundStore();
const kitchenComponent = new KitchenUI(testStore);

kitchenComponent.init();

// Step A: Check Initial Empty State
const statusBadgeEl = mockDomElements.get('order-status-badge');
const idLabelEl = mockDomElements.get('order-id-label');
const emptyStateEl = mockDomElements.get('order-empty-state');
const itemsCountBadgeEl = mockDomElements.get('order-items-count-badge');
const subtotalEl = mockDomElements.get('order-subtotal');
const totalAmountEl = mockDomElements.get('order-total-amount');

assert.equal(idLabelEl.textContent, 'Ninguna', 'Initial Order ID should be Ninguna');
assert.ok(statusBadgeEl.innerHTML.includes('Sin orden activa'), 'Initial badge should be Sin orden activa');
assert.equal(itemsCountBadgeEl.textContent, '0 ítems', 'Initial count should be 0 ítems');
assert.equal(subtotalEl.textContent, '$0.00', 'Initial subtotal should be $0.00');
assert.equal(totalAmountEl.textContent, '$0.00 MXN', 'Initial total should be $0.00 MXN');

// Step B: Emit 'order:updated' with Active Draft Order
testStore.updateState({
  customer: sampleCustomer,
  activeOrder: {
    id: 'b1111111-2222-3333-4444-555555555555',
    status: 'draft',
    created_at: '2026-08-21T20:45:00Z',
    subtotal: 180,
    delivery_fee: 25,
    discount: 10,
    total: 195,
    delivery_address: 'Av. Paseo de la Reforma 222',
    payment_method: 'card',
    payment_status: 'pending',
    order_items: [
      {
        id: 'it_1',
        quantity: 1,
        unit_price: 180,
        subtotal: 180,
        menu_items: { name: 'Pizza Cuatro Quesos' },
        options_selected: { size: 'Grande', notes: 'Sin orilla dura' },
      },
    ],
  },
});

assert.equal(idLabelEl.textContent, '#ORD-B1111111', 'Order ID should update to #ORD-B1111111');
assert.ok(statusBadgeEl.innerHTML.includes('Borrador en curso'), 'Status badge should show Borrador en curso');
assert.ok(statusBadgeEl.className.includes('amber'), 'Status badge class should contain amber');
assert.equal(itemsCountBadgeEl.textContent, '1 ítem', 'Items count should update to 1 ítem');
assert.equal(subtotalEl.textContent, '$180.00', 'Subtotal should update to $180.00');
assert.equal(mockDomElements.get('order-delivery-fee').textContent, '$25.00', 'Delivery fee should update');
assert.equal(mockDomElements.get('order-discount').textContent, '-$10.00', 'Discount should update');
assert.equal(totalAmountEl.textContent, '$195.00 MXN', 'Total amount should update to $195.00 MXN');
assert.equal(mockDomElements.get('order-delivery-address').textContent, 'Av. Paseo de la Reforma 222');
assert.equal(mockDomElements.get('order-payment-method').textContent, 'Tarjeta');
assert.equal(mockDomElements.get('order-payment-status').textContent, 'Pendiente');

const tbodyEl = mockDomElements.get('order-items-tbody');
assert.ok(tbodyEl.innerHTML.includes('Pizza Cuatro Quesos'), 'Tbody should render product name');
assert.ok(tbodyEl.innerHTML.includes('1x'), 'Tbody should render 1x pill');
assert.ok(tbodyEl.innerHTML.includes('Tamaño: Grande'), 'Tbody should render option pill');
assert.ok(tbodyEl.innerHTML.includes('Notas: Sin orilla dura'), 'Tbody should render notes pill');

// Step C: Update to Confirmed Order
testStore.updateState({
  activeOrder: {
    ...testStore.getState().activeOrder,
    status: 'confirmed',
    payment_method: 'transfer',
    payment_status: 'paid',
  },
});

assert.ok(statusBadgeEl.innerHTML.includes('Confirmado / En Cocina'), 'Badge should update to Confirmado / En Cocina');
assert.ok(statusBadgeEl.className.includes('emerald'), 'Badge should have emerald styling');
assert.equal(mockDomElements.get('order-payment-method').textContent, 'Transferencia SPEI');
assert.equal(mockDomElements.get('order-payment-status').textContent, 'Pagado');

// Step D: Test Copy Summary Action
let writeTextCalled = false;
let writtenContent = '';

if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = {};
}
Object.defineProperty(globalThis.navigator, 'clipboard', {
  value: {
    writeText: async (text) => {
      writeTextCalled = true;
      writtenContent = text;
    },
  },
  configurable: true,
  writable: true,
});

const copyResult = await kitchenComponent.copyKitchenSummary();
assert.equal(copyResult, true, 'copyKitchenSummary should succeed');
assert.equal(writeTextCalled, true, 'navigator.clipboard.writeText should be called');
assert.ok(writtenContent.includes('#ORD-B1111111'), 'Copied summary should contain order ID');
assert.ok(writtenContent.includes('Pizza Cuatro Quesos'), 'Copied summary should contain item name');

// Step E: Test Reset State
testStore.resetState();
assert.equal(idLabelEl.textContent, 'Ninguna', 'Order ID should reset to Ninguna');
assert.ok(statusBadgeEl.innerHTML.includes('Sin orden activa'), 'Badge should reset to Sin orden activa');
assert.equal(itemsCountBadgeEl.textContent, '0 ítems', 'Count should reset to 0 ítems');
assert.equal(subtotalEl.textContent, '$0.00', 'Subtotal should reset to $0.00');

// Step F: Test Destroy
kitchenComponent.destroy();
assert.equal(kitchenComponent.unsubscribers.length, 0, 'Unsubscribers should be cleared on destroy');

console.log('   ✅ KitchenUI DOM Component & Reactive Store Integration passed all tests.');

console.log('\n🎉 ALL MILESTONE 3 (KITCHEN & ORDERS DASHBOARD) TESTS PASSED SUCCESSFULLY!');
