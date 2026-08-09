from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.modules.patients.models import Patient
from app.shared.errors import ConflictError

router = APIRouter(prefix="/patients", tags=["patients"])


class PatientCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=2, max_length=200)
    phone: str = Field(min_length=7, max_length=30, pattern=r"^\+?[0-9\s\-]+$")
    email: EmailStr | None = None


class PatientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    phone: str
    email: str | None


@router.get("", response_model=list[PatientResponse])
def list_patients(user: CurrentUser, db: DbSession) -> list[PatientResponse]:
    patients = db.scalars(
        select(Patient).where(Patient.business_id == user.business_id).order_by(Patient.id)
    ).all()
    return [PatientResponse.model_validate(p) for p in patients]


@router.post("", response_model=PatientResponse, status_code=201)
def create_patient(payload: PatientCreate, user: CurrentUser, db: DbSession) -> PatientResponse:
    existing = db.scalar(
        select(Patient).where(
            Patient.business_id == user.business_id, Patient.phone == payload.phone
        )
    )
    if existing is not None:
        raise ConflictError("Ya existe un paciente con ese teléfono")
    patient = Patient(business_id=user.business_id, **payload.model_dump())
    db.add(patient)
    db.commit()
    return PatientResponse.model_validate(patient)
