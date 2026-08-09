"""Pruebas de registro, login y aislamiento entre negocios."""

from tests.conftest import create_service


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_registro_y_login(client):
    res = client.post(
        "/auth/register",
        json={
            "business_name": "Consultorio X",
            "full_name": "Usuario X",
            "email": "x@example.com",
            "password": "contrasena123",
        },
    )
    assert res.status_code == 201
    res = client.post(
        "/auth/login", json={"email": "x@example.com", "password": "contrasena123"}
    )
    assert res.status_code == 200
    assert "access_token" in res.json()


def test_login_con_password_incorrecta(client):
    client.post(
        "/auth/register",
        json={
            "business_name": "Consultorio X",
            "full_name": "Usuario X",
            "email": "x@example.com",
            "password": "contrasena123",
        },
    )
    res = client.post("/auth/login", json={"email": "x@example.com", "password": "incorrecta"})
    assert res.status_code == 401


def test_email_duplicado_rechazado(client, auth_headers):
    res = client.post(
        "/auth/register",
        json={
            "business_name": "Duplicado",
            "full_name": "Otro",
            "email": "ana@example.com",
            "password": "contrasena123",
        },
    )
    assert res.status_code == 409


def test_endpoints_requieren_autenticacion(client):
    assert client.get("/services").status_code == 401
    assert client.get("/appointments").status_code == 401
    assert client.get("/conversations").status_code == 401


def test_aislamiento_entre_negocios(client, auth_headers, second_business_headers):
    """Un negocio no debe ver ni modificar datos de otro."""
    service = create_service(client, auth_headers)

    # El segundo negocio no ve el servicio del primero.
    res = client.get("/services", headers=second_business_headers)
    assert res.status_code == 200
    assert res.json() == []

    # Ni puede modificarlo.
    res = client.patch(
        f"/services/{service['id']}", json={"name": "Hackeado"}, headers=second_business_headers
    )
    assert res.status_code == 404
