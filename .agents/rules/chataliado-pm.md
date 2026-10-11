---
trigger: always_on
description: Reglas del sistema de gestión y arquitectura de ChatAliado para agentes y subagentes.
---

## ChatAliado — Reglas para Agentes y Subagentes

### 1. Fuente Única de Verdad
- Antes de planificar o implementar código, consultar siempre [PROYECTO.md](file:///c:/Users/jesus/prog/chataliado/Project%20Management/PROYECTO.md).
- Toda la visión de producto, arquitectura (Propuesta 3: Cloudflare Workers, Supabase, Evolution API, Chatwoot, Next.js), modelo de datos y catálogo de tools están documentados ahí.

### 2. Flujo de Trabajo Simple y Directo
- No existen ceremonias de "inicio de día" ni "cierre de día" ni sprints fragmentados.
- Las tareas se ejecutan directamente con subagentes especializados enfocados en objetivos claros.

### 3. Principios de Código y Arquitectura
- **TypeScript + Cloudflare Workers** en backend / orquestador.
- **Supabase PostgreSQL** con RLS multi-tenant (`restaurant_id` / `tenant_id` obligatorio en todas las consultas y mutations).
- **El LLM jamás accede directamente a la BD** ni calcula totales de compras por sí mismo; invoca exclusivamente las Tools definidas en `PROYECTO.md`.
- **Desacoplamiento de WhatsApp:** Interfaz agnóstica para poder alternar entre Evolution API y Meta WhatsApp Cloud API.

### 4. Sistema de Diseño e Identidad Visual (Liquid Glass)
- Toda pantalla, componente o modal de interfaz en Next.js / Tailwind debe cumplir estrictamente con [DESIGN.md](file:///c:/Users/jesus/prog/chataliado/Project%20Management/DESIGN/DESIGN.md) y el prototipo vivo [`kds-liquid-glass.html`](file:///c:/Users/jesus/prog/chataliado/Project%20Management/DESIGN/kds-liquid-glass.html).
- **Cero Emojis Obligatorio:** Prohibido el uso de emojis en cualquier elemento visual de la UI; usar exclusivamente iconos Lucide donde aporten valor funcional real.
- **Atmósfera:** Liquid Glass (vidrio esmerilado con refracción y contraste alto) sobre lienzo de papel editorial `#FAF8F5`, pared de color continua (Monograph) y textura táctil de grano analógico (Richard Sancho).
- **Tipografía Estricta:** `Plus Jakarta Sans` (display/textos) y `JetBrains Mono` (datos operativos, precios, timers, comandas). Prohibido Inter o fuentes genéricas.
