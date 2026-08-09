"""Validación de extremo a extremo contra un servidor corriendo en localhost:8010.

Flujo: registro → servicio → horarios → chat simulado (bot responde precios)
→ disponibilidad → cita → doble reserva rechazada → takeover → bot silenciado
→ respuesta manual → cierre.
"""

import sys
from datetime import datetime, timedelta

import httpx

BASE = "http://127.0.0.1:8010"
client = httpx.Client(base_url=BASE, timeout=10)


def check(name: str, condition: bool, detail: str = ""):
    status = "OK " if condition else "FAIL"
    print(f"[{status}] {name} {detail}")
    if not condition:
        sys.exit(1)


# 1. Salud
check("health", client.get("/health").json() == {"status": "ok"})

# 2. Registro
email = f"e2e_{datetime.now():%H%M%S}@example.com"
res = client.post("/auth/register", json={
    "business_name": "Nutrición E2E", "full_name": "Nutriólogo E2E",
    "email": email, "password": "contrasena123"})
check("registro", res.status_code == 201)
headers = {"Authorization": f"Bearer {res.json()['access_token']}"}
business_id = client.get("/business", headers=headers).json()["id"]

# 3. Servicio y horarios
res = client.post("/services", headers=headers, json={
    "name": "Consulta inicial", "price": "600.00", "duration_minutes": 60})
check("servicio creado", res.status_code == 201)
service_id = res.json()["id"]
rules = [{"weekday": d, "start_time": "09:00", "end_time": "18:00"} for d in range(7)]
res = client.put("/availability/rules", headers=headers, json={"rules": rules})
check("reglas de horario", res.status_code == 200)

# 4. Chat simulado: el bot responde con datos configurados
msg = {"business_id": business_id, "patient_name": "Paciente E2E",
       "patient_phone": "5512340000", "text": "hola, ¿cuánto cuesta la consulta?"}
res = client.post("/simulated-chat/messages", json=msg)
check("bot responde precio configurado", "600.00" in (res.json()["bot_reply"] or ""))
conversation_id = res.json()["conversation_id"]

# 5. Disponibilidad y cita
tomorrow = (datetime.now() + timedelta(days=1)).date().isoformat()
res = client.get(f"/availability?service_id={service_id}&from_date={tomorrow}&to_date={tomorrow}",
                 headers=headers)
slots = res.json()
check("hay slots disponibles", len(slots) > 0, f"({len(slots)} slots)")

patient_id = client.get("/patients", headers=headers).json()[0]["id"]
body = {"patient_id": patient_id, "service_id": service_id, "start_at": slots[0]["start_at"]}
res = client.post("/appointments", headers=headers, json=body)
check("cita creada", res.status_code == 201)

# 6. Doble reserva rechazada
res = client.post("/appointments", headers=headers, json=body)
check("doble reserva rechazada", res.status_code == 409)

# 7. La cita aparece en el dashboard
appointments = client.get("/appointments", headers=headers).json()
check("cita visible en dashboard", len(appointments) == 1)

# 8. Takeover: el bot deja de responder
res = client.post(f"/conversations/{conversation_id}/takeover", headers=headers, json={})
check("takeover", res.json()["status"] == "human_active")
res = client.post("/simulated-chat/messages", json={**msg, "text": "¿sigues ahí?"})
check("bot silenciado tras takeover", res.json()["bot_reply"] is None)

# 9. Respuesta manual y cierre
res = client.post(f"/conversations/{conversation_id}/messages", headers=headers,
                  json={"text": "Hola, te atiendo personalmente."})
check("respuesta manual", res.status_code == 201)
res = client.post(f"/conversations/{conversation_id}/close", headers=headers)
check("cierre de conversación", res.json()["status"] == "closed")

print("\nFlujo de extremo a extremo completado con éxito.")
