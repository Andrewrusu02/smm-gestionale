from datetime import date
from typing import List, Literal, Optional

from io import BytesIO
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy.orm import Session

from database import get_db
from models import Client, Quote, QuoteItem, User
from security import require_admin

router = APIRouter()


class QuoteItemIn(BaseModel):
    description: str = Field(min_length=1, max_length=255)
    quantity: float = Field(default=1, gt=0)
    unit_price: float = Field(default=0, ge=0)


class QuoteIn(BaseModel):
    client_id: int
    issue_date: date
    delivery_date: Optional[date] = None
    validity_date: Optional[date] = None
    status: Literal["bozza", "inviato", "accettato", "rifiutato"] = "bozza"
    notes: Optional[str] = None
    tax_rate: float = Field(default=0, ge=0, le=100)
    items: List[QuoteItemIn] = Field(min_length=1)


def _quote_out(q: Quote):
    return {
        **q.to_dict(exclude=("items",)),
        "client_name": q.client.name,
        "items": [item.to_dict() for item in q.items],
    }


def _set_quote(q: Quote, body: QuoteIn):
    subtotal = round(sum(item.quantity * item.unit_price for item in body.items), 2)
    q.client_id = body.client_id
    q.issue_date = body.issue_date
    q.delivery_date = body.delivery_date
    q.validity_date = body.validity_date
    q.status = body.status
    q.notes = body.notes
    q.tax_rate = body.tax_rate
    q.subtotal = subtotal
    q.total = round(subtotal * (1 + body.tax_rate / 100), 2)
    q.items.clear()
    for position, item in enumerate(body.items):
        q.items.append(QuoteItem(
            description=item.description.strip(),
            quantity=item.quantity,
            unit_price=item.unit_price,
            total=round(item.quantity * item.unit_price, 2),
            position=position,
        ))


@router.get("/quotes")
def list_quotes(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [_quote_out(q) for q in db.query(Quote).order_by(Quote.issue_date.desc(), Quote.id.desc()).all()]


@router.post("/quotes")
def create_quote(body: QuoteIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    if not db.get(Client, body.client_id):
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    q = Quote(number="TEMP", client_id=body.client_id, issue_date=body.issue_date)
    db.add(q)
    db.flush()
    q.number = f"PREV-{body.issue_date.year}-{q.id:04d}"
    _set_quote(q, body)
    db.commit()
    return _quote_out(q)


@router.put("/quotes/{quote_id}")
def update_quote(quote_id: int, body: QuoteIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    q = db.get(Quote, quote_id)
    if not q:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    if not db.get(Client, body.client_id):
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    _set_quote(q, body)
    db.commit()
    return _quote_out(q)


@router.delete("/quotes/{quote_id}")
def delete_quote(quote_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    q = db.get(Quote, quote_id)
    if not q:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    db.delete(q)
    db.commit()
    return {"ok": True}


@router.get("/quotes/{quote_id}/pdf")
def quote_pdf(quote_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    quote = db.get(Quote, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    buffer = BytesIO()
    document = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm,
                                topMargin=18 * mm, bottomMargin=18 * mm)
    styles = getSampleStyleSheet()
    story = [
        Paragraph(f"Preventivo {quote.number}", styles["Title"]),
        Paragraph(f"<b>Cliente:</b> {escape(quote.client.name)}<br/><b>Data:</b> {quote.issue_date:%d/%m/%Y}",
                  styles["Normal"]),
        Spacer(1, 12),
    ]
    rows = [["Servizio", "Qtà", "Prezzo unitario", "Totale"]]
    rows.extend([[Paragraph(escape(item.description), styles["Normal"]), f"{item.quantity:g}", f"€ {item.unit_price:.2f}",
                  f"€ {item.total:.2f}"] for item in quote.items])
    rows.append(["", "", "Totale", f"€ {quote.total:.2f}"])
    table = Table(rows, colWidths=[78 * mm, 18 * mm, 36 * mm, 36 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4f46e5")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d1d5db")),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(table)
    if quote.notes:
        story.extend([Spacer(1, 12), Paragraph(f"<b>Note:</b><br/>{escape(quote.notes)}", styles["Normal"])])
    document.build(story)
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="{quote.number}.pdf"'})
