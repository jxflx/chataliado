# ChatAliado — Documento Maestro del Proyecto

> **Fuente Única de Verdad** para la visión de negocio, arquitectura de software, modelo de datos, roadmap y directrices de desarrollo con agentes de IA.

---

## 1. Visión y Objetivo de Negocio

### ¿Qué es ChatAliado?
Plataforma SaaS multi-tenant que automatiza conversaciones, consultas de menú/catálogo, toma de pedidos y gestión de citas para **PYMES en México** mediante WhatsApp y Modelos de Lenguaje (LLMs).

### Enfoque inicial: MVP Comercial
El objetivo primordial es construir un **MVP comercial**, no un prototipo de laboratorio. Buscamos desplegar rápidamente una solución funcional para **3 a 10 restaurantes y pizzerías reales pagando**, validando el modelo de negocio sin incurrir en sobreingeniería.

### Flujo Central de Usuario
```text
Restaurante conecta WhatsApp (vía QR en Evolution API)
       ↓
Cliente escribe por WhatsApp ("Quiero una pepperoni grande")
       ↓
AI responde de inmediato
       ↓
AI consulta menú, disponibilidad y precios en tiempo real
       ↓
AI procesa y confirma el pedido (validación transaccional determinista)
       ↓
El pedido aparece al instante en el Dashboard KDS de Cocina (Supabase Realtime)
       ↓
Cualquier operador puede ver el chat en vivo e intervenir en 1 clic ("Tomar Control")
```

---

## 2. Arquitectura del Sistema (Propuesta 3 — 95% Serverless)

La plataforma utiliza una arquitectura desacoplada, escalable y 95% serverless en su núcleo, eliminando servidores pesados de helpdesks de terceros y centralizando la operación del restaurante en un Dashboard nativo.

```text
                     WHATSAPP
                        │
                        ▼
             Evolution API (Micro-VPS / K8s ~250MB RAM)
                        │
                     Webhook
                        ▼
              ┌──────────────────┐
              │   CLOUDFLARE     │
              │  Worker Backend  │
              │   & AI Agent     │
              └─────────┬────────┘
                        │
                        ▼
                     LLM API
                        │
                  Tool Calling
                        │
          ┌─────────────┼──────────────┐
          ▼             ▼              ▼
      get_menu    add_order_item  handoff_to_human
          │             │              │
          └─────────────┼──────────────┘
                        ▼
                    SUPABASE
               (PostgreSQL + RLS + Realtime)
                        │
                        ▼
      DASHBOARD NATIVO NEXT.JS (100% Serverless)
      ├── 🍕 Comandas de Cocina (KDS en Tiempo Real)
      ├── 💬 Monitor de Chats WhatsApp en Vivo
      ├── ✋ Intervención Humana (Tomar Control / Handoff)
      ├── 📋 Catálogo, Menú y Precios
      └── 📝 Ficha de Clientes y Memoria (notes_md)
```

### Componentes del Stack

| Componente | Tecnología | Responsabilidad | Costo / Hosting |
|---|---|---|---|
| **Canal WhatsApp (MVP)** | Evolution API | Recepción/envío de mensajes y onboarding por código QR. | Micro-VPS / Pod K8s (\$4-\$5/mes) |
| **Backend & Orquestador** | Cloudflare Workers (TypeScript) | Webhooks, lógica de negocio, validaciones y orquestación del LLM. | 100% Serverless (\$0.00) |
| **Agente de IA** | Código propio + Tool Calling | Gestión del diálogo, selección de tools y respuesta contextual. | Pay-per-token |
| **Modelos LLM** | OpenAI / Anthropic / Gemini | Inferencia lingüística y estructuración de parámetros. | Pay-per-token |
| **Base de Datos, Auth & Realtime** | Supabase (PostgreSQL + RLS) | Persistencia multi-tenant, catálogo, pedidos, clientes, usuarios y WebSockets. | Cloud Serverless (\$0.00) |
| **Dashboard Administrativo & Cocina** | Next.js (App Router + Tailwind + shadcn) | Panel web KDS, monitor de chats en vivo, catálogo y gestión de clientes. | Vercel / Cloudflare Pages (\$0.00) |
| **Servidor Auxiliar de Mensajería** | Micro-VPS (1 vCPU, 1 GB RAM) o Contenedor | Alojamiento exclusivo y ligero de Evolution API + Postgres de sesión. | Micro-VPS (\$4-\$5 USD/mes) |

---

## 3. Principios de Ingeniería No Negociables

1. **El Core del Negocio reside en Código propio:**
   - La lógica de pedidos, cálculo de totales, clientes, control de inventario y permisos reside en el backend de Cloudflare Workers y Supabase.
   - Herramientas no-code (como n8n) son exclusivas para integraciones periféricas opcionales (ej. enviar resumen a Google Sheets o correo), nunca para el cerebro de la aplicación.
2. **El LLM NUNCA toca la base de datos directamente:**
   - El LLM sólo invoca *Tools* estructuradas.
   - El backend valida existencias, variantes, disponibilidad y realiza el cálculo matemático de precios. El LLM jamás inventa ni suma precios por su cuenta.
3. **Multi-tenancy Estricto:**
   - Todas las consultas, tablas y operaciones exigen filtrado por `restaurant_id` / `tenant_id` y aislamiento mediante **Row Level Security (RLS)** en PostgreSQL.
4. **Abstracción del Proveedor de Mensajería:**
   - El código interactúa con una interfaz `WhatsAppProvider`. Aunque el MVP use Evolution API, el sistema debe poder conmutar a Meta WhatsApp Cloud API sin alterar la lógica de negocio.

---

## 4. Memoria del Cliente: El "Bloc de Notas del Mesero" (Markdown)

No utilizamos bases de datos vectoriales complejas ni embeddings. Un mesero real solo necesita recordar datos clave y memorables, no el historial milimétrico de hace meses.

### Estructura Rígida de la Memoria (Plantilla Fija de 4 Bloques, Máx 150 palabras)
Cada cliente cuenta con un campo de texto `notes_md` en la tabla `customers` de Supabase, estructurado de forma concisa y determinista bajo 4 encabezados fijos:

```markdown
- 📍 **Entrega:** Av del río 234, Depto 402, portón blanco, no tocar timbre (bebé durmiendo)
- ⚠️ **Restricciones/Alergias:** Sin queso; Alérgico a mariscos
- 🍕 **Preferencias Habituales:** Masa delgada, orilla tradicional, salsa picante aparte
- 📦 **Último Pedido Confirmado:** 1x Pizza Margherita (Familiar (40cm)), 1x Refresco 600ml (Sprite)
```

### Ciclo de Vida y Consolidación Asíncrona (Lazy Background)
1. **Inyección en Prompt (`formatCustomerMemory` + `formatLastOrder`):**
   - Al recibir un mensaje, el Worker inyecta el contenido de `notes_md` más el desglose enriquecido del último pedido (`product_name` y opciones resueltas) en el context window del LLM.
2. **Filtrado durante la Venta:**
   - Durante la conversación de venta, el LLM se concentra 100% en cerrar la orden y asesorar al cliente sin distraerse en llamadas redundantes de notas.
3. **Consolidación Asíncrona Post-Confirmación (`memory-consolidator.ts`):**
   - Al confirmarse exitosamente una orden (`confirm_order`), el Worker dispara una micro-tarea *Lazy* en segundo plano (**0 ms de espera para el cliente en WhatsApp**).
   - El consolidador filtra los mensajes del usuario (`role = 'user'`), extrae restricciones alimentarias explícitas (*"sin queso"*, *"alérgico"*, *"sin cebolla"*) o instrucciones de entrega, y actualiza `customers.notes_md` y `customers.address_default`.
4. **Control y Edición Humana:**
   - En el Dashboard de Next.js y en el Playground, el personal del restaurante puede leer y editar estas notas libremente desde la ficha del cliente (ej. agregar *"Amigo del dueño, cortesía en bebidas"*).

---

## 5. Tools y Operaciones del Agente de IA (11 Tools Deterministas)

El agente interactúa con el sistema exclusivamente mediante herramientas fuertemente tipadas y validadas con Zod.

### Catálogo y Menú
- `get_menu(category?: string)`: Consulta categorías y productos activos con sus esquemas de tamaños, variantes y precios oficiales. Obligatorio invocar antes de sugerir platillos.
- `get_product(product_id: string)`: Consulta detalles específicos, ingredientes o modificaciones permitidas de un ítem particular.

### Gestión de Pedidos y Carrito en Vivo
- `create_order()`: Inicializa una orden en estado `draft` asociada al cliente y restaurante.
- `add_order_item(order_id, product_id, quantity, options_selected?)`: Añade un ítem calculando precio unitario y subtotales en PostgreSQL. Retorna `current_cart` consolidado.
- `remove_order_item(order_id, item_id)`: Elimina un ítem específico del borrador activo. Retorna `current_cart` actualizado.
- `update_order_item_quantity(order_id, item_id, quantity)`: Modifica directamente la cantidad de un ítem existente en el pedido en una sola operación atómica. Retorna `current_cart` actualizado.
- `get_current_order(order_id)`: Retorna el resumen financiero y la lista de ítems activos en `current_cart`.
- `confirm_order(order_id, delivery_address, payment_method)`: Finaliza y confirma la orden (`status = 'confirmed'`), asigna entrega y método de pago, y dispara la consolidación de memoria en segundo plano.

### Clientes y Memoria
- `get_customer(phone)`: Consulta datos del cliente recurrente, nombre, notas de memoria (`notes_md`) y último pedido completado.
- `update_customer_notes(customer_id, notes_md, name?, address_default?)`: Actualiza directamente la memoria Markdown o datos de contacto del cliente.

### Escalamiento y Handoff
- `handoff_to_human(reason)`: Cambia `conversations.mode = 'human'`, silencia las respuestas automáticas del bot y transfiere el chat a atención humana.

---

### 5.1. Protocolos de Comportamiento y Diálogo del Agente (`prompt-builder.ts`)

1. **Regla de Oro de Anclaje al Carrito Real (`current_cart`):**
   - Las herramientas de mutación (`add_order_item`, `remove_order_item`, `update_order_item_quantity`, `get_current_order`) retornan siempre el arreglo `current_cart`.
   - El LLM tiene **estrictamente prohibido listar ítems o totales de memoria**; en cada resumen o desglose debe listar única y exclusivamente los productos y cantidades devueltos en `current_cart`.

2. **Protocolo Activo de Verificación Pre-Confirmación (Datos Críticos):**
   - Antes de ejecutar `confirm_order`, si el cliente ya cuenta con una `Dirección habitual` o restricciones/alergias en su memoria, el bot **se las propone activamente**:
     > *"Tengo registrado que tu entrega es en **[Dirección Guardada]** y con la nota **[Alergias/Restricciones]**. ¿Confirmamos a esa dirección o prefieres una diferente?"*
   - Reduce la fricción de compra para clientes recurrentes a una simple respuesta *"Sí"*.

3. **Protocolo Pasivo "Lo de Siempre" / "Historial Previo":**
   - Si el cliente pregunta *"¿Te acuerdas de lo que pedí ayer?"*, *"Dame lo de la otra vez"* o *"La masa de siempre"*:
     - El bot consulta `Último pedido registrado` (con nombres de platillos y opciones resueltos) y responde con total honestidad citando lo que tiene anotado.
     - Si es un cliente nuevo o sin historial, responde amablemente y con simpatía: *"¡Hola! Aún no tengo registrado ningún pedido previo en mi libreta 📝. ¿Te paso el menú o me dices qué se te antoja ordenar hoy?"*.
     - Queda terminantemente prohibido alucinar o inventar compras pasadas.

4. **Blindaje de Persona y Anti Off-Topic:**
   - El bot actúa 100% como mesero/recepcionista de la pizzería. Rechaza con humor y calidez mexicana solicitudes no relacionadas (programación, videojuegos, tareas escolares o política).

---

## 6. Modelo de Datos Relacional (Supabase / PostgreSQL)

```text
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   restaurants   │◄──────┤      users      │       │  agent_configs  │
└────────┬────────┘       └─────────────────┘       └────────┬────────┘
         │                         │                         │
         ├─────────────────────────┼─────────────────────────┤
         ▼                         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    customers    │◄──────┤  conversations  │──────►│    messages     │
└────────┬────────┘       └────────┬────────┘       └─────────────────┘
         │                         │
         └───────────┬─────────────┘
                     ▼
            ┌─────────────────┐
            │     orders      │
            └────────┬────────┘
                     │
                     ▼
            ┌─────────────────┐
            │   order_items   │
            └─────────────────┘
```

### Tablas Principales

- **`restaurants`**: `id`, `name`, `slug`, `address`, `phone`, `timezone`, `is_active`, `created_at`.
- **`users` & `restaurant_users`**: Usuarios del dashboard, credenciales, roles (`admin`, `staff`).
- **`customers`**: `id`, `restaurant_id`, `phone`, `name`, `address_default`, `notes_md` (TEXT en formato Markdown), `created_at`, `updated_at`.
- **`conversations`**: `id`, `restaurant_id`, `customer_id`, `status` (`open`, `closed`), `mode` (`ai`, `human`), `created_at`, `updated_at`.
- **`messages`**: `id`, `restaurant_id`, `conversation_id`, `role` (`user`, `assistant`, `system`, `human_agent`, `tool`), `content`, `provider_message_id`, `metadata`, `created_at`.
- **`menu_categories`**: `id`, `restaurant_id`, `name`, `sort_order`, `is_active`.
- **`menu_items`**: `id`, `restaurant_id`, `category_id`, `name`, `description`, `price`, `options_schema`, `is_available`.
- **`orders`**: `id`, `restaurant_id`, `customer_id`, `conversation_id`, `status` (`draft`, `confirmed`, `preparing`, `delivered`, `cancelled`), `subtotal`, `delivery_fee`, `discount`, `total`, `delivery_address`, `payment_method`, `created_at`, `updated_at`.
- **`order_items`**: `id`, `order_id`, `product_id`, `quantity`, `unit_price`, `options_selected`, `subtotal`.
- **`agent_configs`**: `id`, `restaurant_id`, `system_prompt`, `business_rules`, `handoff_triggers`, `operating_hours`.

### Checklist de Base de Datos y Producción (Supabase Vibe Coding Checklist)

Auditoría y estado de calidad de la base de datos según los estándares oficiales de producción de Supabase:

#### 🛡️ Seguridad y Hardening
- 🟢 **Row Level Security (RLS):** Habilitado y forzado (`FORCE ROW LEVEL SECURITY`) en las 10 tablas con función `SECURITY DEFINER` y `SET search_path = public`.
- 🟢 **Aislamiento Multi-Tenant:** Todas las consultas y mutations exigen obligatoriamente el filtro `.eq('restaurant_id', validatedTenant)`.
- 🟢 **Gestión de Secretos:** Cero credenciales hardcodeadas en código fuente. Variables inyectadas por entorno en Cloudflare (`.dev.vars` / `wrangler secret`).
- 🟢 **Validación y Sanitización:** Esquemas Zod en todas las fronteras (`phoneSchema` internacional con `+`, `priceSchema` a 2 decimales, límite de 5000 chars en `notes_md`).
- 🟢 **Enmascaramiento de Errores:** Errores internos de PostgreSQL logueados con `console.error` y respuestas genéricas seguras al usuario (`WorkerError` / `ValidationError`).
- 🟡 **Rate Limiting:** Deduplicación en memoria con TTL (60s) en webhooks. Rate limiting global de Cloudflare Workers previsto para despliegue público.
- ⚪ **Supabase Auth & Session Timeouts:** Tablas y RLS listos; la interfaz de login se implementará en el **Hito 5 (Dashboard Next.js)**.

#### 🗄️ Modelado de Datos y Rendimiento
- 🟢 **Estructura Relacional:** 10 tablas normalizadas con claves foráneas, PKs en UUID y restricciones de eliminación seguras (`RESTRICT` en órdenes históricas).
- 🟢 **Integridad y Constraints:** Constraints `CHECK (price >= 0)`, `CHECK (quantity > 0)`, enums para roles/estados y `UNIQUE (restaurant_id, phone)`.
- 🟢 **Indexación Optimizada:** Índices compuestos en `(restaurant_id, category_id)`, `(restaurant_id, is_available)`, `(restaurant_id, status)` sin índices redundantes.
- 🟢 **Triggers Automáticos:** Trigger `update_updated_at_column()` en tablas mutables (`restaurants`, `customers`, `menu_items`, `orders`, `agent_configs`).
- 🟢 **Prevención de Queries N+1:** Consultas relacionales embebidas (`select('*, order_items(*)')`) y cálculo matemático en memoria en TypeScript.
- 🟡 **Selectividad de Columnas:** Métodos actuales usan `select('*')`. Para el MVP es óptimo (<10ms), pero se afinará a columnas específicas si el catálogo escala a miles de productos.
- ⚪ **Backups Automáticos / PITR:** Backups diarios activos por defecto en Supabase Cloud. PITR disponible para el plan Pro al entrar a producción comercial.

#### ⚡ Rendimiento, Testing y Despliegue
- 🟢 **Ejecución Serverless:** Backend en Cloudflare Workers (0 ms cold start, respuesta < 15 ms).
- 🟢 **Testing Determinista Offline:** 78 tests unitarios en Vitest ejecutándose en < 5s sin llamadas externas de red.
- 🟢 **Separación de Entornos:** Configuración local en `.dev.vars` y producción con `wrangler`.
- 🟢 **Observabilidad Básica:** Logs de Cloudflare Workers activados con `observability.enabled = true`.
- ⚪ **Paginación en Catálogo:** El menú actual se entrega completo (~3 KB). Paginación por cursor se agregará si un negocio supera 500 ítems.
- ⚪ **Optimización de Assets / WebP:** Corresponde al **Hito 5 (Dashboard Next.js)** con fotos de platillos en Supabase Storage.
- ⚪ **Monitoreo Avanzado / Sentry:** Previsto para la **Fase 3 del Roadmap (Escala y Madurez)**.

---

## 7. Estrategia de Human Handoff e Intervención en Vivo (Dashboard Nativo)

La supervisión e intervención humana es una funcionalidad nativa y central del producto, gestionada directamente desde el **Dashboard en Next.js (Supabase Realtime)** sin depender de helpdesks de terceros:

1. **Detección Automática o Petición Explícita:**
   - Petición del cliente ("quiero hablar con una persona", "pásame a un asesor").
   - Detección de frustración, enojo o confusión reiterada por parte del LLM.
   - Solicitudes fuera de menú o reglas del restaurante ➡️ La IA invoca `handoff_to_human(reason)`.
2. **Intervención Manual Proactiva desde el Dashboard:**
   - La cocina y el personal del restaurante tienen visibilidad de **todas las conversaciones de WhatsApp en tiempo real** en su pantalla.
   - En cualquier momento, un operador puede hacer clic en **`[ ✋ Tomar Control del Chat ]`**, lo que actualiza `conversations.mode = 'human'` de inmediato.
3. **Silenciamiento Estricto y Devolución a la IA:**
   - Mientras `mode == 'human'`, el Worker **no invoca al LLM (\$0.00 costo)** y cualquier mensaje del cliente se muestra en la pantalla del operador.
   - El personal responde directamente desde la caja/cocina en el Dashboard (o vía WhatsApp Web).
   - Al resolver la duda, el operador presiona **`[ 🤖 Devolver a la IA ]`** (`mode = 'ai'`) y el bot retoma la atención automática al instante.
   - *(Nota: La integración con Chatwoot permanece desacoplada en el código como un adaptador opcional para clientes corporativos con call center, pero queda fuera de la infraestructura estándar para mantener el stack 95% serverless).*

---

## 8. Roadmap y Fases de Desarrollo

### Fase 1: MVP Comercial (Objetivo Inmediato)
- [x] **Hito 1:** Configuración del Worker en Cloudflare y conexión de Webhooks con Evolution API.
- [x] **Hito 2:** Esquema inicial de base de datos en Supabase con RLS habilitado y campo `notes_md` en `customers`.
- [x] **Hito 3:** Orquestador LLM con soporte de Tool Calling determinista (`get_menu`, `add_order_item`, `create_order`, `confirm_order`, `update_customer_notes`, `handoff_to_human`).
- [x] **Hito 4:** Pivote Estratégico de Infraestructura (Descarte de Chatwoot como Core, Blindaje de Whitelist y Anti-Tormenta).
- [x] **Hito 5: Hardening, Optimización de Tokens y Limpieza Técnica:**
  - [x] **Poda de Contexto de Herramientas en LLM (`Context Pruning`):** Compactar payloads históricos de tools (ej. `get_menu`) en `orchestrator.ts` para reducir el consumo de tokens hasta un 60%.
  - [x] **Proxy Reverso `/health` en Playground (`playground/serve.js`):** Soportar health checks a través de túneles remotos (`localtunnel`/`ngrok`) para pruebas con testers externos.
  - [x] **Validación Estricta de Modificadores (`options_schema`):** Validar que las opciones seleccionadas por el LLM pertenezcan estrictamente al esquema del producto antes de insertarlas en `order_items`.
  - [x] **Resiliencia y Tracking de Entrega en WhatsApp (`delivery_status`):** Registrar estado de entrega en `messages` ante fallos o reintentos de red.
  - [x] **Limpieza de Artefactos de Chatwoot:** Limpiar o archivar scripts y configuraciones huérfanas en la raíz del repositorio.
- [/] **Hito 6: Dashboard Administrativo & KDS de Cocina en Next.js (100% Serverless):**
  - **Fase 1: Cimientos y Seguridad Multi-Tenant [COMPLETADA]:**
    - [x] Migración SQL (`20260828000000_hito6_dashboard_saas_roles_realtime.sql`) con columnas de suscripción SaaS, `REPLICA IDENTITY FULL`, RBAC (`owner`, `admin`, `staff`), función `get_auth_user_role()` y RPC atómico `rpc_advance_order_status` con bloqueo pesimista.
    - [x] Backend Cloudflare Worker: Inyección de guardia de suspensión a $0.00 de costo LLM (`Triple Gate - Barrera 2`) y endpoint de despacho humano `POST /api/messages/send` vía `EvolutionWhatsAppProvider`.
    - [x] Scaffolding Next.js 15 App Router en `dashboard/`: `@supabase/ssr` con cookies seguras, `src/middleware.ts` multi-tenant (`Triple Gate - Barrera 1`), flujo de Login PKCE, `TenantProvider` y Shell Layout responsivo (`Sidebar` y `Header`).
    - [x] 408 pruebas unitarias y de integración pasando en verde (31 suites) y build de producción limpio en Next.js.
    - [x] **Módulo 1 — TOP 1 (Criticidad Máxima 9.8/10): Monitor de Chats de WhatsApp & Handoff Humano [COMPLETADO]:**
      - [x] **Bloque 1 (Fundaciones & Infraestructura Segura):**
        - [x] Migración SQL de publicaciones Realtime idempotentes (`supabase/migrations/20260831000000_enable_realtime_publications.sql`).
        - [x] Micro-parser de WhatsApp seguro Anti-XSS y Anti-ReDoS con fast-paths (`dashboard/src/lib/whatsapp/message-parser.tsx`).
        - [x] Motor de alertas sonoras procedural Web Audio API (chime & handoff alarm) con fallback seguro y persistencia (`dashboard/src/lib/audio/sound-alerts.ts`).
        - [x] Server Actions de Next.js multi-tenant con validación Zod, auth check y puente al Worker (`dashboard/src/app/(dashboard)/chats/actions.ts`).
      - [x] **Bloque 2 (Hook & Store Realtime `useLiveChat` con UI Optimista):**
        - [x] Store centralizado con Supabase Realtime (`chats-realtime-${restaurantId}`) para sincronización instantánea de conversaciones y mensajes.
        - [x] UI optimista con rollback transaccional ante fallos de red en `sendMessage`, `setMode` y `setStatus`.
        - [x] Prevención de race conditions por conmutación rápida de chat y descarte estricto de eventos broadcast cross-tenant.
        - [x] Filtrado reactivo en memoria (`useMemo`) por estado (`open`/`closed`), modo (`ai`/`human`) y búsqueda de texto.
        - [x] Certificación adversarial Red-Team con 126 pruebas unitarias y de estrés en verde (`dashboard/test/`).
      - [x] **Bloque 3 (Diseño & Componentes Visuales del Panel de Live Chat) [COMPLETADO]:**
        - [x] `ChatList` & `ChatItem`: Buscador reactivo, pestañas de filtrado (Todos, Abiertos, Cerrados, IA, Humano), selector de sonido y snippets de último mensaje.
        - [x] `ChatDetailHeader`: Ficha superior con enlace directo a WhatsApp, switch de modo (IA / Humano) y botón de cierre/reapertura de ticket.
        - [x] `MessageList` & `MessageBubble`: Burbujas diferenciadas por rol (comensal en Periwinkle, IA con borde Jade, operador humano con borde Slate, sistema en gris tenue) y auto-scroll inteligente con botón "Nuevos mensajes".
        - [x] `MessageInput`: Textarea autoajustable con atajo `Enter`, feedback de envío y advertencia de toma de control.
        - [x] `CustomerSidebar`: Panel colapsable de contexto con datos del cliente y visor de notas markdown (`notes_md`) con edición directa in-place.
        - [x] Cero emojis en toda la interfaz (iconografía exclusiva Lucide React con trazo 1.5px) y tokens Liquid Glass en `globals.css`.
        - [x] Ensamblaje en `src/app/(dashboard)/chats/page.tsx` con arquitectura Trek de 3 columnas, colapso responsivo móvil y skeletons animados.
        - [x] 202 pruebas automatizadas en Vitest pasando en verde (100%) y compilación de producción limpia en Next.js.
    - [x] **Módulo 2 — TOP 2 (Criticidad Operativa 9.0/10): Pantalla KDS de Cocina en Tiempo Real (Completado — 100%):**
      - [x] **Bloque UI & Experiencia Liquid Glass (Toast Matrix) [COMPLETADO]:**
        - [x] Cuadrícula matricial de comandas tipo Toast KDS (selector de densidad 4 vs 5 columnas) en atmósfera Liquid Glass (#FAF8F5, nubes de terracota/salvia, borde vítreo y cero emojis).
        - [x] Cabeceras semafóricas automáticas por tiempo de espera (<8m gris/normal, >8m ámbar/advertencia, >15m rojo/crítico con pulso y ticket preliminar de WhatsApp).
        - [x] Fila interactiva de platillos con tachado táctil (`item-done`), notas de preparación y modificadores.
        - [x] Física de despacho con compresión táctil y animación de salida (`bumpOrder`), más pila de recuperación (`recallOrder`) en 1 clic.
        - [x] Barra inferior flotante de `TOTALES ALL DAY` (conteo agrupado de platillos pendientes) optimizada con hash de dependencias para cero re-cálculos de CPU.
        - [x] Modal rápido de chat para enviar WhatsApp al comensal directamente desde la comanda sin perder el contexto de cocina.
        - [x] Controles de audio y modo pantalla completa (`fullscreen`).
      - [x] **Bloque Backend & Cableado Supabase Realtime [COMPLETADO]:**
        - [x] Suscripción en vivo a cambios en las tablas `orders` y `order_items` filtrados por `restaurant_id` mediante Supabase Realtime (`orders-realtime-${restaurantId}`).
        - [x] Conexión del botón "Despachar / Bump" con el RPC atómico de PostgreSQL `rpc_advance_order_status` (`confirmed` ➔ `preparing` ➔ `ready` ➔ `delivered`) con bloqueo pesimista `SELECT FOR UPDATE` para evitar colisiones entre tablets en cocina.
        - [x] Integración de la `Wake Lock API` del navegador para evitar que las tablets de cocina apaguen o suspendan la pantalla durante el turno.
        - [x] Alerta sonora procedural (Web Audio API) al recibir una orden nueva desde WhatsApp.
        - [x] Sincronización híbrida (WebSockets + refresco de seguridad anti-desconexión WiFi) y auto-archivado de pedidos despachados tras 3 horas con acceso a historial.
    - [x] **Módulo 3 — TOP 3 (Criticidad Media 7.0/10): Menú & Catálogo Interactivo (Options Schema) [COMPLETADO AL 100%]:**
      - [x] Migración SQL `20260909000000_menu_items_sort_order.sql` agregando `sort_order` con índice compuesto.
      - [x] CRUD completo de categorías y platillos con ordenamiento visual y Drag & Drop nativo.
      - [x] Toggle instantáneo de disponibilidad (`is_available`) para pausar platillos agotados en caliente con UI optimista.
      - [x] Editor visual reactivo de `options_schema` (tamaños, orillas, extras con modificadores de precio) validado con Zod y previsualización en vivo.
      - [x] 11 Server Actions multi-tenant con verificación de roles (`owner`/`admin`), pertenencia a tenant y protección amigable contra borrado de platillos con historial de ventas.
      - [x] Atmósfera Liquid Glass con paleta Calidez Toscana Suave (`ambient-layer-menu`) y estricto cumplimiento de Cero Emojis.
      - [x] 330 pruebas unitarias y de integración en Dashboard y 408 en Worker pasando al 100%.
    - [ ] **Módulo 4 — TOP 4 (Criticidad Comercial 6.5/10): Facturación SaaS, Stripe & SPEI:**
      - Integración de Stripe Checkout y Portal de Clientes para suscripciones mensuales recurrentes.
      - Registro y aprobación manual de transferencias SPEI / depósitos en efectivo (México).
      - Gestión de estados de suscripción, Grace Period de 3 días de tolerancia y banner de regularización.
    - [ ] **Módulo 5 — TOP 5 (Criticidad Baja 4.0/10): Ficha de Clientes & Memoria Markdown (`notes_md`):**
      - Listado y buscador de comensales indexado por teléfono y nombre.
      - Editor interactivo de los 4 bloques del "Bloc de Notas del Mesero" (`notes_md`).
      - Historial de pedidos anteriores del cliente para contexto inmediato de soporte.
- **Meta:** 3 a 10 restaurantes operando y cobrando mensualmente.

### Fase 2: Producto Validado
- [ ] Módulo de facturación / suscripciones (Stripe) y métricas de ventas.
- [ ] Onboarding guiado y configuración autónoma de menú por parte del restaurante.
- [ ] Soporte para cálculo dinámico de costos de envío y zonas de entrega.

### Fase 3: Escala y Madurez (100% Serverless)
- [ ] Conexión nativa con Meta WhatsApp Cloud API (Eliminando por completo la micro-VPS de Evolution API, logrando costo \$0 de servidores).
- [ ] Cloudflare Queues y Workflows durables para gestión de picos de demanda y procesos asíncronos.
- [ ] Analítica avanzada de rendimiento del agente y fidelización de comensales.

---

## 9. Directrices Operativas, Seguridad y Calidad

1. **Lectura Obligatoria:** Este archivo (`Project Management/PROYECTO.md`) es la **única referencia** técnica y de requerimientos del proyecto.
2. **Sin Burocracia:** No se utilizan dailies, ceremonias de inicio/cierre ni roadmaps fragmentados. Las tareas se ejecutan y validan directamente contra los objetivos de este documento.
3. **Reglas Activas del Sistema (`.agents/rules/`):**
   - 🛡️ **Seguridad (`.agents/rules/security.md`):** Cero secretos hardcodeados, validación timing-safe de webhooks, sanitización de inputs, double-checkear de no publicar en frontend API keys, RLS multi-tenant obligatorio por `restaurant_id` y Zod en fronteras de LLM.
   - 🧪 **Testing y TDD (`.agents/rules/testing-quality.md`):** Ciclo Red-Green-Refactor, patrón AAA, 100% mocks en tests sin llamadas a APIs externas y tests offline en <5s.
   - 📐 **Estándares de Código (`.agents/rules/code-standards.md`):** TypeScript estricto (`noUncheckedIndexedAccess`), Zod en boundaries, inmutabilidad y límite de 300-400 líneas por archivo.

---

## 10. Herramientas de Desarrollo Local (DEV ONLY — Prohibido en Producción)

> ⚠️ **ADVERTENCIA DE PRODUCCIÓN:** Las herramientas dentro de esta sección están diseñadas **exclusivamente para desarrollo, pruebas de estrés e iteración local de ingeniería**. Jamás deben desplegarse en entornos públicos ni exponerse a usuarios finales.

### Playground / Simulador de Conversaciones y Cocina (`playground/`)
- **Propósito:** Entorno visual local desacoplado para simular múltiples clientes de WhatsApp en paralelo, monitorear el flujo de órdenes en tiempo real ("Vista Cocina") e inspeccionar el razonamiento y las tools ejecutadas por el agente LLM (`Debug View`).
- **Funcionalidades Clave:**
  1. **Simulador Multi-Cliente:** Creación y alternancia entre múltiples clientes simultáneos con números y nombres independientes.
  2. **Vista Cocina y Comandas en Vivo:** Renderizado reactivo de pedidos activos, desglose de opciones, cálculo financiero determinista y estados de cocina (`draft` ➡️ `confirmed` ➡️ `preparing` ➡️ `delivered`).
  3. **Bloc de Notas del Mesero en Tiempo Real:** Visualización y sincronización inmediata de la ficha `notes_md` de 4 bloques en Supabase.
  4. **Toggle Manual de Human Handoff:** Botón interactivo para alternar entre `🤖 Modo IA (Activo)` y `👤 Modo Humano (Bot Silenciado)`.
  5. **Exportación y Auditoría con 1 Clic:** Botones para copiar al portapapeles la transcripción completa formateada en Markdown (`Copiar Registro`) o descargar el log completo en archivo JSON (`Exportar JSON`).
  6. **Reverse Proxy Integrado (`serve.js`):** Permite exponer el frontend y las llamadas al Worker a través de un único puerto (`3000`), soportando `/health`, `/webhook/*` y `/api/*`, habilitando túneles remotos (`npm run tunnel` / `npx localtunnel --port 3000`).

---

## 11. Bitácora de Cambios Recientes y Tareas Pendientes

### ✅ Cambios Implementados en el Agente y Backend:
1. **Sincronización Determinista del Carrito (`current_cart`):** Todas las herramientas de mutación (`add_order_item`, `remove_order_item`, `update_order_item_quantity`, `get_current_order`) retornan el desglose de productos y subtotales reales calculados por PostgreSQL.
2. **Nueva Tool `update_order_item_quantity`:** Modificación directa de cantidades sin borrar ni recrear ítems.
3. **Consolidación Asíncrona / Lazy de Memoria (`memory-consolidator.ts`):** Extracción y estructuración en 4 bloques de `notes_md` en segundo plano (0ms de latencia) tras confirmar pedidos.
4. **Enriquecimiento del Último Pedido (`formatLastOrder`):** Resolución de nombres de productos y modificadores para eliminar la ceguera del LLM sobre pedidos previos.
5. **Protocolos de Verificación Activa y "Lo de Siempre":** Confirmación proactiva de dirección/alergias al pagar y respuesta honesta con base en memoria previa al pedir lo habitual.
6. **Control de Acceso y Blindaje de Webhooks (Whitelist & Anti-Storm):**
   - **Lista Blanca de Teléfonos (`PHONE_WHITELIST` / `DEV_PHONE_WHITELIST`):** En desarrollo/pruebas, el bot solo responde a números autorizados; el resto se descarta con HTTP 200 sin tocar la BD ni el LLM.
   - **Filtro Anti-Tormenta (`MAX_MESSAGE_AGE_SECONDS = 120`):** Al encender Docker/Evolution API, descarta automáticamente ráfagas de mensajes históricos con más de 2 minutos de antigüedad.
   - **Filtro de Difusiones y Estados:** Descarte de mensajes de `@broadcast` y `status@broadcast`.
7. **Pivote Estratégico de Arquitectura (Descarte de Chatwoot como Core):**
   - Se elimina la necesidad de desplegar el stack pesado de Chatwoot (Ruby on Rails + Sidekiq + Redis) en producción.
   - El monitoreo de chats, las comandas de cocina y la intervención humana se centralizan de forma nativa en el **Dashboard en Next.js (Hito 6)** con Supabase Realtime.
   - La infraestructura en VPS se reduce exclusivamente a alojar `evolution-api` (~150-300MB RAM, \$4 USD/mes), logrando una arquitectura 95% Serverless.
8. **Hito 5 Completado (Hardening, Optimización de Tokens y Limpieza Técnica):**
   - **Poda de Contexto (`Context Pruning`):** Compactación inteligente de payloads de herramientas pasadas (ej. `get_menu`, catálogos) en `orchestrator.ts`, reduciendo significativamente el consumo de tokens en conversaciones largas.
   - **Validación Estricta de Modificadores (`options_schema`):** Validador determinista (`modifier-validator.ts`) integrado en `add-order-item.ts` y en `order-repository.ts` (`addItem`) que rechaza opciones inválidas o modificadores con precios manipulados con `ValidationError`.
   - **Tracking de Entrega en WhatsApp (`delivery_status`):** Registro y actualización del estado de entrega (`sent`, `failed`, `delivered`) y `provider_message_id` en `MessageRepository` y `EvolutionProvider` para mensajes del bot y de agentes humanos.
   - **Proxy Reverso `/health` en Playground:** Actualización de `playground/serve.js` para enrutar dinámicamente `/health`, `/webhook/*` y `/api/*` hacia el Worker en el puerto 8787.
   - **Archivado de Artefactos de Chatwoot:** Reorganización limpia de 8 archivos Docker/scripts/docs heredados en `_archive/legacy_chatwoot/` y actualización del `package.json` raíz.
10. **Hito 6 — Fase 1 (Cimientos y Seguridad SaaS) Completada:**
    - **Migración SQL (`20260828000000_hito6_dashboard_saas_roles_realtime.sql`):** Columnas de suscripción SaaS (`subscription_status`, `subscription_tier`, Stripe IDs, `trial_ends_at`, `grace_period_ends_at`, `max_orders_per_month`), `REPLICA IDENTITY FULL` en 7 tablas para Realtime seguro con RLS, función `get_auth_user_role()` con `SECURITY DEFINER`, políticas RLS por rol (`owner`, `admin`, `staff`) y RPC atómico `rpc_advance_order_status` con `SELECT FOR UPDATE` para evitar colisiones entre tablets en cocina.
    - **Guardia de Suspensión a $0.00 de Costo LLM (Triple Gate - Barrera 2):** En `handler.ts`, los webhooks de restaurantes suspendidos persisten el mensaje para el dashboard pero omiten 100% las llamadas al LLM.
    - **Despacho Humano Desacoplado (`POST /api/messages/send`):** Endpoint autenticado en el Worker para que el Dashboard envíe mensajes de WhatsApp vía `EvolutionWhatsAppProvider` sin pasar por el LLM ($0.00 costo de IA).
    - **Next.js 15 App Router (`dashboard/`):** Clientes `@supabase/ssr` (server, client, middleware), `src/middleware.ts` con redirección automática a `/billing` para cuentas suspendidas (`Triple Gate - Barrera 1`), pantalla de Login PKCE, `TenantProvider` para soporte de multi-sucursal y Shell Layout responsivo (`Sidebar`, `Header` y vistas base).
11. **Módulo 1 — Monitor de Live Chat de WhatsApp & Handoff Humano [COMPLETADO]:**
    - **Infraestructura y Realtime:** Hook centralizado `useLiveChat` conectado en vivo a Supabase Realtime (`chats-realtime-${restaurantId}`) con deduplicación y UI optimista.
    - **Server Actions Multi-Tenant:** `sendHumanMessage`, `toggleConversationMode`, `toggleConversationStatus` y `updateCustomerNotes` protegidas con Zod y verificación de tenant en Supabase.
    - **Diseño Liquid Glass:** Arquitectura Trek de 3 columnas (Mini KPI Ribbon, Cockpit central y cajón lateral deslizable *Ficha & Bloc*), reproductor de notas de voz de WhatsApp, respuestas rápidas de 1 clic, tipografías oficiales `Plus Jakarta Sans` y `JetBrains Mono`, y estricto Cero Emojis.
    - **Pruebas y Calidad:** 202 pruebas unitarias y de estrés en Vitest pasando en verde (100%) y compilación de producción limpia (`npm run build` con código 0).
12. **Módulo 2 — Pantalla KDS de Cocina en Tiempo Real (Bloque UI [COMPLETADO] — 50%):**
    - **Matriz Toast KDS:** Cuadrícula de comandas en `/kds` con selector de 4 vs 5 columnas y atmósfera Liquid Glass.
    - **Semáforos y Física:** Cabeceras semafóricas automáticas (<8m normal, >8m advertencia, >15m crítico), tachado de platillos (`item-done`), animación de salida física (`bumpOrder`), pila de recuperación (`recallOrder`) y modal rápido de WhatsApp comensal-cocina.
    - **Barra de Totales All Day & Rendimiento:** Resumen flotante inferior con hash de dependencias para 0% de re-cálculos de CPU, memoización con `React.memo` y aislamiento de composición de GPU (`contain: strict; transform: translate3d`) en el canvas ambiental.
13. **100% de Pruebas Automatizadas Pasando:** 31 suites en Worker (408 tests) + 9 suites en Dashboard (202 tests) ejecutándose en verde (<5s) y build de producción limpio en Next.js (`npm run build` en 2.4s).

### 📌 Tareas Pendientes y Próximos Pasos (Hito 6 — Fase 2: Módulos Funcionales Independientes):
*Los siguientes módulos se abordan progresivamente según prioridad operativa:*

1. ✅ **Módulo 1 — TOP 1: Monitor de Chats de WhatsApp & Handoff Humano [COMPLETADO AL 100%]**

2. ✅ **Módulo 2 — TOP 2 (Criticidad Operativa 9.0/10): Pantalla KDS de Cocina en Tiempo Real [COMPLETADO AL 100%]:**
   - [x] **UI & Experiencia Toast KDS:** Matriz de 4/5 cols, semáforo dinámico, tachado de platillos, bump/recall, totales All Day y chat modal rápido.
   - [x] **Suscripción Supabase Realtime:** Escuchar cambios en vivo en `orders` y `order_items` filtrados por `restaurant_id` (`orders-realtime-${restaurantId}`).
   - [x] **Despacho Transaccional Atómico:** Conectar el botón "Despachar / Bump" con el RPC de PostgreSQL `rpc_advance_order_status` (`confirmed` ➔ `preparing` ➔ `ready` ➔ `delivered`) usando bloqueo pesimista `SELECT FOR UPDATE` para evitar colisiones entre tablets en cocina.
   - [x] **Wake Lock API:** Mantener encendida la pantalla de la tablet de cocina durante el servicio activo sin que se suspenda.
   - [x] **Alertas Sonoras Procedurales:** Reproducir chime audible con Web Audio API cuando entre una nueva comanda desde WhatsApp.
   - [x] **Sincronización Híbrida & Auto-Archivado:** Sincronización anti-desconexión WiFi y auto-archivado de pedidos tras 3 horas con acceso a historial.

3. ✅ **Módulo 3 — TOP 3 (Criticidad Media 7.0/10): Menú & Catálogo Interactivo (Options Schema) [COMPLETADO AL 100%]:**
   - [x] Migración SQL `20260909000000_menu_items_sort_order.sql` agregando `sort_order` con índice compuesto.
   - [x] CRUD de categorías y platillos con ordenamiento visual y Drag & Drop nativo.
   - [x] Toggle instantáneo de disponibilidad (`is_available`) para pausar productos e ingredientes agotados en caliente con UI optimista.
   - [x] Editor visual estructurado de `options_schema` (tamaños, orillas, extras con modificadores de precio) validado con Zod y previsualización.
   - [x] 11 Server Actions multi-tenant con verificación de rol y protección referencial de pedidos históricos.
   - [x] Capa ambiental Liquid Glass Calidez Toscana Suave (`ambient-layer-menu`) y cero emojis en la interfaz.

4. **Módulo 4 — TOP 4 (Criticidad Comercial 6.5/10): Facturación SaaS, Stripe & SPEI:**
   - Integración de Stripe Checkout y Customer Portal para cobros recurrentes de suscripciones.
   - Registro y aprobación manual de pagos por transferencia SPEI / efectivo para México.
   - Gestión de estados de suscripción, Grace Period de 3 días de tolerancia y banner visual de regularización.

5. **Módulo 5 — TOP 5 (Criticidad Baja 4.0/10): Ficha de Clientes & Memoria Markdown (`notes_md`):**
   - Listado y buscador de clientes indexado por teléfono y nombre.
   - Editor de los 4 bloques del "Bloc de Notas del Mesero" (`notes_md`) con sanitización HTML/Markdown.
   - Historial de pedidos anteriores del cliente para contexto inmediato.

