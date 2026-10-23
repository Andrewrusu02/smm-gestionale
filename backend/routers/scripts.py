from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import Client, User, VideoScript, utcnow
from security import get_current_user, require_admin

router = APIRouter()

SCRIPT_STATUSES = (
    "BOZZA", "SCRIPT_PRONTO", "DA_REGISTRARE",
    "REGISTRATO", "IN_MONTAGGIO", "COMPLETATO",
)


class VideoScriptIn(BaseModel):
    client_id: int
    title: str = Field(min_length=1, max_length=255)
    concept: Optional[str] = None
    script_body: str = ""
    status: str = "BOZZA"
    shooting_date: Optional[date] = None
    notes: Optional[str] = None


def _out(script: VideoScript):
    return {
        **script.to_dict(),
        "client_name": script.client.name if script.client else None,
    }


def _validate_status(status: str):
    if status not in SCRIPT_STATUSES:
        raise HTTPException(status_code=422, detail=f"Stato non valido: {status}")


def _client(db: Session, client_id: int):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    return client


@router.get("/scripts/statuses")
def script_statuses(_: User = Depends(get_current_user)):
    return list(SCRIPT_STATUSES)


@router.get("/scripts")
def list_scripts(
    client_id: Optional[int] = None,
    status: Optional[str] = None,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(VideoScript)
    if client_id:
        query = query.filter(VideoScript.client_id == client_id)
    if status:
        query = query.filter(VideoScript.status.in_(status.split(",")))
    return [_out(item) for item in query.order_by(VideoScript.shooting_date.is_(None), VideoScript.shooting_date,
                                                   VideoScript.created_at.desc()).all()]


@router.get("/scripts/{script_id}")
def get_script(script_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    script = db.get(VideoScript, script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script non trovato")
    return _out(script)


@router.post("/scripts")
def create_script(body: VideoScriptIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    _client(db, body.client_id)
    _validate_status(body.status)
    script = VideoScript(**body.model_dump())
    db.add(script)
    db.commit()
    db.refresh(script)
    return _out(script)


@router.put("/scripts/{script_id}")
def update_script(script_id: int, body: VideoScriptIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    script = db.get(VideoScript, script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script non trovato")
    _client(db, body.client_id)
    _validate_status(body.status)
    for key, value in body.model_dump().items():
        setattr(script, key, value)
    script.updated_at = utcnow()
    db.commit()
    db.refresh(script)
    return _out(script)


@router.delete("/scripts/{script_id}")
def delete_script(script_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    script = db.get(VideoScript, script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script non trovato")
    db.delete(script)
    db.commit()
    return {"ok": True}
