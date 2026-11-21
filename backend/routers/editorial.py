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
from avatars import avatar_url
from trash import soft_delete
from services import (CREDITS_EXHAUSTED_MSG, apply_task_status, credit_check, final_price, normalize_hashtags,
                      sync_task_for_post, task_credit_check)

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
    # Facoltativi: se non vengono inviati restano com'erano (compatibilità con i client precedenti).
    caption: Optional[str] = None
    hashtags: Optional[str] = None


POST_OPTIONAL = {"caption", "hashtags"}


def _apply_post_extras(p, body):
    if "caption" in body.model_fields_set:
        p.caption = (body.caption or "").strip() or None
    if "hashtags" in body.model_fields_set:
        p.hashtags = normalize_hashtags(body.hashtags)


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
    # Prezzo con sconto: se list_price è indicato, il prezzo finale viene calcolato qui.
    list_price: Optional[float] = Field(default=None, ge=0)
    discount_type: Optional[Literal["percent", "amount"]] = None
    discount_value: float = Field(default=0, ge=0)


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
    list_price: Optional[float] = Field(default=None, ge=0)
    discount_type: Optional[Literal["percent", "amount"]] = None
    discount_value: Optional[float] = Field(default=None, ge=0)


def post_out(p: Post):
    d = p.to_dict()
    d["client_name"] = p.client.name if p.client else None
    t = p.task
    d["task_id"] = t.id if t else None
    d["task_status"] = t.status if t else None
    d["assignee_name"] = t.assignee.name if t and t.assignee else None
    d["assignee_avatar_url"] = avatar_url(t.assignee) if t and t.assignee else None
    return d


def task_out(t: Task):
    d = t.to_dict()
    d["client_name"] = t.client.name if t.client else None
    d["assignee_name"] = t.assignee.name if t.assignee else None
    d["assignee_avatar_url"] = avatar_url(t.assignee) if t.assignee else None
    d["post_scheduled_at"] = t.post.scheduled_at.isoformat() if t.post else None
    d["post_content_type"] = t.post.content_type if t.post else None
    active_payments = [p for p in t.payments if p.deleted_at is None]
    d["payment_id"] = active_payments[0].id if active_payments else None
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
    p = Post(**body.model_dump(exclude={"scheduled_at", *POST_OPTIONAL}), scheduled_at=_naive(body.scheduled_at),
             cycle_number=c.cycle_number or 1)
    _apply_post_extras(p, body)
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
    for k, v in body.model_dump(exclude={"scheduled_at", *POST_OPTIONAL}).items():
        setattr(p, k, v)
    _apply_post_extras(p, body)
    p.scheduled_at = _naive(body.scheduled_at)
    db.flush()
    sync_task_for_post(db, p, c.name)
    db.commit()
    bg.add_task(push_post, p.id)
    return post_out(p)


@router.delete("/posts/{post_id}")
def delete_post(post_id: int, bg: BackgroundTasks, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    p = db.get(Post, post_id)
    if not p:
        raise HTTPException(status_code=404, detail="Contenuto non trovato")
    event_id, t = p.google_event_id, p.task
    # Nel cestino: il contenuto e il suo task se non completato (con lavori e rate non incassate).
    # Un task completato resta (è lavoro fatto) e ritrova il contenuto se questo viene ripristinato.
    linked = []
    if t and t.status != "completato":
        linked = [t, *db.query(WorkLog).filter(WorkLog.task_id == t.id).all(), *_unpaid(t)]
    p.google_event_id = None  # al ripristino viene creato un nuovo evento Google
    soft_delete(db, p, user, linked)
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


def _unpaid(t: Task):
    """Rate non incassate di un task: vanno nel cestino insieme al task. Quelle incassate restano."""
    return [payment for payment in t.payments if payment.status != "saldato" and payment.deleted_at is None]


def _check_assignee(db, user: User, assignee_id):
    if assignee_id is None:
        return
    if user.role != "admin" and assignee_id != user.id:
        raise HTTPException(status_code=403, detail="Puoi assegnare i task solo a te stesso")
    assignee = db.get(User, int(assignee_id))
    if not assignee:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    if not assignee.active:
        raise HTTPException(status_code=422, detail="Non puoi assegnare un task a un utente disattivato")


@router.post("/tasks")
def create_task(body: TaskIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _check_assignee(db, user, body.assignee_id)
    client = _client_or_404(db, body.client_id) if body.client_id else None
    data = body.model_dump(exclude={"status", "activity_type", "subscription_included"})
    _price_fields(data, data)
    if data.get("contract_id"):
        contract = db.get(Contract, data["contract_id"])
        if not client or not contract or contract.client_id != client.id or contract.status != "ACTIVE":
            raise HTTPException(status_code=422, detail="L'abbonamento selezionato non è attivo per questo cliente")
    credit = task_credit_check(db, client, body.category_service) if client else None
    included = bool(credit and credit["remaining"] > 0)
    if not included and data["price_charged_to_client"] <= 0:
        raise HTTPException(status_code=422, detail="Inserisci un prezzo per il Lavoro Extra")
    if included:
        data["price_charged_to_client"] = 0
        data["list_price"], data["discount_type"], data["discount_value"] = None, None, 0
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


def _price_fields(source: dict, out: dict):
    """Listino, sconto e prezzo finale. Senza listino (vecchi client) il prezzo indicato è anche il listino."""
    if source.get("list_price") is not None:
        try:
            out["price_charged_to_client"] = final_price(source["list_price"], source.get("discount_type"),
                                                         source.get("discount_value") or 0)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        out["list_price"] = source["list_price"]
        out["discount_type"] = source.get("discount_type") if source.get("discount_value") else None
        out["discount_value"] = (source.get("discount_value") or 0) if out["discount_type"] else 0
    else:
        price = source.get("price_charged_to_client") or 0
        out["list_price"] = price or None
        out["discount_type"], out["discount_value"] = None, 0


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
    if {"list_price", "discount_type", "discount_value", "price_charged_to_client"} & data.keys():
        current = {"list_price": t.list_price, "discount_type": t.discount_type, "discount_value": t.discount_value or 0,
                   "price_charged_to_client": t.price_charged_to_client}
        if {"list_price", "discount_type", "discount_value"} & data.keys():
            _price_fields({**current, **data}, data)
        else:  # solo il prezzo (form precedenti): diventa anche il listino, senza sconto
            _price_fields({"price_charged_to_client": data["price_charged_to_client"]}, data)
    for k, v in data.items():
        setattr(t, k, v)
    if {"price_charged_to_client", "subscription_included"} & data.keys():
        billable = bool(t.client_id and t.price_charged_to_client > 0 and not t.subscription_included)
        unpaid = _unpaid(t)
        if billable:
            if unpaid:
                unpaid[0].amount = t.price_charged_to_client
                for payment in unpaid[1:]:
                    soft_delete(db, payment, user)
            else:
                db.add(Payment(client_id=t.client_id, task_id=t.id, kind="single_job",
                               amount=t.price_charged_to_client, description=f"Lavoro: {t.title}",
                               due_date=t.due_date or date.today() + timedelta(days=30),
                               period=(t.due_date or date.today()).strftime("%Y-%m"),
                               status="in_attesa"))
        else:
            for payment in unpaid:
                soft_delete(db, payment, user)
    if "due_date" in data and t.due_date:
        # La scadenza del pagamento segue quella del lavoro finché non è incassato.
        for payment in t.payments:
            if payment.status != "saldato" and payment.kind == "single_job" and payment.deleted_at is None:
                payment.due_date = t.due_date
                payment.period = t.due_date.strftime("%Y-%m")
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
    # Nel cestino con le rate non incassate; i lavori già registrati restano (compensi e resoconti).
    soft_delete(db, t, user, _unpaid(t))
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
