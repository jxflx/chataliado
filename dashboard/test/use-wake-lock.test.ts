import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { useWakeLock } from '../src/hooks/use-wake-lock';

class HookHarness<TProps, TResult> {
  private hookFn: (props: TProps) => TResult;
  private props: TProps;
  private hookIndex = 0;
  private hooksState: any[] = [];
  private effectCleanups: (() => void)[] = [];
  private pendingEffects: (() => void | (() => void))[] = [];
  public result!: TResult;

  constructor(hookFn: (props: TProps) => TResult, initialProps: TProps) {
    this.hookFn = hookFn;
    this.props = initialProps;
    this.render();
  }

  public render(): void {
    this.hookIndex = 0;

    const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
                      (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

    const prevDispatcher = internals.H !== undefined ? internals.H : internals.ReactCurrentDispatcher?.current;

    const testDispatcher = {
      useState: (initial: any) => {
        const idx = this.hookIndex++;
        if (this.hooksState[idx] === undefined) {
          this.hooksState[idx] = typeof initial === 'function' ? initial() : initial;
        }
        const setState = (action: any) => {
          const next = typeof action === 'function' ? action(this.hooksState[idx]) : action;
          if (next !== this.hooksState[idx]) {
            this.hooksState[idx] = next;
            this.render();
          }
        };
        return [this.hooksState[idx], setState];
      },
      useRef: (initial: any) => {
        const idx = this.hookIndex++;
        if (this.hooksState[idx] === undefined) {
          this.hooksState[idx] = { current: initial };
        }
        return this.hooksState[idx];
      },
      useMemo: (factory: () => any, deps?: any[]) => {
        const idx = this.hookIndex++;
        const prev = this.hooksState[idx];
        if (!prev || !deps || deps.some((d, i) => d !== prev.deps[i])) {
          const value = factory();
          this.hooksState[idx] = { value, deps };
          return value;
        }
        return prev.value;
      },
      useCallback: (fn: any, deps: any[]) => {
        const idx = this.hookIndex++;
        const prev = this.hooksState[idx];
        if (!prev || !deps || deps.some((d, i) => d !== prev.deps[i])) {
          this.hooksState[idx] = { fn, deps };
          return fn;
        }
        return prev.fn;
      },
      useEffect: (effect: () => void | (() => void), deps?: any[]) => {
        const idx = this.hookIndex++;
        const prev = this.hooksState[idx];
        if (!prev || !deps || deps.some((d, i) => d !== prev.deps[i])) {
          this.hooksState[idx] = { deps, effect };
          this.pendingEffects.push(effect);
        }
      },
    };

    if (internals.H !== undefined) internals.H = testDispatcher;
    if (internals.ReactCurrentDispatcher) internals.ReactCurrentDispatcher.current = testDispatcher;

    try {
      this.result = this.hookFn(this.props);
    } finally {
      if (internals.H !== undefined) internals.H = prevDispatcher;
      if (internals.ReactCurrentDispatcher) internals.ReactCurrentDispatcher.current = prevDispatcher;
    }

    const effectsToRun = [...this.pendingEffects];
    this.pendingEffects = [];
    for (const effect of effectsToRun) {
      const cleanup = effect();
      if (typeof cleanup === 'function') {
        this.effectCleanups.push(cleanup);
      }
    }
  }

  public unmount(): void {
    for (const cleanup of this.effectCleanups) {
      try {
        cleanup();
      } catch {}
    }
    this.effectCleanups = [];
  }
}

function renderHook<TProps, TResult>(hookFn: (props: TProps) => TResult, initialProps: TProps = {} as TProps) {
  const harness = new HookHarness(hookFn, initialProps);
  return {
    get current() {
      return harness.result;
    },
    unmount: () => harness.unmount(),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const mockEventListeners: Record<string, Function[]> = {};
const mockDocument = {
  visibilityState: 'visible',
  addEventListener: vi.fn((event: string, cb: Function) => {
    mockEventListeners[event] = mockEventListeners[event] || [];
    mockEventListeners[event].push(cb);
  }),
  removeEventListener: vi.fn((event: string, cb: Function) => {
    if (mockEventListeners[event]) {
      mockEventListeners[event] = mockEventListeners[event].filter((f) => f !== cb);
    }
  }),
  dispatchEvent: (event: any) => {
    const cbs = mockEventListeners[event.type || event] || [];
    cbs.forEach((cb) => cb(event));
    return true;
  },
};

describe('useWakeLock Hook (Kitchen Ergonomics & Screen Keep-Awake)', () => {
  const originalNavigator = global.navigator;
  const originalDocument = (global as any).document;

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockEventListeners)) {
      delete mockEventListeners[key];
    }
    (global as any).document = mockDocument;
  });

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
    (global as any).document = originalDocument;
  });

  it('debe indicar isSupported=false y no lanzar excepciones si wakeLock no existe', async () => {
    Object.defineProperty(global, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });

    const hook = renderHook(() => useWakeLock({ enabled: false }));

    expect(hook.current.isSupported).toBe(false);
    expect(hook.current.isActive).toBe(false);

    const success = await hook.current.request();
    expect(success).toBe(false);
    expect(hook.current.error).toContain('no compatible');
  });

  it('debe solicitar exitosamente el bloqueo de pantalla cuando la API está presente', async () => {
    const mockSentinel = {
      released: false,
      release: vi.fn(async () => {
        mockSentinel.released = true;
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    const mockRequest = vi.fn(async () => mockSentinel);

    Object.defineProperty(global, 'navigator', {
      value: {
        wakeLock: {
          request: mockRequest,
        },
      },
      configurable: true,
      writable: true,
    });

    const onRequest = vi.fn();
    const hook = renderHook(() => useWakeLock({ enabled: false, onRequest }));

    expect(hook.current.isSupported).toBe(true);
    expect(hook.current.isActive).toBe(false);

    const ok = await hook.current.request();
    expect(ok).toBe(true);
    expect(mockRequest).toHaveBeenCalledWith('screen');
    expect(hook.current.isActive).toBe(true);
    expect(onRequest).toHaveBeenCalled();

    // Liberar manualmente
    await hook.current.release();
    expect(mockSentinel.release).toHaveBeenCalled();
    expect(hook.current.isActive).toBe(false);
  });

  it('debe re-adquirir el Wake Lock automáticamente al cambiar visibilitychange a visible', async () => {
    let releaseCallback: (() => void) | null = null;

    const mockSentinel = {
      released: false,
      release: vi.fn(async () => {
        mockSentinel.released = true;
      }),
      addEventListener: vi.fn((event, cb) => {
        if (event === 'release') releaseCallback = cb;
      }),
      removeEventListener: vi.fn(),
    };

    const mockRequest = vi.fn(async () => mockSentinel);

    Object.defineProperty(global, 'navigator', {
      value: {
        wakeLock: {
          request: mockRequest,
        },
      },
      configurable: true,
      writable: true,
    });

    const hook = renderHook(() => useWakeLock({ enabled: true }));
    await sleep(10);

    expect(mockRequest).toHaveBeenCalledTimes(1);

    // Simular que el navegador libera el wake lock
    if (releaseCallback) (releaseCallback as any)();
    expect(hook.current.isActive).toBe(false);

    // Simular que el cocinero vuelve a la pestaña visible
    mockDocument.visibilityState = 'visible';
    mockDocument.dispatchEvent({ type: 'visibilitychange' });
    await sleep(10);

    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('debe manejar de forma defensiva errores al solicitar el bloqueo', async () => {
    const onError = vi.fn();
    const mockRequest = vi.fn(async () => {
      throw new Error('NotAllowedError: Wake Lock denied by battery saver');
    });

    Object.defineProperty(global, 'navigator', {
      value: {
        wakeLock: {
          request: mockRequest,
        },
      },
      configurable: true,
      writable: true,
    });

    const hook = renderHook(() => useWakeLock({ enabled: false, onError }));

    const ok = await hook.current.request();
    expect(ok).toBe(false);
    expect(hook.current.isActive).toBe(false);
    expect(hook.current.error).toContain('NotAllowedError');
    expect(onError).toHaveBeenCalled();
  });
});