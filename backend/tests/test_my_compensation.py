from datetime import date

from models import WorkLog


def test_employee_sees_only_own_compensation(client, employee_headers, admin_headers, db_session, employee, admin):
    db = db_session
    db.add_all([
        WorkLog(user_id=employee.id, date=date(2026, 3, 3), description="Reel A", worker_expense=40),  # marzo, da ricevere
        WorkLog(user_id=employee.id, date=date(2026, 3, 9), description="Reel B", worker_expense=60,
                team_paid=True, team_paid_at=date(2026, 3, 20)),  # marzo, ricevuto a marzo
        WorkLog(user_id=employee.id, date=date(2026, 2, 10), description="Vecchio", worker_expense=25),  # febbraio, da ricevere
        WorkLog(user_id=employee.id, date=date(2026, 2, 11), description="Saldato ad aprile", worker_expense=30,
                team_paid=True, team_paid_at=date(2026, 4, 2)),
        WorkLog(user_id=employee.id, date=date(2026, 3, 15), description="Nel cestino", worker_expense=999),
        WorkLog(user_id=admin.id, date=date(2026, 3, 4), description="Admin", worker_expense=500),
    ])
    db.commit()
    trashed = db.query(WorkLog).filter_by(description="Nel cestino").one()
    client.delete(f"/api/work-logs/{trashed.id}", headers=admin_headers)

    r = client.get("/api/me/compensation?year=2026&month=3", headers=employee_headers).json()
    assert r["period"] == "2026-03"
    assert (r["accrued_month"], r["accrued_count"]) == (100, 2)
    assert (r["pending_total"], r["pending_count"]) == (65, 2)
    assert (r["received_month"], r["received_count"]) == (60, 1)
    assert r["received_total"] == 90
    titles = {x["title"] for x in r["month_logs"] + r["pending_logs"]}
    assert "Admin" not in titles and "Nel cestino" not in titles
    apr = client.get("/api/me/compensation?year=2026&month=4", headers=employee_headers).json()
    assert apr["received_month"] == 30 and apr["accrued_month"] == 0
