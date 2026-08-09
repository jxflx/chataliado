"""Pruebas de disponibilidad y citas: creación, doble reserva, cancelación, reprogramación."""

from datetime import datetime, timedelta

from tests.conftest import create_patient, create_service, set_full_week_availability


def _tomorrow_at(hour: int, minute: int = 0) -> str:
    day = datetime.now() + timedelta(days=1)
    return day.replace(hour=hour, minute=minute, second=0, microsecond=0).isoformat()


def _setup(client, headers):
    service = create_service(client, headers)
    set_full_week_availability(client, headers)
    patient = create_patient(client, headers)
    return service, patient


def _create(client, headers, patient_id, service_id, start_at):
    return client.post(
        "/appointments",
        json={"patient_id": patient_id, "service_id": service_id, "start_at": start_at},
        headers=headers,
    )


def test_disponibilidad_devuelve_slots(client, auth_headers):
    service, _ = _setup(client, auth_headers)
    day = (datetime.now() + timedelta(days=1)).date().isoformat()
    res = client.get(
        f"/availability?service_id={service['id']}&from_date={day}&to_date={day}",
        headers=auth_headers,
    )
    assert res.status_code == 200
    slots = res.json()
    assert len(slots) > 0
    assert slots[0]["start_at"].endswith("09:00:00")


def test_crear_cita_en_slot_valido(client, auth_headers):
    service, patient = _setup(client, auth_headers)
    res = _create(client, auth_headers, patient["id"], service["id"], _tomorrow_at(10))
    assert res.status_code == 201, res.text
    assert res.json()["status"] == "confirmed"


def test_doble_reserva_rechazada(client, auth_headers):
    """Regla crítica: el mismo slot no puede reservarse dos veces."""
    service, patient = _setup(client, auth_headers)
    patient2 = create_patient(client, auth_headers, phone="5599999999")
    assert (
        _create(client, auth_headers, patient["id"], service["id"], _tomorrow_at(10)).status_code
        == 201
    )
    res = _create(client, auth_headers, patient2["id"], service["id"], _tomorrow_at(10))
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "conflict"


def test_cita_solapada_rechazada(client, auth_headers):
    """Una cita que se solapa parcialmente también debe rechazarse."""
    service, patient = _setup(client, auth_headers)
    assert (
        _create(client, auth_headers, patient["id"], service["id"], _tomorrow_at(10)).status_code
        == 201
    )
    res = _create(client, auth_headers, patient["id"], service["id"], _tomorrow_at(10, 30))
    assert res.status_code == 409


def test_cita_fuera_de_horario_rechazada(client, auth_headers):
    service, patient = _setup(client, auth_headers)
    res = _create(client, auth_headers, patient["id"], service["id"], _tomorrow_at(22))
    assert res.status_code == 409


def test_cita_en_periodo_bloqueado_rechazada(client, auth_headers):
    service, patient = _setup(client, auth_headers)
    client.post(
        "/availability/blocked-periods",
        json={"start_at": _tomorrow_at(9), "end_at": _tomorrow_at(12), "reason": "Congreso"},
        headers=auth_headers,
    )
    res = _create(client, auth_headers, patient["id"], service["id"], _tomorrow_at(10))
    assert res.status_code == 409


def test_cancelar_cita_libera_slot(client, auth_headers):
    service, patient = _setup(client, auth_headers)
    apt = _create(client, auth_headers, patient["id"], service["id"], _tomorrow_at(10)).json()
    res = client.patch(
        f"/appointments/{apt['id']}", json={"status": "cancelled"}, headers=auth_headers
    )
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"
    # El slot vuelve a estar disponible.
    res = _create(client, auth_headers, patient["id"], service["id"], _tomorrow_at(10))
    assert res.status_code == 201


def test_transicion_de_estado_invalida(client, auth_headers):
    service, patient = _setup(client, auth_headers)
    apt = _create(client, auth_headers, patient["id"], service["id"], _tomorrow_at(10)).json()
    client.patch(f"/appointments/{apt['id']}", json={"status": "cancelled"}, headers=auth_headers)
    res = client.patch(
        f"/appointments/{apt['id']}", json={"status": "completed"}, headers=auth_headers
    )
    assert res.status_code == 409


def test_reprogramar_cita(client, auth_headers):
    service, patient = _setup(client, auth_headers)
    apt = _create(client, auth_headers, patient["id"], service["id"], _tomorrow_at(10)).json()
    res = client.patch(
        f"/appointments/{apt['id']}", json={"start_at": _tomorrow_at(14)}, headers=auth_headers
    )
    assert res.status_code == 200, res.text
    assert res.json()["start_at"].endswith("14:00:00")


def test_reprogramar_a_su_propio_horario_es_valido(client, auth_headers):
    """Al reprogramar, la propia cita no debe bloquear el slot."""
    service, patient = _setup(client, auth_headers)
    apt = _create(client, auth_headers, patient["id"], service["id"], _tomorrow_at(10)).json()
    res = client.patch(
        f"/appointments/{apt['id']}", json={"start_at": _tomorrow_at(10)}, headers=auth_headers
    )
    assert res.status_code == 200
