# Fix: WhatsApp Echo Pipeline — End-to-End

## Problema
El worker recibía webhooks de Evolution API pero **nunca respondía con el eco**. Tres bugs independientes lo impedían.

---

## Bugs Corregidos

### 1. 🔴 Autenticación rechazaba webhooks reales de Evolution API
**Archivo:** [`auth.ts`](file:///c:/Users/jesus/prog/chataliado/worker/src/webhooks/auth.ts)

Evolution API envía su `apikey` en el **body** del webhook (no como header). El código solo aceptaba `body.apikey` si tenía formato UUID (regex gate), pero la global API key (`test-evo-api-key`) no es UUID → se descartaba silenciosamente → **401 Unauthorized**.

```diff
- const token = apikeyHeader ?? authHeader ?? (bodyApiKey && EVOLUTION_INSTANCE_TOKEN_REGEX.test(bodyApiKey.trim()) ? bodyApiKey : null);
+ const token = apikeyHeader ?? authHeader ?? bodyApiKey;
```

Ahora cualquier `body.apikey` se evalúa contra los tokens conocidos (`EVOLUTION_API_KEY`, `WEBHOOK_VERIFY_TOKEN`) o formato UUID de instancia.

---

### 2. 🔴 `Illegal invocation` — fetch pierde binding en workerd
**Archivo:** [`evolution.ts`](file:///c:/Users/jesus/prog/chataliado/worker/src/providers/whatsapp/evolution.ts)

Guardar `fetch` en una propiedad de clase (`this.fetchFn = fetch`) pierde su referencia `this` al contexto global de workerd (runtime de Cloudflare Workers). Es un [error documentado por Cloudflare](https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors).

```diff
- this.fetchFn = config.fetchFn ?? fetch;
+ this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
```

---

### 3. 🟡 Eco duplicado — Evolution API envía `messages.upsert` dos veces
**Archivo:** [`handler.ts`](file:///c:/Users/jesus/prog/chataliado/worker/src/webhooks/handler.ts)

Evolution API (Baileys) envía el mismo evento `messages.upsert` dos veces por cada mensaje recibido. Se añadió un cache de deduplicación en memoria por `messageId` con TTL de 60 segundos.

```typescript
const processedMessages = new Set<string>();
const DEDUP_TTL_MS = 60_000;

// En el handler, antes de procesar:
if (processedMessages.has(result.messageId)) {
  return Response.json({ received: true, status: 'duplicate', ... });
}
markAsProcessed(result.messageId);
```

---

## Mejoras adicionales

### Logging diagnóstico
**Archivo:** [`handler.ts`](file:///c:/Users/jesus/prog/chataliado/worker/src/webhooks/handler.ts)

Se añadieron logs estructurados para facilitar el debugging:
- `[webhook]` — evento recibido con tipo, instancia, sender y messageId
- `[echo] ✓` — eco enviado exitosamente
- `[echo] ✗` — eco fallido con error detallado
- `[webhook] duplicate` — mensaje deduplicado

### Tests actualizados
**Archivos:** [`index.test.ts`](file:///c:/Users/jesus/prog/chataliado/worker/test/index.test.ts), [`webhooks.test.ts`](file:///c:/Users/jesus/prog/chataliado/worker/test/webhooks.test.ts)

| Cambio | Detalle |
|--------|---------|
| Test de auth sin token | Actualizado para esperar `'Missing authentication token'` |
| Nuevo test: body.apikey válido | Verifica que `body.apikey` con la API key de Evolution pasa auth |
| Nuevos tests: body.apikey paths | UUID, WEBHOOK_VERIFY_TOKEN, header `apikey`, token inválido |
| fetchMock host corregido | `localhost:8080` → `evolution-api:8080` (match con wrangler.toml) |
| messageId único por test | Evita colisiones con el cache de deduplicación entre tests |

---

## Verificación

- **44/44 tests pasando** (vitest + cloudflare pool workers)
- **Prueba E2E real**: mensaje enviado desde otro teléfono → eco recibido una sola vez ✓
- Imágenes, stickers, audios, encuestas correctamente descartados (`no_text_content`) ✓
- Mensajes propios (`fromMe`) descartados ✓
- Mensajes de grupo (`@g.us`) descartados ✓
