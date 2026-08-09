"""Fixtures compartidas: base de datos SQLite en memoria y cliente HTTP de pruebas."""

import os

os.environ["DATABASE_URL"] = "sqlite:///./test_chataliado.db"
os.environ["SECRET_KEY"] = "secreto-de-pruebas-suficientemente-largo-para-hs256"

import pytest
from fastapi.testclient import TestClient

from app.infrastructure import database
from app.main import app


@pytest.fixture(autouse=True)
def clean_db():
    """Esquema limpio para cada prueba."""
    database.Base.metadata.drop_all(bind=database.engine)
    database.Base.metadata.create_all(bind=database.engine)
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_headers(client):
    """Registra un negocio y devuelve headers autenticados."""
    res = client.post(
        "/auth/register",
        json={
            "business_name": "Consultorio Nutrición Ana",
            "full_name": "Ana López",
            "email": "ana@example.com",
            "password": "contrasena123",
        },
    )
    assert res.status_code == 201, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def second_business_headers(client):
    """Un segundo negocio para probar aislamiento."""
    res = client.post(
        "/auth/register",
        json={
            "business_name": "Consultorio Otro",
            "full_name": "Otro Usuario",
            "email": "otro@example.com",
            "password": "contrasena123",
        },
    )
    assert res.status_code == 201, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def create_service(client, headers, **overrides):
    payload = {
        "name": "Consulta de nutrición",
        "price": "500.00",
        "duration_minutes": 60,
        "modality": "in_person",
    }
    payload.update(overrides)
    res = client.post("/services", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def set_full_week_availability(client, headers):
    rules = [
        {"weekday": d, "start_time": "09:00:00", "end_time": "18:00:00"} for d in range(7)
    ]
    res = client.put("/availability/rules", json={"rules": rules}, headers=headers)
    assert res.status_code == 200, res.text


def create_patient(client, headers, phone="5512345678"):
    res = client.post(
        "/patients", json={"full_name": "Paciente Prueba", "phone": phone}, headers=headers
    )
    assert res.status_code == 201, res.text
    return res.json()
