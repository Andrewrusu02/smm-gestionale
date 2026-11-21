from datetime import date, datetime, timedelta

from models import Lead, WorkLog


def _setup(client, h, db, employee, admin):
    c = client.post("/api/clients", headers=h, json={"name": "Pizzeria Zenzero", "email": "info@zenzero.it"}).json()
    client.post("/api/tasks", headers=h, json={"title": "Reel Zenzero estate", "client_id": c["id"],
                                               "category_service": "reel", "price_charged_to_client": 50})
    client.post("/api/posts", headers=h, json={"client_id": c["id"], "title": "Carosello menu", "content_type": "carosello",
                                               "scheduled_at": datetime(2026, 3, 2, 10, 0).isoformat()})
    client.post("/api/payments", headers=h, json={"client_id": c["id"], "amount": 99, "invoice_number": "FT-ZEN-7",
                                                  "due_date": (date.today() + timedelta(days=3)).isoformat()})
    client.post("/api/scripts", headers=h, json={"client_id": c["id"], "title": "Script forno a legna"})
    db.add(Lead(name="Zenzero Bis", contact_name="Mario"))
    db.add(WorkLog(user_id=employee.id, client_id=c["id"], date=date.today(), description="Montaggio zenzero dip"))
    db.add(WorkLog(user_id=admin.id, client_id=c["id"], date=date.today(), description="Montaggio zenzero admin"))
    db.commit()
    return c


def _types(r):
    return {g["type"]: g for g in r.json()["groups"]}


def test_admin_finds_everything_grouped(client, admin_headers, db_session, employee, admin):
    c = _setup(client, admin_headers, db_session, employee, admin)
    groups = _types(client.get("/api/search?q=zenzero", headers=admin_headers))
    assert {"client", "task", "post", "payment", "video_script", "lead", "work_log"} <= set(groups)
    assert groups["client"]["items"][0]["link"] == f"/clienti/{c['id']}"
    assert groups["post"]["items"][0]["link"] == "/calendario?date=2026-03-02"
    assert len(groups["work_log"]["items"]) == 2
    # Ricerca per numero fattura e senza distinzione maiuscole.
    assert "payment" in _types(client.get("/api/search?q=ft-zen", headers=admin_headers))


def test_employee_sees_only_what_they_see_today(client, admin_headers, employee_headers, db_session, employee, admin):
    _setup(client, admin_headers, db_session, employee, admin)
    groups = _types(client.get("/api/search?q=zenzero", headers=employee_headers))
    assert not {"client", "payment", "quote", "lead"} & set(groups)
    assert {"task", "post", "video_script", "work_log"} <= set(groups)
    assert [i["title"] for i in groups["work_log"]["items"]] == ["Montaggio zenzero dip"]


def test_short_query_and_wildcards(client, admin_headers, db_session, employee, admin):
    _setup(client, admin_headers, db_session, employee, admin)
    assert client.get("/api/search?q=z", headers=admin_headers).json()["groups"] == []
    assert client.get("/api/search?q=%25%25", headers=admin_headers).json()["groups"] == []  # "%" non è un jolly
    assert client.get("/api/search?q=zenzero").status_code == 401


def test_search_excludes_trash(client, admin_headers, db_session, employee, admin):
    c = _setup(client, admin_headers, db_session, employee, admin)
    client.delete(f"/api/clients/{c['id']}", headers=admin_headers)
    groups = _types(client.get("/api/search?q=zenzero", headers=admin_headers))
    assert not {"client", "task", "post", "payment", "video_script"} & set(groups)
