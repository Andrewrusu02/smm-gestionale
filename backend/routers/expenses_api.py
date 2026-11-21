from collections import defaultdict
import datetime as _dt
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from database import get_db
from expenses import CATEGORIES, FREQUENCIES, amount_in_month, monthly_equivalent
from models import Expense, User
from security import require_admin

router = APIRouter()


class ExpenseIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    category: str = "altro"
    amount: float = Field(ge=0)
    kind: Literal["recurring", "one_off"] = "one_off"
    date: _dt.date  # alias: un campo chiamato "date" oscura il tipo date in Pydantic
    frequency: Optional[Literal["monthly", "quarterly", "yearly"]] = None
    end_date: Optional[_dt.date] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _check(self):
        if self.category not in CATEGORIES:
            raise ValueError("Categoria non valida")
        if self.kind == "recurring":
            self.frequency = self.frequency or "monthly"
            if self.end_date and self.end_date < self.date:
                raise ValueError("La data di fine è precedente a quella di inizio")
        else:
            self.frequency, self.end_date = None, None
        return self


def _out(e: Expense):
    d = e.to_dict()
    d["category_label"] = CATEGORIES.get(e.category, e.category)
    d["frequency_label"] = FREQUENCIES[e.frequency][0] if e.frequency in FREQUENCIES else None
    d["monthly_equivalent"] = monthly_equivalent(e)
    return d


def _get(db, eid) -> Expense:
    e = db.get(Expense, eid)
    if not e:
        raise HTTPException(status_code=404, detail="Spesa non trovata")
    return e


@router.get("/expenses/meta")
def meta(_: User = Depends(require_admin)):
    return {"categories": [{"key": k, "label": v} for k, v in CATEGORIES.items()],
            "frequencies": [{"key": k, "label": v[0]} for k, v in FREQUENCIES.items()]}


@router.get("/expenses")
def list_expenses(kind: Optional[str] = None, category: Optional[str] = None,
                  _: User = Depends(require_admin), db: Session = Depends(get_db)):
    q = db.query(Expense)
    if kind:
        q = q.filter(Expense.kind == kind)
    if category:
        q = q.filter(Expense.category == category)
    return [_out(e) for e in q.order_by(Expense.kind.desc(), Expense.date.desc(), Expense.id.desc()).all()]


@router.get("/expenses/summary")
def summary(year: Optional[int] = None, month: Optional[int] = None,
            _: User = Depends(require_admin), db: Session = Depends(get_db)):
    today = date.today()
    year, month = year or today.year, month or today.month
    if not 1 <= month <= 12:
        raise HTTPException(status_code=422, detail="Mese non valido")
    expenses = db.query(Expense).all()
    by_cat = defaultdict(lambda: {"month": 0.0, "year": 0.0})
    months = [0.0] * 12
    for e in expenses:
        m = amount_in_month(e, year, month)
        by_cat[e.category]["month"] += m
        for i in range(12):
            a = amount_in_month(e, year, i + 1)
            by_cat[e.category]["year"] += a
            months[i] += a
    rows = [{"category": k, "label": CATEGORIES.get(k, k), "month": round(v["month"], 2), "year": round(v["year"], 2)}
            for k, v in by_cat.items() if v["month"] or v["year"]]
    rows.sort(key=lambda r: (-r["year"], r["label"]))
    return {
        "year": year, "month": month,
        "month_total": round(sum(r["month"] for r in rows), 2),
        "year_total": round(sum(months), 2),
        "recurring_monthly": round(sum(monthly_equivalent(e) for e in expenses
                                       if e.kind == "recurring" and (not e.end_date or e.end_date >= today)), 2),
        "by_category": rows,
        "by_month": [{"month": i + 1, "total": round(v, 2)} for i, v in enumerate(months)],
    }


@router.post("/expenses")
def create_expense(body: ExpenseIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    e = Expense(**body.model_dump())
    db.add(e)
    db.commit()
    return _out(e)


@router.put("/expenses/{eid}")
def update_expense(eid: int, body: ExpenseIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    e = _get(db, eid)
    for k, v in body.model_dump().items():
        setattr(e, k, v)
    db.commit()
    return _out(e)


@router.delete("/expenses/{eid}")
def delete_expense(eid: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    db.delete(_get(db, eid))
    db.commit()
    return {"ok": True}
