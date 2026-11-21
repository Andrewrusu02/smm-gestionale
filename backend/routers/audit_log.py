import json
from datetime import date, datetime, time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from audit import LABELS
from database import get_db
from models import AuditLog, User
from security import require_admin

router = APIRouter()
ACTIONS = {"create": "Creazione", "update": "Modifica", "delete": "Eliminazione", "restore": "Ripristino",
           "purge": "Eliminazione definitiva"}


def _out(row: AuditLog):
    d = row.to_dict(exclude=("before_json", "after_json"))
    d["before"] = json.loads(row.before_json) if row.before_json else None
    d["after"] = json.loads(row.after_json) if row.after_json else None
    d["entity_label"] = LABELS.get(row.entity, row.entity)
    d["action_label"] = ACTIONS.get(row.action, row.action)
    return d


@router.get("/audit")
def list_audit(entity: Optional[str] = None, entity_id: Optional[int] = None, user_id: Optional[int] = None,
               action: Optional[str] = None, date_from: Optional[date] = None, date_to: Optional[date] = None,
               limit: int = 100, offset: int = 0, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="La data iniziale è successiva a quella finale")
    q = db.query(AuditLog)
    if entity:
        q = q.filter(AuditLog.entity.in_(entity.split(",")))
    if entity_id:
        q = q.filter(AuditLog.entity_id == entity_id)
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)
    if action:
        q = q.filter(AuditLog.action.in_(action.split(",")))
    if date_from:
        q = q.filter(AuditLog.created_at >= datetime.combine(date_from, time.min))
    if date_to:
        q = q.filter(AuditLog.created_at < datetime.combine(date_to + timedelta(days=1), time.min))
    total = q.count()
    limit = max(1, min(limit, 500))
    rows = q.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset(max(0, offset)).limit(limit).all()
    return {"total": total, "items": [_out(r) for r in rows],
            "entities": [{"key": k, "label": v} for k, v in LABELS.items()], "actions": ACTIONS}
