---
trigger: always_on
description: Estándares estrictos de seguridad, protección de secretos, validación de webhooks y aislamiento multi-tenant (inspirados en Everything Claude Code y OWASP).
---

# 🛡️ Directrices de Seguridad (Security Guidelines)

Todos los agentes y desarrolladores deben cumplir estrictamente las siguientes reglas en cada línea de código, endpoint y migración.

---

## 1. Gestión de Secretos y Configuración
- **Cero Secretos Hardcodeados:** Jamás incluir API keys, tokens de webhook, contraseñas ni URLs con credenciales en el código fuente.
- **Entorno Local:** Usar `.dev.vars` (ignorado en `.gitignore`). Todos los ejemplos públicos deben documentarse en `.dev.vars.example` con valores vacíos o ficticios.
- **Entorno de Producción:** Los secretos se inyectan como variables de entorno de Cloudflare Workers (`env.SECRET_NAME` vía `wrangler secret`).
- **Commits y Logs:** Nunca imprimir secretos o tokens en `console.log()` ni en respuestas de error HTTP.

---

## 2. Autenticación y Validación de Webhooks (WhatsApp / Evolution API)
- **Token Secreto Compartido:** Todo webhook entrante (`POST /webhook/...`) debe validar el header `apikey` o `x-webhook-token` contra `env.WEBHOOK_GLOBAL_TOKEN`.
- **Comparación Segura en Tiempo Constante:** Usar comparaciones seguras (timing-safe) para evitar ataques de timing al validar firmas o tokens de autenticación.
- **Rechazo Temprano:** Si el token es inválido o no existe, responder de inmediato con `401 Unauthorized` sin parsear el cuerpo del mensaje.

---

## 3. Aislamiento Estricto Multi-Tenant (Protección de Datos)
- **Aislamiento por `restaurant_id`:** En **cada consulta**, inserción, actualización o eliminación en Supabase/PostgreSQL, el filtro `restaurant_id` / `tenant_id` es **obligatorio**.
- **Row Level Security (RLS):** Toda tabla creada en PostgreSQL debe tener RLS habilitado (`ALTER TABLE x ENABLE ROW LEVEL SECURITY;`).
- **Prevención de Fuga de Datos:** Ningún comensal o restaurante puede consultar pedidos, menús privados ni conversaciones de otro negocio.

---

## 4. Guardrails para el Agente de IA y LLM
- **Validación con Zod en Fronteras:** Todos los argumentos generados por el LLM para invocar herramientas (`Tool Calling`) deben validarse estrictamente con esquemas Zod antes de ejecutar cualquier operación en backend o base de datos.
- **El LLM no calcula precios ni inventa totales:** El total del pedido, descuentos e impuestos se calculan de forma determinista en TypeScript, nunca por inferencia del LLM.
- **El LLM no ejecuta código ni SQL:** Prohibido el uso de `eval()`, queries dinámicas sin parametrizar o ejecución de scripts generados por IA.
- **Protección contra Prompt Injection:** El contenido enviado por el usuario de WhatsApp debe tratarse siempre como datos no confiables (*untrusted user input*).

---

## 5. Respuestas de Error Seguras
- **Ocultar Detalles Internos:** En respuestas de error HTTP o mensajes devueltos por WhatsApp, jamás exponer stack traces, nombres de tablas de base de datos ni versiones de software.
- **Mensajes Genéricos para el Usuario:** Devolver mensajes amigables al comensal (ej. *"Tuvimos un problema temporal al procesar tu pedido, un asesor humano te atenderá enseguida"*).
