# Plan de Implementación — Hito 3: Orquestador LLM con Tool Calling y Memoria Markdown

> **Documento de Especificación y Plan de Trabajo Técnico**
> **Objetivo:** Implementar el cerebro conversacional de ChatAliado en Cloudflare Workers (`workerd`), con soporte de Tool Calling estructurado, persistencia multi-tenant en Supabase y gestión de memoria mediante el "Bloc de Notas del Mesero" (Markdown).

---

## 1. Arquitectura y Flujo de Ejecución del Hito 3

```text
                       WHATSAPP (Evolution API)
                                  │
                       POST /webhook/evolution
                                  ▼
               ┌──────────────────────────────────────┐
               │         handleEvolutionWebhook       │
               │  - Valida token y deduplica msgId     │
               │  - Resuelve Restaurant por slug/inst  │
               │  - Upsert Customer (phone, name)      │
               │  - Get/Create Conversation activa    │
               └──────────────────┬───────────────────┘
                                  │ (ctx.waitUntil)
                                  ▼
               ┌──────────────────────────────────────┐
               │           AgentOrchestrator          │
               │  - Si mode == 'human' -> Silenciar   │
               │  - Guarda mensaje user en DB         │
               │  - PromptBuilder (Memoria MD + Reglas│
               └──────────────────┬───────────────────┘
                                  │
                     ┌────────────┴────────────┐
                     ▼                         ▼
         ┌───────────────────────┐ ┌───────────────────────┐
         │     LLMProvider       │ │     ToolRegistry      │
         │  (Fetch nativo workerd│ │  - get_menu           │
         │   OpenAI/Groq/Gemini) │ │  - get_product        │
         └───────────┬───────────┘ │  - create_order       │
                     │             │  - add_order_item     │
         Tool Calling│(Bucle <= 5) │  - remove_order_item  │
                     │             │  - get_current_order  │
                     └────────────►│  - confirm_order      │
                                   │  - get_customer       │
                                   │  - update_notes_md    │
                                   │  - handoff_to_human   │
                                   └───────────┬───────────┘
                                               │
                                               ▼
                                   ┌───────────────────────┐
                                   │  Supabase PostgreSQL  │
                                   │  (Aislamiento RLS por │
                                   │   restaurant_id)      │
                                   └───────────────────────┘
```

---

## 2. Desglose de Tareas Técnicas por Capa

### Capa 1: Variables de Entorno y Configuración del Runtime
*Objetivo: Tipar y habilitar las credenciales del proveedor LLM sin dependencias incompatibles con Cloudflare Workers.*

- **Tarea 1.1 — Extensión del Tipado de Entorno:**
  - **Archivo:** `worker/src/types/env.ts`
  - **Cambios:**
    - Agregar `LLM_API_KEY: string` (API Key para inferencia).
    - Agregar `LLM_MODEL: string` (ej. `gpt-4o-mini`, `llama-3.3-70b-versatile`).
    - Agregar `LLM_BASE_URL?: string` (ej. `https://api.openai.com/v1` o URL compatible).
- **Tarea 1.2 — Configuración Local y de Despliegue:**
  - **Archivos:** `worker/wrangler.toml`, `worker/.dev.vars.example`
  - **Cambios:** Añadir placeholders y valores por defecto para pruebas locales.

---

### Capa 2: Repositorios de Persistencia Multi-Tenant (Supabase DB)
*Objetivo: Gestionar el estado de conversaciones, historial de mensajes, metadatos del restaurante y consultas del cliente garantizando aislamiento estricto por `restaurant_id`.*

- **Tarea 2.1 — Repositorio de Conversaciones:**
  - **Archivo:** `worker/src/services/db/conversation-repository.ts`
  - **Métodos requeridos:**
    - `getOrCreateActiveConversation(restaurantId: string, customerId: string): Promise<Conversation>`: Busca una conversación abierta (`status = 'open'`); si no existe, inserta una nueva con `mode = 'ai'` y `status = 'open'`.
    - `setMode(restaurantId: string, conversationId: string, mode: 'ai' | 'human'): Promise<Conversation>`: Cambia el modo de atención. Filtra siempre por `id` y `restaurant_id`.
    - `setStatus(restaurantId: string, conversationId: string, status: 'open' | 'closed'): Promise<Conversation>`: Cierre o reapertura de conversación.
- **Tarea 2.2 — Repositorio de Mensajes:**
  - **Archivo:** `worker/src/services/db/message-repository.ts`
  - **Métodos requeridos:**
    - `saveMessage(restaurantId: string, input: SaveMessageInput): Promise<Message>`: Inserta mensajes con roles `user`, `assistant`, `tool` o `human_agent`, vinculando `conversation_id`, `provider_message_id` y metadatos JSON (como `tool_calls` o `tool_call_id`).
    - `getRecentMessages(restaurantId: string, conversationId: string, limit?: number): Promise<Message[]>`: Obtiene los últimos $N$ mensajes (default 12-15) ordenados cronológicamente (`ascending: true`) para alimentar el contexto del LLM.
- **Tarea 2.3 — Repositorio de Restaurante y Configuración del Agente:**
  - **Archivo:** `worker/src/services/db/restaurant-repository.ts`
  - **Métodos requeridos:**
    - `getByIdOrSlug(identifier: string): Promise<Restaurant | null>`: Resuelve el restaurante por su UUID o por su `slug` (que coincide con el nombre de la instancia en Evolution API).
    - `getAgentConfig(restaurantId: string): Promise<AgentConfig | null>`: Obtiene `system_prompt`, `business_rules`, `operating_hours` y `handoff_triggers`.
    - `getLastCompletedOrder(restaurantId: string, customerId: string): Promise<{ order: Order; items: OrderItem[] } | null>`: Consulta el último pedido completado/confirmado del cliente para inyectarlo en la memoria del prompt.
- **Tarea 2.4 — Extensiones al Repositorio de Pedidos:**
  - **Archivo:** `worker/src/services/db/order-repository.ts`
  - **Métodos requeridos:**
    - `removeItem(restaurantId: string, orderId: string, itemId: string): Promise<Order>`: Elimina un ítem y recalcula matemáticamente el subtotal y total en memoria antes de actualizar la BD.
    - `getActiveDraftOrder(restaurantId: string, customerId: string): Promise<{ order: Order; items: OrderItem[] } | null>`: Retorna el pedido en borrador activo si el cliente ya tiene uno en curso.

---

### Capa 3: Adaptador Desacoplado del Proveedor LLM
*Objetivo: Proporcionar una interfaz agnóstica para interactuar con modelos de lenguaje vía HTTP `fetch` nativo sin usar SDKs incompatibles con Cloudflare Workers.*

- **Tarea 3.1 — Interfaz y Tipado del Proveedor:**
  - **Archivo:** `worker/src/providers/llm/interface.ts`
  - **Estructuras:**
    - `LLMMessage`: Estructura compatible con OpenAI (`role`, `content`, `tool_calls`, `tool_call_id`, `name`).
    - `LLMToolDefinition`: Esquema en formato JSON Schema (`type: 'function'`, `parameters`).
    - `LLMToolCall`: Identificador, nombre de función y argumentos serializados en string.
    - `LLMResponse`: `content: string | null`, `toolCalls?: LLMToolCall[]`, `finishReason: string`.
    - `LLMProvider`: Interfaz con `generateChatCompletion(messages, tools?, options?): Promise<LLMResponse>`.
- **Tarea 3.2 — Cliente OpenAI-Compatible:**
  - **Archivo:** `worker/src/providers/llm/openai-compatible.ts`
  - **Detalle técnico:**
    - Invoca `POST ${baseUrl}/chat/completions` con `globalThis.fetch`.
    - Headers: `Authorization: Bearer ${apiKey}`, `Content-Type: application/json`.
    - Soporta OpenAI (`gpt-4o-mini`), Groq (`llama-3.3-70b-versatile`), OpenRouter y Gemini (vía endpoint compatible).
    - Parseo de errores HTTP seguros (enmascara claves y lanza `LLMProviderError`).

---

### Capa 4: Catálogo y Ejecutor de Tools (`src/tools/`)
*Objetivo: Implementar las 10 operaciones del agente con validación Zod en fronteras, inyección de contexto multi-tenant y cálculo matemático determinista.*

- **Tarea 4.1 — Contexto de Ejecución de Tools (`ToolContext`):**
  - **Archivo:** `worker/src/tools/interface.ts`
  - **Estructura:** Inyecta de forma segura `restaurantId`, `customerId`, `conversationId`, `db`, `env` y los repositorios tipados. **El LLM jamás envía ni puede manipular el `restaurant_id`**.
- **Tarea 4.2 — Implementación de Tools de Catálogo y Menú:**
  - `worker/src/tools/catalog/get-menu.ts`:
    - *Input Zod:* `{ category?: string }`.
    - *Acción:* Consulta categorías y productos activos en `MenuRepository`. Retorna lista estructurada con variantes y precios.
  - `worker/src/tools/catalog/get-product.ts`:
    - *Input Zod:* `{ product_id: string (UUID) }`.
    - *Acción:* Retorna detalle, ingredientes y opciones permitidas (`options_schema`).
- **Tarea 4.3 — Implementación de Tools de Pedidos (Deterministas):**
  - `worker/src/tools/orders/create-order.ts`:
    - *Input Zod:* `{ customer_id?: string }` (usa `ctx.customerId` por defecto).
    - *Acción:* Crea registro en `orders` con `status = 'draft'` y totales en $0.00.
  - `worker/src/tools/orders/add-order-item.ts`:
    - *Input Zod:* `{ order_id: string, product_id: string, quantity: number, options_selected?: Array<{ group_name: string, choice_label: string, price_modifier: number }> }`.
    - *Acción:* Valida disponibilidad en `menu_items`, calcula `(precio_base + modifiers) * quantity`, inserta en `order_items` y actualiza subtotal/total en `orders`.
  - `worker/src/tools/orders/remove-order-item.ts`:
    - *Input Zod:* `{ order_id: string, item_id: string }`.
    - *Acción:* Elimina ítem y recalcula subtotal y total en `orders`.
  - `worker/src/tools/orders/get-current-order.ts`:
    - *Input Zod:* `{ order_id?: string }` (busca orden activa si se omite).
    - *Acción:* Retorna desglose completo de productos, opciones, subtotal, costo de envío y total.
  - `worker/src/tools/orders/confirm-order.ts`:
    - *Input Zod:* `{ order_id: string, delivery_address?: string, payment_method?: 'cash' | 'transfer' | 'card' | 'pending' }`.
    - *Acción:* Actualiza orden a `status = 'confirmed'`, fija dirección y forma de pago.
- **Tarea 4.4 — Implementación de Tools de Memoria y Clientes:**
  - `worker/src/tools/customers/get-customer.ts`:
    - *Input Zod:* `{ phone?: string }` (consulta el cliente de la sesión por defecto).
    - *Acción:* Retorna nombre, teléfono, dirección habitual, notas Markdown y último pedido.
  - `worker/src/tools/customers/update-customer-notes.ts`:
    - *Input Zod:* `{ customer_id?: string, notes_md: string }`.
    - *Acción:* Actualiza el campo `notes_md` en la tabla `customers` (límite 5,000 chars).
- **Tarea 4.5 — Implementación de Tool de Escalamiento:**
  - `worker/src/tools/escalation/handoff-to-human.ts`:
    - *Input Zod:* `{ reason: string }`.
    - *Acción:* Cambia `conversations.mode = 'human'`. Silencia al bot para futuras interacciones.
- **Tarea 4.6 — Registro Central y Dispatcher:**
  - **Archivo:** `worker/src/tools/registry.ts`
  - **Acción:** Registra las 10 tools, exporta definiciones JSON Schema para el LLM y provee `executeTool(name, rawArgs, ctx)` con validación Zod y manejo seguro de errores.

---

### Capa 5: Constructor de Prompts y Ensamblador de Memoria
*Objetivo: Construir dinámicamente el System Prompt con personalidad, reglas, horarios, memoria Markdown y directivas anti-alucinación de precios.*

- **Tarea 5.1 — Ensamblado de Prompt y Validación de Horarios:**
  - **Archivo:** `worker/src/services/agent/prompt-builder.ts`
  - **Componentes:**
    - `checkOperatingHours(operatingHours, timezone, now)`: Evalúa si el restaurante está abierto o cerrado según el día y hora en su zona horaria (`America/Mexico_City`).
    - `buildSystemPrompt(params)`:
      1. Identidad: Inyecta `agentConfig.system_prompt`.
      2. Reglas del Negocio: Inyecta `agentConfig.business_rules` (costos de envío, políticas de entrega).
      3. Horario: Inyecta el estado operativo actual.
      4. Memoria del Cliente: Inyecta bloque `[MEMORIA DEL CLIENTE]` con `customer.notes_md` y último pedido.
      5. Guardrails de Seguridad:
         - *"El total y precios los calcula el sistema; jamás inventes ni sumes precios por tu cuenta."*
         - *"Si el cliente solicita atención de una persona, invoca inmediatamente 'handoff_to_human'."*

---

### Capa 6: Motor Orquestador del Agente de IA (`orchestrator.ts`)
*Objetivo: Controlar el flujo de conversación multi-turno, ejecución de tools en bucle acotado y persistencia en Supabase.*

- **Tarea 6.1 — Motor de Ejecución:**
  - **Archivo:** `worker/src/services/agent/orchestrator.ts`
  - **Flujo:**
    1. Si `conversation.mode === 'human'`: guarda mensaje del comensal y retorna `replyText: null` (bot silenciado).
    2. Guarda mensaje del comensal (`role: 'user'`).
    3. Carga historial reciente (`MessageRepository`) y último pedido.
    4. Ensambla System Prompt (`PromptBuilder`).
    5. **Bucle de Tool Calling (máx. 5 iteraciones):**
       - Llama a `LLMProvider.generateChatCompletion(messages, tools)`.
       - Si devuelve texto final: guarda mensaje (`role: 'assistant'`) y termina.
       - Si devuelve llamadas a tools (`toolCalls`):
         - Guarda mensaje del asistente con metadatos de tool calls.
         - Ejecuta cada tool vía `ToolRegistry.executeTool(name, args, ctx)`.
         - Guarda resultado de cada tool (`role: 'tool'`).
         - Si la tool ejecutada fue `handoff_to_human`: marca handoff, interrumpe bucle y retorna mensaje de transferencia al comensal.

---

### Capa 7: Conexión con el Webhook de Evolution API
*Objetivo: Conectar el webhook entrante de WhatsApp con el orquestador en segundo plano.*

- **Tarea 7.1 — Adaptación del Controlador de Webhook:**
  - **Archivo:** `worker/src/webhooks/handler.ts`
  - **Flujo:**
    - Resuelve `Restaurant` a partir de `instanceId`.
    - Realiza `upsert` de `Customer` (`senderPhone`, `senderName`).
    - Obtiene o crea `Conversation` activa.
    - Despacha en segundo plano (`ctx.waitUntil`) la llamada a `AgentOrchestrator.processMessage()`.
    - Envía la respuesta textual generada a través de `WhatsAppProvider.sendTextMessage()`.

---

### Capa 8: Suite de Pruebas Automatizadas TDD (Vitest)
*Objetivo: Asegurar 100% de cobertura determinista sin dependencias externas ni llamadas reales a APIs.*

- **Tarea 8.1 — Tests Unitarios de Tools (`worker/test/tools.test.ts`):**
  - Pruebas para las 10 tools con entradas válidas, parámetros incorrectos y validación Zod.
- **Tarea 8.2 — Tests de PromptBuilder (`worker/test/prompt-builder.test.ts`):**
  - Validación de cálculo de horarios y formateo correcto de la memoria Markdown.
- **Tarea 8.3 — Tests del Orquestador (`worker/test/orchestrator.test.ts`):**
  - Flujo directo texto a texto.
  - Flujo de Tool Calling (`get_menu` -> respuesta).
  - Flujo de handoff (`handoff_to_human` -> cambio a modo `human`).
  - Silenciamiento cuando la conversación ya está en modo `human`.
- **Tarea 8.4 — Test de Integración E2E (`worker/test/agent-e2e.test.ts`):**
  - Petición HTTP al webhook simulando mensaje de WhatsApp -> procesamiento completo -> respuesta despachada al provider mock.

---

## 3. Lo que se Requiere de tu Parte (Decisiones y Datos)

Para cuando decidas proceder con la ejecución técnica, únicamente se requerirá lo siguiente:

1. **Proveedor y Modelo LLM preferido:**
   - OpenAI (`gpt-4o-mini` — recomendado para MVP por balance costo/velocidad en function calling).
   - Groq (`llama-3.3-70b-versatile` — para latencias mínimas).
   - Google Gemini (`gemini-2.0-flash`).
2. **API Key del Proveedor:** Para configurar en `.dev.vars` al momento de hacer pruebas reales con WhatsApp (los tests automatizados usan mocks y no consumen créditos).
3. **Confirmación de Mapeo de Instancia:** Confirmar si el nombre de la instancia en Evolution API (ej. `don-giovanni`) coincidirá siempre con el campo `restaurants.slug`.
