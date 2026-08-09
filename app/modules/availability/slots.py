"""Cálculo puro de horarios disponibles.

Todas las fechas/horas se manejan en la hora local del negocio (naive).
La zona horaria del negocio se usa para determinar el "ahora" local.
"""

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta


@dataclass(frozen=True)
class Rule:
    weekday: int  # 0=lunes ... 6=domingo
    start_time: time
    end_time: time


@dataclass(frozen=True)
class Interval:
    start: datetime
    end: datetime

    def overlaps(self, other: "Interval") -> bool:
        return self.start < other.end and other.start < self.end


def compute_slots(
    *,
    rules: list[Rule],
    blocked: list[Interval],
    busy: list[Interval],
    duration_minutes: int,
    from_date: date,
    to_date: date,
    now_local: datetime,
    step_minutes: int = 30,
) -> list[Interval]:
    """Genera slots libres de `duration_minutes` entre from_date y to_date (inclusive).

    - Respeta las reglas recurrentes por día de la semana.
    - Excluye bloqueos y citas existentes (solape estricto).
    - Excluye slots en el pasado respecto a now_local.
    """
    if duration_minutes <= 0:
        return []
    duration = timedelta(minutes=duration_minutes)
    step = timedelta(minutes=step_minutes)
    occupied = blocked + busy
    slots: list[Interval] = []

    day = from_date
    while day <= to_date:
        for rule in rules:
            if rule.weekday != day.weekday():
                continue
            window_start = datetime.combine(day, rule.start_time)
            window_end = datetime.combine(day, rule.end_time)
            cursor = window_start
            while cursor + duration <= window_end:
                candidate = Interval(cursor, cursor + duration)
                if candidate.start >= now_local and not any(
                    candidate.overlaps(o) for o in occupied
                ):
                    slots.append(candidate)
                cursor += step
        day += timedelta(days=1)

    slots.sort(key=lambda s: s.start)
    # Deduplicar por si hay reglas superpuestas el mismo día.
    unique: list[Interval] = []
    for slot in slots:
        if not unique or unique[-1].start != slot.start:
            unique.append(slot)
    return unique
