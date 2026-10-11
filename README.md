# 🍕 ChatAliado

Plataforma SaaS multi-tenant que automatiza conversaciones, pedidos y atención al cliente para PYMES en México (foco inicial: restaurantes y pizzerías) mediante WhatsApp y Modelos de Lenguaje (LLMs).

---

## 🏛️ Arquitectura del Sistema (Propuesta 3)

- **Backend & Orquestador de IA (`worker/`):** Cloudflare Workers (TypeScript) con Tool Calling determinista, Context Pruning y enrutamiento webhook timing-safe.
- **Frontend & KDS (`dashboard/`):** Next.js 16 (React 19, Tailwind CSS v4) con Sistema de Diseño **Liquid Glass**, visualización de comandas en tiempo real (KDS), Live Chat humano y administración de catálogos.
- **Base de Datos & Auth (`supabase/`):** Supabase (PostgreSQL 15+ con Row Level Security multi-tenant por `restaurant_id`).
- **Canal WhatsApp:** Interfaz agnóstica `WhatsAppProvider` (adaptador para Evolution API y preparado para Meta WhatsApp Cloud API).
- **Simulador Local (`playground/`):** Sandbox visual sin dependencias externas para emular mensajes de WhatsApp, trazabilidad de tools del LLM y visualización de comandas en desarrollo.

---

## 📁 Estructura del Repositorio

```text
chataliado/
├── worker/               # Backend en Cloudflare Workers (Orquestador LLM, Tools, Webhooks)
├── dashboard/            # Panel de Administración & KDS en Next.js (Liquid Glass)
├── supabase/             # Migraciones PostgreSQL, esquemas RLS y datos semilla
├── playground/           # Simulador interactivo local para desarrollo rápido
├── Project Management/   # Visión técnica, sistema de diseño y roadmap arquitectónico
├── docker-compose.yml    # Infraestructura local (Evolution API + Postgres)
├── package.json          # Scripts raíz del workspace
└── .gitignore            # Exclusión estricta de secretos, caches y dependencias
```

---

## 🚀 Inicio Rápido (Desarrollo Local)

### 1. Requisitos Previos

- **Node.js:** v20+ o v22+
- **npm:** v10+
- **Docker** (opcional, para ejecutar Evolution API en local)

### 2. Configuración de Variables de Entorno

Nunca subas secretos o API keys al repositorio. Cada subsistema cuenta con su plantilla de ejemplo:

```bash
# 1. Configurar variables del Cloudflare Worker
cp worker/.dev.vars.example worker/.dev.vars

# 2. Configurar variables del Dashboard Next.js
cp dashboard/.env.example dashboard/.env.local
```

### 3. Ejecución de Pruebas Automatizadas

El proyecto cuenta con una cobertura integral de pruebas deterministas (TDD / Vitest):

```bash
# Ejecutar pruebas del Worker (Cloudflare Vitest Pool)
npm --prefix worker test

# Ejecutar pruebas del Dashboard (Vitest + React Testing Library)
npm --prefix dashboard test

# Ejecutar suite de pruebas del Playground
node playground/test-runner.js
```

### 4. Iniciar Servicios en Desarrollo

```bash
# Iniciar Worker en local
npm --prefix worker run dev

# Iniciar Dashboard Next.js
npm --prefix dashboard run dev

# Iniciar Simulador Playground
node playground/serve.js
```

---

## 🛡️ Principios de Seguridad

1. **Cero Secretos en Código:** Variables inyectadas en tiempo de ejecución vía `.dev.vars` o `wrangler secret`.
2. **Aislamiento Multi-Tenant Estricto:** Toda consulta y mutación exige filtrado por `restaurant_id` respaldado por políticas RLS en Supabase.
3. **El LLM no ejecuta SQL ni calcula dinero:** Los totales, subtotales y disponibilidad de productos se calculan mediante funciones deterministas en TypeScript.
4. **Validación con Zod en todas las Fronteras:** Todo webhook, petición HTTP y parámetro de llamada a herramientas de IA es validado con esquemas Zod estrictos.

---

## 📖 Documentación Adicional

- [Project Management/PROYECTO.md](Project%20Management/PROYECTO.md): Especificación técnica completa, catálogo de herramientas y arquitectura.
- [Project Management/DESIGN/DESIGN.md](Project%20Management/DESIGN/DESIGN.md): Sistema de diseño Liquid Glass y tokens visuales.
- [AUDITORIA_ARQUITECTURA_TRIADA.md](AUDITORIA_ARQUITECTURA_TRIADA.md): Auditoría de seguridad y análisis de resiliencia.
