"""Dependencias de autenticación y autorización por negocio."""

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.infrastructure.database import get_db
from app.modules.auth.models import User
from app.shared.errors import UnauthorizedError

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None:
        raise UnauthorizedError("Se requiere autenticación")
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise UnauthorizedError("Token inválido o expirado")
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise UnauthorizedError("Usuario no encontrado")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[Session, Depends(get_db)]
