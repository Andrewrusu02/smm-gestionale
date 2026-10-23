import os
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from models import User

JWT_ALGORITHM = "HS256"


def jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_token(user: User) -> str:
    hours = int(os.environ["TOKEN_HOURS"])
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(hours=hours),
    }
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGORITHM)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Non autenticato")
    try:
        payload = jwt.decode(auth[7:], jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessione scaduta")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token non valido")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Token non valido")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.active:
        raise HTTPException(status_code=401, detail="Utente non trovato o disattivato")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Accesso riservato all'amministratore")
    return user


def seed_admin(db: Session):
    email = os.environ["ADMIN_EMAIL"].strip().lower()
    if db.query(User).filter(User.email == email).first():
        return
    db.add(User(
        email=email,
        name=os.environ["ADMIN_NAME"],
        role="admin",
        password_hash=hash_password(os.environ["ADMIN_PASSWORD"]),
        job_title="Amministratore",
    ))
    db.commit()
