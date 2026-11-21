"""Il cestino: gli elementi eliminati spariscono da elenchi, totali, dashboard e notifiche e si possono ripristinare."""
from datetime import date, timedelta

from models import Client, Payment, Task, WorkLog
from trash import include_deleted, purge_expired

TODAY = date.today()


def _client(client, h, name="Cliente Cestino", **kw):
    r = client.post("/api/clients", headers=h, json={"name": name, **kw})
    assert r.status_code == 200, r.text
    return r.json()


def _payment(client, h, cid, amount, days=-3, paid=False):
    p = client.post("/api/payments", headers=h, json={
        "client_id": cid, "amount": amount, "due_date": (TODAY + timedelta(days=days)).isoformat()}).json()
    if paid:
        client.post(f"/api/payments/{p['id']}/mark-paid", headers=h, json={"paid_date": TODAY.isoformat()})
    return p


def _worklog(client, h, user_id, cid, revenue, payout):
    r = client.post("/api/work-logs".replace("work-logs", "worklogs"), headers=h, json={
        "client_id": cid, "date": TODAY.isoformat(), "description": "Lavoro", "user_id": user_id,
        "worker_payout": payout, "client_revenue": revenue})
    assert r.status_code == 200, r.text
    return r.json()


def _dash(client, h):
    return client.get(f"/api/dashboard?month={TODAY.month}&year={TODAY.year}", headers=h).json()


def _trash_entry(client, h, entity, oid):
    items = client.get("/api/trash", headers=h).json()["items"]
    return next(i for i in items if i["entity"] == entity and i["id"] == oid)


def test_deleted_payments_are_excluded_from_totals(client, admin_headers):
    c = _client(client, admin_headers)
    paid = _payment(client, admin_headers, c["id"], 300, paid=True)
    late = _payment(client, admin_headers, c["id"], 120, days=-10)
    before = _dash(client, admin_headers)
    assert before["kpi"]["incassato_mese"] == 300
    assert before["kpi"]["ritardi_importo"] == 120
    assert any(n["id"] == f"pay-late-{late['id']}" for n in client.get("/api/notifications", headers=admin_headers).json())

    assert client.delete(f"/api/payments/{paid['id']}", headers=admin_headers).status_code == 200
    assert client.delete(f"/api/payments/{late['id']}", headers=admin_headers).status_code == 200

    after = _dash(client, admin_headers)
    assert after["kpi"]["incassato_mese"] == 0
    assert after["kpi"]["ritardi_importo"] == 0 and after["kpi"]["ritardi_count"] == 0
    assert client.get("/api/payments", headers=admin_headers).json() == []
    detail = client.get(f"/api/clients/{c['id']}", headers=admin_headers).json()
    assert detail["paid_amount"] == 0 and detail["total_amount"] == 0 and detail["payments"] == []
    assert not any(n["id"].startswith("pay-") for n in client.get("/api/notifications", headers=admin_headers).json())

    # Ripristino: tutto torna come prima.
    entry = _trash_entry(client, admin_headers, "payment", paid["id"])
    assert entry["days_left"] >= 29
    assert client.post(f"/api/trash/{entry['batch']}/restore", headers=admin_headers).status_code == 200
    assert _dash(client, admin_headers)["kpi"]["incassato_mese"] == 300


def test_deleted_worklogs_are_excluded_from_totals(client, admin_headers, employee):
    c = _client(client, admin_headers)
    keep = _worklog(client, admin_headers, employee.id, c["id"], revenue=200, payout=50)
    gone = _worklog(client, admin_headers, employee.id, c["id"], revenue=100, payout=40)
    client.delete(f"/api/work-logs/{gone['id']}", headers=admin_headers)

    stats = _dash(client, admin_headers)["financial_stats"]
    assert stats["entrate_totali"] == 200 and stats["spese_totali"] == 50
    assert _dash(client, admin_headers)["kpi"]["fatturato_mese"] == 200
    report = client.get("/api/reports/jobs", headers=admin_headers).json()
    assert report["totals"] == {"revenue": 200, "expense": 50, "margin": 150}
    monthly = client.get(f"/api/reports/monthly?year={TODAY.year}&month={TODAY.month}", headers=admin_headers).json()
    assert monthly["total_revenue"] == 200 and monthly["completed_jobs"] == 1
    team = next(u for u in client.get("/api/users", headers=admin_headers).json() if u["id"] == employee.id)
    assert team["pending_payout"] == 50 and team["month_cost"] == 50
    assert [w["id"] for w in client.get("/api/work-logs", headers=admin_headers).json()] == [keep["id"]]


def test_deleting_client_hides_linked_items_and_restores_them_together(client, admin_headers, db_session):
    c = _client(client, admin_headers, package="standard")
    other = _client(client, admin_headers, "Altro")
    task = client.post("/api/tasks", headers=admin_headers, json={
        "title": "Extra", "client_id": c["id"], "category_service": "altro", "price_charged_to_client": 90}).json()
    late = _payment(client, admin_headers, c["id"], 70, days=-5)
    k = _dash(client, admin_headers)["kpi"]
    assert k["clienti_attivi"] == 2 and k["task_aperti"] == 1 and k["mrr"] == 300

    assert client.delete(f"/api/clients/{c['id']}", headers=admin_headers).status_code == 200

    k = _dash(client, admin_headers)["kpi"]
    assert k["clienti_attivi"] == 1 and k["task_aperti"] == 0 and k["mrr"] == 0 and k["ritardi_count"] == 0
    assert [x["id"] for x in client.get("/api/clients", headers=admin_headers).json()] == [other["id"]]
    assert client.get(f"/api/clients/{c['id']}", headers=admin_headers).status_code == 404
    assert client.get("/api/tasks", headers=admin_headers).json() == []
    assert client.get("/api/payments", headers=admin_headers).json() == []

    # Un elemento collegato non si ripristina da solo: si ripristina il cliente con tutto il gruppo.
    entry = _trash_entry(client, admin_headers, "client", c["id"])
    assert entry["linked_count"] >= 3  # task, rata del lavoro extra, rata abbonamento, pagamento
    r = client.post(f"/api/trash/{entry['batch']}/restore", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert client.get(f"/api/clients/{c['id']}", headers=admin_headers).status_code == 200
    assert [t["id"] for t in client.get("/api/tasks", headers=admin_headers).json()] == [task["id"]]
    assert any(p["id"] == late["id"] for p in client.get("/api/payments", headers=admin_headers).json())
    assert _dash(client, admin_headers)["kpi"]["clienti_attivi"] == 2


def test_restore_of_child_blocked_while_client_in_trash(client, admin_headers):
    c = _client(client, admin_headers)
    p = _payment(client, admin_headers, c["id"], 50)
    client.delete(f"/api/payments/{p['id']}", headers=admin_headers)  # eliminato da solo
    client.delete(f"/api/clients/{c['id']}", headers=admin_headers)   # poi il cliente
    entry = _trash_entry(client, admin_headers, "payment", p["id"])
    r = client.post(f"/api/trash/{entry['batch']}/restore", headers=admin_headers)
    assert r.status_code == 409 and "cliente" in r.json()["detail"]


def test_task_delete_trashes_unpaid_payment_but_keeps_paid(client, admin_headers, db_session):
    c = _client(client, admin_headers)
    t = client.post("/api/tasks", headers=admin_headers, json={
        "title": "Video", "client_id": c["id"], "category_service": "altro", "price_charged_to_client": 100}).json()
    paid = _payment(client, admin_headers, c["id"], 40, paid=True)
    client.put(f"/api/payments/{paid['id']}", headers=admin_headers, json={"task_id": t["id"]})
    client.delete(f"/api/tasks/{t['id']}", headers=admin_headers)
    visible = client.get("/api/payments", headers=admin_headers).json()
    assert [p["id"] for p in visible] == [paid["id"]]  # la rata incassata resta tra gli incassi
    entry = _trash_entry(client, admin_headers, "task", t["id"])
    assert entry["linked_count"] == 1


def test_trash_requires_admin_and_audit_records_delete_restore(client, admin_headers, employee_headers):
    assert client.get("/api/trash", headers=employee_headers).status_code == 403
    q = client.post("/api/quotes", headers=admin_headers, json={
        "client_id": _client(client, admin_headers)["id"], "issue_date": TODAY.isoformat(),
        "items": [{"description": "Servizio", "quantity": 1, "unit_price": 100}]}).json()
    client.delete(f"/api/quotes/{q['id']}", headers=admin_headers)
    assert client.get("/api/quotes", headers=admin_headers).json() == []
    entry = _trash_entry(client, admin_headers, "quote", q["id"])
    client.post(f"/api/trash/{entry['batch']}/restore", headers=admin_headers)
    assert len(client.get("/api/quotes", headers=admin_headers).json()) == 1
    p = _payment(client, admin_headers, q["client_id"], 25)
    client.delete(f"/api/payments/{p['id']}", headers=admin_headers)
    entry = _trash_entry(client, admin_headers, "payment", p["id"])
    client.post(f"/api/trash/{entry['batch']}/restore", headers=admin_headers)
    log = client.get(f"/api/audit?entity=payment&entity_id={p['id']}&action=delete,restore", headers=admin_headers).json()
    assert sorted(i["action"] for i in log["items"]) == ["delete", "restore"]


def test_purge_after_30_days(client, admin_headers, db_session):
    c = _client(client, admin_headers)
    old = _payment(client, admin_headers, c["id"], 10)
    recent = _payment(client, admin_headers, c["id"], 20)
    client.delete(f"/api/payments/{old['id']}", headers=admin_headers)
    client.delete(f"/api/payments/{recent['id']}", headers=admin_headers)
    with include_deleted(db_session):
        db_session.get(Payment, old["id"]).deleted_at -= timedelta(days=31)
        db_session.commit()
    assert purge_expired(db_session) == 1
    with include_deleted(db_session):
        db_session.expire_all()
        assert db_session.get(Payment, old["id"]) is None
        assert db_session.get(Payment, recent["id"]) is not None


def test_purge_client_keeps_worklogs(client, admin_headers, db_session, employee):
    c = _client(client, admin_headers)
    w = _worklog(client, admin_headers, employee.id, c["id"], revenue=10, payout=5)
    client.post("/api/tasks", headers=admin_headers, json={
        "title": "X", "client_id": c["id"], "category_service": "altro", "price_charged_to_client": 5})
    client.delete(f"/api/clients/{c['id']}", headers=admin_headers)
    entry = _trash_entry(client, admin_headers, "client", c["id"])
    assert client.delete(f"/api/trash/{entry['batch']}", headers=admin_headers).status_code == 200
    db_session.expire_all()
    with include_deleted(db_session):
        assert db_session.get(Client, c["id"]) is None
        assert db_session.query(Task).count() == 0
        log = db_session.get(WorkLog, w["id"])
        assert log is not None and log.client_id is None
