# 🍕 ChatAliado — Interactive Local Playground & WhatsApp Simulator

> ⚠️ **HERRAMIENTA EXCLUSIVA DE DESARROLLO LOCAL (`DEV_ONLY`) — NUNCA DESPLEGAR EN PRODUCCIÓN**  
> Este Playground es una herramienta de ingeniería para pruebas internas, depuración de prompts, simulación de webhooks y validación de herramientas LLM en entorno local (`localhost`). Contiene configuraciones por defecto y claves de prueba para desarrollo offline.

---

## 🎯 Propósito y Visión General

El **ChatAliado Playground** es una SPA (Single Page Application) estática ultraligera de 3 paneles diseñada para simular conversaciones concurrentes de clientes de WhatsApp contra el backend de Cloudflare Workers de ChatAliado, con visualización en tiempo real de:

1. **Panel 1 (Izquierdo) — Simulador Multi-Cliente de WhatsApp:**
   - Envío de mensajes como comensal simulando eventos `messages.upsert` de Evolution API.
   - Selector rápido de contactos precargados (Carlos, Zam VIP, Nuevo Cliente) y creación de nuevos números al vuelo.
   - Respuestas del agente de IA en formato WhatsApp Dark con indicador de escritura (*typing indicator*).
   - Presets de mensajes rápidos (ver menú, pedir pepperoni, notas de memoria, confirmar pedido, escalar a humano).

2. **Panel 2 (Central) — Tablero de Cocina y Pedidos en Tiempo Real:**
   - Visualización de la comanda activa (`draft` vs `confirmed`).
   - Desglose ítem por ítem con cantidades, precios unitarios, modificadores/opciones seleccionadas y subtotales.
   - Resumen financiero calculado de forma 100% determinista por el backend (Subtotal, Costo de Envío, Descuentos, Total a Pagar).
   - Metadatos de entrega (dirección acordada) y método de pago (`cash`, `transfer`, `card`).
   - Botón interactivo para copiar la comanda formateada al portapapeles.

3. **Panel 3 (Derecho) — Inspector de Tools y Memoria del Cliente (Debugger):**
   - **Indicador de Modo Conversacional:** Estado activo de IA (`🤖 MODO IA`) vs Silenciamiento por Handoff (`👤 MODO HUMANO`) con extracción automática del motivo de escalamiento.
   - **Bloc de Notas del Mesero en Vivo (`notes_md`):** Visualización reactiva en Markdown del campo de memoria persistente del cliente con contador de caracteres y animación de actualización.
   - **Línea de Tiempo de Tools del LLM:** Registro cronológico de cada una de las 10 herramientas deterministas invocadas por el modelo (`get_menu`, `get_product`, `create_order`, `add_order_item`, `remove_order_item`, `get_current_order`, `confirm_order`, `get_customer`, `update_customer_notes`, `handoff_to_human`), con acordeones interactivos, argumentos de entrada, salidas devueltas formateadas en JSON con syntax highlighting y buscador/filtros en tiempo real.

---

## 🏗️ Arquitectura y Tecnologías

- **Zero Build Step:** Cero configuración de compiladores (sin Webpack, Vite, ni Babel). Se ejecuta directamente en cualquier navegador moderno abriendo `index.html`.
- **HTML5 & Tailwind CSS:** Diseño visual moderno, responsivo y adaptado para modo oscuro utilizando Tailwind CSS vía CDN (`cdn.tailwindcss.com`).
- **JavaScript Modular (ES6):** Estructura desacoplada estilo Lego:
  - `config.js`: Configuración activa y persistencia local (`localStorage`).
  - `js/store.js`: Store reactivo con arquitectura pub/sub (`PlaygroundStore`).
  - `js/api.js`: Cliente HTTP (`ApiClient`) para despachar webhooks de Evolution API y consultar PostgREST de Supabase.
  - `js/chat-ui.js`: Controlador del chat y simulador de clientes.
  - `js/kitchen-ui.js`: Controlador del tablero de cocina y pedidos.
  - `js/debugger-ui.js`: Inspector de memoria Markdown y timeline de tools LLM.
  - `js/app.js`: Orquestador principal, health checks, modal de ajustes, toasts y polling periódico.

---

## 🚀 Inicio Rápido (Quick Start)

### 1. Iniciar el Backend Worker Local
En una terminal, levanta el Worker de Cloudflare con Miniflare / Wrangler:
```bash
cd worker
npm run dev
```
El worker estará disponible en `http://localhost:8787` y su webhook en `http://localhost:8787/webhook/evolution`.

### 2. Abrir el Playground
Puedes abrirlo directamente en tu navegador o servirlo con cualquier servidor HTTP local:

#### Opción A (Navegador directo):
Abre el archivo `playground/index.html` en Google Chrome, Edge o Firefox.

#### Opción B (Con servidor HTTP ligero):
```bash
# Con npx serve
npx serve playground -p 3000

# O con Python 3
cd playground
python -m http.server 3000
```
Luego abre `http://localhost:3000` en tu navegador.

### 3. Configuración y Ajustes
Haz clic en el ícono ⚙️ en la esquina superior derecha del Playground para abrir el modal de ajustes:
- **Worker Webhook URL:** `http://localhost:8787/webhook/evolution`
- **Worker API Key:** `test-evo-api-key`
- **Supabase REST URL:** `https://juqjmydmkljlrrowxdio.supabase.co`
- **Supabase Service Key:** Llave de desarrollo local / staging.
- **Intervalo de Polling:** `3000` ms (ajustable según conveniencia).

---

## 🧪 Guía de Uso y Escenarios de Prueba

A continuación se describen los 5 escenarios fundamentales para probar las capacidades del orquestador LLM de ChatAliado:

### Escenario 1: Consulta de Menú y Productos
1. Selecciona a **Carlos Mendoza** en la lista de contactos.
2. Haz clic en el botón preset `🍕 Ver menú` o escribe: *"¡Hola! ¿Qué pizzas tienen en el menú?"*.
3. **Comportamiento esperado:**
   - El Worker recibe el webhook y el LLM ejecuta la tool `get_menu`.
   - En el Panel 3 (Debugger), aparece la llamada a `get_menu` con estado ✅ Éxito.
   - En el Panel 1 (Chat), el asistente responde con la lista formateada de pizzas y precios.

### Escenario 2: Creación y Modificación de Pedido
1. Escribe: *"Quiero ordenar una Pizza Pepperoni grande y un refresco"*.
2. **Comportamiento esperado:**
   - El LLM ejecuta `create_order` (o `get_current_order`) y luego `add_order_item`.
   - En el Panel 2 (Cocina), la comanda pasa a estado `🟡 Borrador en curso`.
   - Aparece la tabla con los ítems, cantidades, precio unitario y el subtotal calculado automáticamente por el backend determinista.

### Escenario 3: Actualización de Notas de Memoria ("Bloc de Notas del Mesero")
1. Escribe: *"Recuerda que no me gusta la cebolla en ninguna pizza y soy alérgico a los mariscos"*.
2. **Comportamiento esperado:**
   - El LLM detecta las preferencias del comensal y ejecuta la tool `update_customer_notes`.
   - En el Panel 3, el bloque **Bloc de Notas del Mesero (`notes_md`)** se actualiza en vivo con un destello cian, mostrando las preferencias renderizadas en Markdown y el contador de caracteres.

### Escenario 4: Confirmación de Pedido
1. Escribe: *"Mi dirección es Av. Reforma 123 y pagaré en efectivo. Por favor confirma mi pedido"*.
2. **Comportamiento esperado:**
   - El LLM ejecuta `confirm_order` con la dirección y método de pago (`cash`).
   - En el Panel 2 (Cocina), el badge cambia a `🟢 Confirmado / En Cocina`.
   - Se despliega la dirección de entrega y el método de pago `EFECTIVO`.
   - Puedes hacer clic en `📋 Copiar Comanda` para obtener el texto formateado para ticket de cocina.

### Escenario 5: Escalamiento y Silenciamiento Humano (Handoff)
1. Escribe: *"Tengo un problema grave con mi cobro anterior y quiero hablar con una persona por favor"*.
2. **Comportamiento esperado:**
   - El LLM invoca la tool `handoff_to_human`.
   - En el Panel 3, el badge cambia a `👤 MODO HUMANO (BOT SILENCIADO)` y se muestra el motivo extraído.
   - Cualquier mensaje posterior del usuario no recibirá respuesta automática de la IA mientras permanezca en modo humano.

---

## 🔬 Suite de Pruebas Automatizadas

El proyecto cuenta con una suite completa de pruebas unitarias y de integración offline ejecutables con Node.js:

```bash
# Ejecutar toda la suite de pruebas del Playground (M1 a M5)
node test-runner.js

# O ejecutar suites individuales:
node test-m1.js   # Config, Reactive Store, CSS y Estructura HTML
node test-m2.js   # ApiClient, Chat UI Controller y Webhooks
node test-m3.js   # Tablero de Cocina, Resumen Financiero y Comanda
node test-m4.js   # Debugger UI, Memoria Markdown y Timeline de Tools
node test-m5.js   # Orquestador App, Health Checks, Polling, Toasts y Ajustes
```

### Ejecutar Pruebas del Backend Worker:
```bash
cd ../worker
npm test
```

---

## 🔒 Reglas de Seguridad y Buenas Prácticas
1. **No exponer en internet:** Esta herramienta no cuenta con capa de autenticación para usuarios finales ni control de acceso basado en roles; está diseñada exclusivamente para uso en `localhost`.
2. **Determinismo:** Los precios y subtotales se calculan exclusivamente en el backend (`TypeScript`), jamás mediante estimaciones del modelo de lenguaje.
3. **Aislamiento Multi-Tenant:** Todas las consultas en PostgREST filtran por `restaurant_id` para garantizar la segregación de datos.
