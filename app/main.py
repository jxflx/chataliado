from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.infrastructure import database
from app.modules.appointments.router import router as appointments_router
from app.modules.auth.router import router as auth_router
from app.modules.availability.router import router as availability_router
from app.modules.businesses.router import router as business_router
from app.modules.conversations.router import router as conversations_router
from app.modules.conversations.router import simulated_router
from app.modules.patients.router import router as patients_router
from app.modules.services.router import router as services_router
from app.shared.errors import DomainError

app = FastAPI(title="ChatAliado", version="0.1.0")

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(DomainError)
async def domain_error_handler(_request: Request, exc: DomainError) -> JSONResponse:
    """Traducción uniforme de errores de negocio, sin filtrar detalles internos."""
    return JSONResponse(
        status_code=exc.status_code, content={"error": {"code": exc.code, "message": exc.message}}
    )


@app.get("/health", tags=["health"])
def health() -> dict:
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(business_router)
app.include_router(services_router)
app.include_router(availability_router)
app.include_router(patients_router)
app.include_router(appointments_router)
app.include_router(conversations_router)
app.include_router(simulated_router)

# Dashboard estático mínimo
_static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=_static_dir), name="static")


@app.get("/", include_in_schema=False)
def dashboard() -> FileResponse:
    return FileResponse(_static_dir / "index.html")


@app.get("/chat", include_in_schema=False)
def simulated_chat_page() -> FileResponse:
    return FileResponse(_static_dir / "chat.html")


def init_db() -> None:
    """Crea las tablas si no existen (para desarrollo; en producción usar Alembic)."""
    database.Base.metadata.create_all(bind=database.engine)


init_db()
