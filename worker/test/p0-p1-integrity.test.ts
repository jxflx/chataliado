import { describe, it, expect, vi } from 'vitest';
import { verifyWebhookAuth } from '../src/webhooks/auth';
import { AuthenticationError, ValidationError } from '../src/utils/errors';
import { OrderRepository } from '../src/services/db/order-repository';
import { CustomerRepository } from '../src/services/db/customer-repository';
import { EvolutionWhatsAppProvider, EvolutionProviderError } from '../src/providers/whatsapp/evolution';
import { type SupabaseClient } from '@supabase/supabase-js';
import { type Database } from '../src/types/database';

describe('Prioridad P0 & P1 — Verification & Integrity Suite', () => {
  const mockEnv = {
    EVOLUTION_API_URL: 'https://evo.test.com',
    EVOLUTION_API_KEY: 'secret-evo-key-999',
    WEBHOOK_VERIFY_TOKEN: 'super-webhook-token-777',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service',
    LLM_API_KEY: 'test-llm',
    LLM_MODEL: 'gpt-4o-mini',
    LLM_BASE_URL: 'https://api.openai.com/v1',
  };

  const restaurantId = '11111111-1111-1111-1111-111111111111';
  const orderId = '22222222-2222-2222-2222-222222222222';
  const productId = '33333333-3333-3333-3333-333333333333';
  const itemId = '44444444-4444-4444-4444-444444444444';

  describe('P0: Zero-Trust Webhook Authentication', () => {
    it('debe rechazar cualquier token UUID arbitrario no configurado con HTTP 401', () => {
      const req = new Request('http://localhost/webhook/evolution', {
        method: 'POST',
        headers: { 'apikey': '00000000-0000-0000-0000-000000000000' },
      });

      expect(() => verifyWebhookAuth(req, mockEnv)).toThrow(AuthenticationError);
      expect(() => verifyWebhookAuth(req, mockEnv)).toThrow('Invalid webhook token');
    });

    it('debe aceptar peticiones con el EVOLUTION_API_KEY exacto', () => {
      const req = new Request('http://localhost/webhook/evolution', {
        method: 'POST',
        headers: { 'apikey': 'secret-evo-key-999' },
      });

      expect(() => verifyWebhookAuth(req, mockEnv)).not.toThrow();
    });

    it('debe aceptar peticiones con el WEBHOOK_VERIFY_TOKEN exacto vía x-api-key', () => {
      const req = new Request('http://localhost/webhook/evolution', {
        method: 'POST',
        headers: { 'x-api-key': 'super-webhook-token-777' },
      });

      expect(() => verifyWebhookAuth(req, mockEnv)).not.toThrow();
    });
  });

  describe('P1: Transaccionalidad Atómica en PostgreSQL (RPCs)', () => {
    it('OrderRepository.addItem debe invocar rpc_add_order_item en Supabase', async () => {
      const rpcMock = vi.fn().mockResolvedValue({
        data: {
          order: {
            id: orderId,
            restaurant_id: restaurantId,
            status: 'draft',
            subtotal: 199.5,
            total: 199.5,
          },
          item: {
            id: itemId,
            order_id: orderId,
            product_id: productId,
            quantity: 1,
            unit_price: 199.5,
            subtotal: 199.5,
          },
        },
        error: null,
      });

      const mockClient = {
        rpc: rpcMock,
      } as unknown as SupabaseClient<Database>;

      const repo = new OrderRepository(mockClient);
      const result = await repo.addItem(restaurantId, {
        order_id: orderId,
        product_id: productId,
        quantity: 1,
      });

      expect(rpcMock).toHaveBeenCalledWith('rpc_add_order_item', {
        p_restaurant_id: restaurantId,
        p_order_id: orderId,
        p_product_id: productId,
        p_quantity: 1,
        p_options: [],
      });
      expect(result.order.subtotal).toBe(199.5);
      expect(result.item.id).toBe(itemId);
    });

    it('OrderRepository.removeItem debe invocar rpc_remove_order_item', async () => {
      const rpcMock = vi.fn().mockResolvedValue({
        data: {
          id: orderId,
          restaurant_id: restaurantId,
          status: 'draft',
          subtotal: 0,
          total: 0,
        },
        error: null,
      });

      const mockClient = {
        rpc: rpcMock,
      } as unknown as SupabaseClient<Database>;

      const repo = new OrderRepository(mockClient);
      const result = await repo.removeItem(restaurantId, orderId, itemId);

      expect(rpcMock).toHaveBeenCalledWith('rpc_remove_order_item', {
        p_restaurant_id: restaurantId,
        p_order_id: orderId,
        p_item_id: itemId,
      });
      expect(result.subtotal).toBe(0);
    });

    it('OrderRepository.confirmOrder debe invocar rpc_confirm_order', async () => {
      const rpcMock = vi.fn().mockResolvedValue({
        data: {
          id: orderId,
          restaurant_id: restaurantId,
          status: 'confirmed',
          delivery_address: 'Av. Insurgentes 123',
          payment_method: 'cash',
        },
        error: null,
      });

      const mockClient = {
        rpc: rpcMock,
      } as unknown as SupabaseClient<Database>;

      const repo = new OrderRepository(mockClient);
      const result = await repo.confirmOrder(restaurantId, orderId, {
        deliveryAddress: 'Av. Insurgentes 123',
        paymentMethod: 'cash',
      });

      expect(rpcMock).toHaveBeenCalledWith('rpc_confirm_order', {
        p_restaurant_id: restaurantId,
        p_order_id: orderId,
        p_delivery_address: 'Av. Insurgentes 123',
        p_payment_method: 'cash',
      });
      expect(result.status).toBe('confirmed');
    });

    it('CustomerRepository.upsert debe intentar upsert atómico con onConflict', async () => {
      const maybeSingleMock = vi.fn().mockResolvedValue({
        data: {
          id: '55555555-5555-5555-5555-555555555555',
          restaurant_id: restaurantId,
          phone: '5215512345678',
          name: 'Comensal Test',
          notes_md: '',
        },
        error: null,
      });
      const selectMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
      const upsertMock = vi.fn().mockReturnValue({ select: selectMock });
      const fromMock = vi.fn().mockReturnValue({ upsert: upsertMock });

      const mockClient = {
        from: fromMock,
      } as unknown as SupabaseClient<Database>;

      const repo = new CustomerRepository(mockClient);
      const result = await repo.upsert(restaurantId, {
        phone: '5215512345678',
        name: 'Comensal Test',
      });

      expect(fromMock).toHaveBeenCalledWith('customers');
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '5215512345678', name: 'Comensal Test' }),
        { onConflict: 'restaurant_id,phone' }
      );
      expect(result.phone).toBe('5215512345678');
    });
  });

  describe('P1: Resiliencia con Exponential Backoff en Evolution Provider', () => {
    it('debe reintentar y recuperarse tras fallos transitorios 500', async () => {
      let callCount = 0;
      const customFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return new Response(JSON.stringify({ error: 'Gateway timeout' }), { status: 504 });
        }
        return new Response(JSON.stringify({ key: { id: 'MSG_RETRY_OK' } }), { status: 200 });
      });

      const provider = new EvolutionWhatsAppProvider({
        baseUrl: 'https://evo.test.com',
        apiKey: 'test-key',
        fetchFn: customFetch,
      });

      const result = await provider.sendTextMessage('test-inst', '5215512345678', 'Hola');
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('MSG_RETRY_OK');
      expect(callCount).toBe(3);
    });

    it('no debe reintentar errores de cliente 400', async () => {
      let callCount = 0;
      const customFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: 'Bad request: invalid phone number' }), {
          status: 400,
        });
      });

      const provider = new EvolutionWhatsAppProvider({
        baseUrl: 'https://evo.test.com',
        apiKey: 'test-key',
        fetchFn: customFetch,
      });

      await expect(
        provider.sendTextMessage('test-inst', 'invalid-phone', 'Hola')
      ).rejects.toThrow(EvolutionProviderError);

      expect(callCount).toBe(1);
    });
  });
});
