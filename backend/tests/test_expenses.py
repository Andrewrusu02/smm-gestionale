from datetime import date
from types import SimpleNamespace

from expenses import amount_in_month, monthly_equivalent


def E(**kw):
    base = dict(kind="recurring", amount=30, date=date(2026, 1, 15), frequency="monthly", end_date=None)
    base.update(kw)
    return SimpleNamespace(**base)


def test_amount_in_month_rules():
    monthly = E()
    assert amount_in_month(monthly, 2025, 12) == 0
    assert amount_in_month(monthly, 2026, 1) == 30 and amount_in_month(monthly, 2026, 7) == 30
    ended = E(end_date=date(2026, 3, 31))
    assert amount_in_month(ended, 2026, 3) == 30 and amount_in_month(ended, 2026, 4) == 0
    quarterly = E(amount=90, frequency="quarterly")
    assert [amount_in_month(quarterly, 2026, m) for m in range(1, 8)] == [90, 0, 0, 90, 0, 0, 90]
    yearly = E(amount=120, frequency="yearly")
    assert amount_in_month(yearly, 2027, 1) == 120 and amount_in_month(yearly, 2027, 2) == 0
    once = E(kind="one_off", amount=800, date=date(2026, 5, 3), frequency=None)
    assert amount_in_month(once, 2026, 5) == 800 and amount_in_month(once, 2026, 6) == 0
    assert monthly_equivalent(quarterly) == 30 and monthly_equivalent(once) == 0


def test_expenses_crud_summary_and_real_profit(client, admin_headers, employee_headers, employee):
    t = date.today()
    assert client.get("/api/expenses", headers=employee_headers).status_code == 403
    r = client.post("/api/expenses", headers=admin_headers, json={
        "title": "Adobe", "category": "software", "amount": 60, "kind": "recurring",
        "date": date(t.year, 1, 1).isoformat(), "frequency": "monthly"})
    assert r.status_code == 200, r.text
    client.post("/api/expenses", headers=admin_headers, json={
        "title": "Microfono", "category": "attrezzatura", "amount": 150, "kind": "one_off", "date": t.isoformat(),
        "frequency": "yearly"})  # la frequenza viene ignorata per le spese una tantum
    assert client.post("/api/expenses", headers=admin_headers, json={
        "title": "X", "category": "inventata", "amount": 1, "date": t.isoformat()}).status_code == 422
    items = client.get("/api/expenses", headers=admin_headers).json()
    assert {i["title"]: i["frequency"] for i in items} == {"Adobe": "monthly", "Microfono": None}

    s = client.get(f"/api/expenses/summary?year={t.year}&month={t.month}", headers=admin_headers).json()
    assert s["month_total"] == 210
    assert {r["category"]: r["month"] for r in s["by_category"]} == {"software": 60, "attrezzatura": 150}
    assert s["year_total"] == 60 * 12 + 150
    assert s["recurring_monthly"] == 60

    # Utile reale = fatturato − compensi − spese generali.
    client.post("/api/worklogs", headers=admin_headers, json={
        "date": t.isoformat(), "description": "Reel", "user_id": employee.id, "worker_payout": 100, "client_revenue": 500})
    k = client.get(f"/api/dashboard?month={t.month}&year={t.year}", headers=admin_headers).json()["kpi"]
    assert k["fatturato_mese"] == 500 and k["spese_mese"] == 100
    assert k["spese_generali_mese"] == 210 and k["utile_reale_mese"] == 190

    eid = items[0]["id"]
    upd = client.put(f"/api/expenses/{eid}", headers=admin_headers, json={**items[0], "amount": 70})
    assert upd.status_code == 200 and upd.json()["amount"] == 70
    assert client.delete(f"/api/expenses/{eid}", headers=admin_headers).status_code == 200
    assert len(client.get("/api/expenses", headers=admin_headers).json()) == 1
