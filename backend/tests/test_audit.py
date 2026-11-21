from datetime import date, timedelta

from models import AuditLog


def _client(client, headers, name="Cliente Audit"):
    r = client.post("/api/clients", headers=headers, json={"name": name})
    assert r.status_code == 200, r.text
    return r.json()


def test_payment_changes_are_logged_with_user_and_diff(client, admin_headers, admin, db_session):
    c = _client(client, admin_headers)
    p = client.post("/api/payments", headers=admin_headers, json={
        "client_id": c["id"], "amount": 150, "due_date": (date.today() + timedelta(days=5)).isoformat(),
        "description": "Fattura"}).json()
    client.put(f"/api/payments/{p['id']}", headers=admin_headers, json={"amount": 200})
    client.delete(f"/api/payments/{p['id']}", headers=admin_headers)

    r = client.get(f"/api/audit?entity=payment&entity_id={p['id']}", headers=admin_headers).json()
    actions = [i["action"] for i in r["items"]][::-1]
    assert actions[0] == "create" and "update" in actions and actions[-1] in ("delete",)
    upd = next(i for i in r["items"] if i["action"] == "update" and i["after"].get("amount") == 200)
    assert upd["before"]["amount"] == 150
    assert upd["user_id"] == admin.id and upd["user_name"] == admin.name
    assert set(upd["after"]) == {"amount"}  # solo i campi cambiati


def test_client_task_and_worklog_are_tracked(client, admin_headers, employee_headers, employee):
    c = _client(client, admin_headers)
    client.put(f"/api/clients/{c['id']}", headers=admin_headers, json={"name": "Nuovo nome"})
    t = client.post("/api/tasks", headers=employee_headers, json={
        "title": "Grafica extra", "client_id": c["id"], "category_service": "grafica",
        "price_charged_to_client": 80}).json()
    client.post(f"/api/tasks/{t['id']}/complete", headers=employee_headers,
                json={"client_revenue": 80, "worker_expense": 30})
    items = client.get("/api/audit?limit=500", headers=admin_headers).json()["items"]
    entities = {i["entity"] for i in items}
    assert {"client", "task", "work_log", "payment"} <= entities
    rename = next(i for i in items if i["entity"] == "client" and i["action"] == "update")
    assert rename["before"]["name"] == "Cliente Audit" and rename["after"]["name"] == "Nuovo nome"
    wl = next(i for i in items if i["entity"] == "work_log" and i["action"] == "create")
    assert wl["user_id"] == employee.id and wl["after"]["worker_expense"] == 30


def test_audit_filters_and_permissions(client, admin_headers, employee_headers, employee, db_session):
    _client(client, admin_headers, "A")
    client.post("/api/tasks", headers=employee_headers, json={
        "title": "Mio task", "category_service": "altro", "price_charged_to_client": 10})
    assert client.get("/api/audit", headers=employee_headers).status_code == 403
    only_emp = client.get(f"/api/audit?user_id={employee.id}", headers=admin_headers).json()
    assert only_emp["total"] >= 1 and all(i["user_id"] == employee.id for i in only_emp["items"])
    only_clients = client.get("/api/audit?entity=client", headers=admin_headers).json()
    assert all(i["entity"] == "client" for i in only_clients["items"])
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    assert client.get(f"/api/audit?date_from={tomorrow}", headers=admin_headers).json()["total"] == 0
    today = date.today().isoformat()
    assert client.get(f"/api/audit?date_from={today}&date_to={today}", headers=admin_headers).json()["total"] > 0


def test_no_log_when_nothing_changes(client, admin_headers, db_session):
    c = _client(client, admin_headers, "Stesso")
    n = db_session.query(AuditLog).filter_by(entity="client", entity_id=c["id"]).count()
    client.put(f"/api/clients/{c['id']}", headers=admin_headers, json={"name": "Stesso"})
    assert db_session.query(AuditLog).filter_by(entity="client", entity_id=c["id"]).count() == n
