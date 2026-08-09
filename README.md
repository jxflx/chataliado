# ChatAliado — MVP Fase 1

Asistente conversacional para PYMES en México. Primer caso de uso: **nutriólogo que gestiona citas**. Incluye backend FastAPI, dashboard web mínimo y chat simulado (hace las veces de WhatsApp antes de la integración real).

## Requisitos

- Python 3.12+ (probado con 3.14)
- SQLite (incluido con Python). PostgreSQL es opcional para producción.

## Instalación

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -e .[dev]
copy .env.example .env   # y edita SECRET_KEY
```

## Ejecutar

```powershell
.venv\Scripts\python -m uvicorn app.main:app --reload
```

- Dashboard del negocio: http://localhost:8000/
- Chat simulado (rol paciente): http://localhost:8000/chat
- Documentación de la API: http://localhost:8000/docs

## Flujo de prueba manual

1. Abre `/` y registra tu negocio (nombre, email, contraseña).
2. En **Servicios**, crea un servicio (ej. "Consulta de nutrición", $500, 60 min).
3. En **Horarios**, añade bloques semanales (ej. lunes a viernes 09:00–18:00) y guarda.
4. Abre `/chat` en otra pestaña, usa el ID de negocio `1`, escribe "hola" y "¿cuánto cuesta?".
5. En **Citas**, pulsa "Ver horarios disponibles", elige un slot y crea la cita.
6. En **Conversaciones**, abre la conversación, pulsa "Tomar control" y responde manualmente. El bot deja de responder en `/chat`.

## Pruebas y linting

```powershell
.venv\Scripts\python -m pytest -q         # 42 pruebas (slots, citas, takeover, aislamiento...)
.venv\Scripts\python -m ruff check app tests
.venv\Scripts\python scripts\smoke_e2e.py  # con el servidor corriendo en :8010
```

## Migraciones (Alembic)

En desarrollo las tablas se crean automáticamente al arrancar. Para entornos gestionados:

```powershell
.venv\Scripts\python -m alembic upgrade head
```

## PostgreSQL (opcional)

```powershell
docker compose up -d
# En .env:
# DATABASE_URL=postgresql+psycopg://chataliado:chataliado@localhost:5432/chataliado
.venv\Scripts\python -m pip install -e .[postgres]
```

## Arquitectura

Monolito modular:

```text
app/
├── main.py               # FastAPI, manejo de errores, dashboard estático
├── core/                 # configuración, seguridad (Argon2 + JWT), dependencias
├── modules/
│   ├── auth/             # registro, login, /auth/me
│   ├── businesses/       # datos y zona horaria del negocio
│   ├── patients/         # pacientes (nombre + teléfono)
│   ├── services/         # servicios, precios, duración, modalidad
│   ├── availability/     # reglas semanales, bloqueos, cálculo de slots
│   ├── appointments/     # citas con creación transaccional anti doble-reserva
│   └── conversations/    # chat simulado, mensajes, takeover, cierre
├── infrastructure/       # base de datos y proveedor de LLM intercambiable
└── shared/               # errores de dominio y auditoría
```

### Decisiones clave

- **Doble validación de disponibilidad**: los slots se calculan al consultarlos y se revalidan dentro de la transacción de creación (con `SELECT ... FOR UPDATE` sobre el negocio en PostgreSQL) para impedir dobles reservas concurrentes.
- **LLM intercambiable**: `app/infrastructure/llm.py` define la interfaz `LLMProvider`. Hoy se usa `MockLLMProvider` (determinista, gratis, testeable). El LLM **nunca** crea citas: sólo interpreta; el backend valida y ejecuta.
- **Escalamiento a humano**: el bot transfiere la conversación (`human_requested`) ante temas médicos, enojo o petición explícita. El takeover (`human_active`) silencia al bot definitivamente hasta el cierre.
- **Aislamiento por negocio**: todas las consultas filtran por el `business_id` del token, nunca por uno enviado por el cliente.
- **Fechas**: las citas se guardan en hora local del negocio (naive); cada negocio tiene zona horaria explícita (default `America/Mexico_City`).

## Pospuesto deliberadamente (ver .clinerules)

WhatsApp real, proveedor de LLM de pago, pagos, recordatorios, Google Calendar, Redis/colas y microservicios.
