"""Shot list delle sessioni di registrazione.

L'amministratore prepara il piano (scene, location, attrezzatura, persone, script collegato); tutto il team
può aprirlo e spuntare scene e attrezzatura durante le riprese.
"""
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import Post, ShotListItem, User, VideoScript, utcnow
from security import get_current_user, require_admin

router = APIRouter()


class ItemIn(BaseModel):
    id: Optional[int] = None
    kind: Literal["scene", "equipment"] = "scene"
    description: str = Field(min_length=1, max_length=500)
    framing: Optional[str] = Field(default=None, max_length=120)
    duration_seconds: Optional[int] = Field(default=None, ge=0, le=36000)


class ShotListIn(BaseModel):
    location: Optional[str] = Field(default=None, max_length=255)
    people: Optional[str] = None
    video_script_id: Optional[int] = None
    items: List[ItemIn] = []


class DoneIn(BaseModel):
    done: bool


def _session(db, post_id) -> Post:
    p = db.get(Post, post_id)
    if not p:
        raise HTTPException(status_code=404, detail="Contenuto non trovato")
    if p.content_type != "sessione":
        raise HTTPException(status_code=422, detail="La shot list è disponibile solo per le sessioni di registrazione")
    return p


def _out(db, p: Post):
    script = p.video_script if p.video_script_id else None
    names = {u.id: u.name for u in db.query(User).all()}
    items = [{**i.to_dict(), "done_by_name": names.get(i.done_by)} for i in p.shot_items]
    scenes = [i for i in items if i["kind"] == "scene"]
    return {
        "post": {"id": p.id, "title": p.title, "client_id": p.client_id, "client_name": p.client.name if p.client else None,
                 "scheduled_at": p.scheduled_at.isoformat(), "duration_minutes": p.duration_minutes,
                 "description": p.description},
        "location": p.location, "people": p.people, "video_script_id": p.video_script_id,
        "video_script": {"id": script.id, "title": script.title, "concept": script.concept, "script_body": script.script_body,
                         "status": script.status} if script else None,
        "scenes": scenes,
        "equipment": [i for i in items if i["kind"] == "equipment"],
        "progress": {"done": sum(1 for i in items if i["done"]), "total": len(items),
                     "scene_seconds": sum(i["duration_seconds"] or 0 for i in scenes)},
    }


@router.get("/posts/{post_id}/shotlist")
def get_shotlist(post_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _out(db, _session(db, post_id))


@router.put("/posts/{post_id}/shotlist")
def save_shotlist(post_id: int, body: ShotListIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    p = _session(db, post_id)
    if body.video_script_id:
        script = db.get(VideoScript, body.video_script_id)
        if not script or script.client_id != p.client_id:
            raise HTTPException(status_code=422, detail="Lo script deve essere dello stesso cliente")
    p.location, p.people, p.video_script_id = body.location or None, body.people or None, body.video_script_id
    existing = {i.id: i for i in p.shot_items}
    keep = set()
    positions = {"scene": 0, "equipment": 0}
    for item in body.items:
        row = existing.get(item.id) if item.id else None
        if row is None:
            row = ShotListItem(post_id=p.id)
            p.shot_items.append(row)
        else:
            keep.add(row.id)
        row.kind, row.description = item.kind, item.description.strip()
        row.framing = item.framing or None
        row.duration_seconds = item.duration_seconds
        row.position = positions[item.kind]
        positions[item.kind] += 1
    for iid, row in existing.items():
        if iid not in keep:
            p.shot_items.remove(row)
    db.commit()
    db.refresh(p)
    return _out(db, p)


@router.patch("/shotlist-items/{item_id}")
def toggle_item(item_id: int, body: DoneIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.get(ShotListItem, item_id)
    if not item or not db.get(Post, item.post_id):
        raise HTTPException(status_code=404, detail="Elemento non trovato")
    item.done = body.done
    item.done_at, item.done_by = (utcnow(), user.id) if body.done else (None, None)
    db.commit()
    return item.to_dict()
