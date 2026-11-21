"""Banca idee per cliente. Tutto il team può proporre idee; l'amministratore le trasforma in script video."""
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import Client, Idea, User, VideoScript
from security import get_current_user, require_admin

router = APIRouter()
STATUSES = {"nuova": "Nuova", "approvata": "Approvata", "scartata": "Scartata", "convertita": "Diventata script"}
IdeaStatus = Literal["nuova", "approvata", "scartata", "convertita"]


class IdeaIn(BaseModel):
    client_id: int
    title: str = Field(min_length=1, max_length=255)
    note: Optional[str] = None
    reference_url: Optional[str] = Field(default=None, max_length=500)
    status: IdeaStatus = "nuova"


def _out(i: Idea):
    d = i.to_dict()
    d["client_name"] = i.client.name if i.client else None
    d["status_label"] = STATUSES.get(i.status, i.status)
    if i.video_script_id and not i.video_script:  # script eliminato: l'idea resta, senza collegamento
        d["video_script_id"] = None
    return d


def _idea(db, iid, user=None, edit=False) -> Idea:
    i = db.get(Idea, iid)
    if not i or not i.client:
        raise HTTPException(status_code=404, detail="Idea non trovata")
    if edit and user.role != "admin" and i.created_by != user.id:
        raise HTTPException(status_code=403, detail="Puoi modificare solo le idee che hai proposto tu")
    return i


def _check_url(url):
    if url and not url.lower().startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail="Il link deve iniziare con http:// o https://")


@router.get("/ideas/statuses")
def statuses(_: User = Depends(get_current_user)):
    return [{"key": k, "label": v} for k, v in STATUSES.items()]


@router.get("/ideas")
def list_ideas(client_id: Optional[int] = None, status: Optional[str] = None,
               _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(Idea).join(Client, Idea.client_id == Client.id)
    if client_id:
        q = q.filter(Idea.client_id == client_id)
    if status:
        q = q.filter(Idea.status.in_(status.split(",")))
    return [_out(i) for i in q.order_by(Idea.status == "convertita", Idea.created_at.desc(), Idea.id.desc()).all()]


@router.post("/ideas")
def create_idea(body: IdeaIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.get(Client, body.client_id):
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    _check_url(body.reference_url)
    data = body.model_dump()
    if data["status"] == "convertita":
        data["status"] = "nuova"
    i = Idea(**data, created_by=user.id)
    db.add(i)
    db.commit()
    return _out(i)


@router.put("/ideas/{iid}")
def update_idea(iid: int, body: IdeaIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    i = _idea(db, iid, user, edit=True)
    if not db.get(Client, body.client_id):
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    _check_url(body.reference_url)
    for k, v in body.model_dump().items():
        setattr(i, k, v)
    db.commit()
    return _out(i)


@router.delete("/ideas/{iid}")
def delete_idea(iid: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_idea(db, iid, user, edit=True))
    db.commit()
    return {"ok": True}


@router.post("/ideas/{iid}/to-script")
def idea_to_script(iid: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    i = _idea(db, iid)
    if i.video_script_id and i.video_script:
        raise HTTPException(status_code=409, detail="Questa idea è già diventata uno script")
    script = VideoScript(
        client_id=i.client_id, title=i.title, concept=i.note or None, script_body="", status="BOZZA",
        notes="\n".join(filter(None, ["Nato dalla banca idee.", f"Riferimento: {i.reference_url}" if i.reference_url else None])),
    )
    db.add(script)
    db.flush()
    i.video_script_id, i.status = script.id, "convertita"
    db.commit()
    return {"idea": _out(i), "script": {**script.to_dict(), "client_name": i.client.name}}
