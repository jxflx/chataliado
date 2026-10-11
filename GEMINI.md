# ChatAliado — Contexto del Proyecto

## ¿Qué es ChatAliado?
Plataforma SaaS multi-tenant que automatiza conversaciones, pedidos y citas para PYMES en México (foco inicial: restaurantes y pizzerías) mediante WhatsApp y Modelos de Lenguaje (LLMs).

## Arquitectura y Stack (Propuesta 3)
- **Backend & Orquestador:** Cloudflare Workers (TypeScript)
- **Base de Datos & Auth:** Supabase (PostgreSQL + RLS)
- **Canal WhatsApp:** Evolution API (con QR para MVP) desacoplado mediante interfaz `WhatsAppProvider` (preparado para Meta WhatsApp Cloud API)
- **Inbox Humano, KDS & Dashboard:** Next.js (Dashboard Nativo Serverless con Supabase Realtime)

## Fuentes Únicas de Verdad
- **Visión Técnica, Backend y Roadmap:** 👉 [Project Management/PROYECTO.md](file:///c:/Users/jesus/prog/chataliado/Project%20Management/PROYECTO.md)
- **Sistema de Diseño, UI e Identidad (Liquid Glass):** 👉 [Project Management/DESIGN/DESIGN.md](file:///c:/Users/jesus/prog/chataliado/Project%20Management/DESIGN/DESIGN.md)
- **Prototipo Interactivo Vivo:** 👉 [`Project Management/DESIGN/kds-liquid-glass.html`](file:///c:/Users/jesus/prog/chataliado/Project%20Management/DESIGN/kds-liquid-glass.html)

## Reglas Obligatorias para Agentes y Subagentes
1. **Siempre** consultar `Project Management/PROYECTO.md` antes de implementar cambios o proponer soluciones técnicas.
2. **El LLM nunca toca directamente la base de datos** ni calcula precios/totales por su cuenta; todo se ejecuta a través de Tools estructuradas y validadas por el backend.
3. **Multi-tenancy obligatorio:** Todas las tablas y operaciones deben exigir aislamiento por `restaurant_id` / `tenant_id` y RLS en Supabase.
4. **Diseño UI / Frontend obligatorio:** Todo componente visual debe cumplir con `DESIGN.md` (Liquid Glass, tipografía Plus Jakarta Sans + JetBrains Mono, pared de color Monograph y **CERO EMOJIS**; solo iconos Lucide).
5. **Flujo de trabajo simple:** Gestión directa y autónoma mediante subagentes sin burocracia de dailies, plantillas de inicio/cierre ni sprints fragmentados.
6. **Commits:** Formato Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`).
