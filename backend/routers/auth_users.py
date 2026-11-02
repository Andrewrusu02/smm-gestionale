from datetime import date, datetime, time, timedelta
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from models import LoginAttempt, Task, User, WorkLog, utcnow
from security import create_token, get_current_user, hash_password, require_admin, verify_password

router = APIRouter()
MAX_ATTEMPTS, LOCK_MINUTES = 5, 15


def user_out(u: User):
    return u.to_dict(exclude=("password_hash",))


class LoginIn(BaseModel):
    email: str
    password: str


class ProfileIn(BaseModel):
    name: str = Field(min_length=1)
    phone: Optional[str] = None


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class UserIn(BaseModel):
    email: str
    name: str = Field(min_length=1)
    role: Literal["admin", "dipendente"] = "dipendente"
    password: Optional[str] = Field(default=None, min_length=8)
    phone: Optional[str] = None
    job_title: Optional[str] = None
    hourly_rate: float = 0
    monthly_salary: float = 0
    active: bool = True


@router.post("/auth/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()
    ident = f"{ip}:{email}"
    att = db.get(LoginAttempt, ident)
    if att and att.count >= MAX_ATTEMPTS and utcnow() - att.last_at < timedelta(minutes=LOCK_MINUTES):
        raise HTTPException(status_code=429, detail="Troppi tentativi falliti. Riprova tra 15 minuti.")
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(body.password, user.password_hash):
        if not att:
            att = LoginAttempt(identifier=ident, count=0)
            db.add(att)
        if utcnow() - (att.last_at or utcnow()) >= timedelta(minutes=LOCK_MINUTES):
            att.count = 0
        att.count = (att.count or 0) + 1
        att.last_at = utcnow()
        db.commit()
        raise HTTPException(status_code=401, detail="Email o password non corretti")
    if not user.active:
        raise HTTPException(status_code=403, detail="Account disattivato. Contatta l'amministratore.")
    if att:
        db.delete(att)
        db.commit()
    return {"token": create_token(user), "user": user_out(user)}


@router.get("/auth/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.put("/auth/me")
def update_me(body: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.merge(user)
    user.name, user.phone = body.name.strip(), body.phone
    db.commit()
    return user_out(user)


@router.post("/auth/change-password")
def change_password(body: PasswordIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.merge(user)
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="La password attuale non è corretta")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}


def _month_range(year: Optional[int] = None, month: Optional[int] = None):
    t = date.today()
    y, m = year or t.year, month or t.month
    if not 1 <= m <= 12 or not 2000 <= y <= 2100:
        raise HTTPException(status_code=422, detail="Periodo non valido")
    start = date(y, m, 1)
    nxt = date(y + (m == 12), m % 12 + 1, 1)
    return start, nxt


@router.get("/users")
def list_users(year: Optional[int] = None, month: Optional[int] = None,
               _: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Membri del team con i numeri del mese scelto (default: mese corrente) e il debito aperto.

    - month_*: lavori con data nel mese selezionato (competenza).
    - pending_*: compensi non ancora saldati, di qualsiasi mese (è quanto devi davvero).
    - paid_total: compensi già saldati, di qualsiasi mese.
    """
    from routers.finance import _team_payment_status  # import locale: evita cicli all'avvio

    start, nxt = _month_range(year, month)
    stats = {}
    for w in db.query(WorkLog).all():
        s = stats.setdefault(w.user_id, dict(month_hours=0.0, month_cost=0.0, month_revenue=0.0, month_jobs=0,
                                              pending_payout=0.0, pending_count=0, paid_total=0.0,
                                              zero_payout_count=0, last_log_date=None))
        payout = w.worker_expense or 0
        if start <= w.date < nxt:
            s["month_hours"] += w.hours or 0
            s["month_cost"] += payout
            s["month_revenue"] += w.revenue_amount or 0
            s["month_jobs"] += 1
        if _team_payment_status(w.notes):
            s["paid_total"] += payout
        else:
            s["pending_payout"] += payout
            s["pending_count"] += 1
            if payout <= 0:
                s["zero_payout_count"] += 1
        if not s["last_log_date"] or w.date > s["last_log_date"]:
            s["last_log_date"] = w.date
    done = dict(db.query(Task.assignee_id, func.count(Task.id)).filter(
        Task.status == "completato",
        Task.completed_at >= datetime.combine(start, time.min),
        Task.completed_at < datetime.combine(nxt, time.min)).group_by(Task.assignee_id).all())
    out = []
    for u in db.query(User).order_by(User.role, User.name).all():
        d = user_out(u)
        s = stats.get(u.id, {})
        d.update(
            month_hours=round(s.get("month_hours", 0), 2),
            month_cost=round(s.get("month_cost", 0), 2),
            month_revenue=round(s.get("month_revenue", 0), 2),
            month_margin=round(s.get("month_revenue", 0) - s.get("month_cost", 0), 2),
            month_jobs=s.get("month_jobs", 0),
            month_completed=done.get(u.id, 0),
            pending_payout=round(s.get("pending_payout", 0), 2),
            pending_count=s.get("pending_count", 0),
            paid_total=round(s.get("paid_total", 0), 2),
            zero_payout_count=s.get("zero_payout_count", 0),
            last_log_date=s["last_log_date"].isoformat() if s.get("last_log_date") else None,
            period=f"{start.year}-{start.month:02d}",
        )
        out.append(d)
    return out


@router.get("/users/basic")
def users_basic(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [{"id": u.id, "name": u.name, "role": u.role} for u in db.query(User).filter(User.active.is_(True)).order_by(User.name)]


@router.post("/users")
def create_user(body: UserIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=422, detail="Email non valida")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Esiste già un utente con questa email")
    if not body.password:
        raise HTTPException(status_code=422, detail="La password è obbligatoria (min 8 caratteri)")
    data = body.model_dump(exclude={"password", "email"})
    u = User(email=email, password_hash=hash_password(body.password), **data)
    db.add(u)
    db.commit()
    return user_out(u)


@router.put("/users/{user_id}")
def update_user(user_id: int, body: UserIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    email = body.email.strip().lower()
    clash = db.query(User).filter(User.email == email, User.id != user_id).first()
    if clash:
        raise HTTPException(status_code=409, detail="Esiste già un utente con questa email")
    if u.id == admin.id and (body.role != "admin" or not body.active):
        raise HTTPException(status_code=400, detail="Non puoi rimuovere i tuoi permessi di amministratore")
    for k, v in body.model_dump(exclude={"password", "email"}).items():
        setattr(u, k, v)
    u.email = email
    if body.password:
        u.password_hash = hash_password(body.password)
    db.commit()
    return user_out(u)


@router.delete("/users/{user_id}")
def delete_user(user_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    if u.id == admin.id:
        raise HTTPException(status_code=400, detail="Non puoi eliminare il tuo account")
    if db.query(WorkLog).filter(WorkLog.user_id == u.id).count():
        u.active = False
        db.query(Task).filter(Task.assignee_id == u.id, Task.status != "completato").update({"assignee_id": None})
        db.commit()
        return {"ok": True, "deactivated": True}
    db.query(Task).filter(Task.assignee_id == u.id).update({"assignee_id": None})
    db.query(Task).filter(Task.created_by == u.id).update({"created_by": None})
    db.delete(u)
    db.commit()
    return {"ok": True, "deactivated": False}
