"""Calcolo delle spese generali per mese (ricorrenti e una tantum)."""
from calendar import monthrange
from datetime import date

CATEGORIES = {
    "software": "Abbonamenti software", "affitto": "Affitto", "utenze": "Utenze", "attrezzatura": "Attrezzatura",
    "marketing": "Pubblicità e marketing", "consulenze": "Consulenze e commercialista", "trasporti": "Trasporti",
    "formazione": "Formazione", "altro": "Altro",
}
FREQUENCIES = {"monthly": ("Mensile", 1), "quarterly": ("Trimestrale", 3), "yearly": ("Annuale", 12)}


def _idx(d: date) -> int:
    return d.year * 12 + d.month - 1


def amount_in_month(e, year: int, month: int) -> float:
    """Quanto pesa la spesa ``e`` nel mese indicato."""
    target = year * 12 + month - 1
    if e.kind != "recurring":
        return float(e.amount or 0) if _idx(e.date) == target else 0.0
    start = _idx(e.date)
    if target < start:
        return 0.0
    if e.end_date and target > _idx(e.end_date):
        return 0.0
    step = FREQUENCIES.get(e.frequency or "monthly", FREQUENCIES["monthly"])[1]
    return float(e.amount or 0) if (target - start) % step == 0 else 0.0


def monthly_equivalent(e) -> float:
    if e.kind != "recurring":
        return 0.0
    return round(float(e.amount or 0) / FREQUENCIES.get(e.frequency or "monthly", FREQUENCIES["monthly"])[1], 2)


def total_in_month(expenses, year: int, month: int) -> float:
    return round(sum(amount_in_month(e, year, month) for e in expenses), 2)


def month_end(year: int, month: int) -> date:
    return date(year, month, monthrange(year, month)[1])
