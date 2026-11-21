from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

import backups
from models import User
from security import require_admin

router = APIRouter()


@router.get("/backups")
def list_backups(_: User = Depends(require_admin)):
    return {"retention_days": backups.RETENTION_DAYS, "items": backups.list_backups()}


@router.post("/backups")
def backup_now(_: User = Depends(require_admin)):
    try:
        path = backups.create_backup(kind="manuale")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Backup non riuscito: {e}")
    backups.prune_backups()
    return next(b for b in backups.list_backups() if b["name"] == path.name)


@router.get("/backups/{name}/download")
def download_backup(name: str, _: User = Depends(require_admin)):
    path = backups.resolve_backup(name)
    if not path:
        raise HTTPException(status_code=404, detail="Backup non trovato")
    return FileResponse(path, media_type="application/octet-stream", filename=path.name)
