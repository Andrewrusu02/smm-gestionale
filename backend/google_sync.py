import asyncio
import base64
import hashlib
import logging
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from cryptography.fernet import Fernet, InvalidToken
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from database import SessionLocal
from models import Lead, Post, Setting, utcnow
from services import CONTENT_TYPES

SCOPES = ["openid", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/calendar"]
TOKEN_URI = "https://oauth2.googleapis.com/token"
log = logging.getLogger("google_sync")


def _fernet():
    key = base64.urlsafe_b64encode(hashlib.sha256(os.environ["JWT_SECRET"].encode()).digest())
    return Fernet(key)


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value):
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        return None


def get_setting(db, key):
    s = db.get(Setting, key)
    return s.value if s else None


def set_setting(db, key, value):
    s = db.get(Setting, key)
    if value is None:
        if s:
            db.delete(s)
    elif s:
        s.value = value
    else:
        db.add(Setting(key=key, value=value))


def app_tz():
    return ZoneInfo(os.environ["APP_TIMEZONE"])


def redirect_uri():
    return f"{os.environ['PUBLIC_BACKEND_URL'].rstrip('/')}/api/integrations/google/callback"


def calendar_id(db):
    return get_setting(db, "google_calendar_id") or "primary"


def get_service(db):
    cid = get_setting(db, "google_client_id")
    secret = decrypt(get_setting(db, "google_client_secret"))
    refresh = decrypt(get_setting(db, "google_refresh_token"))
    if not (cid and secret and refresh):
        return None
    creds = Credentials(token=None, refresh_token=refresh, token_uri=TOKEN_URI,
                        client_id=cid, client_secret=secret, scopes=SCOPES)
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


def _record_error(db, msg):
    db.rollback()
    set_setting(db, "google_last_error", f"{utcnow().isoformat()} - {msg}"[:500])
    db.commit()


def event_body(post: Post):
    tz = os.environ["APP_TIMEZONE"]
    start = post.scheduled_at
    end = start + timedelta(minutes=post.duration_minutes or 60)
    client = post.client.name if post.client else ""
    return {
        "summary": f"[{CONTENT_TYPES.get(post.content_type, post.content_type)}] {client} - {post.title}",
        "description": post.description or "",
        "colorId": "10" if post.content_type == "sessione" else "9",
        "start": {"dateTime": start.isoformat(), "timeZone": tz},
        "end": {"dateTime": end.isoformat(), "timeZone": tz},
        "extendedProperties": {"private": {"smm_post_id": str(post.id)}},
    }


def lead_event_body(lead: Lead):
    tz = os.environ["APP_TIMEZONE"]
    start = lead.meeting_at
    end = start + timedelta(minutes=lead.duration_minutes or 60)
    contact = " · ".join(filter(None, [lead.contact_name, lead.email, lead.phone]))
    return {
        "summary": f"[Meeting] {lead.name}",
        "description": "\n\n".join(filter(None, [contact, lead.notes])),
        "location": lead.location or "",
        "colorId": "6",
        "start": {"dateTime": start.isoformat(), "timeZone": tz},
        "end": {"dateTime": end.isoformat(), "timeZone": tz},
        "extendedProperties": {"private": {"smm_lead_id": str(lead.id)}},
    }


def _push(db, svc, post, body=None):
    cal = calendar_id(db)
    body = body or (lead_event_body(post) if isinstance(post, Lead) else event_body(post))
    if post.google_event_id:
        try:
            svc.events().update(calendarId=cal, eventId=post.google_event_id, body=body).execute()
            return
        except HttpError as e:
            if e.resp.status not in (404, 410):
                raise
            post.google_event_id = None
    ev = svc.events().insert(calendarId=cal, body=body).execute()
    post.google_event_id = ev["id"]


def push_post(post_id: int):
    with SessionLocal() as db:
        svc = get_service(db)
        post = db.get(Post, post_id)
        if not svc or not post:
            return
        try:
            _push(db, svc, post)
            db.commit()
        except Exception as e:  # noqa: BLE001
            log.exception("Google push failed")
            _record_error(db, f"Invio evento: {e}")


def push_lead(lead_id: int):
    with SessionLocal() as db:
        svc = get_service(db)
        lead = db.get(Lead, lead_id)
        if not svc or not lead or not lead.meeting_at:
            return
        try:
            _push(db, svc, lead)
            db.commit()
        except Exception as e:  # noqa: BLE001
            log.exception("Google push lead failed")
            _record_error(db, f"Invio meeting: {e}")


def delete_event(event_id: str):
    with SessionLocal() as db:
        svc = get_service(db)
        if not svc or not event_id:
            return
        try:
            svc.events().delete(calendarId=calendar_id(db), eventId=event_id).execute()
        except HttpError as e:
            if e.resp.status not in (404, 410):
                _record_error(db, f"Eliminazione evento: {e}")
        except Exception as e:  # noqa: BLE001
            _record_error(db, f"Eliminazione evento: {e}")


def _parse_dt(value):
    if not value:
        return None
    if "dateTime" in value:
        dt = datetime.fromisoformat(value["dateTime"].replace("Z", "+00:00"))
        return dt.astimezone(app_tz()).replace(tzinfo=None) if dt.tzinfo else dt
    if "date" in value:
        return datetime.fromisoformat(value["date"]).replace(hour=9)
    return None


def _apply_lead_event(db, ev) -> int:
    lead = db.query(Lead).filter(Lead.google_event_id == ev["id"]).first()
    if not lead:
        lid = ev.get("extendedProperties", {}).get("private", {}).get("smm_lead_id")
        lead = db.get(Lead, int(lid)) if lid and lid.isdigit() else None
    if not lead:
        return 0
    if ev.get("status") == "cancelled":
        lead.meeting_at, lead.google_event_id = None, None
        return 1
    start, end = _parse_dt(ev.get("start")), _parse_dt(ev.get("end"))
    if not start:
        return 0
    duration = max(15, int((end - start).total_seconds() // 60)) if end else lead.duration_minutes
    if start == lead.meeting_at and duration == lead.duration_minutes:
        return 0
    lead.meeting_at, lead.duration_minutes = start, duration
    return 1


def _apply_event(db, ev) -> int:
    post = db.query(Post).filter(Post.google_event_id == ev["id"]).first()
    if not post:
        pid = ev.get("extendedProperties", {}).get("private", {}).get("smm_post_id")
        post = db.get(Post, int(pid)) if pid and pid.isdigit() else None
    if not post:
        return _apply_lead_event(db, ev)
    if ev.get("status") == "cancelled":
        task = post.task
        if task and task.status != "completato":
            db.delete(task)
        elif task:
            task.post_id = None
        db.delete(post)
        return 1
    start, end = _parse_dt(ev.get("start")), _parse_dt(ev.get("end"))
    if not start:
        return 0
    duration = max(15, int((end - start).total_seconds() // 60)) if end else post.duration_minutes
    if start == post.scheduled_at and duration == post.duration_minutes:
        return 0
    post.scheduled_at, post.duration_minutes = start, duration
    if post.task:
        post.task.due_date = start.date()
    return 1


def pull_changes(db, svc) -> int:
    cal = calendar_id(db)
    token = get_setting(db, "google_sync_token")
    page, changed = None, 0
    while True:
        params = {"calendarId": cal, "showDeleted": True, "singleEvents": True, "maxResults": 250}
        if page:
            params["pageToken"] = page
        if token:
            params["syncToken"] = token
        else:
            params["timeMin"] = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
        try:
            resp = svc.events().list(**params).execute()
        except HttpError as e:
            if e.resp.status == 410 and token:
                token, page = None, None
                set_setting(db, "google_sync_token", None)
                continue
            raise
        for ev in resp.get("items", []):
            changed += _apply_event(db, ev)
        page = resp.get("nextPageToken")
        if not page:
            if resp.get("nextSyncToken"):
                set_setting(db, "google_sync_token", resp["nextSyncToken"])
            break
    db.commit()
    return changed


def full_sync():
    with SessionLocal() as db:
        svc = get_service(db)
        if not svc:
            return {"pushed": 0, "pulled": 0, "connected": False}
        try:
            since = utcnow() - timedelta(days=30)
            pending = db.query(Post).filter(Post.google_event_id.is_(None), Post.scheduled_at >= since).all()
            pending += db.query(Lead).filter(Lead.google_event_id.is_(None), Lead.meeting_at.isnot(None),
                                             Lead.meeting_at >= since).all()
            for p in pending:
                _push(db, svc, p)
            db.commit()
            pulled = pull_changes(db, svc)
            set_setting(db, "google_last_sync", utcnow().isoformat())
            set_setting(db, "google_last_error", None)
            db.commit()
            return {"pushed": len(pending), "pulled": pulled, "connected": True}
        except Exception as e:  # noqa: BLE001
            log.exception("Google sync failed")
            _record_error(db, f"Sincronizzazione: {e}")
            raise


async def sync_loop():
    interval = int(os.environ["GOOGLE_SYNC_INTERVAL"])
    while True:
        await asyncio.sleep(interval)
        try:
            await asyncio.to_thread(full_sync)
        except Exception:  # noqa: BLE001
            pass
