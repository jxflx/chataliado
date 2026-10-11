/**
 * Motor de alertas sonoras procedurales mediante Web Audio API.
 * 100% Serverless y Offline: 0 costo de ancho de banda y 0ms de latencia de red.
 */

const SOUND_STORAGE_KEY = 'chataliado_sound_enabled';

class SoundAlertManager {
  private audioCtx: AudioContext | null = null;
  private isEnabled: boolean = true;
  private hasGestureListener: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(SOUND_STORAGE_KEY);
        this.isEnabled = stored !== null ? stored === 'true' : true;
      } catch {
        this.isEnabled = true;
      }
    }
    this.setupGestureUnlock();
  }

  /**
   * Registra listeners para reanudar el AudioContext al primer gesto del usuario
   * bajo las políticas de autoplay de los navegadores.
   */
  public setupGestureUnlock(): void {
    if (typeof window === 'undefined' || this.hasGestureListener) return;
    this.hasGestureListener = true;

    const unlockAudio = () => {
      try {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          void this.audioCtx.resume().catch(() => {});
        }
      } catch {}
      if (typeof window !== 'undefined') {
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
      }
      this.hasGestureListener = false;
    };

    window.addEventListener('click', unlockAudio, { once: true, passive: true });
    window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
    window.addEventListener('keydown', unlockAudio, { once: true, passive: true });
  }

  /**
   * Obtiene o inicializa perezosamente el AudioContext.
   * Maneja politicas de autoplay de navegadores reanudando contextos suspendidos.
   */
  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    this.setupGestureUnlock();

    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return null;

      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioCtxClass();
      }

      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume().catch(() => {});
      }

      return this.audioCtx;
    } catch {
      return null;
    }
  }

  /**
   * Consulta si las alertas sonoras estan activas.
   */
  public getSoundEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Activa o desactiva las alertas sonoras y persiste la preferencia.
   */
  public setSoundEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
      } catch {
        // Ignorar fallos de cuota o permisos restringidos en localStorage
      }
    }
  }

  /**
   * Reproduce un chime suave para nuevos mensajes entrantes.
   * Frecuencias: 880Hz (A5) -> 1320Hz (E6) con decaimiento suave.
   */
  public playNewMessageSound(): void {
    if (!this.isEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch {
      // Ignorar fallos transitorios de audio en navegadores restrictivos
    }
  }

  /**
   * Reproduce una alarma distintiva de 3 tonos cuando la IA transfiere a un humano (Handoff Trigger).
   * Frecuencias: D5 (587Hz) -> F#5 (740Hz) -> A5 (880Hz)
   */
  public playHandoffAlertSound(): void {
    if (!this.isEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const notes = [587.33, 739.99, 880.0];
      const now = ctx.currentTime;

      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + index * 0.1;
        const stopTime = startTime + 0.12;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.2, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, stopTime);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(stopTime);
      });
    } catch {
      // Ignorar fallos de Web Audio
    }
  }

  /**
   * Reproduce una campana/chime de cocina brillante al entrar un nuevo pedido confirmado desde WhatsApp.
   * Frecuencias armónicas: C5 (523.25Hz) -> G5 (783.99Hz) -> C6 (1046.50Hz)
   * Diseñado con decadencia exponencial para sonar como campana de comanda de cocina profesional.
   */
  public playNewOrderSound(): void {
    if (!this.isEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const notes = [
        { freq: 523.25, start: 0, duration: 0.25, gain: 0.25 },
        { freq: 783.99, start: 0.12, duration: 0.35, gain: 0.25 },
        { freq: 1046.50, start: 0.24, duration: 0.45, gain: 0.30 },
      ];
      const now = ctx.currentTime;

      notes.forEach(({ freq, start, duration, gain: peakGain }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + start;
        const stopTime = startTime + duration;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(peakGain, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, stopTime);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(stopTime);
      });
    } catch {
      // Ignorar fallos transitorios de audio en navegadores restrictivos
    }
  }
}

// Instancia singleton para el cliente
export const soundAlerts = new SoundAlertManager();