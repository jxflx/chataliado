from zoneinfo import ZoneInfo

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from app.core.deps import CurrentUser, DbSession
from app.modules.businesses.models import Business
from app.shared.errors import NotFoundError, ValidationDomainError

router = APIRouter(prefix="/business", tags=["business"])


class BusinessResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    timezone: str
    description: str


class BusinessUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=200)
    timezone: str | None = Field(default=None, max_length=64)
    description: str | None = Field(default=None, max_length=2000)


@router.get("", response_model=BusinessResponse)
def get_business(user: CurrentUser, db: DbSession) -> BusinessResponse:
    business = db.get(Business, user.business_id)
    if business is None:
        raise NotFoundError("Negocio no encontrado")
    return BusinessResponse.model_validate(business)


@router.patch("", response_model=BusinessResponse)
def update_business(payload: BusinessUpdate, user: CurrentUser, db: DbSession) -> BusinessResponse:
    business = db.get(Business, user.business_id)
    if business is None:
        raise NotFoundError("Negocio no encontrado")
    data = payload.model_dump(exclude_unset=True)
    if "timezone" in data:
        try:
            ZoneInfo(data["timezone"])
        except Exception as exc:
            raise ValidationDomainError("Zona horaria inválida") from exc
    for field, value in data.items():
        setattr(business, field, value)
    db.commit()
    return BusinessResponse.model_validate(business)
