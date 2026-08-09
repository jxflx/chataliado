from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ServiceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=2000)
    price: Decimal = Field(ge=0, le=1_000_000)
    duration_minutes: int = Field(ge=5, le=480)
    modality: Literal["in_person", "online"] = "in_person"


class ServiceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    price: Decimal | None = Field(default=None, ge=0, le=1_000_000)
    duration_minutes: int | None = Field(default=None, ge=5, le=480)
    modality: Literal["in_person", "online"] | None = None
    is_active: bool | None = None


class ServiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str
    price: Decimal
    duration_minutes: int
    modality: str
    is_active: bool
