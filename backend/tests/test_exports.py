from datetime import date
from io import BytesIO

from openpyxl import load_workbook

from models import Client, Expense, Payment, WorkLog


def test_accountant_export(client, admin_headers, employee_headers, db_session, employee):
    db = db_session
    c = Client(name="Bar Centrale")
    db.add(c)
    db.flush()
    db.add_all([
        Payment(client_id=c.id, kind="single_job", amount=100, due_date=date(2026, 2, 1), paid_date=date(2026, 2, 3),
                status="saldato", invoice_number="FT-1"),
        Payment(client_id=c.id, kind="abbonamento", amount=300, due_date=date(2026, 3, 1), paid_date=date(2026, 3, 2),
                status="saldato", invoice_number="FT-2"),
        Payment(client_id=c.id, kind="single_job", amount=999, due_date=date(2026, 2, 1), status="in_attesa"),
        Payment(client_id=c.id, kind="single_job", amount=50, due_date=date(2026, 5, 1), paid_date=date(2026, 5, 1),
                status="saldato"),  # fuori periodo
        WorkLog(user_id=employee.id, client_id=c.id, date=date(2026, 2, 10), description="Reel", worker_expense=40,
                team_paid=True, team_paid_at=date(2026, 3, 1)),
        WorkLog(user_id=employee.id, date=date(2026, 2, 12), description="Legacy", worker_expense=10, team_paid=True),
        WorkLog(user_id=employee.id, date=date(2026, 2, 12), description="Da pagare", worker_expense=25, team_paid=False),
        Expense(title="Software", category="software", amount=20, kind="recurring", date=date(2026, 1, 31), frequency="monthly"),
        Expense(title="Monitor", category="attrezzatura", amount=200, kind="one_off", date=date(2026, 3, 15)),
    ])
    db.commit()

    assert client.get("/api/exports/accountant?date_from=2026-02-01", headers=employee_headers).status_code == 403
    assert client.get("/api/exports/accountant?date_from=2026-03-01&date_to=2026-02-01",
                      headers=admin_headers).status_code == 422
    r = client.get("/api/exports/accountant?date_from=2026-02-01&date_to=2026-03-31", headers=admin_headers)
    assert r.status_code == 200
    assert "commercialista_20260201_20260331.xlsx" in r.headers["content-disposition"]
    wb = load_workbook(BytesIO(r.content))
    assert wb.sheetnames == ["Riepilogo", "Incassi", "Compensi team", "Spese generali"]

    incassi = [row for row in wb["Incassi"].iter_rows(min_row=2, values_only=True) if row[0] and row[0] != "Totale"]
    assert [(r[2], r[5]) for r in incassi] == [("FT-1", 100), ("FT-2", 300)]
    assert incassi[0][1] == "Bar Centrale"

    team = [row for row in wb["Compensi team"].iter_rows(min_row=2, values_only=True) if row[0] and row[0] != "Totale"]
    assert sorted(r[5] for r in team) == [10, 40]

    spese = [row for row in wb["Spese generali"].iter_rows(min_row=2, values_only=True) if row[0] and row[0] != "Totale"]
    # Ricorrente al 31: a febbraio scala al 28.
    assert [(r[0].date().isoformat(), r[5]) for r in spese] == [("2026-02-28", 20), ("2026-03-15", 200), ("2026-03-31", 20)]

    summary = {row[0]: row[2] for row in wb["Riepilogo"].iter_rows(min_row=5, values_only=True) if row[0]}
    assert summary["Incassi (pagamenti saldati)"] == 400
    assert summary["Compensi pagati al team"] == 50
    assert summary["Spese generali"] == 240
    assert summary["Risultato (incassi − compensi − spese)"] == 110
