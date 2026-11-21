"""Listino personalizzato per cliente e categoria di servizio: precompila il prezzo dei lavori extra."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import Client, ClientPriceList, User
from security import get_current_user, require_admin

router = APIRouter()
CATEGORIES = ("reel", "carosello", "grafica", "sessione", "copywriting_script", "altro")


class PriceItem(BaseModel):
    category_service: str
    price: float = Field(ge=0)
    notes: Optional[str] = Field(default=None, max_length=255)


class PriceListIn(BaseModel):
    items: List[PriceItem]


def _client(db, cid):
    c = db.get(Client, cid)
    if not c:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    return c


@router.get("/clients/{client_id}/price-list")
def get_price_list(client_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    _client(db, client_id)
    rows = db.query(ClientPriceList).filter_by(client_id=client_id).order_by(ClientPriceList.category_service).all()
    return [r.to_dict() for r in rows]


@router.put("/clients/{client_id}/price-list")
def set_price_list(client_id: int, body: PriceListIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    _client(db, client_id)
    seen = set()
    for item in body.items:
        if item.category_service not in CATEGORIES:
            raise HTTPException(status_code=422, detail=f"Categoria non valida: {item.category_service}")
        if item.category_service in seen:
            raise HTTPException(status_code=422, detail="Ogni categoria può comparire una sola volta")
        seen.add(item.category_service)
    existing = {r.category_service: r for r in db.query(ClientPriceList).filter_by(client_id=client_id).all()}
    for cat, row in existing.items():
        if cat not in seen:
            db.delete(row)
    for item in body.items:
        row = existing.get(item.category_service) or ClientPriceList(client_id=client_id, category_service=item.category_service)
        row.price, row.notes = item.price, item.notes
        db.add(row)
    db.commit()
    return get_price_list(client_id, _, db)


@router.get("/price-list/suggest")
def suggest(client_id: int, category_service: str, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.query(ClientPriceList).filter_by(client_id=client_id, category_service=category_service).first()
    return {"price": row.price if row else None}
