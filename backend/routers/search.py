"""Ricerca globale (Ctrl+K). Rispetta i permessi attuali: un dipendente trova solo ciò che vede già oggi
(task e contenuti del calendario, script video, i propri lavori registrati)."""
from urllib.parse import quote

from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from models import Client, Lead, Payment, Post, Quote, Task, User, VideoScript, WorkLog
from security import get_current_user
from services import CONTENT_TYPES

router = APIRouter()
LIMIT = 6


def _like(q: str) -> str:
    return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def _match(*cols, pattern):
    return or_(*[c.ilike(pattern, escape="\\") for c in cols])


def _eur(v):
    return "€ " + f"{v or 0:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _d(v):
    return v.strftime("%d/%m/%Y") if v else ""


@router.get("/search")
def search(q: str = "", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = (q or "").strip()
    if len(q) < 2:
        return {"q": q, "groups": []}
    p = _like(q)
    admin = user.role == "admin"
    groups = []

    def group(key, label, items):
        if items:
            groups.append({"type": key, "label": label, "items": items})

    if admin:
        clients = db.query(Client).filter(_match(Client.name, Client.company_name, Client.contact_name, Client.email,
                                                 Client.phone, Client.vat_number, pattern=p)) \
            .order_by(Client.active.desc(), Client.name).limit(LIMIT).all()
        group("client", "Clienti", [{
            "id": c.id, "title": c.name, "subtitle": " · ".join(filter(None, [c.company_name, c.contact_name, c.email])),
            "link": f"/clienti/{c.id}"} for c in clients])

    tasks = db.query(Task).outerjoin(Client, Task.client_id == Client.id) \
        .filter(_match(Task.title, Task.description, Client.name, pattern=p)) \
        .order_by(Task.status == "completato", Task.due_date.is_(None), Task.due_date.desc()).limit(LIMIT).all()
    group("task", "Task", [{
        "id": t.id, "title": t.title,
        "subtitle": " · ".join(filter(None, [t.client.name if t.client else None, _d(t.due_date),
                                             "completato" if t.status == "completato" else None])),
        "link": f"/task?q={quote(t.title)}"} for t in tasks])

    posts = db.query(Post).join(Client, Post.client_id == Client.id) \
        .filter(_match(Post.title, Post.description, Client.name, pattern=p)) \
        .order_by(Post.scheduled_at.desc()).limit(LIMIT).all()
    group("post", "Contenuti", [{
        "id": x.id, "title": x.title,
        "subtitle": " · ".join(filter(None, [CONTENT_TYPES.get(x.content_type, x.content_type),
                                             x.client.name if x.client else None, _d(x.scheduled_at)])),
        "link": f"/calendario?date={x.scheduled_at.date().isoformat()}"} for x in posts])

    if admin:
        payments = db.query(Payment).join(Client, Payment.client_id == Client.id) \
            .filter(_match(Payment.description, Payment.invoice_number, Payment.notes, Client.name, pattern=p)) \
            .order_by(Payment.due_date.desc()).limit(LIMIT).all()
        group("payment", "Pagamenti", [{
            "id": x.id, "title": x.description or f"Pagamento {x.client.name}",
            "subtitle": " · ".join(filter(None, [x.client.name, _eur(x.amount), f"fattura {x.invoice_number}" if x.invoice_number else None,
                                                 "saldato" if x.status == "saldato" else f"scadenza {_d(x.due_date)}"])),
            "link": f"/pagamenti?client_id={x.client_id}"} for x in payments])

        quotes = db.query(Quote).join(Client, Quote.client_id == Client.id) \
            .filter(_match(Quote.number, Quote.notes, Client.name, pattern=p)) \
            .order_by(Quote.issue_date.desc()).limit(LIMIT).all()
        group("quote", "Preventivi", [{
            "id": x.id, "title": x.number, "subtitle": f"{x.client.name} · {_eur(x.total)} · {x.status}",
            "link": f"/preventivi?q={quote(x.number)}"} for x in quotes])

    scripts = db.query(VideoScript).join(Client, VideoScript.client_id == Client.id) \
        .filter(_match(VideoScript.title, VideoScript.concept, VideoScript.script_body, Client.name, pattern=p)) \
        .order_by(VideoScript.updated_at.desc()).limit(LIMIT).all()
    group("video_script", "Script video", [{
        "id": x.id, "title": x.title, "subtitle": " · ".join(filter(None, [x.client.name, _d(x.shooting_date)])),
        "link": f"/script-idee?id={x.id}"} for x in scripts])

    if admin:
        leads = db.query(Lead).filter(_match(Lead.name, Lead.contact_name, Lead.email, Lead.phone, Lead.notes, pattern=p)) \
            .order_by(Lead.meeting_at.is_(None), Lead.meeting_at.desc()).limit(LIMIT).all()
        group("lead", "Lead", [{
            "id": x.id, "title": x.name, "subtitle": " · ".join(filter(None, [x.contact_name, x.status, _d(x.meeting_at)])),
            "link": f"/lead?q={quote(x.name)}"} for x in leads])

    logs = db.query(WorkLog).outerjoin(Client, WorkLog.client_id == Client.id) \
        .filter(_match(WorkLog.description, WorkLog.task_title, WorkLog.notes, Client.name, pattern=p))
    if not admin:
        logs = logs.filter(WorkLog.user_id == user.id)
    logs = logs.order_by(WorkLog.date.desc()).limit(LIMIT).all()
    group("work_log", "Lavori registrati", [{
        "id": w.id, "title": w.task_title or w.description,
        "subtitle": " · ".join(filter(None, [w.client.name if w.client else None, w.user.name if admin and w.user else None,
                                             _d(w.date), _eur(w.worker_expense)])),
        "link": f"/team?q={quote(w.task_title or w.description or '')}&user={w.user_id}" if admin else "/"} for w in logs])
    return {"q": q, "groups": groups}
