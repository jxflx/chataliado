from datetime import date

from fastapi import APIRouter
from sqlalchemy import delete, select

from app.core.deps import CurrentUser, DbSession
from app.modules.availability.models import AvailabilityRule, BlockedPeriod
from app.modules.availability.schemas import (
    BlockedPeriodCreate,
    BlockedPeriodResponse,
    RuleResponse,
    RulesReplaceRequest,
    SlotResponse,
)
from app.modules.availability.service import get_available_slots
from app.shared.audit import record_audit
from app.shared.errors import NotFoundError

router = APIRouter(prefix="/availability", tags=["availability"])


@router.get("", response_model=list[SlotResponse])
def availability(
    service_id: int, from_date: date, to_date: date, user: CurrentUser, db: DbSession
) -> list[SlotResponse]:
    slots = get_available_slots(
        db,
        business_id=user.business_id,
        service_id=service_id,
        from_date=from_date,
        to_date=to_date,
    )
    return [SlotResponse(start_at=s.start, end_at=s.end) for s in slots]


@router.get("/rules", response_model=list[RuleResponse])
def list_rules(user: CurrentUser, db: DbSession) -> list[RuleResponse]:
    rules = db.scalars(
        select(AvailabilityRule)
        .where(AvailabilityRule.business_id == user.business_id)
        .order_by(AvailabilityRule.weekday, AvailabilityRule.start_time)
    ).all()
    return [RuleResponse.model_validate(r) for r in rules]


@router.put("/rules", response_model=list[RuleResponse])
def replace_rules(
    payload: RulesReplaceRequest, user: CurrentUser, db: DbSession
) -> list[RuleResponse]:
    """Reemplaza el conjunto completo de reglas recurrentes del negocio."""
    db.execute(delete(AvailabilityRule).where(AvailabilityRule.business_id == user.business_id))
    new_rules = [
        AvailabilityRule(business_id=user.business_id, **rule.model_dump())
        for rule in payload.rules
    ]
    db.add_all(new_rules)
    db.flush()
    record_audit(
        db,
        business_id=user.business_id,
        actor=f"user:{user.id}",
        action="availability.rules_replace",
        entity="availability_rules",
        entity_id=user.business_id,
    )
    db.commit()
    return [RuleResponse.model_validate(r) for r in new_rules]


@router.get("/blocked-periods", response_model=list[BlockedPeriodResponse])
def list_blocked_periods(user: CurrentUser, db: DbSession) -> list[BlockedPeriodResponse]:
    periods = db.scalars(
        select(BlockedPeriod)
        .where(BlockedPeriod.business_id == user.business_id)
        .order_by(BlockedPeriod.start_at)
    ).all()
    return [BlockedPeriodResponse.model_validate(p) for p in periods]


@router.post("/blocked-periods", response_model=BlockedPeriodResponse, status_code=201)
def create_blocked_period(
    payload: BlockedPeriodCreate, user: CurrentUser, db: DbSession
) -> BlockedPeriodResponse:
    period = BlockedPeriod(business_id=user.business_id, **payload.model_dump())
    db.add(period)
    db.flush()
    record_audit(
        db,
        business_id=user.business_id,
        actor=f"user:{user.id}",
        action="availability.block_create",
        entity="blocked_period",
        entity_id=period.id,
    )
    db.commit()
    return BlockedPeriodResponse.model_validate(period)


@router.delete("/blocked-periods/{period_id}", status_code=204)
def delete_blocked_period(period_id: int, user: CurrentUser, db: DbSession) -> None:
    period = db.scalar(
        select(BlockedPeriod).where(
            BlockedPeriod.id == period_id, BlockedPeriod.business_id == user.business_id
        )
    )
    if period is None:
        raise NotFoundError("Periodo bloqueado no encontrado")
    db.delete(period)
    db.commit()
