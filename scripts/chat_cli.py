"""Simulador de Chat en Terminal (CLI) para ChatAliado.

Permite probar interactivamente la conversación con el bot (MockLLMProvider)
desde la terminal, ya sea directamente (standalone) o conectándose al API backend.

Uso:
  python scripts/chat_cli.py                      # Modo directo / standalone
  python scripts/chat_cli.py --url http://127.0.0.1:8000  # Modo API HTTP
"""

import argparse
import sys
from typing import Any

import httpx

from app.infrastructure.llm import MockLLMProvider


def run_standalone():
    print("=" * 60)
    print("🤖 ChatAliado — Simulador CLI (Modo Directo Standalone)")
    print("Escribe tus mensajes y presiona Enter. Escribe '/exit' para salir.")
    print("Escribe '/prompts' para recargar prompts desde YAML.")
    print("=" * 60)

    provider = MockLLMProvider()
    business_context = {
        "business_name": "Consultorio Nutricional Aliado",
        "services": [
            {
                "name": "Consulta Nutricional Inicial",
                "price": "600.00",
                "duration_minutes": 60,
                "modality": "in_person",
            },
            {
                "name": "Seguimiento en Línea",
                "price": "400.00",
                "duration_minutes": 30,
                "modality": "online",
            },
        ],
    }

    history: list[dict[str, str]] = []

    while True:
        try:
            user_input = input("\n👤 Cliente > ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n¡Hasta luego!")
            break

        if not user_input:
            continue

        if user_input.lower() in ("/exit", "/quit"):
            print("¡Hasta luego!")
            break

        if user_input.lower() == "/prompts":
            provider = MockLLMProvider()
            print("🔄 Prompts recargados desde app/infrastructure/prompts.yaml")
            continue

        if user_input.lower() == "/history":
            print("\n--- Historial de Conversación ---")
            for msg in history:
                print(f"  {msg['author'].capitalize()}: {msg['text']}")
            continue

        history.append({"author": "patient", "text": user_input})
        reply = provider.reply(conversation_history=history, business_context=business_context)

        print(f"🤖 Bot [{reply.intent.upper()}] > {reply.text}")
        if reply.intent == "handoff":
            print(f"⚠️  [HANDOFF TRIGGERED] Razón: {reply.handoff_reason}")

        history.append({"author": "bot", "text": reply.text})


def run_api(base_url: str, business_id: int, name: str, phone: str):
    print("=" * 60)
    print(f"🤖 ChatAliado — Simulador CLI (Modo HTTP API: {base_url})")
    print(f"Negocio ID: {business_id} | Paciente: {name} ({phone})")
    print("Escribe tus mensajes y presiona Enter. Escribe '/exit' para salir.")
    print("=" * 60)

    client = httpx.Client(base_url=base_url, timeout=10.0)

    while True:
        try:
            user_input = input("\n👤 Cliente > ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\n¡Hasta luego!")
            break

        if not user_input:
            continue

        if user_input.lower() in ("/exit", "/quit"):
            print("¡Hasta luego!")
            break

        try:
            res = client.post(
                "/api/v1/simulated-chat/messages",
                json={
                    "business_id": business_id,
                    "patient_name": name,
                    "patient_phone": phone,
                    "text": user_input,
                },
            )
            if res.status_code != 200:
                print(f"❌ Error API ({res.status_code}): {res.text}")
                continue

            data = res.json()
            bot_reply = data.get("bot_reply")
            status = data.get("conversation_status")

            if bot_reply:
                print(f"🤖 Bot > {bot_reply}")
            else:
                print(f"👤 Staff (Modo humano activo / estado: {status})")

        except Exception as e:
            print(f"❌ Error al conectar con servidor: {e}")


def main():
    parser = argparse.ArgumentParser(description="Simulador CLI de chat para ChatAliado")
    parser.add_argument("--url", type=str, default="", help="URL base del servidor backend API")
    parser.add_argument("--business-id", type=int, default=1, help="ID del negocio")
    parser.add_argument("--patient-name", type=str, default="Cliente CLI", help="Nombre del cliente")
    parser.add_argument("--patient-phone", type=str, default="5550001122", help="Teléfono")

    args = parser.parse_args()

    if args.url:
        run_api(args.url, args.business_id, args.patient_name, args.patient_phone)
    else:
        run_standalone()


if __name__ == "__main__":
    main()
