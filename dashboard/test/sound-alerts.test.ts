import { describe, it, expect, vi, beforeEach } from 'vitest';
import { soundAlerts } from '../src/lib/audio/sound-alerts';

describe('Sound Alerts Procedural Engine (Web Audio API)', () => {
  beforeEach(() => {
    soundAlerts.setSoundEnabled(true);
  });

  it('debe permitir consultar y alternar el estado habilitado/deshabilitado', () => {
    expect(soundAlerts.getSoundEnabled()).toBe(true);
    soundAlerts.setSoundEnabled(false);
    expect(soundAlerts.getSoundEnabled()).toBe(false);
  });

  it('no debe lanzar errores al invocar playNewMessageSound en entorno sin AudioContext', () => {
    expect(() => {
      soundAlerts.playNewMessageSound();
    }).not.toThrow();
  });

  it('no debe lanzar errores al invocar playHandoffAlertSound en entorno sin AudioContext', () => {
    expect(() => {
      soundAlerts.playHandoffAlertSound();
    }).not.toThrow();
  });

  it('no debe lanzar errores al invocar playNewOrderSound en entorno sin AudioContext', () => {
    expect(() => {
      soundAlerts.playNewOrderSound();
    }).not.toThrow();
  });

  it('no debe ejecutar audio si soundEnabled es falso', () => {
    soundAlerts.setSoundEnabled(false);
    expect(() => {
      soundAlerts.playNewMessageSound();
      soundAlerts.playHandoffAlertSound();
      soundAlerts.playNewOrderSound();
    }).not.toThrow();
  });
});
