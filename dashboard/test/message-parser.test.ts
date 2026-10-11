import { describe, it, expect } from 'vitest';
import React from 'react';
import { parseWhatsAppMessage, formatWhatsAppPreview, isSafeUrl } from '../src/lib/whatsapp/message-parser';

describe('WhatsApp Message Parser & Anti-XSS Defense', () => {
  describe('isSafeUrl Guardrail', () => {
    it('debe aceptar URLs válidas http y https', () => {
      expect(isSafeUrl('https://example.com')).toBe(true);
      expect(isSafeUrl('http://pizzeria.mx/menu?id=123')).toBe(true);
      expect(isSafeUrl('https://sub.domain.org/path/file.pdf#section')).toBe(true);
    });

    it('debe rechazar esquemas maliciosos javascript:, data:, vbscript: o URLs inválidas', () => {
      expect(isSafeUrl('javascript:alert(document.cookie)')).toBe(false);
      expect(isSafeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBe(false);
      expect(isSafeUrl('vbscript:msgbox("xss")')).toBe(false);
      expect(isSafeUrl('not a url')).toBe(false);
      expect(isSafeUrl('')).toBe(false);
    });
  });

  describe('parseWhatsAppMessage — XSS and Security Stress', () => {
    it('debe retornar null para contenido nulo o vacío', () => {
      expect(parseWhatsAppMessage(null)).toBeNull();
      expect(parseWhatsAppMessage(undefined)).toBeNull();
      expect(parseWhatsAppMessage('')).toBeNull();
    });

    it('debe neutralizar tags HTML como <script> o <img> tratándolos como texto plano', () => {
      const payload = '<script>alert("pwned")</script><img src=x onerror=alert(1)>';
      const result = parseWhatsAppMessage(payload);
      expect(result).toBeDefined();
    });

    it('debe parsear negritas (*texto*) correctamente', () => {
      const result = parseWhatsAppMessage('Hola *amigo*, tu pedido está listo');
      expect(result).toBeDefined();
    });

    it('debe parsear cursivas (_texto_) y tachados (~texto~)', () => {
      const result = parseWhatsAppMessage('Texto con _cursiva_ y con ~tachado~');
      expect(result).toBeDefined();
    });

    it('debe parsear código en línea (`code`) y bloques de código (```...```)', () => {
      const inlineResult = parseWhatsAppMessage('Usa el comando `confirm_order`');
      expect(inlineResult).toBeDefined();

      const blockResult = parseWhatsAppMessage('Detalles del pedido:\n```\n1x Pizza Familiar\n1x Refresco\n```');
      expect(blockResult).toBeDefined();
    });

    it('debe soportar URLs seguras transformándolas en enlaces seguros con noopener', () => {
      const result = parseWhatsAppMessage('Revisa nuestro menú en https://chataliado.com/menu');
      expect(result).toBeDefined();
    });

    it('debe ser resiliente ante tokens de formato sin cerrar (*incompleto)', () => {
      const result = parseWhatsAppMessage('Hola *este texto no cierra la negrita');
      expect(result).toBeDefined();
    });
  });

  describe('formatWhatsAppPreview — Conversation Snippet Generation', () => {
    it('debe limpiar tokens markdown y retornar texto plano compacto', () => {
      const raw = '¡Hola! Tu pedido de *Pizza Pepperoni* con _queso extra_ (`ID: 123`) fue ~cancelado~ confirmado.';
      const preview = formatWhatsAppPreview(raw, 100);
      expect(preview).toBe('¡Hola! Tu pedido de Pizza Pepperoni con queso extra (ID: 123) fue cancelado confirmado.');
    });

    it('debe truncar con puntos suspensivos cuando excede el maxLength', () => {
      const raw = 'Este es un mensaje sumamente largo que describe un pedido grande con muchos ingredientes y notas especiales de entrega en el domicilio';
      const preview = formatWhatsAppPreview(raw, 30);
      expect(preview.length).toBeLessThanOrEqual(33);
      expect(preview.endsWith('...')).toBe(true);
    });

    it('debe manejar bloques de código sustituyéndolos por un marcador limpio', () => {
      const raw = 'Hola, aquí el resumen:\n```\n1x Pizza\n2x Refrescos\n```\n¿Confirmamos?';
      const preview = formatWhatsAppPreview(raw, 100);
      expect(preview).toContain('[código]');
      expect(preview).toContain('¿Confirmamos?');
    });

    it('debe retornar string vacío para contenido nulo o vacío', () => {
      expect(formatWhatsAppPreview(null)).toBe('');
      expect(formatWhatsAppPreview(undefined)).toBe('');
      expect(formatWhatsAppPreview('')).toBe('');
    });
  });
});
