"""Pruebas del MockLLMProvider: respuestas seguras y escalamiento a humano."""

from app.infrastructure.llm import MockLLMProvider

CONTEXT = {
    "business_name": "Consultorio Ana",
    "services": [
        {"name": "Consulta", "price": "500.00", "duration_minutes": 60, "modality": "in_person"}
    ],
}


def _reply(text: str):
    return MockLLMProvider().reply(
        conversation_history=[{"author": "patient", "text": text}], business_context=CONTEXT
    )


def test_saludo_incluye_aviso_de_asistente_automatizado():
    reply = _reply("hola")
    assert reply.intent == "answer"
    assert "automatizado" in reply.text


def test_precios_provienen_de_la_configuracion_del_negocio():
    reply = _reply("¿cuánto cuesta la consulta?")
    assert "500.00" in reply.text
    assert "Consulta" in reply.text


def test_peticion_explicita_de_humano_escala():
    reply = _reply("quiero hablar con una persona")
    assert reply.intent == "handoff"
    assert reply.handoff_reason


def test_tema_medico_escala():
    reply = _reply("necesito un diagnóstico para mi enfermedad")
    assert reply.intent == "handoff"


def test_enojo_escala():
    reply = _reply("estoy muy molesto con el servicio")
    assert reply.intent == "handoff"


def test_sin_servicios_configurados_escala_en_pregunta_de_precio():
    reply = MockLLMProvider().reply(
        conversation_history=[{"author": "patient", "text": "precio?"}],
        business_context={"business_name": "X", "services": []},
    )
    assert reply.intent == "handoff"


def test_carga_prompts_desde_config_custom_yaml():
    custom_config = {
        "handoff_keywords": ["urgente", "emergencia"],
        "disclaimer": "Asistente de prueba.",
        "messages": {
            "greeting": "Bienvenido a {business_name}. {disclaimer}",
            "handoff_keyword": "Transferido por palabra clave custom.",
        },
    }
    provider = MockLLMProvider(prompts_config=custom_config)
    reply = provider.reply(
        conversation_history=[{"author": "patient", "text": "hola"}],
        business_context={"business_name": "Clínica Test"},
    )
    assert reply.text == "Bienvenido a Clínica Test. Asistente de prueba."

    reply_handoff = provider.reply(
        conversation_history=[{"author": "patient", "text": "es una emergencia"}],
        business_context={"business_name": "Clínica Test"},
    )
    assert reply_handoff.intent == "handoff"
    assert reply_handoff.text == "Transferido por palabra clave custom."

