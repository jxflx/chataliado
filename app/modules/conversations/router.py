from fastapi import APIRouter
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.modules.conversations import service as conversations_service
from app.modules.conversations.models import Conversation, Message
from app.modules.conversations.schemas import (
    ConversationDetail,
    ConversationResponse,
    InboundResult,
    MessageResponse,
    SimulatedInboundMessage,
    StaffReply,
    TakeoverRequest,
)
from app.modules.patients.models import Patient
from app.shared.errors import NotFoundError

router = APIRouter(prefix="/conversations", tags=["conversations"])

# Endpoint público del chat simulado: hace las veces del webhook de WhatsApp.
simulated_router = APIRouter(prefix="/simulated-chat", tags=["simulated-chat"])


@simulated_router.post("/messages", response_model=InboundResult)
def simulated_inbound(payload: SimulatedInboundMessage, db: DbSession) -> InboundResult:
    conversation, bot_reply = conversations_service.handle_inbound_message(
        db,
        business_id=payload.business_id,
        patient_name=payload.patient_name,
        patient_phone=payload.patient_phone,
        text=payload.text,
    )
    return InboundResult(
        conversation_id=conversation.id,
        conversation_status=conversation.status,
        bot_reply=bot_reply,
    )


@router.get("", response_model=list[ConversationDetail])
def list_conversations(
    user: CurrentUser, db: DbSession, status: str | None = None
) -> list[ConversationDetail]:
    query = (
        select(Conversation, Patient)
        .join(Patient, Conversation.patient_id == Patient.id)
        .where(Conversation.business_id == user.business_id)
        .order_by(Conversation.last_activity_at.desc())
    )
    if status is not None:
        query = query.where(Conversation.status == status)
    rows = db.execute(query).all()
    return [
        ConversationDetail(
            id=c.id,
            patient_id=c.patient_id,
            channel=c.channel,
            status=c.status,
            last_activity_at=c.last_activity_at,
            patient_name=p.full_name,
            patient_phone=p.phone,
        )
        for c, p in rows
    ]


@router.get("/{conversation_id}/messages", response_model=list[MessageResponse])
def list_messages(conversation_id: int, user: CurrentUser, db: DbSession) -> list[MessageResponse]:
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id, Conversation.business_id == user.business_id
        )
    )
    if conversation is None:
        raise NotFoundError("Conversación no encontrada")
    messages = db.scalars(
        select(Message).where(Message.conversation_id == conversation_id).order_by(Message.id)
    ).all()
    return [MessageResponse.model_validate(m) for m in messages]


@router.post("/{conversation_id}/messages", response_model=MessageResponse, status_code=201)
def reply_as_staff(
    conversation_id: int, payload: StaffReply, user: CurrentUser, db: DbSession
) -> MessageResponse:
    message = conversations_service.staff_reply(
        db,
        business_id=user.business_id,
        conversation_id=conversation_id,
        user_id=user.id,
        text=payload.text,
    )
    return MessageResponse.model_validate(message)


@router.post("/{conversation_id}/takeover", response_model=ConversationResponse)
def takeover(
    conversation_id: int, payload: TakeoverRequest, user: CurrentUser, db: DbSession
) -> ConversationResponse:
    conversation = conversations_service.takeover(
        db,
        business_id=user.business_id,
        conversation_id=conversation_id,
        user_id=user.id,
        reason=payload.reason,
    )
    return ConversationResponse.model_validate(conversation)


@router.post("/{conversation_id}/close", response_model=ConversationResponse)
def close(conversation_id: int, user: CurrentUser, db: DbSession) -> ConversationResponse:
    conversation = conversations_service.close_conversation(
        db, business_id=user.business_id, conversation_id=conversation_id, user_id=user.id
    )
    return ConversationResponse.model_validate(conversation)
