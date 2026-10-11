'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseWakeLockOptions {
  enabled?: boolean;
  onRequest?: () => void;
  onRelease?: () => void;
  onError?: (err: Error) => void;
}

export interface UseWakeLockReturn {
  isSupported: boolean;
  isActive: boolean;
  error: string | null;
  request: () => Promise<boolean>;
  release: () => Promise<boolean>;
  toggle: () => Promise<boolean>;
}

/**
 * Hook para la Screen Wake Lock API del navegador.
 * Evita que las tablets de cocina suspendan la pantalla durante el servicio.
 * Re-adquiere automáticamente el bloqueo cuando la pestaña vuelve a ser visible (visibilitychange).
 * Totalmente seguro: no lanza excepciones en navegadores no compatibles ni contextos inseguros.
 */
export function useWakeLock(options: UseWakeLockOptions = {}): UseWakeLockReturn {
  const { enabled = true, onRequest, onRelease, onError } = options;

  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const enabledRef = useRef<boolean>(enabled);
  enabledRef.current = enabled;

  // Comprobar soporte del navegador de forma segura
  useEffect(() => {
    const supported =
      typeof navigator !== 'undefined' &&
      'wakeLock' in navigator &&
      typeof navigator.wakeLock?.request === 'function';
    setIsSupported(supported);
  }, []);

  // Función para solicitar el Wake Lock
  const request = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      setError('Wake Lock API no compatible con este navegador');
      return false;
    }

    // La Screen Wake Lock API rechaza peticiones si la pestaña no es visible
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return false;
    }

    try {
      // Liberar sentinel previo si existiera
      if (sentinelRef.current && !sentinelRef.current.released) {
        await sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
      }

      const sentinel = await navigator.wakeLock.request('screen');
      sentinelRef.current = sentinel;
      setIsActive(true);
      setError(null);
      onRequest?.();

      sentinel.addEventListener('release', () => {
        setIsActive(false);
        sentinelRef.current = null;
        onRelease?.();
      });

      return true;
    } catch (err: unknown) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      setError(errObj.message);
      setIsActive(false);
      sentinelRef.current = null;
      onError?.(errObj);
      return false;
    }
  }, [onRequest, onRelease, onError]);

  // Función para liberar el Wake Lock manualmente
  const release = useCallback(async (): Promise<boolean> => {
    if (!sentinelRef.current) {
      setIsActive(false);
      return true;
    }

    try {
      await sentinelRef.current.release();
      sentinelRef.current = null;
      setIsActive(false);
      setError(null);
      return true;
    } catch (err: unknown) {
      const errObj = err instanceof Error ? err : new Error(String(err));
      setError(errObj.message);
      return false;
    }
  }, []);

  const toggle = useCallback(async (): Promise<boolean> => {
    if (isActive) {
      return release();
    } else {
      return request();
    }
  }, [isActive, request, release]);

  // Re-adquisición automática en visibilitychange
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        enabledRef.current &&
        (!sentinelRef.current || sentinelRef.current.released)
      ) {
        void request();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [request]);

  // Manejo del ciclo de vida según el prop `enabled`
  useEffect(() => {
    if (enabled && isSupported) {
      void request();
    } else if (!enabled && sentinelRef.current) {
      void release();
    }

    return () => {
      if (sentinelRef.current && !sentinelRef.current.released) {
        void sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
      }
    };
  }, [enabled, isSupported, request, release]);

  return {
    isSupported,
    isActive,
    error,
    request,
    release,
    toggle,
  };
}