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


def _month_range():
    t = date.today()
    start = date(t.year, t.month, 1)
    nxt = date(t.year + (t.month == 12), t.month % 12 + 1, 1)
    return start, nxt


@router.get("/users")
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    start, nxt = _month_range()
    logs = dict((uid, (h, c)) for uid, h, c in db.query(WorkLog.user_id, func.sum(WorkLog.hours), func.sum(WorkLog.worker_expense))
                .filter(WorkLog.date >= start, WorkLog.date < nxt).group_by(WorkLog.user_id).all())
    done = dict(db.query(Task.assignee_id, func.count(Task.id)).filter(
        Task.status == "completato", Task.completed_at >= datetime.combine(start, time.min)).group_by(Task.assignee_id).all())
    out = []
    for u in db.query(User).order_by(User.role, User.name).all():
        d = user_out(u)
        h, c = logs.get(u.id, (0, 0))
        d.update(month_hours=round(h or 0, 2), month_cost=round(c or 0, 2), month_completed=done.get(u.id, 0))
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
