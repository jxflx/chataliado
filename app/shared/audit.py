from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.infrastructure.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey("businesses.id"), index=True)
    actor: Mapped[str] = mapped_column(String(100))  # "user:{id}" | "patient:{id}" | "bot"
    action: Mapped[str] = mapped_column(String(100))
    entity: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[int] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC).replace(tzinfo=None)
    )


def record_audit(
    db: Session, *, business_id: int, actor: str, action: str, entity: str, entity_id: int
) -> None:
    """Registra la operación en la misma transacción abierta (sin commit propio)."""
    db.add(
        AuditLog(
            business_id=business_id, actor=actor, action=action, entity=entity, entity_id=entity_id
        )
    )
