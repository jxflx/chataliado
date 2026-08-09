"""Pruebas unitarias del cálculo puro de slots."""

from datetime import date, datetime, time

from app.modules.availability.slots import Interval, Rule, compute_slots

MONDAY = date(2026, 7, 13)  # lunes
PAST = datetime(2026, 1, 1)


def _slots(**kwargs):
    defaults = {
        "rules": [Rule(0, time(9, 0), time(12, 0))],
        "blocked": [],
        "busy": [],
        "duration_minutes": 60,
        "from_date": MONDAY,
        "to_date": MONDAY,
        "now_local": PAST,
    }
    defaults.update(kwargs)
    return compute_slots(**defaults)


def test_genera_slots_dentro_de_la_regla():
    slots = _slots()
    starts = [s.start.time() for s in slots]
    assert time(9, 0) in starts
    assert time(11, 0) in starts
    # Un slot de 60 min a las 11:30 terminaría a las 12:30, fuera de la regla.
    assert time(11, 30) not in starts


def test_dia_sin_regla_no_genera_slots():
    tuesday = date(2026, 7, 14)
    assert _slots(from_date=tuesday, to_date=tuesday) == []


def test_respeta_duracion_del_servicio():
    slots = _slots(duration_minutes=180)
    assert len(slots) == 1
    assert slots[0].start.time() == time(9, 0)
    assert slots[0].end.time() == time(12, 0)


def test_excluye_citas_existentes():
    busy = [Interval(datetime(2026, 7, 13, 9, 0), datetime(2026, 7, 13, 10, 0))]
    starts = [s.start.time() for s in _slots(busy=busy)]
    assert time(9, 0) not in starts
    assert time(9, 30) not in starts  # solaparía con la cita 9:00-10:00
    assert time(10, 0) in starts


def test_excluye_periodos_bloqueados():
    blocked = [Interval(datetime(2026, 7, 13, 0, 0), datetime(2026, 7, 14, 0, 0))]
    assert _slots(blocked=blocked) == []


def test_excluye_slots_en_el_pasado():
    now = datetime(2026, 7, 13, 10, 15)
    starts = [s.start.time() for s in _slots(now_local=now)]
    assert time(9, 0) not in starts
    assert time(10, 30) in starts


def test_reglas_superpuestas_no_duplican_slots():
    rules = [Rule(0, time(9, 0), time(12, 0)), Rule(0, time(9, 0), time(11, 0))]
    slots = _slots(rules=rules)
    starts = [s.start for s in slots]
    assert len(starts) == len(set(starts))


def test_duracion_invalida_devuelve_vacio():
    assert _slots(duration_minutes=0) == []
