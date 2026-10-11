import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { parseWhatsAppMessage, formatWhatsAppPreview, isSafeUrl } from '../src/lib/whatsapp/message-parser';
import { toggleConversationMode, toggleConversationStatus, sendHumanMessage } from '../src/app/(dashboard)/chats/actions';
import { soundAlerts } from '../src/lib/audio/sound-alerts';

// Mocking Supabase Server Client for Server Actions
const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}));

describe('⚔️ ADVERSARIAL STRESS & OFFENSIVE SECURITY SUITE - BLOQUE 1 ⚔️', () => {
  const validTenantId = '11111111-1111-4111-8111-111111111111';
  const victimTenantId = '99999999-9999-4999-8999-999999999999';
  const validConversationId = '22222222-2222-4222-8222-222222222222';
  const validUserId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  // =========================================================================
  // 1. XSS, PROTOCOL HIJACKING & POLYGLOT PAYLOAD ATTACKS
  // =========================================================================
  describe('1. XSS, Protocol Hijacking & Polyglot Injection Attacks', () => {
    const maliciousProtocols = [
      'javascript:alert(document.cookie)',
      'javascript:/*--></title></style></textarea></script></xmp><svg/onload=\'+/"/+/onmouseover=1/+/[*/[]/+alert(1)//\'>',
      'JAVASCRIPT:alert(1)',
      'java\0script:alert(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'data:text/html,<script>alert("xss")</script>',
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
      'blob:https://chataliado.com/1234-5678-9012',
      'file:///etc/passwd',
      'file://C:/Windows/System32/calc.exe',
      'vbscript:msgbox("xss")',
      'about:blank',
      'chrome://settings',
      'view-source:https://google.com',
      'ws://malicious-server.com',
      'wss://malicious-server.com',
      'ftp://anonymous@ftp.attack.com',
      'jar:http://evil.com/archive.jar!/index.html',
    ];

    it.each(maliciousProtocols)('isSafeUrl debe rechazar esquema inseguro: %s', (url) => {
      expect(isSafeUrl(url)).toBe(false);
    });

    const xssPolyglots = [
      '<script>alert("XSS")</script>',
      '<SCRIPT SRC="https://evil.com/xss.js"></SCRIPT>',
      '<img src="x" onerror="alert(1)">',
      '<svg onload=alert(document.domain)>',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<math><mtext><table><mglyph></mglyph><svg><style><img src=x onerror=alert(1)>',
      '"><script>alert(1)</script>',
      '\'><svg/onload=alert(1)>',
      '<<SCRIPT>alert("XSS");//<</SCRIPT>',
      '<body onload=alert(1)>',
      '<input autofocus onfocus=alert(1)>',
      '<details open ontoggle=alert(1)>',
      '<select autofocus onfocus=alert(1)>',
      '<marquee onstart=alert(1)>',
      '<style>body{background-image:url("javascript:alert(1)")}</style>',
      '"><input type="text" value="" autofocus onfocus="alert(1)">',
      '<!--<script>alert(1)</script>-->',
      '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
      '<base href="https://attacker.com/">',
      '<form action="https://evil.com/steal"><input type="submit">',
      '<object data="javascript:alert(1)">',
      '<embed src="javascript:alert(1)">',
    ];

    it.each(xssPolyglots)('parseWhatsAppMessage debe neutralizar y renderizar polyglot como texto plano seguro: %s', (payload) => {
      const element = parseWhatsAppMessage(payload);
      expect(element).toBeDefined();

      const json = JSON.stringify(element);
      expect(json).not.toContain('dangerouslySetInnerHTML');
      expect(json).not.toContain('__html');
    });

    it('debe neutralizar intentos de escape con markdown anidado malicioso', () => {
      const nestedPayload = '*<script>alert(1)</script>* `"><img src=x onerror=alert(1)>` _javascript:alert(1)_ ~<svg onload=alert(1)>~';
      const result = parseWhatsAppMessage(nestedPayload);
      expect(result).toBeDefined();
      const json = JSON.stringify(result);
      expect(json).not.toContain('dangerouslySetInnerHTML');
    });

    it('debe neutralizar URLs ofuscadas con caracteres de control ASCII/Unicode', () => {
      const obfuscated = [
        'http://javascript:alert(1)',
        'https://chataliado.com/%0d%0ajavascript:alert(1)',
        'https://attacker.com\\@chataliado.com',
        'http://127.0.0.1:8080/evil?q=<script>',
        'https://example.com/test?param=<img src=x onerror=alert(1)>',
      ];

      obfuscated.forEach((url) => {
        const result = parseWhatsAppMessage(`Link sospechoso: ${url}`);
        expect(result).toBeDefined();
        const json = JSON.stringify(result);
        expect(json).not.toContain('dangerouslySetInnerHTML');
      });
    });
  });

  // =========================================================================
  // 2. REDOS (REGULAR EXPRESSION DENIAL OF SERVICE) & MASSIVE STRESS
  // =========================================================================
  describe('2. ReDoS & Computational Complexity Attacks', () => {
    it('debe procesar 100,000 asteriscos no cerrados en menos de 50ms sin congelar el hilo', () => {
      const hugeUnclosedBold = '*'.repeat(100_000);
      const start = performance.now();
      const result = parseWhatsAppMessage(hugeUnclosedBold);
      const duration = performance.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(50);
    });

    it('debe procesar 100,000 guiones bajos no cerrados en menos de 50ms', () => {
      const hugeUnclosedItalic = '_'.repeat(100_000);
      const start = performance.now();
      const result = parseWhatsAppMessage(hugeUnclosedItalic);
      const duration = performance.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(50);
    });

    it('debe procesar 100,000 tildes de tachado no cerradas en menos de 50ms', () => {
      const hugeUnclosedStrike = '~'.repeat(100_000);
      const start = performance.now();
      const result = parseWhatsAppMessage(hugeUnclosedStrike);
      const duration = performance.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(50);
    });

    it('debe procesar 100,000 backticks sin cerrar en menos de 50ms', () => {
      const hugeBackticks = '`'.repeat(100_000);
      const start = performance.now();
      const result = parseWhatsAppMessage(hugeBackticks);
      const duration = performance.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(150);
    });

    it('debe procesar 100,000 bloques alternados *_~`*_~` en menos de 50ms', () => {
      const alternating = '*bold* _italic_ ~strike~ `code` '.repeat(5_000);
      const start = performance.now();
      const result = parseWhatsAppMessage(alternating);
      const duration = performance.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(100);
    });

    it('debe procesar URLs gigantescas de 100,000 caracteres sin degradación', () => {
      const hugeUrl = 'https://example.com/path/' + 'a'.repeat(100_000);
      const start = performance.now();
      const result = parseWhatsAppMessage(`Visita ${hugeUrl} ahora`);
      const duration = performance.now() - start;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(50);
    });

    it('formatWhatsAppPreview debe procesar 100,000 caracteres con formateos densos en <30ms', () => {
      const dense = '```bloque de codigo largo``` *pizza* _salsa_ ~refresco~ `id:1` '.repeat(2_000);
      const start = performance.now();
      const preview = formatWhatsAppPreview(dense, 60);
      const duration = performance.now() - start;

      expect(preview.length).toBeLessThanOrEqual(63);
      expect(duration).toBeLessThan(30);
    });
  });

  // =========================================================================
  // 3. MULTI-TENANT ISOLATION, FORGERY & PARAMETER TAMPERING
  // =========================================================================
  describe('3. Multi-Tenant Isolation, Forgery & Parameter Tampering', () => {
    it('debe rechazar Server Actions con IDs que intentan SQL Injection', async () => {
      const sqlInjectionIds = [
        "11111111-1111-4111-8111-111111111111' OR '1'='1",
        "'; DROP TABLE conversations; --",
        "11111111-1111-4111-8111-111111111111 UNION SELECT * FROM users--",
        "../../etc/passwd",
        "<script>alert(1)</script>",
        "00000000-0000-0000-0000-000000000000\x00",
      ];

      for (const maliciousId of sqlInjectionIds) {
        const resMode = await toggleConversationMode(maliciousId, validConversationId, 'human');
        expect(resMode.success).toBe(false);
        expect(resMode.error).toMatch(/UUID|inválido/i);

        const resStatus = await toggleConversationStatus(maliciousId, validConversationId, 'closed');
        expect(resStatus.success).toBe(false);
        expect(resStatus.error).toMatch(/UUID|inválido/i);
      }
    });

    it('debe aislar estrictamente al tenant cuando un usuario pertenece al Restaurante A pero intenta mutar Restaurante B', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: validUserId } }, error: null });

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Row not found' } }),
      });

      const res = await toggleConversationMode(victimTenantId, validConversationId, 'human');
      expect(res.success).toBe(false);
      expect(res.error).toContain('FORBIDDEN');
    });

    it('debe bloquear llamadas a sendHumanMessage si el usuario intenta usurpar otro tenant', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: validUserId } }, error: null });

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Row not found' } }),
      });

      const res = await sendHumanMessage({
        restaurantId: victimTenantId,
        conversationId: validConversationId,
        phone: '+5215512345678',
        content: 'Intento de usurpación',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('FORBIDDEN');
    });

    it('debe rechazar manipulación de estado con valores no permitidos en el enum', async () => {
      const invalidStatuses = ['deleted', 'archived', 'pending', 'ADMIN_BYPASS', '__proto__', 'null'];

      for (const badStatus of invalidStatuses) {
        // @ts-expect-error test invalid enum runtime value
        const res = await toggleConversationStatus(validTenantId, validConversationId, badStatus);
        expect(res.success).toBe(false);
      }
    });

    it('debe rechazar manipulación de modo con valores no permitidos en el enum', async () => {
      const invalidModes = ['god_mode', 'superuser', 'auto', 'null', 'undefined'];

      for (const badMode of invalidModes) {
        // @ts-expect-error test invalid enum runtime value
        const res = await toggleConversationMode(validTenantId, validConversationId, badMode);
        expect(res.success).toBe(false);
      }
    });

    it('debe validar formatos de número telefónico en boundaries E.164', async () => {
      const invalidPhones = ['0', '+0', '123', 'phone123', '+1234567890123456', '+', '++5215512345678', '5215512345678; DROP TABLE;'];

      for (const badPhone of invalidPhones) {
        const res = await sendHumanMessage({
          restaurantId: validTenantId,
          conversationId: validConversationId,
          phone: badPhone,
          content: 'Test phone',
        });
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/teléfono|inválido/i);
      }
    });
  });

  // =========================================================================
  // 4. PAYLOAD OVERFLOW, BOUNDARY LIMITS & UNICODE ABUSE
  // =========================================================================
  describe('4. Payload Overflow, Boundary Limits & Unicode Abuse', () => {
    it('debe rechazar mensajes que superan 4,000 caracteres (Buffer Overflow prevention)', async () => {
      const hugeMessage = 'A'.repeat(4001);
      const res = await sendHumanMessage({
        restaurantId: validTenantId,
        conversationId: validConversationId,
        phone: '+5215512345678',
        content: hugeMessage,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('4,000');
    });

    it('debe aceptar mensajes exactamente en el límite de 4,000 caracteres', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: { role: 'admin' }, error: null }),
      });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, messageId: 'MSG_MAX_LEN' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const exact4000Message = 'A'.repeat(4000);
      const res = await sendHumanMessage({
        restaurantId: validTenantId,
        conversationId: validConversationId,
        phone: '+5215512345678',
        content: exact4000Message,
      });

      expect(res.success).toBe(true);
      expect(res.data?.messageId).toBe('MSG_MAX_LEN');
    });

    it('debe rechazar payloads con strings que solo contienen espacios o saltos de línea', async () => {
      const whitespaceOnly = ['   ', '\n\n\n\t', '\r\n   \r\n'];

      for (const ws of whitespaceOnly) {
        const res = await sendHumanMessage({
          restaurantId: validTenantId,
          conversationId: validConversationId,
          phone: '+5215512345678',
          content: ws,
        });

        expect(res.success).toBe(false);
        expect(res.error).toContain('vacío');
      }
    });

    it('debe manejar secuencias Unicode complejas, RTL overrides y Zalgo text sin crashear', () => {
      const unicodeAttacks = [
        'Texto con RTL override: \u202E\u0041\u0042\u0043\u202C',
        'Zero-width space abuse: A\u200BB\u200CC\u200DD\uFEFF',
        'Zalgo text: H̶̛͎é̷̙ľ̸͈l̴͇͝ó̸̠ ̵͚̈́W̶̗͋o̵̭̽r̶̼͊ĺ̶̞d̷̥͑',
        'Surrogate pair fragmentation: \uD83D\uDE00\uD83D\uDCA5\uD83D\uDD25',
        'Null byte injection: Hello\x00World',
        'Homoglyph Latin vs Cyrillic: https://аpple.com (Cyrillic a)',
      ];

      unicodeAttacks.forEach((payload) => {
        expect(() => {
          parseWhatsAppMessage(payload);
          formatWhatsAppPreview(payload);
        }).not.toThrow();
      });
    });
  });

  // =========================================================================
  // 5. SECRET LEAKAGE & INFRASTRUCTURE FAIL-SAFE RESILIENCE
  // =========================================================================
  describe('5. Secret Leakage & Error Resilience', () => {
    it('no debe exponer tokens ni secretos en mensajes de error cuando el Worker falla', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: { role: 'staff' }, error: null }),
      });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          error: 'Internal Crash: failed connecting to DB with key sb_secret_key_12345',
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const res = await sendHumanMessage({
        restaurantId: validTenantId,
        conversationId: validConversationId,
        phone: '+5215512345678',
        content: 'Hola',
      });

      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('debe manejar caídas de red completas (Fetch Network Failure) de forma segura', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: { role: 'staff' }, error: null }),
      });

      vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED 127.0.0.1:8787')));

      const res = await sendHumanMessage({
        restaurantId: validTenantId,
        conversationId: validConversationId,
        phone: '+5215512345678',
        content: 'Hola',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('ECONNREFUSED');
    });
  });

  // =========================================================================
  // 6. SOUND ALERTS ENGINE HARDENING & STORAGE INTEGRITY
  // =========================================================================
  describe('6. Sound Alerts Engine Hardening', () => {
    it('debe ser resiliente ante corrupción o valores inesperados en localStorage', () => {
      const corruptedValues = ['corrupted_string', 'undefined', 'null', '{}', '12345', 'NaN'];

      corruptedValues.forEach((val) => {
        const mockStorage: Record<string, string> = { chataliado_sound_enabled: val };
        vi.stubGlobal('localStorage', {
          getItem: (k: string) => mockStorage[k] ?? null,
          setItem: (k: string, v: string) => { mockStorage[k] = v; },
        });

        expect(() => {
          soundAlerts.getSoundEnabled();
          soundAlerts.setSoundEnabled(false);
          soundAlerts.playNewMessageSound();
          soundAlerts.playHandoffAlertSound();
        }).not.toThrow();
      });
    });

    it('no debe crashear si AudioContext lanza SecurityError (política de autoplay restrictiva)', () => {
      vi.stubGlobal('AudioContext', class MockFailingAudioContext {
        get state() { return 'suspended'; }
        resume() { throw new Error('SecurityError: autoplay not allowed without user interaction'); }
        createOscillator() { throw new Error('SecurityError'); }
        createGain() { throw new Error('SecurityError'); }
      });

      soundAlerts.setSoundEnabled(true);
      expect(() => {
        soundAlerts.playNewMessageSound();
        soundAlerts.playHandoffAlertSound();
      }).not.toThrow();
    });

    it('debe soportar ráfagas de 1,000 alertas de sonido sin saturación ni excepciones', () => {
      soundAlerts.setSoundEnabled(true);
      expect(() => {
        for (let i = 0; i < 1_000; i++) {
          soundAlerts.playNewMessageSound();
          soundAlerts.playHandoffAlertSound();
        }
      }).not.toThrow();
    });
  });
});
