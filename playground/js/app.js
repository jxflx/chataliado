/**
 * ChatAliado Playground - Application Orchestrator & Bootstrap Controller
 * Connects reactive store, API client, UI controllers, health checks, background polling,
 * settings modal, toast notifications, and tab visibility handling.
 *
 * STRICTLY DEV_ONLY - NEVER DEPLOY TO PRODUCTION
 */

import {
  CONFIG,
  DEFAULT_CONFIG,
  loadCustomConfig,
  saveCustomConfig,
  resetConfig,
} from '../config.js';
import { store } from './store.js';
import { apiClient } from './api.js';
import { chatUI } from './chat-ui.js';
import { kitchenUI } from './kitchen-ui.js';
import { debuggerUI } from './debugger-ui.js';

/**
 * Creates and displays a toast notification in the UI.
 * @param {string} message - Notification text
 * @param {'info' | 'success' | 'error' | 'warning'} [type='info'] - Notification type
 * @param {number} [durationMs=3000] - Duration in milliseconds before auto-dismiss
 * @returns {HTMLElement | null} The created toast element (if DOM available)
 */
export function showToast(message, type = 'info', durationMs = 3000) {
  if (typeof document === 'undefined') return null;

  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className =
      'fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className =
    'toast-item pointer-events-auto flex items-center justify-between p-3 rounded-xl border text-xs shadow-2xl backdrop-blur-md transition-all duration-300 transform translate-y-2 opacity-0';

  let icon = 'ℹ️';
  let colorClasses = 'bg-slate-900/95 border-sky-500/40 text-slate-100';

  if (type === 'success') {
    icon = '✅';
    colorClasses = 'bg-emerald-950/95 border-emerald-500/50 text-emerald-100';
  } else if (type === 'error') {
    icon = '❌';
    colorClasses = 'bg-rose-950/95 border-rose-500/50 text-rose-100';
  } else if (type === 'warning') {
    icon = '⚠️';
    colorClasses = 'bg-amber-950/95 border-amber-500/50 text-amber-100';
  }

  toast.className += ` ${colorClasses}`;
  toast.innerHTML = `
    <div class="flex items-center space-x-2.5 mr-2">
      <span class="text-base shrink-0">${icon}</span>
      <span class="font-medium leading-tight">${escapeHtml(message)}</span>
    </div>
    <button class="btn-dismiss-toast text-slate-400 hover:text-white p-1 text-sm font-bold shrink-0 leading-none">&times;</button>
  `;

  container.appendChild(toast);

  // Trigger entrance animation
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
  });

  const dismiss = () => {
    toast.classList.remove('translate-y-0', 'opacity-100');
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 300);
  };

  const closeBtn = toast.querySelector('.btn-dismiss-toast');
  if (closeBtn) {
    closeBtn.addEventListener('click', dismiss);
  }

  if (durationMs > 0) {
    const timer = setTimeout(dismiss, durationMs);
    if (typeof timer?.unref === 'function') {
      timer.unref();
    }
  }

  return toast;
}

if (typeof window !== 'undefined') {
  window.showToast = showToast;
}

/**
 * Escapes HTML entities.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Main Application Orchestrator Class.
 */
export class AppOrchestrator {
  constructor(options = {}) {
    this.config = options.config || CONFIG;
    this.store = options.store || store;
    this.apiClient = options.apiClient || apiClient;
    this.chatUI = options.chatUI || chatUI;
    this.kitchenUI = options.kitchenUI || kitchenUI;
    this.debuggerUI = options.debuggerUI || debuggerUI;

    this.pollTimer = null;
    this.isInitialized = false;
    this.isTabHidden = false;
    this.restaurantsList = [];
    this._unsubscribers = [];

    this._handleVisibilityChange = this._handleVisibilityChange.bind(this);
    this._handleRestaurantSelectChange = this._handleRestaurantSelectChange.bind(this);
    this._handleManualSyncClick = this._handleManualSyncClick.bind(this);
    this._handleSettingsSubmit = this._handleSettingsSubmit.bind(this);
    this._handleSettingsReset = this._handleSettingsReset.bind(this);
  }

  /**
   * Initializes the application.
   */
  async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // 1. Ensure custom config is loaded
    loadCustomConfig();

    // 2. Bind DOM event listeners
    this.bindDOMEvents();

    // 3. Initialize sub-controllers
    if (typeof this.chatUI?.init === 'function') this.chatUI.init();
    if (typeof this.kitchenUI?.init === 'function') this.kitchenUI.init();
    if (typeof this.debuggerUI?.init === 'function') this.debuggerUI.init();

    // 4. Populate restaurants list
    await this.populateRestaurants();

    // 5. Initial health checks
    await this.checkHealth();

    // 6. Initial data sync for active phone
    await this.syncActiveClient();

    // 7. Start periodic background sync timer
    this.startPolling();

    // 8. Welcome toast
    if (typeof document !== 'undefined') {
      showToast('Playground inicializado en modo DEV_ONLY', 'info', 2500);
    }
  }

  /**
   * Cleans up timers, listeners, and resources.
   */
  destroy() {
    this.stopPolling();

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._handleVisibilityChange);
    }

    for (const unsub of this._unsubscribers) {
      try {
        unsub();
      } catch {
        // ignore
      }
    }
    this._unsubscribers = [];
    this.isInitialized = false;
  }

  /**
   * Binds global DOM event listeners.
   */
  bindDOMEvents() {
    if (typeof document === 'undefined') return;

    // Visibility change (pause/resume polling)
    document.addEventListener('visibilitychange', this._handleVisibilityChange);

    // Restaurant dropdown change
    const restaurantSelect = document.getElementById('restaurant-select');
    if (restaurantSelect) {
      restaurantSelect.addEventListener('change', this._handleRestaurantSelectChange);
    }

    // Manual Refresh/Sync Button
    const refreshBtn = document.getElementById('btn-refresh-sync');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', this._handleManualSyncClick);
    }

    // Settings Modal Open/Close
    const openSettingsBtn = document.getElementById('btn-open-settings');
    const closeSettingsBtn = document.getElementById('btn-close-settings');
    const cancelSettingsBtn = document.getElementById('btn-cancel-settings');
    const settingsModal = document.getElementById('settings-modal');

    if (openSettingsBtn) {
      openSettingsBtn.addEventListener('click', () => this.openSettingsModal());
    }
    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener('click', () => this.closeSettingsModal());
    }
    if (cancelSettingsBtn) {
      cancelSettingsBtn.addEventListener('click', () => this.closeSettingsModal());
    }
    if (settingsModal) {
      settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) this.closeSettingsModal();
      });
    }

    // Escape key closes modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeSettingsModal();
      }
    });

    // Settings Form Submit & Reset
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('submit', this._handleSettingsSubmit);
    }

    const resetSettingsBtn = document.getElementById('btn-reset-settings');
    if (resetSettingsBtn) {
      resetSettingsBtn.addEventListener('click', this._handleSettingsReset);
    }
  }

  /**
   * Fetches and populates the restaurant dropdown.
   */
  async populateRestaurants() {
    if (typeof document === 'undefined') return;
    const select = document.getElementById('restaurant-select');
    if (!select) return;

    try {
      const restaurants = await this.apiClient.fetchRestaurants();
      if (Array.isArray(restaurants) && restaurants.length > 0) {
        this.restaurantsList = restaurants;
        select.innerHTML = restaurants
          .map(
            (r) =>
              `<option value="${escapeHtml(r.slug)}" ${
                r.slug === this.config.DEFAULT_RESTAURANT_SLUG ? 'selected' : ''
              }>${escapeHtml(r.name)} (${escapeHtml(r.slug)})</option>`
          )
          .join('');

        const selected = restaurants.find((r) => r.slug === this.config.DEFAULT_RESTAURANT_SLUG);
        if (selected) {
          this.store.setRestaurant({
            id: selected.id,
            slug: selected.slug,
            name: selected.name,
          });
        }
      } else {
        // Fallback default options
        this.restaurantsList = [
          {
            id: this.config.DEFAULT_RESTAURANT_ID,
            slug: this.config.DEFAULT_RESTAURANT_SLUG,
            name: this.config.DEFAULT_RESTAURANT_NAME || 'Pizzería Don Giovanni',
          },
        ];
      }
    } catch (err) {
      console.warn('[App] Failed to fetch restaurants, using defaults:', err);
    }
  }

  /**
   * Handles restaurant dropdown selection change.
   */
  async _handleRestaurantSelectChange(e) {
    const slug = e.target.value;
    const found = this.restaurantsList.find((r) => r.slug === slug);
    const restaurant = found || {
      id: this.config.DEFAULT_RESTAURANT_ID,
      slug,
      name: slug,
    };

    this.store.setRestaurant(restaurant);
    showToast(`Restaurante cambiado a "${restaurant.name}"`, 'info');
    await this.syncActiveClient(false);
  }

  /**
   * Performs concurrent health checks for Worker and Supabase.
   */
  async checkHealth() {
    try {
      const [workerHealth, supabaseHealth] = await Promise.all([
        this.apiClient.checkWorkerHealth(),
        this.apiClient.checkSupabaseHealth(),
      ]);

      this.updateWorkerStatusBadge(workerHealth.ok, workerHealth.status);
      this.updateSupabaseStatusBadge(supabaseHealth.ok, supabaseHealth.status);

      this.store.updateState({
        workerOnline: workerHealth.ok,
        supabaseOnline: supabaseHealth.ok,
      });

      return { workerHealth, supabaseHealth };
    } catch (err) {
      console.warn('[App] Error during health checks:', err);
      this.updateWorkerStatusBadge(false, 0);
      this.updateSupabaseStatusBadge(false, 0);
      return { workerHealth: { ok: false }, supabaseHealth: { ok: false } };
    }
  }

  /**
   * Updates Worker Status Pill in header.
   */
  updateWorkerStatusBadge(isOnline, status = 200) {
    if (typeof document === 'undefined') return;

    const dot = document.getElementById('worker-status-dot');
    const text = document.getElementById('worker-status-text');
    const badge = document.getElementById('worker-status-badge');

    if (dot) {
      dot.className = isOnline
        ? 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse'
        : 'w-2 h-2 rounded-full bg-rose-500';
    }
    if (text) {
      text.textContent = isOnline ? 'Online (200)' : 'Offline';
      text.className = isOnline ? 'font-mono text-emerald-400' : 'font-mono text-rose-400';
    }
    if (badge) {
      badge.className = isOnline
        ? 'flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-800 border border-emerald-500/30 text-slate-300'
        : 'flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-800 border border-rose-500/30 text-slate-300';
    }
  }

  /**
   * Updates Supabase Status Pill in header.
   */
  updateSupabaseStatusBadge(isOnline, status = 200) {
    if (typeof document === 'undefined') return;

    const dot = document.getElementById('supabase-status-dot');
    const text = document.getElementById('supabase-status-text');
    const badge = document.getElementById('supabase-status-badge');

    if (dot) {
      dot.className = isOnline
        ? 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse'
        : 'w-2 h-2 rounded-full bg-rose-500';
    }
    if (text) {
      text.textContent = isOnline ? 'Connected' : 'Disconnected';
      text.className = isOnline ? 'font-mono text-emerald-400' : 'font-mono text-rose-400';
    }
    if (badge) {
      badge.className = isOnline
        ? 'hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-800 border border-emerald-500/30 text-slate-300'
        : 'hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-800 border border-rose-500/30 text-slate-300';
    }
  }

  /**
   * Orchestrates active client sync from Supabase.
   * @param {boolean} [showToastFeedback=false]
   */
  async syncActiveClient(showToastFeedback = false) {
    const state = this.store.getState();
    const phone = state.activePhone;
    const rId = state.restaurant?.id || this.config.DEFAULT_RESTAURANT_ID;
    const rSlug = state.restaurant?.slug || this.config.DEFAULT_RESTAURANT_SLUG;

    if (!phone || !rId) return;

    this.store.setSyncing(true);
    try {
      const data = await this.apiClient.syncAll(phone, rId, rSlug);
      if (this.store.getState().activePhone !== phone) return; // Guard against race conditions
      this.store.updateState({
        customer: data.customer,
        conversation: data.conversation,
        messages: data.messages,
        activeOrder: data.order,
        toolExecutions: this.store.parseToolExecutions(data.messages),
        supabaseOnline: true,
      });

      this.updateSupabaseStatusBadge(true, 200);

      if (showToastFeedback) {
        showToast('Datos sincronizados con éxito', 'success', 2000);
      }
    } catch (err) {
      console.warn('[App] syncActiveClient error:', err);
      this.store.updateState({ supabaseOnline: false });
      this.updateSupabaseStatusBadge(false, 0);
      if (showToastFeedback) {
        showToast('Error al sincronizar con Supabase', 'error', 3000);
      }
    } finally {
      this.store.setSyncing(false);
    }
  }

  /**
   * Handles Manual Sync Button click.
   */
  async _handleManualSyncClick() {
    const spinner = document.getElementById('sync-spinner-icon');
    const text = document.getElementById('sync-button-text');
    const btn = document.getElementById('btn-refresh-sync');

    if (spinner) spinner.classList.add('animate-spin');
    if (text) text.textContent = 'Syncing...';
    if (btn) btn.disabled = true;

    try {
      await Promise.all([this.syncActiveClient(true), this.checkHealth()]);
    } finally {
      if (spinner) spinner.classList.remove('animate-spin');
      if (text) text.textContent = 'Sync';
      if (btn) btn.disabled = false;
    }
  }

  /**
   * Starts periodic polling timer.
   */
  startPolling() {
    this.stopPolling();
    const interval = this.config.POLL_INTERVAL_MS || 3000;
    this.pollTimer = setInterval(async () => {
      if (!this.isTabHidden && !this.store.getState().isSending) {
        await this.syncActiveClient(false);
      }
    }, interval);
    if (typeof this.pollTimer?.unref === 'function') {
      this.pollTimer.unref();
    }
  }

  /**
   * Stops periodic polling timer.
   */
  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Restarts polling with updated interval.
   */
  restartPolling() {
    this.stopPolling();
    this.startPolling();
  }

  /**
   * Handles window / tab visibility changes.
   */
  _handleVisibilityChange() {
    if (typeof document === 'undefined') return;

    if (document.hidden) {
      this.isTabHidden = true;
      this.stopPolling();
    } else {
      this.isTabHidden = false;
      this.syncActiveClient(false);
      this.checkHealth();
      this.startPolling();
    }
  }

  /**
   * Opens Settings Modal and populates current configuration.
   */
  openSettingsModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    const wUrl = document.getElementById('setting-worker-url');
    const wKey = document.getElementById('setting-worker-key');
    const sUrl = document.getElementById('setting-supabase-url');
    const sKey = document.getElementById('setting-supabase-key');
    const rSlug = document.getElementById('setting-restaurant-slug');
    const pInt = document.getElementById('setting-poll-interval');

    if (wUrl) wUrl.value = this.config.WORKER_URL || '';
    if (wKey) wKey.value = this.config.WORKER_API_KEY || '';
    if (sUrl) sUrl.value = this.config.SUPABASE_URL || '';
    if (sKey) sKey.value = this.config.SUPABASE_KEY || '';
    if (rSlug) rSlug.value = this.config.DEFAULT_RESTAURANT_SLUG || '';
    if (pInt) pInt.value = this.config.POLL_INTERVAL_MS || 3000;

    modal.classList.remove('hidden');
    wUrl?.focus();
  }

  /**
   * Closes Settings Modal.
   */
  closeSettingsModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.add('hidden');
  }

  /**
   * Saves Settings form values and updates active configuration.
   */
  async _handleSettingsSubmit(e) {
    e.preventDefault();

    const wUrl = document.getElementById('setting-worker-url')?.value?.trim();
    const wKey = document.getElementById('setting-worker-key')?.value?.trim();
    const sUrl = document.getElementById('setting-supabase-url')?.value?.trim();
    const sKey = document.getElementById('setting-supabase-key')?.value?.trim();
    const rSlug = document.getElementById('setting-restaurant-slug')?.value?.trim();
    const pInt = Number(document.getElementById('setting-poll-interval')?.value) || 3000;

    const updated = {
      ...(wUrl ? { WORKER_URL: wUrl } : {}),
      ...(wKey ? { WORKER_API_KEY: wKey } : {}),
      ...(sUrl ? { SUPABASE_URL: sUrl } : {}),
      ...(sKey ? { SUPABASE_KEY: sKey } : {}),
      ...(rSlug ? { DEFAULT_RESTAURANT_SLUG: rSlug } : {}),
      POLL_INTERVAL_MS: Math.max(1000, pInt),
    };

    saveCustomConfig(updated);
    this.closeSettingsModal();
    showToast('Configuración guardada exitosamente', 'success');

    this.restartPolling();
    await this.checkHealth();
    await this.syncActiveClient(true);
  }

  /**
   * Resets Settings to default configuration.
   */
  async _handleSettingsReset() {
    resetConfig();
    this.closeSettingsModal();
    showToast('Configuración restablecida a valores por defecto', 'warning');

    this.restartPolling();
    await this.checkHealth();
    await this.syncActiveClient(true);
  }
}

// Singleton app orchestrator instance
export const app = new AppOrchestrator();

// Auto-bootstrap in browser environment
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
  } else {
    app.init();
  }
}
