from datetime import date, datetime, time, timedelta
from typing import Literal, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from database import get_db
from google_sync import delete_event, push_lead
from models import Client, Lead, User
from security import require_admin

router = APIRouter()
LeadStatus = Literal["nuovo", "appuntamento", "trattativa", "convertito", "perso"]


class LeadIn(BaseModel):
    name: str = Field(min_length=1)
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    meeting_at: Optional[datetime] = None
    duration_minutes: int = Field(default=60, ge=5, le=1440)
    location: Optional[str] = None
    notes: Optional[str] = None
    status: LeadStatus = "nuovo"


def lead_out(db, ld: Lead):
    d = ld.to_dict()
    c = db.get(Client, ld.converted_client_id) if ld.converted_client_id else None
    d["converted_client_name"] = c.name if c else None
    if not c:
        d["converted_client_id"] = None
    return d


def _lead(db, lid) -> Lead:
    ld = db.get(Lead, lid)
    if not ld:
        raise HTTPException(status_code=404, detail="Lead non trovato")
    return ld


def _apply(ld: Lead, body: LeadIn):
    for k, v in body.model_dump().items():
        setattr(ld, k, v)
    if ld.meeting_at:
        ld.meeting_at = ld.meeting_at.replace(tzinfo=None, second=0, microsecond=0)
        if ld.status == "nuovo":
            ld.status = "appuntamento"


@router.get("/leads")
def list_leads(status: Optional[str] = None, start: Optional[date] = None, end: Optional[date] = None,
               _: User = Depends(require_admin), db: Session = Depends(get_db)):
    q = db.query(Lead)
    if status:
        q = q.filter(Lead.status.in_(status.split(",")))
    if start:
        q = q.filter(Lead.meeting_at >= datetime.combine(start, time.min))
    if end:
        q = q.filter(Lead.meeting_at < datetime.combine(end + timedelta(days=1), time.min))
    leads = q.order_by(Lead.meeting_at.is_(None), Lead.meeting_at.desc(), Lead.id.desc()).all()
    return [lead_out(db, ld) for ld in leads]


@router.get("/leads/{lid}")
def get_lead(lid: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    return lead_out(db, _lead(db, lid))


@router.post("/leads")
def create_lead(body: LeadIn, bg: BackgroundTasks, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    ld = Lead()
    _apply(ld, body)
    db.add(ld)
    db.commit()
    if ld.meeting_at:
        bg.add_task(push_lead, ld.id)
    return lead_out(db, ld)


@router.put("/leads/{lid}")
def update_lead(lid: int, body: LeadIn, bg: BackgroundTasks, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    ld = _lead(db, lid)
    _apply(ld, body)
    old_event = None
    if not ld.meeting_at and ld.google_event_id:
        old_event, ld.google_event_id = ld.google_event_id, None
    db.commit()
    if old_event:
        bg.add_task(delete_event, old_event)
    elif ld.meeting_at:
        bg.add_task(push_lead, ld.id)
    return lead_out(db, ld)


@router.delete("/leads/{lid}")
def delete_lead(lid: int, bg: BackgroundTasks, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    ld = _lead(db, lid)
    event_id = ld.google_event_id
    db.delete(ld)
    db.commit()
    if event_id:
        bg.add_task(delete_event, event_id)
    return {"ok": True}
