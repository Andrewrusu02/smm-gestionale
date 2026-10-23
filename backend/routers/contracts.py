from calendar import monthrange
from datetime import date, datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import Client, Contract, Payment, Task, User, WorkLog, utcnow
from security import get_current_user, require_admin
from services import period_of
from services import apply_task_status

router = APIRouter()


class ContractIn(BaseModel):
    client_id: int
    type: Literal["SUBSCRIPTION", "SINGLE_JOB"]
    title: str = Field(min_length=1, max_length=255)
    start_date: Optional[date] = None
    price: float = Field(default=0, ge=0)
    billing_frequency: Optional[str] = None
    due_date: Optional[date] = None
    assigned_to: Optional[int] = None
    description: Optional[str] = None


class CompleteTaskIn(BaseModel):
    completed_by: Optional[int] = None
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None
    client_revenue: float = Field(default=0, ge=0)
    worker_expense: float = Field(default=0, ge=0)


def _task_out(task):
    return {
        **task.to_dict(),
        "client_name": task.client.name if task.client else None,
        "assignee_name": task.assignee.name if task.assignee else None,
        "contract_title": task.contract.title if task.contract else None,
    }


def _contract_out(contract):
    return {
        **contract.to_dict(),
        "client_name": contract.client.name if contract.client else None,
        "task_ids": [task.id for task in contract.tasks],
    }


@router.get("/contracts")
def list_contracts(client_id: Optional[int] = None, _: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    query = db.query(Contract)
    if client_id:
        query = query.filter(Contract.client_id == client_id)
    return [_contract_out(c) for c in query.order_by(Contract.created_at.desc()).all()]


@router.post("/contracts")
def create_contract(body: ContractIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    client = db.get(Client, body.client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    if body.type == "SINGLE_JOB" and not body.due_date:
        raise HTTPException(status_code=422, detail="La data di esecuzione è obbligatoria per un lavoro singolo")
    if body.type == "SUBSCRIPTION" and not body.billing_frequency:
        body.billing_frequency = "MONTHLY"
    if body.assigned_to and not db.get(User, body.assigned_to):
        raise HTTPException(status_code=404, detail="Operatore non trovato")
    contract = Contract(
        client_id=client.id, type=body.type, title=body.title, price=body.price,
        billing_frequency=body.billing_frequency,         due_date=body.due_date, description=body.description, start_date=body.start_date,
    )
    db.add(contract)
    db.flush()
    if body.type == "SINGLE_JOB":
        task = Task(
            client_id=client.id, contract_id=contract.id, title=body.title,
            description=body.description, due_date=body.due_date, 
            assigned_to_id=body.assigned_to, created_by=user.id,
            price_charged_to_client=body.price, activity_type="SINGLE_JOB",
            auto_generated=True, status="da_fare",
        )
        db.add(task)
        db.flush()
        if body.price is not None:
            db.add(Payment(
                client_id=client.id, task_id=task.id, kind="single_job",
                description=f"Lavoro: {body.title}", amount=body.price,
                due_date=body.due_date or date.today(), period=period_of(body.due_date or date.today()),
                status="in_attesa",
            ))
    db.commit()
    db.refresh(contract)
    return _contract_out(contract)


@router.get("/contracts/{contract_id}")
def get_contract(contract_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    contract = db.get(Contract, contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="Contratto non trovato")
    return _contract_out(contract)


@router.get("/business-tasks")
def list_business_tasks(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tasks = db.query(Task).filter(Task.contract_id.isnot(None), Task.status != "completato").order_by(
        Task.due_date.is_(None), Task.due_date, Task.id.desc()
    ).all()
    return [_task_out(task) for task in tasks]


@router.post("/tasks/{task_id}/complete")
def complete_task(task_id: int, body: CompleteTaskIn, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task or task.status == "completato":
        raise HTTPException(status_code=404, detail="Task attivo non trovato")
    completed_by = body.completed_by or user.id
    if user.role != "admin" and completed_by != user.id:
        raise HTTPException(status_code=403, detail="Puoi registrare solo il tuo lavoro")
    operator = db.get(User, completed_by)
    if not operator:
        raise HTTPException(status_code=404, detail="Operatore non trovato")
    completed_at = body.completed_at or utcnow()
    log = WorkLog(
        user_id=operator.id, completed_by_id=operator.id, client_id=task.client_id,
        contract_id=task.contract_id, task_title=task.title,
        date=completed_at.date(), completed_at=completed_at, description=task.title,
        notes=body.notes, revenue_amount=body.client_revenue,
        worker_expense=body.worker_expense, cost=body.worker_expense,
        task_id=task.id,
    )
    db.add(log)
    apply_task_status(task, "completato")
    db.commit()
    return {"work_log": {**log.to_dict(), "operator_name": operator.name}, "task_removed": True}


def _bounds(year: int, month: int):
    return date(year, month, 1), date(year, month, monthrange(year, month)[1])


def _report(db, start, end):
    logs = db.query(WorkLog).filter(WorkLog.date >= start, WorkLog.date <= end).all()
    subscriptions = sum(log.revenue_amount or 0 for log in logs
                        if log.contract and log.contract.type == "SUBSCRIPTION")
    single_jobs = sum(log.revenue_amount or 0 for log in logs
                      if not log.contract or log.contract.type == "SINGLE_JOB")
    return {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "completed_jobs": len(logs),
        "subscription_revenue": round(float(subscriptions), 2),
        "single_job_revenue": round(float(single_jobs), 2),
        "total_revenue": round(float(subscriptions) + single_jobs, 2),
        "total_worker_expense": round(sum(log.worker_expense or 0 for log in logs), 2),
        "by_operator": _group(logs, lambda log: log.user.name if log.user else "Sconosciuto"),
        "by_client": _group(logs, lambda log: log.client.name if log.client else "Sconosciuto"),
        "logs": [{
            **log.to_dict(),
            "operator_name": log.user.name if log.user else None,
            "client_name": log.client.name if log.client else None,
        } for log in logs],
    }


def _group(logs, key):
    result = {}
    for log in logs:
        name = key(log)
        item = result.setdefault(name, {"name": name, "jobs": 0, "revenue": 0, "worker_expense": 0})
        item["jobs"] += 1
        item["revenue"] += log.revenue_amount or 0
        item["worker_expense"] += log.worker_expense or 0
    return sorted(({**item, "revenue": round(item["revenue"], 2),
                    "worker_expense": round(item["worker_expense"], 2)} for item in result.values()),
                  key=lambda item: item["revenue"], reverse=True)


@router.get("/reports/monthly")
def monthly_report(year: int, month: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    if month < 1 or month > 12:
        raise HTTPException(status_code=422, detail="Mese non valido")
    return _report(db, *_bounds(year, month))


@router.get("/reports/annual")
def annual_report(year: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    months = []
    for month in range(1, 13):
        report = _report(db, *_bounds(year, month))
        months.append({
            "month": month, "completed_jobs": report["completed_jobs"],
            "subscription_revenue": report["subscription_revenue"],
            "single_job_revenue": report["single_job_revenue"],
            "total_revenue": report["total_revenue"],
            "total_worker_expense": report["total_worker_expense"],
        })
    start, end = _bounds(year, 1)[0], _bounds(year, 12)[1]
    year_logs = db.query(WorkLog).filter(WorkLog.date >= start, WorkLog.date <= end).all()
    subscription_revenue = round(sum(x["subscription_revenue"] for x in months), 2)
    single_job_revenue = round(sum(x["single_job_revenue"] for x in months), 2)
    return {
        "year": year, "months": months, "total_jobs": sum(x["completed_jobs"] for x in months),
        "subscription_revenue": subscription_revenue, "single_job_revenue": single_job_revenue,
        "total_revenue": round(subscription_revenue + single_job_revenue, 2),
        "total_worker_expense": round(sum(log.worker_expense or 0 for log in year_logs), 2),
        "by_operator": _group(year_logs, lambda log: log.user.name if log.user else "Sconosciuto"),
        "by_client": _group(year_logs, lambda log: log.client.name if log.client else "Sconosciuto"),
    }
