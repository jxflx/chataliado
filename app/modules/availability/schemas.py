from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RuleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    weekday: int = Field(ge=0, le=6, description="0=lunes ... 6=domingo")
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def check_range(self) -> "RuleInput":
        if self.start_time >= self.end_time:
            raise ValueError("start_time debe ser menor que end_time")
        return self


class RulesReplaceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rules: list[RuleInput] = Field(max_length=50)


class RuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    weekday: int
    start_time: time
    end_time: time


class BlockedPeriodCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_at: datetime
    end_at: datetime
    reason: str = Field(default="", max_length=300)

    @model_validator(mode="after")
    def check_range(self) -> "BlockedPeriodCreate":
        if self.start_at >= self.end_at:
            raise ValueError("start_at debe ser menor que end_at")
        return self


class BlockedPeriodResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    start_at: datetime
    end_at: datetime
    reason: str


class SlotResponse(BaseModel):
    start_at: datetime
    end_at: datetime


class AvailabilityQuery(BaseModel):
    service_id: int
    from_date: date
    to_date: date
