/**
 * ChatAliado Playground - Configuration
 * STRICTLY DEV_ONLY - NEVER DEPLOY TO PRODUCTION
 */

export const DEFAULT_CONFIG = {
  DEV_ONLY: true,
  WORKER_URL:
    typeof window !== 'undefined' && window.location && window.location.origin
      ? `${window.location.origin}/webhook/evolution`
      : 'http://localhost:8787/webhook/evolution',
  WORKER_API_KEY: 'test-evo-api-key',
  DEFAULT_RESTAURANT_SLUG: 'don-giovanni',
  DEFAULT_RESTAURANT_ID: 'a0000000-0000-0000-0000-000000000001',
  DEFAULT_RESTAURANT_NAME: 'Pizzería Don Giovanni',
  SUPABASE_URL: 'https://your-project.supabase.co',
  SUPABASE_KEY: 'your-supabase-service-role-key-placeholder',
  POLL_INTERVAL_MS: 3000,
  BURST_POLL_INTERVAL_MS: 600,
  BURST_POLL_COUNT: 8,
};

const STORAGE_KEY = 'chataliado_playground_config';

/**
 * Safely retrieves localStorage reference across browser and test environments.
 * @returns {Storage | null}
 */
function getStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // Storage access may be restricted
  }
  return null;
}

/**
 * Mutable active configuration object.
 */
export const CONFIG = { ...DEFAULT_CONFIG };

/**
 * Loads custom configuration from localStorage if available,
 * merging it over the default configuration.
 * @returns {typeof CONFIG} The current merged configuration.
 */
export function loadCustomConfig() {
  const storage = getStorage();
  if (storage) {
    try {
      const stored = storage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.assign(CONFIG, DEFAULT_CONFIG, parsed);
        return CONFIG;
      }
    } catch (err) {
      console.warn('[Config] Failed to parse custom config from localStorage:', err);
    }
  }
  Object.assign(CONFIG, DEFAULT_CONFIG);
  return CONFIG;
}

/**
 * Saves partial or full custom configuration to localStorage and updates CONFIG.
 * @param {Partial<typeof DEFAULT_CONFIG>} newConfig
 * @returns {typeof CONFIG} The updated configuration.
 */
export function saveCustomConfig(newConfig) {
  Object.assign(CONFIG, newConfig);
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(CONFIG));
    } catch (err) {
      console.error('[Config] Failed to save custom config to localStorage:', err);
    }
  }
  return CONFIG;
}

/**
 * Resets configuration to default values and clears localStorage.
 * @returns {typeof CONFIG} The reset configuration.
 */
export function resetConfig() {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn('[Config] Failed to remove custom config from localStorage:', err);
    }
  }
  for (const key of Object.keys(CONFIG)) {
    delete CONFIG[key];
  }
  Object.assign(CONFIG, DEFAULT_CONFIG);
  return CONFIG;
}

// Automatically load custom config upon module evaluation
loadCustomConfig();
