import { describe, it, expect, vi, beforeEach } from 'vitest';
import { advanceOrderStatus, recallOrderStatus } from '../src/app/(dashboard)/kds/actions';

// Mock de @/lib/supabase/server
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

describe('KDS Server Actions (Atomic Bump, Recall & State Machine)', () => {
  const validTenantId = '11111111-1111-4111-8111-111111111111';
  const validOrderId = '22222222-2222-4222-8222-222222222222';
  const validUserId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('advanceOrderStatus (Bump)', () => {
    it('debe rechazar IDs no UUID con error de validación de esquema', async () => {
      const res = await advanceOrderStatus('not-a-uuid', validOrderId, 'confirmed', 'preparing');
      expect(res.success).toBe(false);
      expect(res.error).toContain('UUID');
    });

    it('debe rechazar estados no válidos según el esquema Zod', async () => {
      const res = await advanceOrderStatus(
        validTenantId,
        validOrderId,
        'invalid_status' as any,
        'preparing'
      );
      expect(res.success).toBe(false);
    });

    it('debe rechazar llamadas si el usuario no tiene sesión activa', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'No session' } });

      const res = await advanceOrderStatus(validTenantId, validOrderId, 'confirmed', 'preparing');
      expect(res.success).toBe(false);
      expect(res.error).toContain('UNAUTHORIZED');
    });

    it('debe rechazar si el usuario no tiene membresía en el restaurante (cross-tenant guard)', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: null, error: { message: 'Not member' } }),
      });

      const res = await advanceOrderStatus(validTenantId, validOrderId, 'confirmed', 'preparing');
      expect(res.success).toBe(false);
      expect(res.error).toContain('FORBIDDEN');
    });

    it('debe invocar rpc_advance_order_status exitosamente y retornar confirmación', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: { role: 'staff' }, error: null }),
      });

      mockRpc.mockResolvedValueOnce({
        data: { success: true, order_id: validOrderId, previous_status: 'confirmed', new_status: 'preparing' },
        error: null,
      });

      const res = await advanceOrderStatus(validTenantId, validOrderId, 'confirmed', 'preparing');

      expect(res.success).toBe(true);
      expect(res.data).toEqual({
        orderId: validOrderId,
        previousStatus: 'confirmed',
        newStatus: 'preparing',
      });
      expect(mockRpc).toHaveBeenCalledWith('rpc_advance_order_status', {
        p_restaurant_id: validTenantId,
        p_order_id: validOrderId,
        p_from_status: 'confirmed',
        p_to_status: 'preparing',
      });
    });

    it('debe detectar STATUS_CONFLICT ante colisiones concurrentes y marcar conflict=true', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: { role: 'staff' }, error: null }),
      });

      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'STATUS_CONFLICT: El pedido ya cambió de estado a "preparing" (esperado: "confirmed")' },
      });

      const res = await advanceOrderStatus(validTenantId, validOrderId, 'confirmed', 'preparing');

      expect(res.success).toBe(false);
      expect(res.conflict).toBe(true);
      expect(res.error).toContain('Conflicto: La orden ya fue actualizada por otra pantalla');
    });

    it('debe reportar ORDER_NOT_FOUND adecuadamente', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: { role: 'staff' }, error: null }),
      });

      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'ORDER_NOT_FOUND: Pedido no encontrado o no pertenece a este restaurante' },
      });

      const res = await advanceOrderStatus(validTenantId, validOrderId, 'confirmed', 'preparing');

      expect(res.success).toBe(false);
      expect(res.error).toContain('Orden no encontrada');
    });

    it('debe reportar transiciones de estado ilícitas (INVALID_TRANSITION)', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: { role: 'staff' }, error: null }),
      });

      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'INVALID_TRANSITION: No se puede cambiar de "confirmed" a "delivered"' },
      });

      const res = await advanceOrderStatus(validTenantId, validOrderId, 'confirmed', 'delivered');

      expect(res.success).toBe(false);
      expect(res.error).toContain('Transición inválida');
    });

    it('debe abortar con error de TIMEOUT si el RPC tarda más de 8000ms', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: { role: 'staff' }, error: null }),
      });

      mockRpc.mockImplementationOnce(() => new Promise((resolve) => setTimeout(resolve, 9000)));

      vi.useFakeTimers();
      const advancePromise = advanceOrderStatus(validTenantId, validOrderId, 'confirmed', 'preparing');
      await vi.advanceTimersByTimeAsync(8500);
      const res = await advancePromise;
      vi.useRealTimers();

      expect(res.success).toBe(false);
      expect(res.error).toContain('TIMEOUT');
    }, 10000);
  });

  describe('recallOrderStatus (Recall / Deshacer)', () => {
    it('debe validar entradas con Zod antes de llamar a Supabase', async () => {
      const res = await recallOrderStatus('invalid', validOrderId, 'delivered', 'ready');
      expect(res.success).toBe(false);
      expect(res.error).toContain('UUID');
    });

    it('debe ejecutar exitosamente rpc_recall_order_status', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: { role: 'owner' }, error: null }),
      });

      mockRpc.mockResolvedValueOnce({
        data: { success: true, order_id: validOrderId, previous_status: 'delivered', new_status: 'ready' },
        error: null,
      });

      const res = await recallOrderStatus(validTenantId, validOrderId, 'delivered', 'ready');

      expect(res.success).toBe(true);
      expect(res.data).toEqual({
        orderId: validOrderId,
        previousStatus: 'delivered',
        newStatus: 'ready',
      });
      expect(mockRpc).toHaveBeenCalledWith('rpc_recall_order_status', {
        p_restaurant_id: validTenantId,
        p_order_id: validOrderId,
        p_from_status: 'delivered',
        p_to_status: 'ready',
      });
    });

    it('debe manejar conflictos en el recall', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: { role: 'owner' }, error: null }),
      });

      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'STATUS_CONFLICT: El pedido ya cambió de estado' },
      });

      const res = await recallOrderStatus(validTenantId, validOrderId, 'delivered', 'ready');

      expect(res.success).toBe(false);
      expect(res.conflict).toBe(true);
      expect(res.error).toContain('Conflicto');
    });

    it('debe abortar con error de TIMEOUT si el RPC de recall tarda más de 8000ms', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: validUserId } }, error: null });
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValueOnce({ data: { role: 'owner' }, error: null }),
      });

      mockRpc.mockImplementationOnce(() => new Promise((resolve) => setTimeout(resolve, 9000)));

      vi.useFakeTimers();
      const recallPromise = recallOrderStatus(validTenantId, validOrderId, 'delivered', 'ready');
      await vi.advanceTimersByTimeAsync(8500);
      const res = await recallPromise;
      vi.useRealTimers();

      expect(res.success).toBe(false);
      expect(res.error).toContain('TIMEOUT');
    }, 10000);
  });
});