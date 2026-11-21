from datetime import date

from models import Client, Expense, Payment, Task, WorkLog
from routers.forecast import build_forecast

TODAY = date(2026, 5, 10)


def test_forecast_three_months(db_session, employee):
    db = db_session
    sub = Client(name="Abbonato", package="standard", start_date=date(2026, 1, 1), active=True, status="ACTIVE")
    late_start = Client(name="Parte a giugno", package="silver", start_date=date(2026, 6, 1), active=True, status="ACTIVE")
    inactive = Client(name="Spento", package="premium", start_date=date(2026, 1, 1), active=False, status="INACTIVE")
    db.add_all([sub, late_start, inactive])
    db.flush()
    # Maggio: rata abbonamento già emessa e in attesa -> non va contata due volte.
    db.add(Payment(client_id=sub.id, kind="abbonamento", period="2026-05", amount=300, due_date=date(2026, 5, 31), status="in_attesa"))
    db.add(Payment(client_id=sub.id, kind="single_job", amount=50, due_date=date(2026, 3, 1), status="in_ritardo"))  # scaduto
    db.add(Payment(client_id=sub.id, kind="single_job", amount=80, due_date=date(2026, 7, 15), status="in_attesa"))
    db.add(Payment(client_id=sub.id, kind="single_job", amount=999, due_date=date(2026, 5, 1), status="saldato"))
    db.add(Payment(client_id=sub.id, kind="single_job", amount=200, due_date=date(2026, 9, 1), status="in_attesa"))  # oltre
    db.add(Task(title="Video aperto", client_id=sub.id, price_charged_to_client=120, due_date=date(2026, 6, 20), status="da_fare"))
    db.add(Task(title="Fatto", client_id=sub.id, price_charged_to_client=70, due_date=date(2026, 6, 20), status="completato"))
    db.add(WorkLog(user_id=employee.id, date=date(2026, 4, 2), description="x", worker_expense=40, team_paid=False))
    db.add(WorkLog(user_id=employee.id, date=date(2026, 4, 2), description="y", worker_expense=60, team_paid=True))
    db.add(Expense(title="Software", category="software", amount=25, kind="recurring", date=date(2026, 1, 1), frequency="monthly"))
    db.add(Expense(title="Assicurazione", category="altro", amount=90, kind="recurring", date=date(2026, 4, 1), frequency="quarterly"))
    db.commit()

    f = build_forecast(db, 3, today=TODAY)
    may, jun, jul = f["months"]
    assert [m["period"] for m in f["months"]] == ["2026-05", "2026-06", "2026-07"]
    assert may["subscriptions"] == 0 and may["pending_payments"] == 350  # 300 rata + 50 scaduto
    assert jun["subscriptions"] == 300 + 400 and jun["single_jobs"] == 120
    assert jul["subscriptions"] == 700 and jul["pending_payments"] == 80 and jul["recurring_expenses"] == 25 + 90
    assert may["team_payouts"] == 40 and jun["team_payouts"] == 0
    assert may["recurring_expenses"] == 25
    assert may["net"] == round(350 - 65, 2)
    assert jul["cumulative"] == round(may["net"] + jun["net"] + jul["net"], 2)


def test_forecast_api(client, admin_headers, employee_headers):
    assert client.get("/api/forecast", headers=employee_headers).status_code == 403
    r = client.get("/api/forecast", headers=admin_headers)
    assert r.status_code == 200 and len(r.json()["months"]) == 3
