from datetime import date
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from database import get_db
from models import Client, Lead, Post, Task, User, WorkLog, utcnow
from security import get_current_user, require_admin
from services import (PACKAGES, client_usage, create_cycle_payment, credit_check,
                      ensure_subscription_payment, package_for, refresh_payment_statuses)

router = APIRouter()


class ClientIn(BaseModel):
    name: str = Field(min_length=1)
    company_name: Optional[str] = None
    status: Literal["ACTIVE", "INACTIVE"] = "ACTIVE"
    package: Optional[Literal["standard", "silver", "premium", "personalizzato"]] = None
    custom_price: Optional[float] = Field(default=None, ge=0)
    custom_reel: Optional[int] = Field(default=None, ge=0)
    custom_sessione: Optional[int] = Field(default=None, ge=0)
    custom_carosello: Optional[int] = Field(default=None, ge=0)
    custom_grafica: Optional[int] = Field(default=None, ge=0)
    custom_storia: Optional[int] = Field(default=None, ge=0)
    contact_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    vat_number: Optional[str] = None
    notes: Optional[str] = None
    project_description: Optional[str] = None
    billing_day: int = Field(default=5, ge=1, le=28)
    start_date: Optional[date] = None
    active: bool = True
    invoice_due_date: Optional[date] = None
    lead_id: Optional[int] = None


CUSTOM_FIELDS = ("custom_price", "custom_reel", "custom_sessione", "custom_carosello", "custom_grafica", "custom_storia")
EXTRA_FIELDS = {"invoice_due_date", "lead_id"}


def _validate(body: ClientIn):
    if body.package == "personalizzato" and body.custom_price is None:
        raise HTTPException(status_code=422, detail="Inserisci il costo mensile del pacchetto personalizzato")


def _clean_package(data):
    if data["package"] != "personalizzato":
        for k in CUSTOM_FIELDS:
            data[k] = None


def client_out(db, c: Client):
    d = c.to_dict()
    d["package_info"] = package_for(c)
    d["active_subscription"] = bool(package_for(c))
    d["usage"] = client_usage(db, c)
    d["credits_exhausted"] = bool(d["usage"]) and all(u["remaining"] == 0 for u in d["usage"])
    d["overdue_count"] = sum(1 for p in c.payments if p.status == "in_ritardo")
    d["open_tasks"] = sum(1 for t in c.tasks if t.status != "completato")
    d["total_amount"] = round(sum(p.amount for p in c.payments), 2)
    d["paid_amount"] = round(sum(p.amount for p in c.payments if p.status == "saldato"), 2)
    d["balance"] = round(d["total_amount"] - d["paid_amount"], 2)
    work_payments = [p for p in c.payments if p.task_id is not None]
    d["work_revenue_total"] = round(sum(p.amount for p in work_payments), 2)
    d["work_revenue_paid"] = round(sum(p.amount for p in work_payments if p.status == "saldato"), 2)
    d["work_revenue_balance"] = round(d["work_revenue_total"] - d["work_revenue_paid"], 2)
    return d


@router.get("/packages")
def packages(_: User = Depends(get_current_user)):
    return PACKAGES


@router.get("/clients")
def list_clients(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [client_out(db, c) for c in db.query(Client).order_by(Client.active.desc(), Client.name).all()]


@router.get("/clients/basic")
def clients_basic(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [{"id": c.id, "name": c.name, "package": c.package,
             "active_subscription": bool(package_for(c)), "usage": client_usage(db, c)}
            for c in db.query(Client).filter(Client.active.is_(True)).order_by(Client.name)]


@router.get("/clients/{client_id}/credits")
def client_credits(client_id: int, content_type: str, exclude_post_id: Optional[int] = None,
                   _: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = db.get(Client, client_id)
    if not c:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    return {"tracked": False} if not (chk := credit_check(db, c, content_type, exclude_post_id)) else {"tracked": True, **chk}


@router.post("/clients/{client_id}/renew")
def renew_package(client_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = db.get(Client, client_id)
    if not c:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    if not package_for(c):
        raise HTTPException(status_code=400, detail="Solo i clienti in abbonamento hanno un pacchetto da rinnovare")
    c.cycle_number = (c.cycle_number or 1) + 1
    c.cycle_started_at = utcnow()
    create_cycle_payment(db, c, c.cycle_number)
    db.commit()
    return client_out(db, c)


@router.get("/clients/{client_id}")
def get_client(client_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = db.get(Client, client_id)
    if not c:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    d = client_out(db, c)
    q = db.query(Post).filter(Post.client_id == c.id)
    if package_for(c):
        q = q.filter(Post.cycle_number == (c.cycle_number or 1))
    posts = q.order_by(Post.scheduled_at).limit(200).all()
    d["posts"] = [p.to_dict() for p in posts]
    d["payments"] = [{**p.to_dict(), "task_title": p.task.title if p.task else None}
                     for p in sorted(c.payments, key=lambda p: p.due_date, reverse=True)]
    d["tasks"] = [{**t.to_dict(), "assignee_name": t.assignee.name if t.assignee else None}
                  for t in sorted(c.tasks, key=lambda t: t.created_at, reverse=True)[:30]]
    d["work_logs"] = [{
        **log.to_dict(),
        "client_name": c.name,
        "user_name": log.user.name if log.user else None,
        "task_title": log.task.title if log.task else log.task_title or log.description,
        "worker_payout": log.worker_expense or 0,
        "client_revenue": log.revenue_amount or 0,
        "margin": round((log.revenue_amount or 0) - (log.worker_expense or 0), 2),
    } for log in sorted(c.work_logs, key=lambda item: (item.date, item.id), reverse=True)]
    d["contracts"] = [{**contract.to_dict(), "task_count": len(contract.tasks)}
                      for contract in sorted(c.contracts, key=lambda item: item.created_at, reverse=True)]
    d["video_scripts"] = [{
        **script.to_dict(), "client_name": c.name
    } for script in sorted(c.video_scripts, key=lambda item: (item.shooting_date is None,
                                                               item.shooting_date or date.max),)]
    return d


@router.post("/clients")
def create_client(body: ClientIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    _validate(body)
    data = body.model_dump(exclude=EXTRA_FIELDS)
    _clean_package(data)
    if body.package:
        data["start_date"] = data["start_date"] or date.today()
    c = Client(**data, cycle_number=1, cycle_started_at=utcnow())
    db.add(c)
    db.flush()
    if body.lead_id:
        lead = db.get(Lead, body.lead_id)
        if lead:
            lead.status, lead.converted_client_id = "convertito", c.id
    if package_for(c):
        create_cycle_payment(db, c, 1)
    db.commit()
    return client_out(db, c)


@router.put("/clients/{client_id}")
def update_client(client_id: int, body: ClientIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = db.get(Client, client_id)
    if not c:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    _validate(body)
    data = body.model_dump(exclude=EXTRA_FIELDS)
    _clean_package(data)
    for k, v in data.items():
        setattr(c, k, v)
    if package_for(c):
        ensure_subscription_payment(db, c)
    db.commit()
    refresh_payment_statuses(db)
    return client_out(db, c)


@router.delete("/clients/{client_id}")
def delete_client(client_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = db.get(Client, client_id)
    if not c:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    task_ids = [t.id for t in c.tasks]
    db.query(WorkLog).filter(WorkLog.client_id == c.id).update({"client_id": None}, synchronize_session=False)
    if task_ids:
        db.query(WorkLog).filter(WorkLog.task_id.in_(task_ids)).update({"task_id": None}, synchronize_session=False)
    db.query(Task).filter(Task.client_id == c.id).update({"post_id": None}, synchronize_session=False)
    db.delete(c)
    db.commit()
    return {"ok": True}
