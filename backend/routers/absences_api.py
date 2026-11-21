"""Ferie, permessi e indisponibilità del team.

Ognuno gestisce le proprie; l'amministratore anche quelle degli altri. Tutti le vedono nel calendario.
"""
import datetime as _dt
from datetime import date, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from absences import KINDS, absences_overlapping
from database import get_db
from models import User, UserAbsence
from security import get_current_user

router = APIRouter()


class AbsenceIn(BaseModel):
    user_id: Optional[int] = None
    kind: Literal["ferie", "permesso", "indisponibile"] = "ferie"
    start_date: _dt.date
    end_date: Optional[_dt.date] = None
    note: Optional[str] = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def _check(self):
        self.end_date = self.end_date or self.start_date
        if self.end_date < self.start_date:
            raise ValueError("La data di fine è precedente a quella di inizio")
        if (self.end_date - self.start_date).days > 366:
            raise ValueError("Il periodo non può superare un anno")
        return self


def _out(a: UserAbsence):
    d = a.to_dict()
    d["user_name"] = a.user.name if a.user else None
    d["kind_label"] = KINDS.get(a.kind, a.kind)
    return d


def _owner(db, body_user_id, user: User) -> int:
    uid = body_user_id or user.id
    if uid != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Puoi segnare solo le tue assenze")
    if not db.get(User, uid):
        raise HTTPException(status_code=404, detail="Utente non trovato")
    return uid


def _absence(db, aid, user: User) -> UserAbsence:
    a = db.get(UserAbsence, aid)
    if not a:
        raise HTTPException(status_code=404, detail="Assenza non trovata")
    if user.role != "admin" and a.user_id != user.id:
        raise HTTPException(status_code=403, detail="Puoi modificare solo le tue assenze")
    return a


@router.get("/absences")
def list_absences(start: Optional[date] = None, end: Optional[date] = None, user_id: Optional[int] = None,
                  _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(UserAbsence)
    if start:
        q = q.filter(UserAbsence.end_date >= start)
    if end:
        q = q.filter(UserAbsence.start_date <= end)
    if not start and not end:
        q = q.filter(UserAbsence.end_date >= date.today() - timedelta(days=60))
    if user_id:
        q = q.filter(UserAbsence.user_id == user_id)
    return [_out(a) for a in q.order_by(UserAbsence.start_date, UserAbsence.id).all()]


@router.get("/absences/check")
def check(user_id: int, start: date, end: Optional[date] = None, _: User = Depends(get_current_user),
          db: Session = Depends(get_db)):
    return [_out(a) for a in absences_overlapping(db, user_id, start, end)]


@router.post("/absences")
def create_absence(body: AbsenceIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    uid = _owner(db, body.user_id, user)
    a = UserAbsence(user_id=uid, kind=body.kind, start_date=body.start_date, end_date=body.end_date,
                    note=body.note or None, created_by=user.id)
    db.add(a)
    db.commit()
    return _out(a)


@router.put("/absences/{aid}")
def update_absence(aid: int, body: AbsenceIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _absence(db, aid, user)
    a.user_id = _owner(db, body.user_id or a.user_id, user)
    a.kind, a.start_date, a.end_date, a.note = body.kind, body.start_date, body.end_date, body.note or None
    db.commit()
    return _out(a)


@router.delete("/absences/{aid}")
def delete_absence(aid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_absence(db, aid, user))
    db.commit()
    return {"ok": True}
