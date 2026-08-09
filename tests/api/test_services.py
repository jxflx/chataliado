"""Pruebas del CRUD de servicios."""

from tests.conftest import create_service


def test_crear_y_listar_servicio(client, auth_headers):
    create_service(client, auth_headers)
    res = client.get("/services", headers=auth_headers)
    assert res.status_code == 200
    services = res.json()
    assert len(services) == 1
    assert services[0]["name"] == "Consulta de nutrición"
    assert services[0]["is_active"] is True


def test_editar_servicio(client, auth_headers):
    service = create_service(client, auth_headers)
    res = client.patch(
        f"/services/{service['id']}",
        json={"price": "650.00", "is_active": False},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["price"] == "650.00"
    assert res.json()["is_active"] is False


def test_campos_desconocidos_rechazados(client, auth_headers):
    res = client.post(
        "/services",
        json={
            "name": "Consulta",
            "price": "500.00",
            "duration_minutes": 60,
            "campo_falso": "x",
        },
        headers=auth_headers,
    )
    assert res.status_code == 422


def test_duracion_invalida_rechazada(client, auth_headers):
    res = client.post(
        "/services",
        json={"name": "Consulta", "price": "500.00", "duration_minutes": 0},
        headers=auth_headers,
    )
    assert res.status_code == 422
