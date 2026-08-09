"""Pruebas del chat simulado, takeover humano y cierre de conversaciones."""

from tests.conftest import create_service


def _send(client, business_id, text, phone="5511112222", name="Paciente Chat"):
    return client.post(
        "/simulated-chat/messages",
        json={
            "business_id": business_id,
            "patient_name": name,
            "patient_phone": phone,
            "text": text,
        },
    )


def _business_id(client, headers) -> int:
    return client.get("/business", headers=headers).json()["id"]


def test_mensaje_entrante_recibe_respuesta_del_bot(client, auth_headers):
    business_id = _business_id(client, auth_headers)
    res = _send(client, business_id, "hola")
    assert res.status_code == 200
    data = res.json()
    assert data["conversation_status"] == "bot_active"
    assert data["bot_reply"] is not None
    assert "automatizado" in data["bot_reply"]


def test_mensajes_se_persisten_y_consultan(client, auth_headers):
    business_id = _business_id(client, auth_headers)
    _send(client, business_id, "hola")
    _send(client, business_id, "¿tienen citas?")

    conversations = client.get("/conversations", headers=auth_headers).json()
    assert len(conversations) == 1
    conv_id = conversations[0]["id"]

    messages = client.get(f"/conversations/{conv_id}/messages", headers=auth_headers).json()
    # 2 del paciente + 2 del bot
    assert len(messages) == 4
    assert messages[0]["author"] == "patient"
    assert messages[1]["author"] == "bot"


def test_precio_respondido_desde_configuracion(client, auth_headers):
    create_service(client, auth_headers)
    business_id = _business_id(client, auth_headers)
    res = _send(client, business_id, "¿cuánto cuesta?")
    assert "500.00" in res.json()["bot_reply"]


def test_peticion_de_humano_escala_conversacion(client, auth_headers):
    business_id = _business_id(client, auth_headers)
    res = _send(client, business_id, "quiero hablar con una persona")
    assert res.json()["conversation_status"] == "human_requested"


def test_takeover_detiene_al_bot(client, auth_headers):
    """Regla crítica: tras el takeover el bot NO responde más."""
    business_id = _business_id(client, auth_headers)
    _send(client, business_id, "hola")
    conv_id = client.get("/conversations", headers=auth_headers).json()[0]["id"]

    res = client.post(
        f"/conversations/{conv_id}/takeover", json={}, headers=auth_headers
    )
    assert res.status_code == 200
    assert res.json()["status"] == "human_active"

    res = _send(client, business_id, "¿sigues ahí?")
    assert res.json()["bot_reply"] is None
    assert res.json()["conversation_status"] == "human_active"


def test_respuesta_manual_del_negocio(client, auth_headers):
    business_id = _business_id(client, auth_headers)
    _send(client, business_id, "hola")
    conv_id = client.get("/conversations", headers=auth_headers).json()[0]["id"]

    res = client.post(
        f"/conversations/{conv_id}/messages",
        json={"text": "Hola, soy Ana, ¿en qué te ayudo?"},
        headers=auth_headers,
    )
    assert res.status_code == 201
    assert res.json()["author"] == "staff"
    # Responder manualmente toma el control.
    conv = client.get("/conversations", headers=auth_headers).json()[0]
    assert conv["status"] == "human_active"


def test_cerrar_conversacion(client, auth_headers):
    business_id = _business_id(client, auth_headers)
    _send(client, business_id, "hola")
    conv_id = client.get("/conversations", headers=auth_headers).json()[0]["id"]

    res = client.post(f"/conversations/{conv_id}/close", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "closed"

    # No se puede responder en una conversación cerrada.
    res = client.post(
        f"/conversations/{conv_id}/messages", json={"text": "hola"}, headers=auth_headers
    )
    assert res.status_code == 409

    # Un nuevo mensaje del paciente abre una nueva conversación.
    res = _send(client, business_id, "hola de nuevo")
    assert res.json()["conversation_id"] != conv_id


def test_aislamiento_de_conversaciones_entre_negocios(
    client, auth_headers, second_business_headers
):
    business_id = _business_id(client, auth_headers)
    _send(client, business_id, "hola")
    conv_id = client.get("/conversations", headers=auth_headers).json()[0]["id"]

    assert client.get("/conversations", headers=second_business_headers).json() == []
    res = client.get(
        f"/conversations/{conv_id}/messages", headers=second_business_headers
    )
    assert res.status_code == 404
