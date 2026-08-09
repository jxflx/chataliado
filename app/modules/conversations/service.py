"""Casos de uso de conversaciones: mensaje entrante, respuesta del bot,
takeover humano, respuesta manual y cierre."""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.infrastructure.llm import get_llm_provider
from app.modules.businesses.models import Business
from app.modules.conversations.models import Conversation, HandoffEvent, Message
from app.modules.patients.models import Patient
from app.modules.services.models import Service
from app.shared.audit import record_audit
from app.shared.errors import ConflictError, NotFoundError


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _get_or_create_patient(db: Session, business_id: int, name: str, phone: str) -> Patient:
    patient = db.scalar(
        select(Patient).where(Patient.business_id == business_id, Patient.phone == phone)
    )
    if patient is None:
        patient = Patient(business_id=business_id, full_name=name, phone=phone)
        db.add(patient)
        db.flush()
    return patient


def _get_or_create_conversation(db: Session, business_id: int, patient_id: int) -> Conversation:
    conversation = db.scalar(
        select(Conversation)
        .where(
            Conversation.business_id == business_id,
            Conversation.patient_id == patient_id,
            Conversation.status != "closed",
        )
        .order_by(Conversation.id.desc())
    )
    if conversation is None:
        conversation = Conversation(
            business_id=business_id, patient_id=patient_id, channel="simulated"
        )
        db.add(conversation)
        db.flush()
    return conversation


def _business_context(db: Session, business: Business) -> dict:
    services = db.scalars(
        select(Service).where(Service.business_id == business.id, Service.is_active.is_(True))
    ).all()
    return {
        "business_name": business.name,
        "services": [
            {
                "name": s.name,
                "price": str(s.price),
                "duration_minutes": s.duration_minutes,
                "modality": s.modality,
            }
            for s in services
        ],
    }


def handle_inbound_message(
    db: Session, *, business_id: int, patient_name: str, patient_phone: str, text: str
) -> tuple[Conversation, str | None]:
    """Persiste el mensaje del paciente y, si el bot tiene control, responde.

    Devuelve (conversación, respuesta_del_bot | None).
    Si la conversación está en manos humanas, el bot NO responde.
    """
    business = db.get(Business, business_id)
    if business is None:
        raise NotFoundError("Negocio no encontrado")

    patient = _get_or_create_patient(db, business_id, patient_name, patient_phone)
    conversation = _get_or_create_conversation(db, business_id, patient.id)

    db.add(
        Message(conversation_id=conversation.id, direction="inbound", author="patient", text=text)
    )
    conversation.last_activity_at = _utcnow()

    bot_reply_text: str | None = None
    if conversation.status == "bot_active":
        history = [
            {"author": m.author, "text": m.text}
            for m in db.scalars(
                select(Message)
                .where(Message.conversation_id == conversation.id)
                .order_by(Message.id)
            )
        ]
        history.append({"author": "patient", "text": text})
        reply = get_llm_provider().reply(
            conversation_history=history, business_context=_business_context(db, business)
        )
        db.add(
            Message(
                conversation_id=conversation.id,
                direction="outbound",
                author="bot",
                text=reply.text,
            )
        )
        bot_reply_text = reply.text
        if reply.intent == "handoff":
            conversation.status = "human_requested"
            db.add(
                HandoffEvent(
                    conversation_id=conversation.id, user_id=None, reason=reply.handoff_reason
                )
            )

    db.commit()
    return conversation, bot_reply_text


def takeover(db: Session, *, business_id: int, conversation_id: int, user_id: int, reason: str):
    conversation = _get_conversation(db, business_id, conversation_id)
    if conversation.status == "closed":
        raise ConflictError("La conversación está cerrada")
    conversation.status = "human_active"
    db.add(HandoffEvent(conversation_id=conversation.id, user_id=user_id, reason=reason))
    record_audit(
        db,
        business_id=business_id,
        actor=f"user:{user_id}",
        action="conversation.takeover",
        entity="conversation",
        entity_id=conversation.id,
    )
    db.commit()
    return conversation


def staff_reply(db: Session, *, business_id: int, conversation_id: int, user_id: int, text: str):
    conversation = _get_conversation(db, business_id, conversation_id)
    if conversation.status == "closed":
        raise ConflictError("La conversación está cerrada")
    # Responder manualmente implica tomar el control si el bot lo tenía.
    if conversation.status != "human_active":
        conversation.status = "human_active"
        db.add(
            HandoffEvent(
                conversation_id=conversation.id,
                user_id=user_id,
                reason="Respuesta manual desde el dashboard",
            )
        )
    message = Message(
        conversation_id=conversation.id, direction="outbound", author="staff", text=text
    )
    db.add(message)
    conversation.last_activity_at = _utcnow()
    db.commit()
    return message


def close_conversation(db: Session, *, business_id: int, conversation_id: int, user_id: int):
    conversation = _get_conversation(db, business_id, conversation_id)
    if conversation.status == "closed":
        raise ConflictError("La conversación ya está cerrada")
    conversation.status = "closed"
    record_audit(
        db,
        business_id=business_id,
        actor=f"user:{user_id}",
        action="conversation.close",
        entity="conversation",
        entity_id=conversation.id,
    )
    db.commit()
    return conversation


def _get_conversation(db: Session, business_id: int, conversation_id: int) -> Conversation:
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.business_id == business_id
        )
    )
    if conversation is None:
        raise NotFoundError("Conversación no encontrada")
    return conversation
