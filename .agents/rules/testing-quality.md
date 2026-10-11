---
trigger: always_on
description: Estándares de calidad de software, pruebas automatizadas y ciclo TDD (inspirados en Everything Claude Code y Vitest).
---

# 🧪 Directrices de Calidad y Testing (TDD Guidelines)

El código de producción se respalda siempre con pruebas automatizadas deterministas, rápidas y reproducibles.

---

## 1. Metodología TDD (Test-Driven Development)
- **Ciclo Red-Green-Refactor:**
  1. **Red:** Escribir el test que define el comportamiento esperado antes o en paralelo a la implementación (el test debe fallar inicialmente).
  2. **Green:** Escribir el código mínimo necesario para que el test pase.
  3. **Refactor:** Limpiar y optimizar el código manteniendo los tests en verde.
- **Ninguna Feature sin Test:** Todo nuevo endpoint, provider, validador de Zod o tool de IA debe acompañarse de su correspondiente archivo de test en `test/`.

---

## 2. Estructura de Tests: Patrón AAA (Arrange, Act, Assert)
Cada test unitario o de integración debe seguir una estructura limpia y legible:

```typescript
it('debe rechazar webhooks sin token con HTTP 401', async () => {
  // 1. Arrange (Preparar datos y mocks)
  const req = new Request('http://localhost/webhook/evolution', {
    method: 'POST',
    body: JSON.stringify({ event: 'messages.upsert' }),
  });

  // 2. Act (Ejecutar la función o endpoint)
  const response = await worker.fetch(req, env);

  // 3. Assert (Verificar el resultado)
  expect(response.status).toBe(401);
});
```

---

## 3. Aislamiento y Mocks Obligatorios en Tests
- **Cero Llamadas Externas Reales:** Los tests unitarios jamás deben llamar a las APIs reales de Evolution API, Meta, OpenAI, Gemini ni Supabase.
- **Mocks con Vitest:** Usar `vi.fn()` o mockear `globalThis.fetch` para simular respuestas de red de forma determinista y a costo $0.00.
- **Tests Offline:** La suite de pruebas debe poder ejecutarse sin conexión a internet y en menos de 5 segundos.

---

## 4. Criterios de Cobertura Crítica
Las siguientes áreas requieren **100% de cobertura de pruebas**:
- Validación de firmas y tokens de seguridad en Webhooks.
- Cálculo de totales de pedidos, desglose de precios y descuentos.
- Parsing y validación de esquemas Zod (casos válidos, casos inválidos, payloads incompletos).
- Enrutamiento de mensajes y transferencia a humano (Chatwoot handoff).
