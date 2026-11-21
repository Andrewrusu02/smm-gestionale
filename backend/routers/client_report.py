"""Report mensile in PDF per il cliente: contenuti consegnati, crediti, lavori extra, prossime uscite."""
from datetime import date, datetime, time, timedelta
from io import BytesIO
from typing import Optional
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from google_sync import get_setting, set_setting
from models import Client, Post, Task, User
from security import get_current_user, require_admin
from services import CONTENT_TYPES, client_usage, month_bounds, package_for

router = APIRouter()
MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre",
          "novembre", "dicembre"]
DEFAULT_AGENCY = "SMM Gestionale"


def agency_name(db) -> str:
    return get_setting(db, "agency_name") or DEFAULT_AGENCY


class AgencyIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


@router.get("/settings/agency")
def get_agency(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"name": agency_name(db)}


@router.put("/settings/agency")
def put_agency(body: AgencyIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    set_setting(db, "agency_name", body.name.strip())
    db.commit()
    return {"name": agency_name(db)}


def _eur(v):
    return "€ " + f"{v or 0:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def report_data(db, c: Client, year: int, month: int, today: Optional[date] = None):
    today = today or date.today()
    start, end = month_bounds(f"{year:04d}-{month:02d}")
    s_dt, e_dt = datetime.combine(start, time.min), datetime.combine(end + timedelta(days=1), time.min)
    delivered = db.query(Post).filter(Post.client_id == c.id, Post.status == "consegnato",
                                      Post.scheduled_at >= s_dt, Post.scheduled_at < e_dt).order_by(Post.scheduled_at).all()
    extras = [t for t in db.query(Task).filter(Task.client_id == c.id, Task.subscription_included.is_(False),
                                               Task.post_id.is_(None), Task.price_charged_to_client > 0).all()
              if (t.completed_at and s_dt <= t.completed_at < e_dt) or (not t.completed_at and t.due_date and start <= t.due_date <= end)]
    extras.sort(key=lambda t: (t.completed_at or datetime.combine(t.due_date, time.min)))
    horizon = max(today, end)
    upcoming = db.query(Post).filter(Post.client_id == c.id, Post.status != "consegnato",
                                     Post.scheduled_at >= datetime.combine(today, time.min),
                                     Post.scheduled_at < datetime.combine(horizon + timedelta(days=31), time.min)) \
        .order_by(Post.scheduled_at).limit(20).all()
    return {"start": start, "end": end, "delivered": delivered, "extras": extras, "upcoming": upcoming,
            "usage": client_usage(db, c), "package": package_for(c)}


def build_pdf(db, c: Client, year: int, month: int) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    data = report_data(db, c, year, month)
    agency = agency_name(db)
    styles = getSampleStyleSheet()
    ink, muted, accent, line = colors.HexColor("#0f172a"), colors.HexColor("#64748b"), colors.HexColor("#4f46e5"), colors.HexColor("#e2e8f0")
    h1 = ParagraphStyle("h1", parent=styles["Title"], fontSize=20, leading=24, textColor=ink, alignment=0, spaceAfter=2)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=12.5, textColor=ink, spaceBefore=14, spaceAfter=6)
    body = ParagraphStyle("b", parent=styles["Normal"], fontSize=9.5, leading=13, textColor=ink)
    small = ParagraphStyle("s", parent=body, fontSize=8.5, textColor=muted)
    eyebrow = ParagraphStyle("e", parent=small, textColor=accent, fontName="Helvetica-Bold")

    def table(rows, widths, money_col=None):
        t = Table(rows, colWidths=widths, repeatRows=1)
        style = [
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (0, 0), (-1, 0), muted), ("LINEBELOW", (0, 0), (-1, 0), 0.6, line),
            ("LINEBELOW", (0, 1), (-1, -1), 0.3, line), ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ]
        if money_col is not None:
            style.append(("ALIGN", (money_col, 0), (money_col, -1), "RIGHT"))
        t.setStyle(TableStyle(style))
        return t

    def p(text, st=body):
        return Paragraph(escape(str(text or "")), st)

    period = f"{MONTHS[month - 1]} {year}"
    story = [
        p(agency.upper(), eyebrow),
        Paragraph(f"Report di {escape(period)}", h1),
        p(f"{c.name}{' · ' + c.company_name if c.company_name else ''}", body),
        p(f"Periodo dal {data['start']:%d/%m/%Y} al {data['end']:%d/%m/%Y} · generato il {date.today():%d/%m/%Y}", small),
        Spacer(1, 6),
    ]
    # Riepilogo
    delivered, extras = data["delivered"], data["extras"]
    extra_total = sum(t.price_charged_to_client or 0 for t in extras)
    summary = [["Contenuti consegnati", "Lavori extra", "Valore lavori extra"],
               [str(len(delivered)), str(len(extras)), _eur(extra_total)]]
    st = Table(summary, colWidths=[58 * mm] * 3)
    st.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, 0), 8.5), ("TEXTCOLOR", (0, 0), (-1, 0), muted),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"), ("FONTSIZE", (0, 1), (-1, 1), 16),
        ("TEXTCOLOR", (0, 1), (-1, 1), ink), ("BOX", (0, 0), (-1, -1), 0.5, line),
        ("LINEBEFORE", (1, 0), (-1, -1), 0.5, line), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(st)

    story.append(Paragraph("Contenuti consegnati", h2))
    if delivered:
        rows = [["Data", "Tipo", "Contenuto"]] + [[f"{x.scheduled_at:%d/%m/%Y}", CONTENT_TYPES.get(x.content_type, x.content_type), p(x.title)]
                                                  for x in delivered]
        story.append(table(rows, [24 * mm, 38 * mm, 112 * mm]))
    else:
        story.append(p("Nessun contenuto consegnato nel mese.", small))

    if data["package"] and data["usage"]:
        story.append(Paragraph(f"Crediti del pacchetto {escape(data['package']['name'])} (ciclo {c.cycle_number or 1})", h2))
        rows = [["Tipo di contenuto", "Inclusi", "Usati", "Rimasti"]] + [
            [u["label"], str(u["limit"]), str(u["used"]), str(u["remaining"]) + (f" (+{u['over']} extra)" if u["over"] else "")]
            for u in data["usage"]]
        story.append(table(rows, [74 * mm, 32 * mm, 32 * mm, 36 * mm]))
        story.append(p("I crediti si riferiscono al ciclo di abbonamento in corso.", small))

    story.append(Paragraph("Lavori extra", h2))
    if extras:
        rows = [["Data", "Lavoro", "Stato", "Importo"]]
        for t in extras:
            when = t.completed_at.date() if t.completed_at else t.due_date
            rows.append([f"{when:%d/%m/%Y}", p(t.title), "Completato" if t.status == "completato" else "In corso", _eur(t.price_charged_to_client)])
        rows.append(["", "Totale", "", _eur(extra_total)])
        story.append(table(rows, [24 * mm, 96 * mm, 26 * mm, 28 * mm], money_col=3))
    else:
        story.append(p("Nessun lavoro extra nel mese.", small))

    story.append(Paragraph("Prossime uscite", h2))
    if data["upcoming"]:
        rows = [["Data", "Ora", "Tipo", "Contenuto"]] + [
            [f"{x.scheduled_at:%d/%m/%Y}", f"{x.scheduled_at:%H:%M}", CONTENT_TYPES.get(x.content_type, x.content_type), p(x.title)]
            for x in data["upcoming"]]
        story.append(table(rows, [24 * mm, 16 * mm, 38 * mm, 96 * mm]))
    else:
        story.append(p("Nessuna uscita programmata nelle prossime settimane.", small))

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(muted)
        canvas.drawString(18 * mm, 10 * mm, f"{agency} · Report {period} · {c.name}")
        canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Pagina {doc.page}")
        canvas.restoreState()

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
                            title=f"Report {period} - {c.name}", author=agency)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


@router.get("/clients/{client_id}/report.pdf")
def client_report(client_id: int, year: Optional[int] = None, month: Optional[int] = None,
                  _: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = db.get(Client, client_id)
    if not c:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    today = date.today()
    year, month = year or today.year, month or today.month
    if not 1 <= month <= 12 or not 2000 <= year <= 2100:
        raise HTTPException(status_code=422, detail="Periodo non valido")
    pdf = build_pdf(db, c, year, month)
    safe = "".join(ch if ch.isalnum() else "_" for ch in c.name)[:40] or "cliente"
    return StreamingResponse(BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="report_{safe}_{year}-{month:02d}.pdf"'})
