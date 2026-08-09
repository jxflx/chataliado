from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AppointmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    patient_id: int
    service_id: int
    start_at: datetime
    notes: str = Field(default="", max_length=2000)


class AppointmentPatch(BaseModel):
    """Cancelar/cambiar estado o reprogramar. Exactamente una operación por request."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["confirmed", "cancelled", "completed", "no_show"] | None = None
    start_at: datetime | None = None


class AppointmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    patient_id: int
    service_id: int
    start_at: datetime
    end_at: datetime
    status: str
    source: str
    notes: str
