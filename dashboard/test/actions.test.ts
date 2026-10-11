import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toggleConversationMode, toggleConversationStatus, sendHumanMessage } from '../src/app/(dashboard)/chats/actions';

// Mock de @/lib/supabase/server
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

describe('Chats Server Actions (Multi-Tenant & Security)', () => {
  const validTenantId = '11111111-1111-4111-8111-111111111111';
  const validConversationId = '22222222-2222-4222-8222-222222222222';
  const validUserId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('toggleConversationMode', () => {
    it('debe rechazar IDs no UUID con error de validación', async () => {
      const res = await toggleConversationMode('not-a-uuid', validConversationId, 'human');
      expect(res.success).toBe(false);
      expect(res.error).toContain('UUID');
    });

    it('debe rechazar llamadas de usuarios no autenticados', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'No session' } });

      const res = await toggleConversationMode(validTenantId, validConversationId, 'human');
      expect(res.success).toBe(false);
      expect(res.error).toContain('UNAUTHORIZED');
    });

    it('debe rechazar si el usuario no pertenece al restaurante', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'Not found' } }),
      });

      const res = await toggleConversationMode(validTenantId, validConversationId, 'human');
      expect(res.success).toBe(false);
      expect(res.error).toContain('FORBIDDEN');
    });

    it('debe actualizar exitosamente el modo a "human" cuando está autorizado', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });
      
      const membershipChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: { role: 'admin' }, error: null }),
      };

      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };
      updateChain.eq.mockReturnValueOnce(updateChain).mockResolvedValueOnce({ error: null });

      mockFrom
        .mockReturnValueOnce(membershipChain)
        .mockReturnValueOnce(updateChain);

      const res = await toggleConversationMode(validTenantId, validConversationId, 'human');
      expect(res.success).toBe(true);
      expect(res.data?.mode).toBe('human');
    });
  });

  describe('toggleConversationStatus', () => {
    it('debe rechazar estado inválido', async () => {
      // @ts-expect-error test invalid enum
      const res = await toggleConversationStatus(validTenantId, validConversationId, 'invalid_status');
      expect(res.success).toBe(false);
    });

    it('debe actualizar exitosamente a "closed"', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });
      
      const membershipChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: { role: 'admin' }, error: null }),
      };

      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };
      updateChain.eq.mockReturnValueOnce(updateChain).mockResolvedValueOnce({ error: null });

      mockFrom
        .mockReturnValueOnce(membershipChain)
        .mockReturnValueOnce(updateChain);

      const res = await toggleConversationStatus(validTenantId, validConversationId, 'closed');
      expect(res.success).toBe(true);
      expect(res.data?.status).toBe('closed');
    });
  });

  describe('sendHumanMessage', () => {
    it('debe rechazar mensajes con contenido vacío', async () => {
      const res = await sendHumanMessage({
        restaurantId: validTenantId,
        conversationId: validConversationId,
        phone: '+5215512345678',
        content: '   ',
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('vacío');
    });

    it('debe rechazar números de teléfono con formato inválido', async () => {
      const res = await sendHumanMessage({
        restaurantId: validTenantId,
        conversationId: validConversationId,
        phone: '123',
        content: 'Hola',
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('teléfono');
    });

    it('debe comunicar con el Worker y retornar messageId exitoso', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });
      
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: { role: 'staff' }, error: null }),
      });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          messageId: 'MSG_TEST_999',
          message: { id: 'msg-uuid-1', content: 'Tu pizza está en camino' },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const res = await sendHumanMessage({
        restaurantId: validTenantId,
        conversationId: validConversationId,
        phone: '+5215512345678',
        content: 'Tu pizza está en camino',
      });

      expect(res.success).toBe(true);
      expect(res.data?.messageId).toBe('MSG_TEST_999');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('debe manejar respuestas de error HTTP del Worker adecuadamente', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });
      
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: { role: 'staff' }, error: null }),
      });

      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'La cuenta del restaurante se encuentra suspendida' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const res = await sendHumanMessage({
        restaurantId: validTenantId,
        conversationId: validConversationId,
        phone: '+5215512345678',
        content: 'Hola',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('suspendida');
    });
  });
});
