from collections import defaultdict
from calendar import monthrange
from datetime import date, datetime, time, timedelta
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from google_sync import get_setting
from models import Client, Lead, Payment, Task, User, WorkLog
from security import get_current_user, require_admin
from services import (PACKAGE_KEYS, PACKAGES, client_usage, month_bounds, package_for, period_of,
                      refresh_payment_statuses, shift_period, worklog_cost)

router = APIRouter()


def _bounds(year: int, month: int):
    return date(year, month, 1), date(year, month, monthrange(year, month)[1])


class PaymentIn(BaseModel):
    client_id: int
    task_id: Optional[int] = None
    kind: Literal["abbonamento", "single_job"] = "single_job"
    description: Optional[str] = None
    invoice_number: Optional[str] = None
    amount: float = Field(ge=0)
    due_date: date
    period: Optional[str] = None
    notes: Optional[str] = None


class PaymentUpdate(BaseModel):
    client_id: Optional[int] = None
    task_id: Optional[int] = None
    kind: Optional[Literal["abbonamento", "single_job"]] = None
    description: Optional[str] = None
    invoice_number: Optional[str] = None
    amount: Optional[float] = Field(default=None, ge=0)
    due_date: Optional[date] = None
    period: Optional[str] = None
    notes: Optional[str] = None


class PaidIn(BaseModel):
    paid_date: Optional[date] = None


class GenerateIn(BaseModel):
    period: str = Field(pattern=r"^\d{4}-\d{2}$")


class WorkLogIn(BaseModel):
    client_id: Optional[int] = None
    task_id: Optional[int] = None
    date: Optional[date] = None
    completed_at: Optional[datetime] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    hours: float = Field(default=0, ge=0, le=24)
    fixed_cost: Optional[float] = Field(default=None, ge=0)
    worker_payout: Optional[float] = Field(default=None, ge=0)
    client_revenue: Optional[float] = Field(default=None, ge=0)
    user_id: Optional[int] = None
    team_paid: Optional[bool] = None


class WorkLogUpdate(BaseModel):
    client_id: Optional[int] = None
    task_id: Optional[int] = None
    date: Optional[date] = None
    completed_at: Optional[datetime] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    hours: Optional[float] = Field(default=None, ge=0, le=24)
    fixed_cost: Optional[float] = Field(default=None, ge=0)
    worker_payout: Optional[float] = Field(default=None, ge=0)
    client_revenue: Optional[float] = Field(default=None, ge=0)
    user_id: Optional[int] = None
    team_paid: Optional[bool] = None


TEAM_PAID_TAG = "[SALDATO_TEAM]"
LEGACY_TEAM_PAID_TAG = "[team-paid]"


def _team_payment_status(notes: Optional[str]) -> bool:
    value = notes or ""
    return TEAM_PAID_TAG in value or LEGACY_TEAM_PAID_TAG in value


def _set_team_payment_status(worklog: WorkLog, paid: bool) -> None:
    notes = worklog.notes or ""
    notes = notes.replace(TEAM_PAID_TAG, "").replace(LEGACY_TEAM_PAID_TAG, "").strip()
    if paid:
        notes = f"{notes} {TEAM_PAID_TAG}".strip()
    worklog.notes = notes or None


def payment_out(p: Payment):
    d = p.to_dict()
    d["client_name"] = p.client.name if p.client else None
    d["task_title"] = p.task.title if p.task else None
    return d


def _payment(db, pid) -> Payment:
    p = db.get(Payment, pid)
    if not p:
        raise HTTPException(status_code=404, detail="Pagamento non trovato")
    return p


@router.get("/payments")
def list_payments(status: Optional[str] = None, client_id: Optional[int] = None, period: Optional[str] = None,
                  kind: Optional[str] = None, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    refresh_payment_statuses(db)
    q = db.query(Payment)
    if status:
        q = q.filter(Payment.status == status)
    if client_id:
        q = q.filter(Payment.client_id == client_id)
    if kind:
        q = q.filter(Payment.kind == kind)
    if period:
        s, e = month_bounds(period)
        q = q.filter(Payment.due_date >= s, Payment.due_date <= e)
    return [payment_out(p) for p in q.order_by(Payment.due_date.desc(), Payment.id.desc()).all()]


@router.post("/payments")
def create_payment(body: PaymentIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    if not db.get(Client, body.client_id):
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    if body.task_id:
        task = db.get(Task, body.task_id)
        if not task or task.client_id != body.client_id:
            raise HTTPException(status_code=422, detail="Il task non appartiene al cliente selezionato")
    p = Payment(**body.model_dump(), status="in_attesa")
    p.period = p.period or period_of(body.due_date)
    db.add(p)
    db.commit()
    refresh_payment_statuses(db)
    return payment_out(db.get(Payment, p.id))


@router.put("/payments/{pid}")
def update_payment(pid: int, body: PaymentUpdate, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    p = _payment(db, pid)
    client_id = body.client_id if body.client_id is not None else p.client_id
    if body.task_id is not None:
        task = db.get(Task, body.task_id)
        if not task or task.client_id != client_id:
            raise HTTPException(status_code=422, detail="Il task non appartiene al cliente selezionato")
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None or key in {"task_id", "description", "invoice_number", "period", "notes"}:
            setattr(p, key, value)
    if body.due_date is not None:
        p.due_date = body.due_date
    if body.period is None and body.due_date is not None:
        p.period = period_of(body.due_date)
    p.period = p.period or period_of(p.due_date)
    db.commit()
    refresh_payment_statuses(db)
    return payment_out(p)


@router.post("/payments/{pid}/mark-paid")
def mark_paid(pid: int, body: PaidIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    p = _payment(db, pid)
    p.paid_date = body.paid_date or date.today()
    p.status = "saldato"
    db.commit()
    return payment_out(p)


@router.post("/payments/{pid}/mark-unpaid")
def mark_unpaid(pid: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    p = _payment(db, pid)
    p.paid_date = None
    p.status = "in_ritardo" if p.due_date < date.today() else "in_attesa"
    db.commit()
    return payment_out(p)


@router.delete("/payments/{pid}")
def delete_payment(pid: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    db.delete(_payment(db, pid))
    db.commit()
    return {"ok": True}


def worklog_out(w: WorkLog):
    d = w.to_dict()
    d["user_name"] = w.user.name if w.user else None
    d["client_name"] = w.client.name if w.client else None
    d["task_title"] = w.task.title if w.task else None
    d["worker_payout"] = w.worker_expense or 0
    d["client_revenue"] = w.revenue_amount or 0
    d["margin"] = round((w.revenue_amount or 0) - (w.worker_expense or 0), 2)
    d["team_paid"] = _team_payment_status(w.notes)
    d["billing_group"] = "subscription" if w.contract and w.contract.type == "SUBSCRIPTION" else "single_job"
    return d


@router.get("/worklogs")
def list_worklogs(user_id: Optional[int] = None, client_id: Optional[int] = None, date_from: Optional[date] = None,
                  date_to: Optional[date] = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(WorkLog)
    if user.role != "admin":
        q = q.filter(WorkLog.user_id == user.id)
    elif user_id:
        q = q.filter(WorkLog.user_id == user_id)
    if client_id:
        q = q.filter(WorkLog.client_id == client_id)
    if date_from:
        q = q.filter(WorkLog.date >= date_from)
    if date_to:
        q = q.filter(WorkLog.date <= date_to)
    return [worklog_out(w) for w in q.order_by(WorkLog.date.desc(), WorkLog.id.desc()).limit(500).all()]


def _apply_worklog(db, w: WorkLog, body: WorkLogIn, user: User):
    owner = user
    if body.user_id and body.user_id != user.id:
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="Puoi registrare solo i tuoi lavori")
        owner = db.get(User, body.user_id)
        if not owner:
            raise HTTPException(status_code=404, detail="Utente non trovato")
    elif w.user_id and user.role == "admin":
        owner = db.get(User, w.user_id)
    if body.client_id and not db.get(Client, body.client_id):
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    task_id = body.task_id if body.task_id is not None else w.task_id
    task = db.get(Task, task_id) if task_id else None
    if task_id and not task:
        raise HTTPException(status_code=404, detail="Task non trovato")
    fixed_cost = body.worker_payout if body.worker_payout is not None else body.fixed_cost
    if fixed_cost is None and not body.hours:
        raise HTTPException(status_code=422, detail="Inserisci le ore impiegate o un costo a prestazione")
    completed_at = body.completed_at or w.completed_at
    work_date = body.date or (completed_at.date() if completed_at else w.date)
    if not work_date:
        raise HTTPException(status_code=422, detail="La data del lavoro è obbligatoria")
    w.user_id = owner.id
    w.client_id = body.client_id if body.client_id is not None else (task.client_id if task else w.client_id)
    w.task_id, w.date = task_id, work_date
    w.completed_at = completed_at
    w.description = body.description or w.description or (task.title if task else "Lavoro")
    notes = body.notes if body.notes is not None else w.notes
    if body.team_paid is not None:
        _set_team_payment_status(w, body.team_paid)
    else:
        w.notes = notes or None
    w.hours, w.fixed_cost = body.hours, fixed_cost
    w.worker_expense = fixed_cost if fixed_cost is not None else worklog_cost(owner, body.hours, None)
    if body.client_revenue is not None:
        w.revenue_amount = body.client_revenue
    elif task and body.client_revenue is None and w.revenue_amount is None:
        w.revenue_amount = task.price_charged_to_client or 0
    w.cost = w.worker_expense


@router.post("/worklogs")
def create_worklog(body: WorkLogIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    w = WorkLog()
    _apply_worklog(db, w, body, user)
    db.add(w)
    db.commit()
    return worklog_out(w)


def _own_worklog(db, wid, user) -> WorkLog:
    w = db.get(WorkLog, wid)
    if not w:
        raise HTTPException(status_code=404, detail="Log non trovato")
    if user.role != "admin" and w.user_id != user.id:
        raise HTTPException(status_code=403, detail="Non puoi modificare i log di altri")
    return w


def _merge_worklog_update(w: WorkLog, body: WorkLogUpdate) -> WorkLogIn:
    return WorkLogIn(
        client_id=body.client_id if body.client_id is not None else w.client_id,
        task_id=body.task_id if body.task_id is not None else w.task_id,
        date=body.date or w.date,
        completed_at=body.completed_at or w.completed_at,
        description=body.description or w.description,
        notes=body.notes if body.notes is not None else w.notes,
        hours=body.hours if body.hours is not None else (w.hours or 0),
        fixed_cost=body.fixed_cost,
        worker_payout=body.worker_payout if body.worker_payout is not None else w.worker_expense,
        client_revenue=body.client_revenue if body.client_revenue is not None else w.revenue_amount,
        user_id=body.user_id if body.user_id is not None else w.user_id,
        team_paid=body.team_paid,
    )


@router.put("/worklogs/{wid}")
def update_worklog(wid: int, body: WorkLogUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    w = _own_worklog(db, wid, user)
    if set(body.model_dump(exclude_unset=True)) == {"team_paid"}:
        _set_team_payment_status(w, body.team_paid)
        db.commit()
        return worklog_out(w)
    _apply_worklog(db, w, _merge_worklog_update(w, body), user)
    db.commit()
    return worklog_out(w)


@router.delete("/worklogs/{wid}")
def delete_worklog(wid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_own_worklog(db, wid, user))
    db.commit()
    return {"ok": True}


# Hyphenated aliases are the public API; the legacy plural routes remain supported.
@router.get("/work-logs")
def list_work_logs(client_id: Optional[int] = None, user_id: Optional[int] = None,
                   month: Optional[int] = None, year: Optional[int] = None,
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(WorkLog)
    if user.role != "admin":
        query = query.filter(WorkLog.user_id == user.id)
    elif user_id:
        query = query.filter(WorkLog.user_id == user_id)
    if client_id:
        query = query.filter(WorkLog.client_id == client_id)
    if month:
        if not year or month < 1 or month > 12:
            raise HTTPException(status_code=422, detail="Specificare un anno valido con il mese")
        start, end = _bounds(year, month)
        query = query.filter(WorkLog.date >= start, WorkLog.date <= end)
    elif year:
        query = query.filter(WorkLog.date >= date(year, 1, 1), WorkLog.date <= date(year, 12, 31))
    return [worklog_out(w) for w in query.order_by(WorkLog.date.desc(), WorkLog.id.desc()).limit(1000).all()]


@router.put("/work-logs/{wid}")
def update_work_log(wid: int, body: WorkLogUpdate, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    w = _own_worklog(db, wid, user)
    if set(body.model_dump(exclude_unset=True)) == {"team_paid"}:
        _set_team_payment_status(w, body.team_paid)
        db.commit()
        return worklog_out(w)
    _apply_worklog(db, w, _merge_worklog_update(w, body), user)
    db.commit()
    return worklog_out(w)


@router.delete("/work-logs/{wid}")
def delete_work_log(wid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_own_worklog(db, wid, user))
    db.commit()
    return {"ok": True}


@router.get("/reports/jobs")
def jobs_report(client_id: Optional[int] = None, user_id: Optional[int] = None,
                month: Optional[int] = None, year: Optional[int] = None,
                _: User = Depends(require_admin), db: Session = Depends(get_db)):
    query = db.query(WorkLog)
    if client_id:
        query = query.filter(WorkLog.client_id == client_id)
    if user_id:
        query = query.filter(WorkLog.user_id == user_id)
    if month:
        if not year or month < 1 or month > 12:
            raise HTTPException(status_code=422, detail="Specificare un anno valido con il mese")
        start, end = _bounds(year, month)
        query = query.filter(WorkLog.date >= start, WorkLog.date <= end)
    elif year:
        query = query.filter(WorkLog.date >= date(year, 1, 1), WorkLog.date <= date(year, 12, 31))
    logs = query.order_by(WorkLog.date.desc(), WorkLog.id.desc()).all()
    rows = [worklog_out(log) for log in logs]
    revenue = round(sum(row["client_revenue"] for row in rows), 2)
    expense = round(sum(row["worker_payout"] for row in rows), 2)
    return {
        "rows": rows,
        "totals": {"revenue": revenue, "expense": expense, "margin": round(revenue - expense, 2)},
    }


@router.get("/dashboard")
def dashboard(months: int = 6, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    months = max(1, min(months, 24))
    current = period_of(date.today())
    refresh_payment_statuses(db)
    periods = [shift_period(current, -i) for i in range(months - 1, -1, -1)]
    first, _e = month_bounds(periods[0])
    _s, last = month_bounds(current)
    rev, cash, cost = defaultdict(float), defaultdict(float), defaultdict(float)
    rev_sub, rev_jobs = defaultdict(float), defaultdict(float)
    for p in db.query(Payment).filter(Payment.due_date >= first, Payment.due_date <= last).all():
        k = period_of(p.due_date)
        if p.status == "saldato":
            cash[k] += p.amount
    logs = db.query(WorkLog).filter(WorkLog.date >= first, WorkLog.date <= last).all()
    for w in logs:
        k = period_of(w.date)
        revenue = w.revenue_amount or 0
        expense = w.worker_expense or 0
        rev[k] += revenue
        cost[k] += expense
        if w.contract and w.contract.type == "SUBSCRIPTION":
            rev_sub[k] += revenue
        else:
            rev_jobs[k] += revenue
    series = [{
        "period": k, "entrate": round(rev[k], 2), "abbonamenti": round(rev_sub[k], 2), "lavori_singoli": round(rev_jobs[k], 2),
        "incassato": round(cash[k], 2), "spese": round(cost[k], 2), "utile": round(rev[k] - cost[k], 2),
    } for k in periods]

    active = db.query(Client).filter(Client.active.is_(True)).all()
    dist = [{"package": key, "name": PACKAGES[key]["name"] if key in PACKAGES else "Personalizzato",
             "value": sum(1 for c in active if c.package == key)}
            for key in PACKAGE_KEYS]
    mrr = sum((package_for(c) or {}).get("price", 0) for c in active if c.package)

    month_start = datetime.combine(month_bounds(current)[0], time.min)
    done_month = dict(db.query(Task.assignee_id, func.count(Task.id)).filter(
        Task.status == "completato", Task.completed_at >= month_start).group_by(Task.assignee_id).all())
    done_total = dict(db.query(Task.assignee_id, func.count(Task.id)).filter(
        Task.status == "completato").group_by(Task.assignee_id).all())
    hours = dict(db.query(WorkLog.user_id, func.sum(WorkLog.hours)).filter(
        WorkLog.date >= month_start.date()).group_by(WorkLog.user_id).all())
    leaderboard = sorted([{
        "user_id": u.id, "name": u.name, "role": u.role, "completed_month": done_month.get(u.id, 0),
        "completed_total": done_total.get(u.id, 0), "hours_month": round(hours.get(u.id) or 0, 2),
    } for u in db.query(User).filter(User.active.is_(True)).all()],
        key=lambda x: (x["completed_month"], x["completed_total"]), reverse=True)

    overdue = db.query(Payment).filter(Payment.status == "in_ritardo").order_by(Payment.due_date).all()
    upcoming = db.query(Payment).filter(Payment.status == "in_attesa", Payment.due_date <= date.today() + timedelta(days=10)) \
        .order_by(Payment.due_date).all()
    cur = series[-1]
    return {
        "series": series,
        "kpi": {
            "entrate_mese": cur["entrate"], "spese_mese": cur["spese"], "utile_mese": cur["utile"],
            "incassato_mese": cur["incassato"], "mrr": mrr,
            "clienti_attivi": len(active), "abbonamenti_attivi": sum(d["value"] for d in dist),
            "ritardi_count": len(overdue), "ritardi_importo": round(sum(p.amount for p in overdue), 2),
            "task_aperti": db.query(Task).filter(Task.status != "completato").count(),
            "task_non_assegnati": db.query(Task).filter(Task.status != "completato", Task.assignee_id.is_(None)).count(),
        },
        "package_distribution": dist,
        "leaderboard": leaderboard,
        "overdue_payments": [payment_out(p) for p in overdue[:8]],
        "upcoming_payments": [payment_out(p) for p in upcoming[:8]],
    }


@router.get("/notifications")
def notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = date.today()
    items = []
    if user.role == "admin":
        refresh_payment_statuses(db)
        for p in db.query(Payment).filter(Payment.status == "in_ritardo").order_by(Payment.due_date).limit(10):
            days = (today - p.due_date).days
            items.append({"id": f"pay-late-{p.id}", "severity": "high", "link": "/pagamenti",
                          "title": f"Pagamento in ritardo: {p.client.name}",
                          "message": f"€ {p.amount:,.2f} scaduto da {days} giorn{'o' if days == 1 else 'i'}"})
        for p in db.query(Payment).filter(Payment.status == "in_attesa", Payment.due_date <= today + timedelta(days=5)) \
                .order_by(Payment.due_date).limit(10):
            items.append({"id": f"pay-due-{p.id}", "severity": "medium", "link": "/pagamenti",
                          "title": f"Scadenza in arrivo: {p.client.name}",
                          "message": f"€ {p.amount:,.2f} in scadenza il {p.due_date.strftime('%d/%m/%Y')}"})
        err = get_setting(db, "google_last_error")
        for c in db.query(Client).filter(Client.package.isnot(None), Client.active.is_(True)).all():
            usage = client_usage(db, c)
            if usage and all(u["remaining"] == 0 for u in usage):
                items.append({"id": f"credits-{c.id}", "severity": "medium", "link": f"/clienti/{c.id}",
                              "title": f"Pacchetto esaurito: {c.name}",
                              "message": "Tutti i crediti del ciclo sono stati usati. Valuta il rinnovo."})
        day_start = datetime.combine(today, time.min)
        for ld in db.query(Lead).filter(Lead.meeting_at >= day_start, Lead.meeting_at < day_start + timedelta(days=2),
                                        Lead.status.notin_(["convertito", "perso"])).order_by(Lead.meeting_at).limit(10):
            when = "Oggi" if ld.meeting_at.date() == today else "Domani"
            items.append({"id": f"lead-{ld.id}", "severity": "medium", "link": "/lead",
                          "title": f"Meeting {when.lower()}: {ld.name}",
                          "message": f"{when} alle {ld.meeting_at.strftime('%H:%M')}"})
        if err:
            items.append({"id": "google-error", "severity": "medium", "link": "/impostazioni",
                          "title": "Errore sincronizzazione Google Calendar", "message": err[:160]})
    for t in db.query(Task).filter(Task.assignee_id == user.id, Task.status != "completato",
                                   Task.due_date.isnot(None), Task.due_date <= today + timedelta(days=1)).limit(10):
        late = t.due_date < today
        items.append({"id": f"task-{t.id}", "severity": "high" if late else "medium", "link": "/task",
                      "title": "Task scaduto" if late else "Task in scadenza",
                      "message": f"{t.title} — {t.due_date.strftime('%d/%m/%Y')}"})
    unassigned = db.query(Task).filter(Task.assignee_id.is_(None), Task.status != "completato").count()
    if unassigned:
        items.append({"id": "unassigned", "severity": "low", "link": "/task",
                      "title": "Task da prendere in carico", "message": f"{unassigned} task senza assegnatario"})
    return items
