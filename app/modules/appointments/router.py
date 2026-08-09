from datetime import date

from fastapi import APIRouter
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.modules.appointments import service as appointments_service
from app.modules.appointments.models import Appointment
from app.modules.appointments.schemas import (
    AppointmentCreate,
    AppointmentPatch,
    AppointmentResponse,
)
from app.shared.errors import ValidationDomainError

router = APIRouter(prefix="/appointments", tags=["appointments"])


@router.get("", response_model=list[AppointmentResponse])
def list_appointments(
    user: CurrentUser,
    db: DbSession,
    from_date: date | None = None,
    to_date: date | None = None,
    status: str | None = None,
) -> list[AppointmentResponse]:
    query = select(Appointment).where(Appointment.business_id == user.business_id)
    if from_date is not None:
        query = query.where(Appointment.start_at >= from_date)
    if to_date is not None:
        query = query.where(Appointment.start_at < to_date)
    if status is not None:
        query = query.where(Appointment.status == status)
    appointments = db.scalars(query.order_by(Appointment.start_at)).all()
    return [AppointmentResponse.model_validate(a) for a in appointments]


@router.post("", response_model=AppointmentResponse, status_code=201)
def create_appointment(
    payload: AppointmentCreate, user: CurrentUser, db: DbSession
) -> AppointmentResponse:
    appointment = appointments_service.create_appointment(
        db,
        business_id=user.business_id,
        patient_id=payload.patient_id,
        service_id=payload.service_id,
        start_at=payload.start_at.replace(tzinfo=None),
        source="dashboard",
        actor=f"user:{user.id}",
        notes=payload.notes,
    )
    return AppointmentResponse.model_validate(appointment)


@router.patch("/{appointment_id}", response_model=AppointmentResponse)
def patch_appointment(
    appointment_id: int, payload: AppointmentPatch, user: CurrentUser, db: DbSession
) -> AppointmentResponse:
    has_status = payload.status is not None
    has_start = payload.start_at is not None
    if has_status == has_start:
        raise ValidationDomainError("Envía exactamente una operación: status o start_at")
    actor = f"user:{user.id}"
    if has_status:
        appointment = appointments_service.change_status(
            db,
            business_id=user.business_id,
            appointment_id=appointment_id,
            new_status=payload.status,
            actor=actor,
        )
    else:
        appointment = appointments_service.reschedule_appointment(
            db,
            business_id=user.business_id,
            appointment_id=appointment_id,
            new_start_at=payload.start_at.replace(tzinfo=None),
            actor=actor,
        )
    return AppointmentResponse.model_validate(appointment)
