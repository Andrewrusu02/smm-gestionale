"""Set di hashtag ricorrenti per cliente."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import Client, ClientHashtagSet, User
from security import get_current_user, require_admin
from services import normalize_hashtags

router = APIRouter()


class HashtagSetIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    hashtags: str = Field(min_length=1)


def _client(db, cid):
    if not db.get(Client, cid):
        raise HTTPException(status_code=404, detail="Cliente non trovato")


def _set(db, client_id, sid) -> ClientHashtagSet:
    row = db.get(ClientHashtagSet, sid)
    if not row or row.client_id != client_id:
        raise HTTPException(status_code=404, detail="Set di hashtag non trovato")
    return row


def _clean(body: HashtagSetIn) -> str:
    tags = normalize_hashtags(body.hashtags)
    if not tags:
        raise HTTPException(status_code=422, detail="Inserisci almeno un hashtag")
    return tags


@router.get("/clients/{client_id}/hashtag-sets")
def list_sets(client_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _client(db, client_id)
    return [r.to_dict() for r in db.query(ClientHashtagSet).filter_by(client_id=client_id).order_by(ClientHashtagSet.name)]


@router.post("/clients/{client_id}/hashtag-sets")
def create_set(client_id: int, body: HashtagSetIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    _client(db, client_id)
    row = ClientHashtagSet(client_id=client_id, name=body.name.strip(), hashtags=_clean(body))
    db.add(row)
    db.commit()
    return row.to_dict()


@router.put("/clients/{client_id}/hashtag-sets/{sid}")
def update_set(client_id: int, sid: int, body: HashtagSetIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    row = _set(db, client_id, sid)
    row.name, row.hashtags = body.name.strip(), _clean(body)
    db.commit()
    return row.to_dict()


@router.delete("/clients/{client_id}/hashtag-sets/{sid}")
def delete_set(client_id: int, sid: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    db.delete(_set(db, client_id, sid))
    db.commit()
    return {"ok": True}
