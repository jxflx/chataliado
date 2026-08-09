"""Caso de uso: calcular horarios disponibles para un servicio y rango de fechas."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.appointments.models import Appointment
from app.modules.availability.models import AvailabilityRule, BlockedPeriod
from app.modules.availability.slots import Interval, Rule, compute_slots
from app.modules.businesses.models import Business
from app.modules.services.models import Service
from app.shared.errors import NotFoundError, ValidationDomainError

MAX_RANGE_DAYS = 60
ACTIVE_APPOINTMENT_STATUSES = ("pending", "confirmed")


def get_available_slots(
    db: Session, *, business_id: int, service_id: int, from_date: date, to_date: date
) -> list[Interval]:
    if to_date < from_date:
        raise ValidationDomainError("to_date debe ser mayor o igual que from_date")
    if (to_date - from_date).days > MAX_RANGE_DAYS:
        raise ValidationDomainError(f"El rango máximo es de {MAX_RANGE_DAYS} días")

    business = db.get(Business, business_id)
    if business is None:
        raise NotFoundError("Negocio no encontrado")
    service = db.scalar(
        select(Service).where(
            Service.id == service_id,
            Service.business_id == business_id,
            Service.is_active.is_(True),
        )
    )
    if service is None:
        raise NotFoundError("Servicio no encontrado o inactivo")

    rules = [
        Rule(r.weekday, r.start_time, r.end_time)
        for r in db.scalars(
            select(AvailabilityRule).where(AvailabilityRule.business_id == business_id)
        )
    ]
    range_start = datetime.combine(from_date, datetime.min.time())
    range_end = datetime.combine(to_date + timedelta(days=1), datetime.min.time())
    blocked = [
        Interval(b.start_at, b.end_at)
        for b in db.scalars(
            select(BlockedPeriod).where(
                BlockedPeriod.business_id == business_id,
                BlockedPeriod.start_at < range_end,
                BlockedPeriod.end_at > range_start,
            )
        )
    ]
    busy = [
        Interval(a.start_at, a.end_at)
        for a in db.scalars(
            select(Appointment).where(
                Appointment.business_id == business_id,
                Appointment.status.in_(ACTIVE_APPOINTMENT_STATUSES),
                Appointment.start_at < range_end,
                Appointment.end_at > range_start,
            )
        )
    ]
    now_local = datetime.now(ZoneInfo(business.timezone)).replace(tzinfo=None)
    return compute_slots(
        rules=rules,
        blocked=blocked,
        busy=busy,
        duration_minutes=service.duration_minutes,
        from_date=from_date,
        to_date=to_date,
        now_local=now_local,
    )
