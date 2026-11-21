"""Registro modifiche automatico.

Un listener ``after_flush`` di SQLAlchemy registra in ``audit_log`` ogni creazione, modifica ed eliminazione
di pagamenti, lavori registrati (compensi), clienti e task, con i valori prima/dopo dei soli campi cambiati.
L'utente arriva da ``session.info["audit_user"]``, impostato da ``security.get_current_user``.
"""
import json
from datetime import date, datetime

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from models import AuditLog, Client, Payment, Task, WorkLog, utcnow

TRACKED = {Payment: "payment", WorkLog: "work_log", Client: "client", Task: "task"}
LABELS = {"payment": "Pagamento", "work_log": "Lavoro / compenso", "client": "Cliente", "task": "Task"}
IGNORED = {"updated_at", "created_at"}


def _plain(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _columns(obj):
    return {c.key: _plain(getattr(obj, c.key)) for c in inspect(obj).mapper.column_attrs}


def _changes(obj):
    state = inspect(obj)
    before, after = {}, {}
    for attr in state.mapper.column_attrs:
        if attr.key in IGNORED:
            continue
        hist = state.attrs[attr.key].history
        if not hist.has_changes():
            continue
        old = _plain(hist.deleted[0]) if hist.deleted else None
        new = _plain(hist.added[0]) if hist.added else _plain(getattr(obj, attr.key))
        if old != new:
            before[attr.key], after[attr.key] = old, new
    return before, after


def _summary(entity, obj):
    for field in ("title", "name", "description", "task_title"):
        value = getattr(obj, field, None)
        if value:
            return str(value)[:255]
    return None


def _dump(data):
    return json.dumps(data, ensure_ascii=False, default=str) if data is not None else None


@event.listens_for(Session, "after_flush")
def _record(session, _ctx):
    if session.info.get("audit_disabled"):
        return
    user_id, user_name = session.info.get("audit_user") or (None, "Sistema")
    rows = []

    def add(entity, obj, action, before, after):
        rows.append({
            "created_at": utcnow(), "user_id": user_id, "user_name": user_name, "entity": entity,
            "entity_id": getattr(obj, "id", None), "action": action, "before_json": _dump(before),
            "after_json": _dump(after), "summary": _summary(entity, obj),
        })

    for obj in session.new:
        entity = TRACKED.get(type(obj))
        if entity:
            add(entity, obj, "create", None, _columns(obj))
    for obj in session.dirty:
        entity = TRACKED.get(type(obj))
        if not entity:
            continue
        before, after = _changes(obj)
        if not after:
            continue
        action = "update"
        if "deleted_at" in after:
            action = "delete" if after["deleted_at"] else "restore"
        add(entity, obj, action, before, after)
    for obj in session.deleted:
        entity = TRACKED.get(type(obj))
        if entity:
            add(entity, obj, "purge" if getattr(obj, "deleted_at", None) else "delete", _columns(obj), None)
    if rows:
        session.connection().execute(AuditLog.__table__.insert(), rows)
