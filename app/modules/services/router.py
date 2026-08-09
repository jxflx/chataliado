from fastapi import APIRouter
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.modules.services.models import Service
from app.modules.services.schemas import ServiceCreate, ServiceResponse, ServiceUpdate
from app.shared.audit import record_audit
from app.shared.errors import NotFoundError

router = APIRouter(prefix="/services", tags=["services"])


def get_service_or_404(db, business_id: int, service_id: int) -> Service:
    service = db.scalar(
        select(Service).where(Service.id == service_id, Service.business_id == business_id)
    )
    if service is None:
        raise NotFoundError("Servicio no encontrado")
    return service


@router.get("", response_model=list[ServiceResponse])
def list_services(user: CurrentUser, db: DbSession) -> list[ServiceResponse]:
    services = db.scalars(
        select(Service).where(Service.business_id == user.business_id).order_by(Service.id)
    ).all()
    return [ServiceResponse.model_validate(s) for s in services]


@router.post("", response_model=ServiceResponse, status_code=201)
def create_service(payload: ServiceCreate, user: CurrentUser, db: DbSession) -> ServiceResponse:
    service = Service(business_id=user.business_id, **payload.model_dump())
    db.add(service)
    db.flush()
    record_audit(
        db,
        business_id=user.business_id,
        actor=f"user:{user.id}",
        action="service.create",
        entity="service",
        entity_id=service.id,
    )
    db.commit()
    return ServiceResponse.model_validate(service)


@router.patch("/{service_id}", response_model=ServiceResponse)
def update_service(
    service_id: int, payload: ServiceUpdate, user: CurrentUser, db: DbSession
) -> ServiceResponse:
    service = get_service_or_404(db, user.business_id, service_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(service, field, value)
    record_audit(
        db,
        business_id=user.business_id,
        actor=f"user:{user.id}",
        action="service.update",
        entity="service",
        entity_id=service.id,
    )
    db.commit()
    return ServiceResponse.model_validate(service)
