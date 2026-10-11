/**
 * ChatAliado Playground - Real-Time Kitchen & Orders Dashboard (Panel 2)
 * Pure ES6 module handling order lifecycle, itemized breakdown, deterministic financials,
 * delivery/payment metadata and kitchen comanda copy.
 */

import { store } from './store.js';

export const STATUS_CONFIG = {
  draft: {
    status: 'draft',
    label: 'Borrador en curso',
    icon: '🟡',
    bgClass: 'bg-amber-500/20',
    textClass: 'text-amber-400',
    borderClass: 'border-amber-500/30',
    pulseClass: 'pulse-amber',
  },
  confirmed: {
    status: 'confirmed',
    label: 'Confirmado / En Cocina',
    icon: '🟢',
    bgClass: 'bg-emerald-500/20',
    textClass: 'text-emerald-400',
    borderClass: 'border-emerald-500/30',
    pulseClass: 'pulse-emerald',
  },
  preparing: {
    status: 'preparing',
    label: 'En Preparación',
    icon: '🔵',
    bgClass: 'bg-sky-500/20',
    textClass: 'text-sky-400',
    borderClass: 'border-sky-500/30',
    pulseClass: '',
  },
  delivered: {
    status: 'delivered',
    label: 'Entregado',
    icon: '🟣',
    bgClass: 'bg-purple-500/20',
    textClass: 'text-purple-400',
    borderClass: 'border-purple-500/30',
    pulseClass: '',
  },
  cancelled: {
    status: 'cancelled',
    label: 'Cancelado',
    icon: '🔴',
    bgClass: 'bg-rose-500/20',
    textClass: 'text-rose-400',
    borderClass: 'border-rose-500/30',
    pulseClass: '',
  },
  none: {
    status: 'none',
    label: 'Sin orden activa',
    icon: '⚪',
    bgClass: 'bg-slate-800',
    textClass: 'text-slate-400',
    borderClass: 'border-slate-700',
    pulseClass: '',
  },
};

const OPTION_LABELS = {
  size: 'Tamaño', tamano: 'Tamaño', tamaño: 'Tamaño',
  crust: 'Orilla', orilla: 'Orilla',
  notes: 'Notas', notas: 'Notas', note: 'Nota', instructions: 'Notas', instrucciones: 'Notas',
  extra: 'Extra', extras: 'Extras', toppings: 'Ingredientes', ingredientes: 'Ingredientes',
  drink: 'Bebida', bebida: 'Bebida', flavor: 'Sabor', sabor: 'Sabor',
  sauce: 'Salsa', salsa: 'Salsa', side: 'Guarnición', guarnicion: 'Guarnición',
};

export function formatCurrency(amount, includeCurrencyCode = false) {
  const num = Number(amount);
  const safe = Number.isFinite(num) ? num : 0;
  const formatted = `$${safe.toFixed(2)}`;
  return includeCurrencyCode ? `${formatted} MXN` : formatted;
}

export function formatDiscount(discount) {
  const num = Number(discount);
  const safe = Number.isFinite(num) ? Math.abs(num) : 0;
  return `-$${safe.toFixed(2)}`;
}

export function formatOrderId(orderId) {
  if (!orderId || typeof orderId !== 'string') return 'Ninguna';
  const cleanId = orderId.replace(/-/g, '');
  return `#ORD-${cleanId.slice(0, 8).toUpperCase()}`;
}

export function formatDateTime(dateInput, timeZone = 'America/Mexico_City') {
  if (!dateInput) return '—';
  try {
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('es-MX', {
      timeZone, year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(d);
  } catch {
    return '—';
  }
}

export function getStatusBadgeConfig(status) {
  const key = String(status || '').toLowerCase().trim();
  return STATUS_CONFIG[key] || STATUS_CONFIG.none;
}

export function formatPaymentMethod(method) {
  const m = String(method || '').toLowerCase().trim();
  const map = { cash: 'Efectivo', transfer: 'Transferencia SPEI', card: 'Tarjeta', pending: 'Pendiente de definir' };
  return map[m] || '—';
}

export function formatPaymentStatus(status) {
  const s = String(status || '').toLowerCase().trim();
  const map = { paid: 'Pagado', pending: 'Pendiente', failed: 'Fallido', refunded: 'Reembolsado' };
  return map[s] || '—';
}

export function formatDeliveryAddress(orderAddress, customerAddress) {
  return (orderAddress || customerAddress || '').trim() || 'No especificada aún';
}

export function parseOptions(optionsSelected) {
  if (!optionsSelected) return [];
  let parsed = optionsSelected;
  if (typeof optionsSelected === 'string') {
    const trimmed = optionsSelected.trim();
    if (!trimmed || trimmed === 'null' || trimmed === '{}' || trimmed === '[]') return [];
    try { parsed = JSON.parse(trimmed); } catch {
      return [{ key: 'notes', label: 'Notas', value: trimmed, isNote: true }];
    }
  }
  if (!parsed || typeof parsed !== 'object') return [];

  if (Array.isArray(parsed)) {
    return parsed.map(opt => {
      if (typeof opt === 'string') return { key: 'option', label: 'Opción', value: opt, isNote: false };
      const group = opt.group_name || opt.group || opt.name || opt.key || 'Opción';
      const choice = opt.choice_label || opt.choice || opt.value || opt.label || '';
      const normKey = group.toLowerCase().replace(/[^a-z0-9]/g, '');
      return {
        key: normKey,
        label: OPTION_LABELS[normKey] || group,
        value: choice,
        isNote: /note|nota|instruc|observ|coment/i.test(group) || /note|nota/i.test(normKey),
        priceModifier: typeof opt.price_modifier === 'number' ? opt.price_modifier : undefined,
      };
    });
  }

  const results = [];
  for (const [rawKey, rawVal] of Object.entries(parsed)) {
    if (rawVal === null || rawVal === undefined || rawVal === '') continue;
    const normKey = rawKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    results.push({
      key: normKey,
      label: OPTION_LABELS[normKey] || rawKey.charAt(0).toUpperCase() + rawKey.slice(1),
      value: typeof rawVal === 'object' ? JSON.stringify(rawVal) : String(rawVal),
      isNote: /note|nota|instruc|observ|coment/i.test(rawKey) || /note|nota/i.test(normKey),
    });
  }
  return results;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function renderOptionsHtml(options = []) {
  if (!options || options.length === 0) return '';
  const pills = options.map(opt => {
    const modText = opt.priceModifier && opt.priceModifier > 0 ? ` (+${formatCurrency(opt.priceModifier)})` : '';
    const text = `${opt.label}: ${opt.value}${modText}`;
    if (opt.isNote) {
      return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-950/50 text-amber-300 border border-amber-700/50 font-sans">📝 ${escapeHtml(text)}</span>`;
    }
    return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-slate-800/90 text-sky-400 border border-slate-700/80 font-sans">${escapeHtml(text)}</span>`;
  });
  return `<div class="mt-1 flex flex-wrap gap-1">${pills.join('')}</div>`;
}

export function formatKitchenClipboardSummary(order, customer, items = []) {
  if (!order) return 'Sin orden activa.';
  const orderItems = items && items.length > 0 ? items : (order.order_items || []);
  const badgeConfig = getStatusBadgeConfig(order.status);
  const orderIdText = formatOrderId(order.id);
  const dateText = formatDateTime(order.created_at || order.updated_at);
  const customerName = customer?.name || 'Cliente';
  const customerPhone = customer?.phone ? `+${customer.phone}` : '—';
  const addressText = formatDeliveryAddress(order.delivery_address, customer?.address_default);
  const paymentMethodText = formatPaymentMethod(order.payment_method);

  const itemLines = orderItems.map((item, idx) => {
    const name = item.menu_items?.name || item.name || item.product_name || item.product_id || `Ítem #${idx + 1}`;
    const qty = item.quantity || 1;
    const unitPrice = formatCurrency(item.unit_price || (item.subtotal ? item.subtotal / qty : 0));
    const subtotal = formatCurrency(item.subtotal || (item.unit_price ? item.unit_price * qty : 0));
    const opts = parseOptions(item.options_selected);
    let line = `• ${qty}x ${name} (${unitPrice} c/u -> ${subtotal})`;
    if (opts.length > 0) {
      line += '\n' + opts.map(o => `  - ${o.label}: ${o.value}`).join('\n');
    }
    return line;
  });

  return [
    '====================================', '🍕 COMANDA DE COCINA - CHATALIADO', '====================================',
    `Orden:     ${orderIdText}`, `Estado:    ${badgeConfig.label.toUpperCase()}`,
    `Fecha:     ${dateText}`, `Cliente:   ${customerName} (${customerPhone})`,
    `Dirección: ${addressText}`, '', 'ÍTEMS:', '------------------------------------',
    itemLines.length > 0 ? itemLines.join('\n') : '• (Sin productos)',
    '------------------------------------',
    `Subtotal:       ${formatCurrency(order.subtotal)}`,
    `Envío:          ${formatCurrency(order.delivery_fee)}`,
    `Descuento:      ${formatDiscount(order.discount)}`,
    `TOTAL A PAGAR:  ${formatCurrency(order.total ?? order.total_amount, true)}`,
    `Método de Pago: ${paymentMethodText}`,
    '====================================',
  ].join('\n');
}

export class KitchenUI {
  constructor(storeInstance = store) {
    this.store = storeInstance;
    this.unsubscribers = [];
    this.dom = null;
    this._copyTimeout = null;
  }

  init() {
    this.bindDom();
    if (this.store) {
      this.unsubscribers.push(
        this.store.on('order:updated', ({ activeOrder }) => this.render(activeOrder, this.store.getState().customer)),
        this.store.on('customer:updated', ({ customer }) => this.render(this.store.getState().activeOrder, customer)),
        this.store.on('phone:changed', () => this.render(this.store.getState().activeOrder, this.store.getState().customer)),
        this.store.on('state:reset', () => this.render(null, null))
      );
      const state = this.store.getState();
      this.render(state.activeOrder, state.customer);
    }
  }

  destroy() {
    for (const unsub of this.unsubscribers) {
      try { unsub(); } catch { /* ignore */ }
    }
    this.unsubscribers = [];
  }

  bindDom() {
    if (typeof document === 'undefined') return;
    this.dom = {
      panel: document.getElementById('panel-kitchen-orders'),
      statusBadge: document.getElementById('order-status-badge'),
      idLabel: document.getElementById('order-id-label'),
      createdTime: document.getElementById('order-created-time'),
      itemsCountBadge: document.getElementById('order-items-count-badge'),
      emptyState: document.getElementById('order-empty-state'),
      itemsTable: document.getElementById('order-items-table'),
      itemsTbody: document.getElementById('order-items-tbody'),
      subtotal: document.getElementById('order-subtotal'),
      deliveryFee: document.getElementById('order-delivery-fee'),
      discount: document.getElementById('order-discount'),
      totalAmount: document.getElementById('order-total-amount'),
      deliveryAddress: document.getElementById('order-delivery-address'),
      paymentMethod: document.getElementById('order-payment-method'),
      paymentStatus: document.getElementById('order-payment-status'),
      btnRefreshSync: document.getElementById('btn-refresh-sync'),
    };
    this.setupClipboardButton();
  }

  setupClipboardButton() {
    if (typeof document === 'undefined' || !this.dom?.panel) return;
    let copyBtn = document.getElementById('btn-copy-kitchen-order');
    if (!copyBtn) {
      const headerCard = this.dom.panel.querySelector('.bg-slate-900.border.border-slate-800.rounded-xl');
      if (headerCard) {
        const div = document.createElement('div');
        div.className = 'mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between';
        div.innerHTML = `
          <span class="text-[11px] text-slate-500 font-medium">📋 Resumen para Comanda</span>
          <button id="btn-copy-kitchen-order" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 rounded text-xs font-semibold text-slate-200 transition flex items-center gap-1.5 shadow-sm">
            <span id="btn-copy-icon">📋</span>
            <span id="btn-copy-text">Copiar Comanda</span>
          </button>
        `;
        headerCard.appendChild(div);
        copyBtn = document.getElementById('btn-copy-kitchen-order');
      }
    }
    if (copyBtn && !copyBtn.dataset.bound) {
      copyBtn.dataset.bound = 'true';
      copyBtn.addEventListener('click', () => this.copyKitchenSummary());
    }
  }

  render(order, customer) {
    if (!this.dom) this.bindDom();
    if (!this.dom) return;

    // 1. Status Badge
    if (this.dom.statusBadge) {
      const b = getStatusBadgeConfig(order?.status);
      this.dom.statusBadge.className = `text-xs px-2.5 py-0.5 rounded-full font-semibold border flex items-center gap-1.5 transition-all ${b.bgClass} ${b.textClass} ${b.borderClass} ${b.pulseClass}`;
      this.dom.statusBadge.innerHTML = `<span>${b.icon}</span> <span>${b.label}</span>`;
    }

    // 2. Header ID & Time
    if (this.dom.idLabel) this.dom.idLabel.textContent = formatOrderId(order?.id);
    if (this.dom.createdTime) this.dom.createdTime.textContent = formatDateTime(order?.created_at || order?.updated_at);

    // 3. Items Table & Breakdown
    const items = Array.isArray(order?.order_items) ? order.order_items : [];
    const count = items.reduce((acc, it) => acc + (Number(it.quantity) || 1), 0);
    if (this.dom.itemsCountBadge) this.dom.itemsCountBadge.textContent = count === 1 ? '1 ítem' : `${count} ítems`;

    if (items.length === 0) {
      if (this.dom.emptyState) this.dom.emptyState.classList.remove('hidden');
      if (this.dom.itemsTable) this.dom.itemsTable.classList.add('hidden');
      if (this.dom.itemsTbody) this.dom.itemsTbody.innerHTML = '';
    } else {
      if (this.dom.emptyState) this.dom.emptyState.classList.add('hidden');
      if (this.dom.itemsTable) this.dom.itemsTable.classList.remove('hidden');
      if (this.dom.itemsTbody) {
        this.dom.itemsTbody.innerHTML = items.map((item, idx) => {
          const name = item.menu_items?.name || item.name || item.product_name || item.product_id || `Producto #${idx + 1}`;
          const qty = item.quantity || 1;
          const unitPrice = item.unit_price || (item.subtotal ? item.subtotal / qty : 0);
          const lineSubtotal = item.subtotal || (item.unit_price ? item.unit_price * qty : 0);
          return `
            <tr class="border-b border-slate-800/60 hover:bg-slate-800/30 transition">
              <td class="py-2.5 pr-2 align-top"><span class="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-800 text-emerald-400 font-bold font-mono text-[11px] border border-slate-700">${qty}x</span></td>
              <td class="py-2.5 pr-2 align-top"><div class="font-semibold text-slate-200 font-sans">${escapeHtml(name)}</div>${renderOptionsHtml(parseOptions(item.options_selected))}</td>
              <td class="py-2.5 pr-2 text-right align-top text-slate-400 font-mono">${formatCurrency(unitPrice)}</td>
              <td class="py-2.5 text-right align-top font-bold text-slate-200 font-mono">${formatCurrency(lineSubtotal)}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // 4. Financial Summary
    const subtotal = order?.subtotal ?? 0;
    const delivery = order?.delivery_fee ?? 0;
    const discount = order?.discount ?? 0;
    const total = order?.total ?? order?.total_amount ?? Math.max(0, Number(subtotal) + Number(delivery) - Number(discount));

    if (this.dom.subtotal) this.dom.subtotal.textContent = formatCurrency(subtotal);
    if (this.dom.deliveryFee) this.dom.deliveryFee.textContent = formatCurrency(delivery);
    if (this.dom.discount) this.dom.discount.textContent = formatDiscount(discount);
    if (this.dom.totalAmount) this.dom.totalAmount.textContent = formatCurrency(total, true);

    // 5. Delivery & Payment Metadata
    if (this.dom.deliveryAddress) {
      this.dom.deliveryAddress.textContent = formatDeliveryAddress(order?.delivery_address, customer?.address_default);
    }
    if (this.dom.paymentMethod) this.dom.paymentMethod.textContent = formatPaymentMethod(order?.payment_method);
    if (this.dom.paymentStatus) this.dom.paymentStatus.textContent = formatPaymentStatus(order?.payment_status);
  }

  async copyKitchenSummary() {
    const state = this.store ? this.store.getState() : {};
    const text = formatKitchenClipboardSummary(state.activeOrder, state.customer);
    let copied = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch { copied = false; }

    if (!copied && typeof document !== 'undefined') {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch { copied = false; }
    }

    const txt = document.getElementById('btn-copy-text');
    const ico = document.getElementById('btn-copy-icon');
    if (txt) {
      txt.textContent = copied ? '¡Copiado! ✓' : 'Error al copiar';
      if (ico) ico.textContent = copied ? '✅' : '⚠️';
      if (this._copyTimeout) clearTimeout(this._copyTimeout);
      this._copyTimeout = setTimeout(() => {
        if (txt) txt.textContent = 'Copiar Comanda';
        if (ico) ico.textContent = '📋';
      }, 2000);
    }
    return copied;
  }
}

export const kitchenUI = new KitchenUI(store);

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => kitchenUI.init());
  } else {
    kitchenUI.init();
  }
}
