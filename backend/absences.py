"""Controllo della disponibilità del team (ferie, permessi, indisponibilità)."""
from datetime import date

from models import UserAbsence

KINDS = {"ferie": "Ferie", "permesso": "Permesso", "indisponibile": "Non disponibile"}


def absences_overlapping(db, user_id: int, start: date, end: date | None = None):
    end = end or start
    return db.query(UserAbsence).filter(UserAbsence.user_id == user_id, UserAbsence.start_date <= end,
                                        UserAbsence.end_date >= start).order_by(UserAbsence.start_date).all()


def task_availability_warning(db, task) -> str | None:
    """Avviso se l'assegnatario del task è assente nel periodo del task (inizio→scadenza, o solo scadenza)."""
    if not task.assigned_to_id or not (task.due_date or task.start_date):
        return None
    start = task.start_date or task.due_date
    end = task.due_date or task.start_date
    if start > end:
        start, end = end, start
    hits = absences_overlapping(db, task.assigned_to_id, start, end)
    if not hits:
        return None
    a = hits[0]
    name = a.user.name if a.user else "L'assegnatario"
    if a.start_date == a.end_date:
        when = f"il {a.start_date:%d/%m}"
    else:
        when = f"dal {a.start_date:%d/%m} al {a.end_date:%d/%m}"
    if a.kind == "indisponibile":
        return f"Attenzione: {name} non è disponibile {when}"
    return f"Attenzione: {name} è in {KINDS.get(a.kind, a.kind).lower()} {when}"
