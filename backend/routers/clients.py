from datetime import date
from typing import Literal, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from database import get_db
from models import Client, Lead, Post, Task, User, WorkLog, utcnow
from security import get_current_user, require_admin
from avatars import avatar_url
from routers.finance import _clean_notes
from google_sync import delete_event
from trash import soft_delete
from models import SubscriptionHistory
from services import (PACKAGES, SUBSCRIPTION_EVENTS, client_usage, create_cycle_payment, credit_check,
                      ensure_subscription_payment, package_for, record_subscription_event, refresh_payment_statuses,
                      track_subscription_change)

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
    d["open_payment_count"] = sum(1 for p in c.payments if p.status != "saldato")
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
    refresh_payment_statuses(db)
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
def renew_package(client_id: int, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = db.get(Client, client_id)
    if not c:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    if not package_for(c):
        raise HTTPException(status_code=400, detail="Solo i clienti in abbonamento hanno un pacchetto da rinnovare")
    latest = max((p for p in c.payments if p.kind == "abbonamento"), key=lambda p: p.due_date, default=None)
    if latest:
        next_month = latest.due_date.month % 12 + 1
        next_year = latest.due_date.year + (1 if latest.due_date.month == 12 else 0)
        next_reference = date(next_year, next_month, 1)
    else:
        today = date.today()
        next_reference = date(today.year, today.month, 1)
    old_cycle = c.cycle_number or 1
    c.cycle_number = old_cycle + 1
    c.cycle_started_at = utcnow()
    create_cycle_payment(db, c, c.cycle_number, next_reference)
    record_subscription_event(db, c, "renewal", user, from_package=c.package,
                              from_price=(package_for(c) or {}).get("price"), from_cycle=old_cycle)
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
    d["tasks"] = [{**t.to_dict(), "assignee_name": t.assignee.name if t.assignee else None,
                   "assignee_avatar_url": avatar_url(t.assignee) if t.assignee else None}
                  for t in sorted(c.tasks, key=lambda t: t.created_at, reverse=True)[:30]]
    d["work_logs"] = [{
        **log.to_dict(),
        "client_name": c.name,
        "user_name": log.user.name if log.user else None,
        "task_title": log.task.title if log.task else log.task_title or log.description,
        "worker_payout": log.worker_expense or 0,
        "client_revenue": log.revenue_amount or 0,
        "margin": round((log.revenue_amount or 0) - (log.worker_expense or 0), 2),
        "team_paid": bool(log.team_paid),
        "notes": _clean_notes(log.notes),
    } for log in sorted(c.work_logs, key=lambda item: (item.date, item.id), reverse=True)]
    d["contracts"] = [{**contract.to_dict(), "task_count": len(contract.tasks)}
                      for contract in sorted(c.contracts, key=lambda item: item.created_at, reverse=True)]
    d["subscription_history"] = subscription_history(c.id, None, db)
    d["video_scripts"] = [{
        **script.to_dict(), "client_name": c.name
    } for script in sorted(c.video_scripts, key=lambda item: (item.shooting_date is None,
                                                               item.shooting_date or date.max),)]
    return d


@router.post("/clients")
def create_client(body: ClientIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
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
        record_subscription_event(db, c, "start", user, day=c.start_date)
    db.commit()
    return client_out(db, c)


@router.put("/clients/{client_id}")
def update_client(client_id: int, body: ClientIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = db.get(Client, client_id)
    if not c:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    _validate(body)
    data = body.model_dump(exclude=EXTRA_FIELDS)
    _clean_package(data)
    old_package, old_price = c.package, (package_for(c) or {}).get("price")
    for k, v in data.items():
        setattr(c, k, v)
    track_subscription_change(db, c, old_package, old_price, user)
    if package_for(c):
        ensure_subscription_payment(db, c)
    db.commit()
    refresh_payment_statuses(db)
    return client_out(db, c)


@router.delete("/clients/{client_id}")
def delete_client(client_id: int, bg: BackgroundTasks, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = db.get(Client, client_id)
    if not c:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    # Nel cestino il cliente con task, contenuti, pagamenti, preventivi, script e contratti.
    # I lavori registrati restano (compensi del team e resoconti), come prima dell'introduzione del cestino.
    linked = [*c.tasks, *c.posts, *c.payments, *c.quotes, *c.video_scripts, *c.contracts]
    events = [p.google_event_id for p in c.posts if p.google_event_id]
    for p in c.posts:
        p.google_event_id = None
    soft_delete(db, c, user, linked)
    db.commit()
    for event_id in events:
        bg.add_task(delete_event, event_id)
    return {"ok": True}


@router.get("/clients/{client_id}/subscription-history")
def subscription_history(client_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.query(SubscriptionHistory).filter(SubscriptionHistory.client_id == client_id) \
        .order_by(SubscriptionHistory.date.desc(), SubscriptionHistory.id.desc()).all()
    out = []
    for r in rows:
        d = r.to_dict()
        d["event_label"] = SUBSCRIPTION_EVENTS.get(r.event, r.event)
        d["from_package_label"] = (PACKAGES.get(r.from_package) or {}).get("name") or (r.from_package or "").capitalize() or None
        d["to_package_label"] = (PACKAGES.get(r.to_package) or {}).get("name") or (r.to_package or "").capitalize() or None
        out.append(d)
    return out
