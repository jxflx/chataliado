from zoneinfo import ZoneInfo

from fastapi import APIRouter
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.core.security import create_access_token, hash_password, verify_password
from app.modules.auth.models import User
from app.modules.auth.schemas import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from app.modules.businesses.models import Business
from app.shared.errors import ConflictError, UnauthorizedError, ValidationDomainError

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(payload: RegisterRequest, db: DbSession) -> TokenResponse:
    """Registra un negocio con su primer usuario (owner)."""
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing is not None:
        raise ConflictError("Ya existe un usuario con ese email")
    try:
        ZoneInfo(payload.timezone)
    except Exception as exc:
        raise ValidationDomainError("Zona horaria inválida") from exc

    business = Business(name=payload.business_name, timezone=payload.timezone)
    db.add(business)
    db.flush()
    user = User(
        business_id=business.id,
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role="owner",
    )
    db.add(user)
    db.commit()
    return TokenResponse(access_token=create_access_token(user.id, business.id))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise UnauthorizedError("Credenciales inválidas")
    return TokenResponse(access_token=create_access_token(user.id, user.business_id))


@router.get("/me", response_model=UserResponse)
def me(user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(user)
