from datetime import date, datetime, time, timedelta
from typing import Literal, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from google_sync import delete_event, push_post
from models import Client, Contract, Payment, Post, Task, User, WorkLog
from security import get_current_user, require_admin
from services import CREDITS_EXHAUSTED_MSG, apply_task_status, credit_check, sync_task_for_post, task_credit_check

router = APIRouter()
ContentType = Literal["reel", "storia", "carosello", "grafica", "post", "sessione"]
TaskStatus = Literal["da_fare", "in_corso", "in_revisione", "completato"]
Priority = Literal["bassa", "media", "alta"]
ServiceCategory = Literal["reel", "carosello", "grafica", "sessione", "copywriting_script", "altro"]


class PostIn(BaseModel):
    client_id: int
    title: str = Field(min_length=1)
    content_type: ContentType
    scheduled_at: datetime
    duration_minutes: int = Field(default=60, ge=5, le=1440)
    description: Optional[str] = None


class TaskIn(BaseModel):
    title: str = Field(min_length=1)
    description: Optional[str] = None
    client_id: Optional[int] = None
    status: TaskStatus = "da_fare"
    priority: Priority = "media"
    assignee_id: Optional[int] = None
    due_date: Optional[date] = None
    start_date: Optional[date] = None
    price_charged_to_client: float = Field(default=0, ge=0)
    category_service: ServiceCategory
    activity_type: Literal["SINGLE_JOB", "SUBSCRIPTION"] = "SINGLE_JOB"
    contract_id: Optional[int] = None
    subscription_included: bool = False


class TaskPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    client_id: Optional[int] = None
    status: Optional[TaskStatus] = None
    priority: Optional[Priority] = None
    assignee_id: Optional[int] = None
    due_date: Optional[date] = None
    start_date: Optional[date] = None
    price_charged_to_client: Optional[float] = Field(default=None, ge=0)
    category_service: Optional[ServiceCategory] = None
    activity_type: Optional[Literal["SINGLE_JOB", "SUBSCRIPTION"]] = None
    contract_id: Optional[int] = None
    subscription_included: Optional[bool] = None


def post_out(p: Post):
    d = p.to_dict()
    d["client_name"] = p.client.name if p.client else None
    t = p.task
    d["task_id"] = t.id if t else None
    d["task_status"] = t.status if t else None
    d["assignee_name"] = t.assignee.name if t and t.assignee else None
    return d


def task_out(t: Task):
    d = t.to_dict()
    d["client_name"] = t.client.name if t.client else None
    d["assignee_name"] = t.assignee.name if t.assignee else None
    d["post_scheduled_at"] = t.post.scheduled_at.isoformat() if t.post else None
    d["post_content_type"] = t.post.content_type if t.post else None
    d["payment_id"] = t.payments[0].id if t.payments else None
    return d


def _naive(dt: datetime) -> datetime:
    return dt.replace(tzinfo=None, second=0, microsecond=0)


def _client_or_404(db, cid):
    c = db.get(Client, cid)
    if not c:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    return c


def _check_credits(db, c: Client, content_type: str, force: bool, exclude_post_id=None):
    if not c.package or force:
        return
    chk = credit_check(db, c, content_type, exclude_post_id)
    if chk and chk["remaining"] <= 0:
        raise HTTPException(status_code=409, detail={"code": "credits_exhausted", "message": CREDITS_EXHAUSTED_MSG, **chk})


@router.get("/posts")
def list_posts(start: Optional[date] = None, end: Optional[date] = None, client_id: Optional[int] = None,
               content_type: Optional[str] = None, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(Post)
    if start:
        q = q.filter(Post.scheduled_at >= datetime.combine(start, time.min))
    if end:
        q = q.filter(Post.scheduled_at < datetime.combine(end + timedelta(days=1), time.min))
    if client_id:
        q = q.filter(Post.client_id == client_id)
    if content_type:
        q = q.filter(Post.content_type.in_(content_type.split(",")))
    return [post_out(p) for p in q.order_by(Post.scheduled_at).all()]


@router.post("/posts")
def create_post(body: PostIn, bg: BackgroundTasks, force: bool = False, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = _client_or_404(db, body.client_id)
    _check_credits(db, c, body.content_type, force)
    p = Post(**body.model_dump(exclude={"scheduled_at"}), scheduled_at=_naive(body.scheduled_at), cycle_number=c.cycle_number or 1)
    db.add(p)
    db.flush()
    sync_task_for_post(db, p, c.name)
    db.commit()
    bg.add_task(push_post, p.id)
    return post_out(p)


@router.put("/posts/{post_id}")
def update_post(post_id: int, body: PostIn, bg: BackgroundTasks, force: bool = False, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    p = db.get(Post, post_id)
    if not p:
        raise HTTPException(status_code=404, detail="Contenuto non trovato")
    c = _client_or_404(db, body.client_id)
    if body.client_id != p.client_id or body.content_type != p.content_type:
        _check_credits(db, c, body.content_type, force, p.id)
    if body.client_id != p.client_id:
        p.cycle_number = c.cycle_number or 1
    for k, v in body.model_dump(exclude={"scheduled_at"}).items():
        setattr(p, k, v)
    p.scheduled_at = _naive(body.scheduled_at)
    db.flush()
    sync_task_for_post(db, p, c.name)
    db.commit()
    bg.add_task(push_post, p.id)
    return post_out(p)


@router.delete("/posts/{post_id}")
def delete_post(post_id: int, bg: BackgroundTasks, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    p = db.get(Post, post_id)
    if not p:
        raise HTTPException(status_code=404, detail="Contenuto non trovato")
    event_id, t = p.google_event_id, p.task
    if t and t.status != "completato":
        db.query(WorkLog).filter(WorkLog.task_id == t.id).delete(synchronize_session=False)
        db.delete(t)
    elif t:
        t.post_id = None
    db.delete(p)
    db.commit()
    if event_id:
        bg.add_task(delete_event, event_id)
    return {"ok": True}


@router.get("/tasks")
def list_tasks(status: Optional[str] = None, client_id: Optional[int] = None, assignee_id: Optional[int] = None,
               mine: bool = False, unassigned: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(Task)
    if status:
        q = q.filter(Task.status.in_(status.split(",")))
    else:
        q = q.filter(Task.status != "completato")
    if client_id:
        q = q.filter(Task.client_id == client_id)
    if assignee_id:
        q = q.filter(Task.assignee_id == assignee_id)
    if mine:
        q = q.filter(Task.assignee_id == user.id)
    if unassigned:
        q = q.filter(Task.assignee_id.is_(None))
    tasks = q.order_by(Task.due_date.is_(None), Task.due_date, Task.id.desc()).all()
    return [task_out(t) for t in tasks]


def _check_assignee(db, user: User, assignee_id):
    if assignee_id is None:
        return
    if user.role != "admin" and assignee_id != user.id:
        raise HTTPException(status_code=403, detail="Puoi assegnare i task solo a te stesso")
    if not db.get(User, assignee_id):
        raise HTTPException(status_code=404, detail="Utente non trovato")


@router.post("/tasks")
def create_task(body: TaskIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _check_assignee(db, user, body.assignee_id)
    client = _client_or_404(db, body.client_id) if body.client_id else None
    data = body.model_dump(exclude={"status", "activity_type", "subscription_included"})
    if data.get("contract_id"):
        contract = db.get(Contract, data["contract_id"])
        if not client or not contract or contract.client_id != client.id or contract.status != "ACTIVE":
            raise HTTPException(status_code=422, detail="L'abbonamento selezionato non è attivo per questo cliente")
    credit = task_credit_check(db, client, body.category_service) if client else None
    included = bool(credit and credit["remaining"] > 0)
    if not included and body.price_charged_to_client <= 0:
        raise HTTPException(status_code=422, detail="Inserisci un prezzo per il Lavoro Extra")
    if included:
        data["price_charged_to_client"] = 0
    data["subscription_included"] = included
    data["activity_type"] = "SUBSCRIPTION" if included else "SINGLE_JOB"
    data["cycle_number"] = (client.cycle_number or 1) if included else None
    t = Task(**data, created_by=user.id, status="da_fare")
    db.add(t)
    db.flush()
    if t.client_id and t.price_charged_to_client > 0 and not t.subscription_included:
        db.add(Payment(client_id=t.client_id, task_id=t.id, kind="single_job",
                       amount=t.price_charged_to_client, description=f"Lavoro: {t.title}",
                       due_date=t.due_date or date.today() + timedelta(days=30),
                       period=(t.due_date or date.today()).strftime("%Y-%m"), status="in_attesa"))
    db.commit()
    return task_out(t)


def _task_for_edit(db, task_id, user: User) -> Task:
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Task non trovato")
    if user.role != "admin" and user.id not in (t.assignee_id, t.created_by):
        raise HTTPException(status_code=403, detail="Puoi modificare solo i task presi in carico da te")
    return t


@router.put("/tasks/{task_id}")
def update_task(task_id: int, body: TaskPatch, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = _task_for_edit(db, task_id, user)
    data = body.model_dump(exclude_unset=True)
    if "assignee_id" in data:
        _check_assignee(db, user, data["assignee_id"])
    if data.get("client_id"):
        _client_or_404(db, data["client_id"])
    new_status = data.pop("status", None)
    if new_status == "completato":
        raise HTTPException(status_code=409, detail="Usa la finestra Completa per registrare il compenso dell'operatore")
    for k, v in data.items():
        setattr(t, k, v)
    if {"price_charged_to_client", "subscription_included"} & data.keys():
        billable = bool(t.client_id and t.price_charged_to_client > 0 and not t.subscription_included)
        unpaid = [payment for payment in t.payments if payment.status != "saldato"]
        if billable:
            if unpaid:
                unpaid[0].amount = t.price_charged_to_client
                for payment in unpaid[1:]:
                    db.delete(payment)
            else:
                db.add(Payment(client_id=t.client_id, task_id=t.id, kind="single_job",
                               amount=t.price_charged_to_client, description=f"Lavoro: {t.title}",
                               due_date=t.due_date or date.today() + timedelta(days=30),
                               period=(t.due_date or date.today()).strftime("%Y-%m"),
                               status="in_attesa"))
        else:
            for payment in unpaid:
                db.delete(payment)
    if new_status:
        apply_task_status(t, new_status)
    db.commit()
    return task_out(t)


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Task non trovato")
    if user.role != "admin" and t.created_by != user.id:
        raise HTTPException(status_code=403, detail="Solo l'amministratore o chi ha creato il task può eliminarlo")
    db.query(WorkLog).filter(WorkLog.task_id == t.id).update({"task_id": None})
    db.delete(t)
    db.commit()
    return {"ok": True}


@router.post("/tasks/{task_id}/claim")
def claim_task(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Task non trovato")
    if t.assignee_id and t.assignee_id != user.id:
        raise HTTPException(status_code=409, detail=f"Task già preso in carico da {t.assignee.name}")
    t.assignee_id = user.id
    if t.status == "da_fare":
        t.status = "in_corso"
    db.commit()
    return task_out(t)


@router.post("/tasks/{task_id}/release")
def release_task(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.get(Task, task_id)
    if not t:
        raise HTTPException(status_code=404, detail="Task non trovato")
    if user.role != "admin" and t.assignee_id != user.id:
        raise HTTPException(status_code=403, detail="Non hai in carico questo task")
    t.assignee_id = None
    if t.status == "in_corso":
        t.status = "da_fare"
    db.commit()
    return task_out(t)


@router.get("/me/overview")
def my_overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = date.today()
    month_start = date(today.year, today.month, 1)
    mine = db.query(Task).filter(Task.assignee_id == user.id, Task.status != "completato") \
        .order_by(Task.due_date.is_(None), Task.due_date).all()
    completed = db.query(Task).filter(Task.assignee_id == user.id, Task.status == "completato",
                                      Task.completed_at >= datetime.combine(month_start, time.min)).count()
    hours = db.query(func.sum(WorkLog.hours)).filter(WorkLog.user_id == user.id, WorkLog.date >= month_start).scalar() or 0
    upcoming = db.query(Post).filter(Post.scheduled_at >= datetime.combine(today, time.min),
                                     Post.scheduled_at < datetime.combine(today + timedelta(days=8), time.min)) \
        .order_by(Post.scheduled_at).limit(12).all()
    unassigned = db.query(Task).filter(Task.assignee_id.is_(None), Task.status != "completato").count()
    return {
        "my_tasks": [task_out(t) for t in mine],
        "completed_month": completed,
        "hours_month": round(hours, 2),
        "upcoming_posts": [post_out(p) for p in upcoming],
        "unassigned_count": unassigned,
    }
