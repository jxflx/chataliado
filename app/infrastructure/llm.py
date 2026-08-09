"""Interfaz intercambiable de proveedor de LLM.

El LLM nunca ejecuta operaciones: sólo devuelve un texto de respuesta y,
opcionalmente, una intención estructurada que el backend valida y ejecuta.
"""

from dataclasses import dataclass, field
from typing import Literal, Protocol

Intent = Literal["answer", "handoff"]

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Protocol
import yaml

Intent = Literal["answer", "handoff"]

DEFAULT_PROMPTS_PATH = Path(__file__).parent / "prompts.yaml"

# Valores por defecto en caso de fallback si no existe o falla el archivo YAML.
DEFAULT_HANDOFF_KEYWORDS = (
    "humano",
    "persona",
    "nutriólogo",
    "nutriologo",
    "doctor",
    "queja",
    "molesto",
    "enojado",
    "diagnóstico",
    "diagnostico",
    "receta",
    "medicamento",
    "enfermedad",
    "dieta para",
)

DEFAULT_DISCLAIMER = (
    "Soy un asistente automatizado y no sustituyo al profesional. "
    "Puedo ayudarte con información de servicios, precios y citas."
)

DEFAULT_MESSAGES = {
    "handoff_keyword": (
        "Entiendo. Voy a transferir tu conversación para que te atienda "
        "una persona del equipo. En breve te contactarán."
    ),
    "services_empty": "Aún no tengo información de precios cargada. {disclaimer}",
    "appointment_help": (
        "Con gusto te ayudo a agendar una cita. Por favor indícame tu nombre "
        "completo y el servicio que te interesa, y te compartiré los horarios "
        "disponibles desde el sistema."
    ),
    "greeting": "¡Hola! Bienvenido a {business_name}. {disclaimer} ¿En qué puedo ayudarte?",
    "unknown": (
        "Disculpa, no estoy seguro de haber entendido tu mensaje. "
        "Puedo ayudarte con información de servicios, precios y citas. "
        "Si prefieres hablar con una persona, dime 'quiero hablar con una persona'."
    ),
}

# Compatibilidad hacia atrás con variables globales
HANDOFF_KEYWORDS = DEFAULT_HANDOFF_KEYWORDS
DISCLAIMER = DEFAULT_DISCLAIMER


@dataclass
class LLMReply:
    text: str
    intent: Intent = "answer"
    handoff_reason: str = ""
    metadata: dict = field(default_factory=dict)


class LLMProvider(Protocol):
    def reply(self, *, conversation_history: list[dict], business_context: dict) -> LLMReply: ...


def load_prompts_from_yaml(filepath: Path | str | None = None) -> dict[str, Any]:
    """Carga los prompts y configuración del LLM desde un archivo YAML."""
    path = Path(filepath) if filepath else DEFAULT_PROMPTS_PATH
    if not path.is_file():
        return {
            "handoff_keywords": list(DEFAULT_HANDOFF_KEYWORDS),
            "disclaimer": DEFAULT_DISCLAIMER,
            "messages": DEFAULT_MESSAGES.copy(),
        }

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return {
            "handoff_keywords": data.get("handoff_keywords", list(DEFAULT_HANDOFF_KEYWORDS)),
            "disclaimer": data.get("disclaimer", DEFAULT_DISCLAIMER),
            "messages": {**DEFAULT_MESSAGES, **data.get("messages", {})},
        }
    except Exception:
        return {
            "handoff_keywords": list(DEFAULT_HANDOFF_KEYWORDS),
            "disclaimer": DEFAULT_DISCLAIMER,
            "messages": DEFAULT_MESSAGES.copy(),
        }


class MockLLMProvider:
    """Proveedor falso y determinista para desarrollo y pruebas.

    Responde con la información configurada por el negocio y escala a humano
    cuando detecta palabras clave médicas, de enojo o petición explícita.
    Los prompts y palabras clave se cargan dinámicamente desde un archivo YAML.
    """

    def __init__(
        self,
        prompts_path: Path | str | None = None,
        prompts_config: dict[str, Any] | None = None,
    ):
        if prompts_config is not None:
            self.config = prompts_config
        else:
            self.config = load_prompts_from_yaml(prompts_path)

        self.handoff_keywords = tuple(
            self.config.get("handoff_keywords", DEFAULT_HANDOFF_KEYWORDS)
        )
        self.disclaimer = self.config.get("disclaimer", DEFAULT_DISCLAIMER)
        self.messages = self.config.get("messages", DEFAULT_MESSAGES)

    def reply(self, *, conversation_history: list[dict], business_context: dict) -> LLMReply:
        last = conversation_history[-1]["text"].lower() if conversation_history else ""

        for keyword in self.handoff_keywords:
            if keyword in last:
                handoff_msg = self.messages.get(
                    "handoff_keyword", DEFAULT_MESSAGES["handoff_keyword"]
                )
                return LLMReply(
                    text=handoff_msg,
                    intent="handoff",
                    handoff_reason=f"Palabra clave detectada: '{keyword}'",
                )

        services = business_context.get("services", [])
        if any(word in last for word in ("precio", "costo", "cuánto", "cuanto")):
            if services:
                lines = [
                    f"- {s['name']}: ${s['price']} MXN ({s['duration_minutes']} min, "
                    f"{'en línea' if s['modality'] == 'online' else 'presencial'})"
                    for s in services
                ]
                return LLMReply(text="Estos son nuestros servicios:\n" + "\n".join(lines))

            services_empty_fmt = self.messages.get(
                "services_empty", DEFAULT_MESSAGES["services_empty"]
            ).format(disclaimer=self.disclaimer)
            return LLMReply(
                text=services_empty_fmt,
                intent="handoff",
                handoff_reason="Información de servicios no configurada",
            )

        if any(word in last for word in ("cita", "agendar", "reservar", "horario", "disponib")):
            appt_msg = self.messages.get("appointment_help", DEFAULT_MESSAGES["appointment_help"])
            return LLMReply(text=appt_msg)

        if any(word in last for word in ("hola", "buenos", "buenas", "hey")):
            business_name = business_context.get("business_name", "el consultorio")
            greeting_fmt = self.messages.get("greeting", DEFAULT_MESSAGES["greeting"]).format(
                business_name=business_name, disclaimer=self.disclaimer
            )
            return LLMReply(text=greeting_fmt)

        unknown_msg = self.messages.get("unknown", DEFAULT_MESSAGES["unknown"])
        return LLMReply(text=unknown_msg)


def get_llm_provider() -> LLMProvider:
    """Punto único para cambiar de proveedor (OpenAI, Anthropic, etc.) en el futuro."""
    return MockLLMProvider()

