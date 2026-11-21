"""Esportazione Excel per il commercialista: incassi, compensi pagati al team, spese generali e riepilogo."""
from calendar import monthrange
from datetime import date
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from expenses import CATEGORIES, amount_in_month
from models import Expense, Payment, User, WorkLog
from security import require_admin

router = APIRouter()
EUR = '#,##0.00 "€"'
DATE = "DD/MM/YYYY"


def expense_occurrences(expenses, start: date, end: date):
    """Ogni addebito delle spese nel periodo: (data, spesa, importo)."""
    out = []
    for e in expenses:
        if e.kind != "recurring":
            if start <= e.date <= end:
                out.append((e.date, e, float(e.amount or 0)))
            continue
        y, m = start.year, start.month
        while (y, m) <= (end.year, end.month):
            amount = amount_in_month(e, y, m)
            if amount:
                day = date(y, m, min(e.date.day, monthrange(y, m)[1]))
                if start <= day <= end:
                    out.append((day, e, amount))
            y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return sorted(out, key=lambda x: (x[0], x[1].title))


def collect(db, start: date, end: date):
    payments = db.query(Payment).filter(Payment.status == "saldato", Payment.paid_date >= start,
                                        Payment.paid_date <= end).order_by(Payment.paid_date, Payment.id).all()
    # Compensi pagati: data del saldo; per i saldi registrati prima della data di saldo si usa la data del lavoro.
    logs = [w for w in db.query(WorkLog).filter(WorkLog.team_paid.is_(True), WorkLog.worker_expense > 0).all()
            if start <= (w.team_paid_at or w.date) <= end]
    logs.sort(key=lambda w: ((w.team_paid_at or w.date), w.id))
    expenses = expense_occurrences(db.query(Expense).all(), start, end)
    return payments, logs, expenses


def build_workbook(db, start: date, end: date) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    payments, logs, expenses = collect(db, start, end)
    wb = Workbook()
    head_font, head_fill = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor="4F46E5")

    def sheet(ws, title, headers, rows, money_cols, date_cols, widths):
        ws.title = title
        ws.append(headers)
        for cell in ws[1]:
            cell.font, cell.fill = head_font, head_fill
            cell.alignment = Alignment(vertical="center")
        for r in rows:
            ws.append(r)
        n = len(rows)
        if n:
            ws.append([])
            total_row = ws.max_row + 1
            ws.cell(total_row, 1, "Totale").font = Font(bold=True)
            for col in money_cols:
                letter = get_column_letter(col)
                c = ws.cell(total_row, col, f"=SUM({letter}2:{letter}{n + 1})")
                c.font, c.number_format = Font(bold=True), EUR
        for row in ws.iter_rows(min_row=2, max_row=n + 1):
            for col in money_cols:
                row[col - 1].number_format = EUR
            for col in date_cols:
                row[col - 1].number_format = DATE
        for i, w in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(i)].width = w
        ws.freeze_panes = "A2"

    summary = wb.active
    ws_in = wb.create_sheet()
    sheet(ws_in, "Incassi", ["Data incasso", "Cliente", "N. fattura", "Descrizione", "Tipo", "Importo"],
          [[p.paid_date, p.client.name if p.client else "", p.invoice_number or "", p.description or "",
            "Abbonamento" if p.kind == "abbonamento" else "Lavoro singolo", float(p.amount or 0)] for p in payments],
          [6], [1], [14, 28, 14, 40, 16, 14])
    ws_team = wb.create_sheet()
    sheet(ws_team, "Compensi team", ["Data saldo", "Collaboratore", "Lavoro", "Cliente", "Data lavoro", "Compenso"],
          [[w.team_paid_at or w.date, w.user.name if w.user else "", w.task_title or w.description or "",
            w.client.name if w.client else "", w.date, float(w.worker_expense or 0)] for w in logs],
          [6], [1, 5], [14, 24, 40, 28, 14, 14])
    ws_exp = wb.create_sheet()
    sheet(ws_exp, "Spese generali", ["Data", "Descrizione", "Categoria", "Tipo", "Note", "Importo"],
          [[d, e.title, CATEGORIES.get(e.category, e.category), "Ricorrente" if e.kind == "recurring" else "Una tantum",
            e.notes or "", amount] for d, e, amount in expenses],
          [6], [1], [14, 34, 26, 14, 30, 14])

    total_in = round(sum(float(p.amount or 0) for p in payments), 2)
    total_team = round(sum(float(w.worker_expense or 0) for w in logs), 2)
    total_exp = round(sum(a for _, _, a in expenses), 2)
    summary.title = "Riepilogo"
    summary["A1"] = "Riepilogo per il commercialista"
    summary["A1"].font = Font(bold=True, size=14)
    summary["A2"] = f"Periodo: dal {start:%d/%m/%Y} al {end:%d/%m/%Y}"
    rows = [("Incassi (pagamenti saldati)", len(payments), total_in),
            ("Compensi pagati al team", len(logs), total_team),
            ("Spese generali", len(expenses), total_exp)]
    summary.append([])
    summary.append(["Voce", "N. movimenti", "Totale"])
    for cell in summary[4]:
        cell.font, cell.fill = head_font, head_fill
    for r in rows:
        summary.append(list(r))
    summary.append(["Risultato (incassi − compensi − spese)", None, round(total_in - total_team - total_exp, 2)])
    summary.cell(summary.max_row, 1).font = Font(bold=True)
    summary.cell(summary.max_row, 3).font = Font(bold=True)
    for row in summary.iter_rows(min_row=5, max_row=summary.max_row):
        row[2].number_format = EUR
    summary.column_dimensions["A"].width = 40
    summary.column_dimensions["B"].width = 14
    summary.column_dimensions["C"].width = 16
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


@router.get("/exports/accountant")
def accountant_export(date_from: date, date_to: Optional[date] = None,
                      _: User = Depends(require_admin), db: Session = Depends(get_db)):
    date_to = date_to or date.today()
    if date_from > date_to:
        raise HTTPException(status_code=422, detail="La data iniziale è successiva a quella finale")
    content = build_workbook(db, date_from, date_to)
    name = f"commercialista_{date_from:%Y%m%d}_{date_to:%Y%m%d}.xlsx"
    return StreamingResponse(BytesIO(content),
                             media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})
