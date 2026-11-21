"""Previsione incassi a 3 mesi (mese corrente + i due successivi).

Entrate:  rate degli abbonamenti attivi non ancora emesse, pagamenti in attesa (quelli scaduti finiscono nel
          primo mese) e lavori singoli aperti senza ancora un pagamento collegato.
Uscite:   compensi del team non ancora saldati (nel primo mese) e spese generali ricorrenti.
"""
from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from expenses import amount_in_month
from models import Client, Expense, Payment, Task, User, WorkLog
from security import require_admin
from services import package_for, period_of, shift_period

router = APIRouter()


def build_forecast(db, months: int = 3, today: date | None = None):
    today = today or date.today()
    first = period_of(today)
    periods = [shift_period(first, i) for i in range(months)]

    def bucket(d: date | None) -> str | None:
        """Mese della previsione per una data: il passato e le date mancanti vanno nel primo mese."""
        if d is None:
            return first
        p = period_of(d)
        if p < first:
            return first
        return p if p in periods else None

    rows = {p: {"period": p, "subscriptions": 0.0, "pending_payments": 0.0, "single_jobs": 0.0,
                "team_payouts": 0.0, "recurring_expenses": 0.0, "details": defaultdict(list)} for p in periods}

    def add(period, key, amount, label):
        if period and amount:
            rows[period][key] += amount
            rows[period]["details"][key].append({"label": label, "amount": round(amount, 2)})

    unpaid = db.query(Payment).filter(Payment.status != "saldato", Payment.amount > 0).all()
    for p in unpaid:
        add(bucket(p.due_date), "pending_payments", p.amount,
            f"{p.client.name if p.client else 'Cliente'} · {p.description or 'Pagamento'}"
            + (" (scaduto)" if p.due_date < today else ""))

    sub_periods = {(p.client_id, p.period) for p in db.query(Payment).filter(Payment.kind == "abbonamento").all()}
    for c in db.query(Client).filter(Client.active.is_(True), Client.status != "INACTIVE").all():
        pkg = package_for(c)
        if not pkg or not pkg.get("price"):
            continue
        start = period_of(c.start_date) if c.start_date else first
        for period in periods:
            if period >= start and (c.id, period) not in sub_periods:
                add(period, "subscriptions", float(pkg["price"]), f"{c.name} · pacchetto {pkg['name']}")

    open_jobs = db.query(Task).filter(Task.status != "completato", Task.subscription_included.is_(False),
                                      Task.price_charged_to_client > 0).all()
    for t in open_jobs:
        if any(p.deleted_at is None for p in t.payments):
            continue  # già conteggiato tra i pagamenti in attesa
        add(bucket(t.due_date), "single_jobs", t.price_charged_to_client,
            f"{t.client.name + ' · ' if t.client else ''}{t.title}")

    owed = defaultdict(float)
    for w in db.query(WorkLog).filter(WorkLog.team_paid.is_(False), WorkLog.worker_expense > 0).all():
        owed[w.user.name if w.user else "Collaboratore"] += w.worker_expense
    for name, amount in owed.items():
        add(first, "team_payouts", amount, f"Compensi da saldare a {name}")

    for e in db.query(Expense).filter(Expense.kind == "recurring").all():
        for period in periods:
            y, m = map(int, period.split("-"))
            add(period, "recurring_expenses", amount_in_month(e, y, m), e.title)

    out, cumulative = [], 0.0
    for p in periods:
        r = rows[p]
        inflow = r["subscriptions"] + r["pending_payments"] + r["single_jobs"]
        outflow = r["team_payouts"] + r["recurring_expenses"]
        cumulative += inflow - outflow
        out.append({
            "period": p,
            **{k: round(r[k], 2) for k in ("subscriptions", "pending_payments", "single_jobs", "team_payouts", "recurring_expenses")},
            "inflow": round(inflow, 2), "outflow": round(outflow, 2), "net": round(inflow - outflow, 2),
            "cumulative": round(cumulative, 2),
            "details": {k: sorted(v, key=lambda x: -x["amount"]) for k, v in r["details"].items()},
        })
    return {"months": out, "totals": {
        "inflow": round(sum(m["inflow"] for m in out), 2), "outflow": round(sum(m["outflow"] for m in out), 2),
        "net": round(sum(m["net"] for m in out), 2)}}


@router.get("/forecast")
def forecast(months: int = 3, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    return build_forecast(db, max(1, min(months, 12)))
