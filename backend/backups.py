"""Backup del database SQLite.

I file finiscono in ``<cartella del database>/backups`` (in produzione ``/data/backups``), oppure in
``BACKUP_DIR`` se impostata. Si usa l'API ``backup`` di sqlite3: è sicura anche mentre l'app scrive.
"""
import asyncio
import logging
import os
import re
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

log = logging.getLogger("backups")
RETENTION_DAYS = 30
NAME_RE = re.compile(r"^[\w.-]+\.db$")
KINDS = ("auto", "manuale", "pre-migrazione")


def database_path():
    url = os.environ.get("DATABASE_URL", "")
    if not url.startswith("sqlite:///"):
        return None
    return url.split("sqlite:///", 1)[1]


def backup_dir(db_path=None) -> Path:
    if os.environ.get("BACKUP_DIR"):
        path = Path(os.environ["BACKUP_DIR"])
    else:
        path = Path(os.path.abspath(db_path or database_path() or ".")).parent / "backups"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _tz():
    try:
        return ZoneInfo(os.environ.get("APP_TIMEZONE") or "Europe/Rome")
    except Exception:  # noqa: BLE001
        return None


def _now():
    return datetime.now(_tz()).replace(tzinfo=None)


def create_backup(kind="manuale", label=None, db_path=None) -> Path:
    db_path = db_path or database_path()
    if not db_path:
        raise RuntimeError("Il backup è disponibile solo con SQLite")
    stamp = _now().strftime("%Y%m%d-%H%M%S")
    suffix = f"-{re.sub(r'[^0-9A-Za-z_-]', '', label)}" if label else ""
    target = backup_dir(db_path) / f"{kind}-{stamp}{suffix}.db"
    n = 1
    while target.exists():
        n += 1
        target = target.with_name(f"{kind}-{stamp}{suffix}-{n}.db")
    src = sqlite3.connect(db_path)
    dst = sqlite3.connect(str(target))
    try:
        with dst:
            src.backup(dst)
    finally:
        dst.close()
        src.close()
    log.info("Backup creato: %s", target.name)
    return target


def _kind_of(name: str) -> str:
    for kind in KINDS:
        if name.startswith(f"{kind}-"):
            return kind
    return "altro"


def list_backups(db_path=None):
    out = []
    for path in backup_dir(db_path).glob("*.db"):
        stat = path.stat()
        out.append({
            "name": path.name,
            "size": stat.st_size,
            "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
            "kind": _kind_of(path.name),
        })
    return sorted(out, key=lambda b: b["created_at"], reverse=True)


def resolve_backup(name: str, db_path=None):
    """Percorso di un backup esistente, oppure None (blocca nomi con percorsi o caratteri strani)."""
    if not NAME_RE.match(name or "") or "/" in name or "\\" in name or name.startswith("."):
        return None
    path = backup_dir(db_path) / name
    return path if path.is_file() else None


def prune_backups(days: int = RETENTION_DAYS, db_path=None, now=None):
    """Cancella i backup più vecchi di ``days`` giorni; l'ultimo backup non viene mai cancellato."""
    now = now or datetime.now()
    files = sorted(backup_dir(db_path).glob("*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
    removed = []
    for path in files[1:]:
        if now - datetime.fromtimestamp(path.stat().st_mtime) > timedelta(days=days):
            path.unlink()
            removed.append(path.name)
    if removed:
        log.info("Backup eliminati perché più vecchi di %d giorni: %s", days, ", ".join(removed))
    return removed


def nightly_due(now=None, db_path=None, hour=None) -> bool:
    """True se è passata l'ora del backup notturno e oggi non è ancora stato fatto."""
    now = now or _now()
    hour = int(os.environ.get("BACKUP_HOUR", "3")) if hour is None else hour
    if now.hour < hour:
        return False
    today = now.strftime("%Y%m%d")
    return not any(p.name.startswith(f"auto-{today}") for p in backup_dir(db_path).glob("auto-*.db"))


def run_nightly(db_path=None):
    if nightly_due(db_path=db_path):
        create_backup(kind="auto", db_path=db_path)
        prune_backups(db_path=db_path)
        return True
    return False


async def backup_loop(interval_seconds: int = 900):
    while True:
        try:
            await asyncio.to_thread(run_nightly)
        except Exception:  # noqa: BLE001
            log.exception("Backup notturno fallito")
        await asyncio.sleep(interval_seconds)
