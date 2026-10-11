import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  isPhoneWhitelisted,
  isMessageAgeValid,
} from '../src/webhooks/security-filters';

describe('Security Filters & Access Control (Whitelist & Anti-Storm)', () => {
  describe('normalizePhone', () => {
    it('debe limpiar caracteres no numéricos (+, -, espacios, paréntesis)', () => {
      expect(normalizePhone('+52 (55) 1234-5678')).toBe('525512345678');
      expect(normalizePhone('  +52-1-55-9876-5432 ')).toBe('525598765432');
    });

    it('debe normalizar números móviles mexicanos de 13 dígitos (521XXXXXXXXXX -> 52XXXXXXXXXX)', () => {
      expect(normalizePhone('5215512345678')).toBe('525512345678');
      expect(normalizePhone('+52 1 55 1234 5678')).toBe('525512345678');
    });

    it('debe mantener números de 10 dígitos nacionales sin modificar', () => {
      expect(normalizePhone('5512345678')).toBe('5512345678');
    });

    it('debe retornar cadena vacía para inputs inválidos o vacíos', () => {
      expect(normalizePhone('')).toBe('');
      expect(normalizePhone('abc---')).toBe('');
    });
  });

  describe('isPhoneWhitelisted', () => {
    it('debe permitir todos los números si la lista blanca no está definida o está vacía', () => {
      expect(isPhoneWhitelisted('5215512345678', undefined)).toBe(true);
      expect(isPhoneWhitelisted('5215512345678', null)).toBe(true);
      expect(isPhoneWhitelisted('5215512345678', '')).toBe(true);
      expect(isPhoneWhitelisted('5215512345678', '   ')).toBe(true);
      expect(isPhoneWhitelisted('5215512345678', '*')).toBe(true);
    });

    it('debe autorizar un número cuando coincide con la lista blanca en formato nacional (10 dígitos)', () => {
      const whitelist = '5512345678';
      // Mismo número en distintos formatos de WhatsApp
      expect(isPhoneWhitelisted('5215512345678', whitelist)).toBe(true);
      expect(isPhoneWhitelisted('525512345678', whitelist)).toBe(true);
      expect(isPhoneWhitelisted('+52 1 55 1234 5678', whitelist)).toBe(true);
      expect(isPhoneWhitelisted('5512345678', whitelist)).toBe(true);
    });

    it('debe autorizar cuando la lista blanca contiene múltiples números separados por coma o espacio', () => {
      const whitelist = '5511111111, 5522222222, +52 1 55 3333 3333';
      expect(isPhoneWhitelisted('5215511111111', whitelist)).toBe(true);
      expect(isPhoneWhitelisted('5215522222222', whitelist)).toBe(true);
      expect(isPhoneWhitelisted('525533333333', whitelist)).toBe(true);
    });

    it('debe rechazar números que no estén en la lista blanca', () => {
      const whitelist = '5512345678, 5587654321';
      expect(isPhoneWhitelisted('5215599999999', whitelist)).toBe(false);
      expect(isPhoneWhitelisted('5215500000000', whitelist)).toBe(false);
      expect(isPhoneWhitelisted('1234567890', whitelist)).toBe(false);
    });
  });

  describe('isMessageAgeValid (Anti-Storm Historical Message Filter)', () => {
    const fixedNow = 1724600000; // Timestamp de referencia en segundos

    it('debe aceptar mensajes recientes dentro del límite por defecto (120s)', () => {
      const result = isMessageAgeValid(fixedNow - 30, 120, fixedNow);
      expect(result.isValid).toBe(true);
      expect(result.ageSeconds).toBe(30);
      expect(result.maxAgeSeconds).toBe(120);
    });

    it('debe rechazar mensajes con antigüedad mayor al límite (ej. ráfaga de sync histórica de WhatsApp)', () => {
      // Mensaje de hace 5 minutos (300s)
      const result5min = isMessageAgeValid(fixedNow - 300, 120, fixedNow);
      expect(result5min.isValid).toBe(false);
      expect(result5min.ageSeconds).toBe(300);

      // Mensaje de hace 1 hora (3600s)
      const result1hour = isMessageAgeValid(fixedNow - 3600, 120, fixedNow);
      expect(result1hour.isValid).toBe(false);
      expect(result1hour.ageSeconds).toBe(3600);
    });

    it('debe soportar timestamps en milisegundos convirtiéndolos automáticamente a segundos', () => {
      const tsMs = (fixedNow - 45) * 1000; // 45 segundos atrás en ms
      const result = isMessageAgeValid(tsMs, 120, fixedNow);
      expect(result.isValid).toBe(true);
      expect(result.ageSeconds).toBe(45);
    });

    it('debe respetar límites de tiempo configurables personalizados', () => {
      // Con límite estricto de 30 segundos
      expect(isMessageAgeValid(fixedNow - 20, 30, fixedNow).isValid).toBe(true);
      expect(isMessageAgeValid(fixedNow - 40, 30, fixedNow).isValid).toBe(false);

      // Con límite en formato string (desde env var)
      expect(isMessageAgeValid(fixedNow - 40, '60', fixedNow).isValid).toBe(true);
      expect(isMessageAgeValid(fixedNow - 90, '60', fixedNow).isValid).toBe(false);
    });

    it('debe considerar válidos mensajes sin timestamp (generados en tiempo real)', () => {
      expect(isMessageAgeValid(null, 120, fixedNow).isValid).toBe(true);
      expect(isMessageAgeValid(undefined, 120, fixedNow).isValid).toBe(true);
    });
  });
});
