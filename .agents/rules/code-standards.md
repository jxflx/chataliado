---
trigger: always_on
description: Estándares de estilo de código, TypeScript estricto, Zod en fronteras y arquitectura limpia (inspirados en Everything Claude Code).
---

# 📐 Estándares de Código y Arquitectura (Code Standards)

---

## 1. TypeScript Estricto
- **Modo Estricto Activado:** `strict: true` y `noUncheckedIndexedAccess: true` en `tsconfig.json`.
- **Tipado Explícito en Exportaciones:** Todas las funciones exportadas, métodos de servicios y endpoints deben tener tipos de retorno explícitos.
- **Prohibido el uso de `any`:** Usar `unknown` con *type guards* o esquemas Zod en lugar de `any`.
- **Inmutabilidad:** Preferir `const` sobre `let`. Tratar los objetos y estados como inmutables a menos que una mutación local sea estrictamente necesaria por rendimiento.

---

## 2. Validación con Zod en todas las Fronteras (Boundaries)
- Todo dato que cruza la frontera de la aplicación (payloads de Webhooks, peticiones HTTP, respuestas de APIs externas y salidas de herramientas de LLM) **debe ser parseado y validado con Zod** antes de ser procesado por la lógica de negocio.
- Usar `z.infer<typeof Schema>` para derivar tipos automáticamente y evitar duplicación entre esquemas de validación e interfaces TypeScript.

---

## 3. Principio de Responsabilidad Única (SRP) y Modularidad
- **Estructura Desacoplada:**
  - `src/index.ts`: Entrypoint y enrutador HTTP del Worker.
  - `src/controllers/`: Manejo de peticiones HTTP, extracción de headers y respuestas.
  - `src/services/`: Lógica de negocio (procesamiento de pedidos, reglas del restaurante).
  - `src/providers/`: Adaptadores externos desacoplados (`WhatsAppProvider`, `EvolutionProvider`).
  - `src/tools/`: Definición y ejecución de herramientas para el agente LLM.
  - `src/schemas/`: Esquemas de validación Zod.
  - `src/types/`: Tipos e interfaces globales (`Env`, etc.).
- **Límite de Tamaño:** Ningún archivo debe exceder **300-400 líneas**. Si un archivo crece más, debe descomponerse en submódulos o utilidades.

---

## 4. Convenciones de Nombres y Commits
- **Nombres de Archivos:** `kebab-case.ts` o `camelCase.ts` coherente dentro de su carpeta.
- **Interfaces y Tipos:** `PascalCase` (ej. `WhatsAppProvider`, `OrderSummary`).
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
