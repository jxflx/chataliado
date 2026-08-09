"""Casos de uso de citas: creación transaccional, cancelación y reprogramación.

Regla crítica: la disponibilidad se valida dos veces (al mostrar slots y aquí,
dentro de la transacción, justo antes de insertar). Se toma un bloqueo por fila
del negocio (SELECT ... FOR UPDATE en PostgreSQL; en SQLite las escrituras ya
se serializan) para que dos solicitudes concurrentes no reserven el mismo slot.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.appointments.models import APPOINTMENT_TRANSITIONS, Appointment
from app.modules.availability.models import AvailabilityRule, BlockedPeriod
from app.modules.availability.slots import Interval, Rule, compute_slots
from app.modules.businesses.models import Business
from app.modules.patients.models import Patient
from app.modules.services.models import Service
from app.shared.audit import record_audit
from app.shared.errors import ConflictError, NotFoundError, ValidationDomainError

ACTIVE_STATUSES = ("pending", "confirmed")


def _lock_business(db: Session, business_id: int) -> Business:
    business = db.scalar(select(Business).where(Business.id == business_id).with_for_update())
    if business is None:
        raise NotFoundError("Negocio no encontrado")
    return business


def _slot_is_available(
    db: Session, business: Business, service: Service, start_at: datetime
) -> bool:
    """Revalida el slot exacto dentro de la transacción actual."""
    end_at = start_at + timedelta(minutes=service.duration_minutes)
    rules = [
        Rule(r.weekday, r.start_time, r.end_time)
        for r in db.scalars(
            select(AvailabilityRule).where(AvailabilityRule.business_id == business.id)
        )
    ]
    blocked = [
        Interval(b.start_at, b.end_at)
        for b in db.scalars(
            select(BlockedPeriod).where(
                BlockedPeriod.business_id == business.id,
                BlockedPeriod.start_at < end_at,
                BlockedPeriod.end_at > start_at,
            )
        )
    ]
    busy = [
        Interval(a.start_at, a.end_at)
        for a in db.scalars(
            select(Appointment).where(
                Appointment.business_id == business.id,
                Appointment.status.in_(ACTIVE_STATUSES),
                Appointment.start_at < end_at,
                Appointment.end_at > start_at,
            )
        )
    ]
    now_local = datetime.now(ZoneInfo(business.timezone)).replace(tzinfo=None)
    slots = compute_slots(
        rules=rules,
        blocked=blocked,
        busy=busy,
        duration_minutes=service.duration_minutes,
        from_date=start_at.date(),
        to_date=start_at.date(),
        now_local=now_local,
    )
    return any(s.start == start_at for s in slots)


def create_appointment(
    db: Session,
    *,
    business_id: int,
    patient_id: int,
    service_id: int,
    start_at: datetime,
    source: str,
    actor: str,
    notes: str = "",
) -> Appointment:
    if start_at.tzinfo is not None:
        raise ValidationDomainError("start_at debe ser hora local del negocio, sin zona horaria")
    business = _lock_business(db, business_id)
    service = db.scalar(
        select(Service).where(
            Service.id == service_id,
            Service.business_id == business_id,
            Service.is_active.is_(True),
        )
    )
    if service is None:
        raise NotFoundError("Servicio no encontrado o inactivo")
    patient = db.scalar(
        select(Patient).where(Patient.id == patient_id, Patient.business_id == business_id)
    )
    if patient is None:
        raise NotFoundError("Paciente no encontrado")

    if not _slot_is_available(db, business, service, start_at):
        raise ConflictError("El horario solicitado ya no está disponible")

    appointment = Appointment(
        business_id=business_id,
        patient_id=patient_id,
        service_id=service_id,
        start_at=start_at,
        end_at=start_at + timedelta(minutes=service.duration_minutes),
        status="confirmed",
        source=source,
        notes=notes,
    )
    db.add(appointment)
    db.flush()
    record_audit(
        db,
        business_id=business_id,
        actor=actor,
        action="appointment.create",
        entity="appointment",
        entity_id=appointment.id,
    )
    db.commit()
    return appointment


def _get_appointment(db: Session, business_id: int, appointment_id: int) -> Appointment:
    appointment = db.scalar(
        select(Appointment).where(
            Appointment.id == appointment_id, Appointment.business_id == business_id
        )
    )
    if appointment is None:
        raise NotFoundError("Cita no encontrada")
    return appointment


def change_status(
    db: Session, *, business_id: int, appointment_id: int, new_status: str, actor: str
) -> Appointment:
    appointment = _get_appointment(db, business_id, appointment_id)
    allowed = APPOINTMENT_TRANSITIONS.get(appointment.status, set())
    if new_status not in allowed:
        raise ConflictError(f"No se puede pasar de '{appointment.status}' a '{new_status}'")
    appointment.status = new_status
    record_audit(
        db,
        business_id=business_id,
        actor=actor,
        action=f"appointment.{new_status}",
        entity="appointment",
        entity_id=appointment.id,
    )
    db.commit()
    return appointment


def reschedule_appointment(
    db: Session, *, business_id: int, appointment_id: int, new_start_at: datetime, actor: str
) -> Appointment:
    if new_start_at.tzinfo is not None:
        raise ValidationDomainError("start_at debe ser hora local del negocio, sin zona horaria")
    business = _lock_business(db, business_id)
    appointment = _get_appointment(db, business_id, appointment_id)
    if appointment.status not in ACTIVE_STATUSES:
        raise ConflictError("Sólo se pueden reprogramar citas pendientes o confirmadas")
    service = db.get(Service, appointment.service_id)

    # Liberar temporalmente el slot actual para la validación.
    previous_status = appointment.status
    appointment.status = "cancelled"
    db.flush()
    if not _slot_is_available(db, business, service, new_start_at):
        appointment.status = previous_status
        db.commit()
        raise ConflictError("El nuevo horario no está disponible")

    appointment.status = previous_status
    appointment.start_at = new_start_at
    appointment.end_at = new_start_at + timedelta(minutes=service.duration_minutes)
    record_audit(
        db,
        business_id=business_id,
        actor=actor,
        action="appointment.reschedule",
        entity="appointment",
        entity_id=appointment.id,
    )
    db.commit()
    return appointment
