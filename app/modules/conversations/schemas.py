from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SimulatedInboundMessage(BaseModel):
    """Mensaje entrante del chat simulado (mismo modelo que usará WhatsApp)."""

    model_config = ConfigDict(extra="forbid")

    business_id: int
    patient_name: str = Field(min_length=2, max_length=200)
    patient_phone: str = Field(min_length=7, max_length=30, pattern=r"^\+?[0-9\s\-]+$")
    text: str = Field(min_length=1, max_length=5000)


class StaffReply(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=5000)


class TakeoverRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(default="Tomado manualmente desde el dashboard", max_length=300)


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    direction: str
    author: str
    text: str
    created_at: datetime


class ConversationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: int
    channel: str
    status: str
    last_activity_at: datetime


class ConversationDetail(ConversationResponse):
    patient_name: str
    patient_phone: str


class InboundResult(BaseModel):
    conversation_id: int
    conversation_status: str
    bot_reply: str | None
