import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode
import jwt
import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from google_sync import (SCOPES, TOKEN_URI, decrypt, encrypt, full_sync, get_setting,
                         redirect_uri, set_setting)
from models import User
from security import JWT_ALGORITHM, jwt_secret, require_admin

router = APIRouter()


class GoogleConfigIn(BaseModel):
    client_id: str
    client_secret: Optional[str] = None
    calendar_id: Optional[str] = None


def _status(db):
    return {
        "client_id": get_setting(db, "google_client_id") or "",
        "has_secret": bool(get_setting(db, "google_client_secret")),
        "connected": bool(get_setting(db, "google_refresh_token")),
        "email": get_setting(db, "google_email"),
        "calendar_id": get_setting(db, "google_calendar_id") or "primary",
        "redirect_uri": redirect_uri(),
        "last_sync": get_setting(db, "google_last_sync"),
        "last_error": get_setting(db, "google_last_error"),
        "sync_interval_seconds": int(os.environ["GOOGLE_SYNC_INTERVAL"]),
    }


@router.get("/integrations/google")
def google_status(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return _status(db)


@router.put("/integrations/google")
def google_config(body: GoogleConfigIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    set_setting(db, "google_client_id", body.client_id.strip())
    if body.client_secret:
        set_setting(db, "google_client_secret", encrypt(body.client_secret.strip()))
    if body.calendar_id is not None:
        set_setting(db, "google_calendar_id", body.calendar_id.strip() or "primary")
        set_setting(db, "google_sync_token", None)
    db.commit()
    return _status(db)


@router.get("/integrations/google/auth-url")
def google_auth_url(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    cid = get_setting(db, "google_client_id")
    if not cid or not get_setting(db, "google_client_secret"):
        raise HTTPException(status_code=400, detail="Inserisci prima Client ID e Client Secret di Google")
    state = jwt.encode({"sub": str(admin.id), "type": "gstate", "exp": datetime.now(timezone.utc) + timedelta(minutes=10)},
                       jwt_secret(), algorithm=JWT_ALGORITHM)
    params = {"client_id": cid, "redirect_uri": redirect_uri(), "response_type": "code", "scope": " ".join(SCOPES),
              "access_type": "offline", "prompt": "consent", "include_granted_scopes": "true", "state": state}
    return {"url": f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"}


@router.get("/integrations/google/callback")
def google_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None,
                    db: Session = Depends(get_db)):
    front = os.environ["FRONTEND_URL"].rstrip("/")
    fail = lambda msg: RedirectResponse(f"{front}/impostazioni?tab=integrazioni&google=error&msg={msg}")  # noqa: E731
    if error or not code or not state:
        return fail(error or "autorizzazione_annullata")
    try:
        payload = jwt.decode(state, jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "gstate":
            raise jwt.InvalidTokenError()
    except jwt.InvalidTokenError:
        return fail("stato_non_valido")
    token = requests.post(TOKEN_URI, data={
        "code": code, "client_id": get_setting(db, "google_client_id"),
        "client_secret": decrypt(get_setting(db, "google_client_secret")),
        "redirect_uri": redirect_uri(), "grant_type": "authorization_code",
    }, timeout=20).json()
    if "access_token" not in token:
        return fail(token.get("error", "scambio_token_fallito"))
    refresh = token.get("refresh_token") or decrypt(get_setting(db, "google_refresh_token"))
    if not refresh:
        return fail("refresh_token_mancante")
    info = requests.get("https://www.googleapis.com/oauth2/v2/userinfo",
                        headers={"Authorization": f"Bearer {token['access_token']}"}, timeout=20).json()
    set_setting(db, "google_refresh_token", encrypt(refresh))
    set_setting(db, "google_email", info.get("email"))
    set_setting(db, "google_sync_token", None)
    set_setting(db, "google_last_error", None)
    db.commit()
    return RedirectResponse(f"{front}/impostazioni?tab=integrazioni&google=connected")


@router.post("/integrations/google/disconnect")
def google_disconnect(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    refresh = decrypt(get_setting(db, "google_refresh_token"))
    if refresh:
        try:
            requests.post("https://oauth2.googleapis.com/revoke", params={"token": refresh}, timeout=10)
        except requests.RequestException:
            pass
    for k in ("google_refresh_token", "google_email", "google_sync_token", "google_last_sync", "google_last_error"):
        set_setting(db, k, None)
    db.commit()
    return _status(db)


@router.post("/integrations/google/sync")
def google_sync_now(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    if not get_setting(db, "google_refresh_token"):
        raise HTTPException(status_code=400, detail="Google Calendar non è collegato")
    try:
        return full_sync()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Sincronizzazione fallita: {e}")
