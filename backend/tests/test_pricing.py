import sqlite3

import pytest

import migrator
from services import final_price
from tests.test_migrations import old_db


def test_final_price():
    assert final_price(200) == 200
    assert final_price(200, "percent", 15) == 170
    assert final_price(99.99, "percent", 33) == 66.99
    assert final_price(200, "amount", 50) == 150
    with pytest.raises(ValueError):
        final_price(100, "percent", 120)
    with pytest.raises(ValueError):
        final_price(100, "amount", 150)


def _client(client, h):
    return client.post("/api/clients", headers=h, json={"name": "Cliente Prezzi"}).json()


def _payments(client, h, task_id):
    return [p for p in client.get("/api/payments", headers=h).json() if p["task_id"] == task_id]


def test_extra_task_with_discount_uses_final_price_for_payment(client, admin_headers):
    c = _client(client, admin_headers)
    r = client.post("/api/tasks", headers=admin_headers, json={
        "title": "Video promo", "client_id": c["id"], "category_service": "altro",
        "list_price": 400, "discount_type": "percent", "discount_value": 25})
    assert r.status_code == 200, r.text
    t = r.json()
    assert (t["list_price"], t["discount_type"], t["discount_value"], t["price_charged_to_client"]) == (400, "percent", 25, 300)
    assert [p["amount"] for p in _payments(client, admin_headers, t["id"])] == [300]

    # Cambio sconto in euro: il pagamento non incassato segue il nuovo prezzo finale.
    t2 = client.put(f"/api/tasks/{t['id']}", headers=admin_headers,
                    json={"discount_type": "amount", "discount_value": 50}).json()
    assert t2["price_charged_to_client"] == 350 and t2["list_price"] == 400
    assert [p["amount"] for p in _payments(client, admin_headers, t["id"])] == [350]

    # Vecchio form: solo il prezzo -> diventa listino senza sconto.
    t3 = client.put(f"/api/tasks/{t['id']}", headers=admin_headers, json={"price_charged_to_client": 380}).json()
    assert (t3["list_price"], t3["discount_type"], t3["price_charged_to_client"]) == (380, None, 380)

    bad = client.post("/api/tasks", headers=admin_headers, json={
        "title": "X", "client_id": c["id"], "category_service": "altro", "list_price": 100,
        "discount_type": "amount", "discount_value": 200})
    assert bad.status_code == 422
    free = client.post("/api/tasks", headers=admin_headers, json={
        "title": "X", "client_id": c["id"], "category_service": "altro", "list_price": 100,
        "discount_type": "percent", "discount_value": 100})
    assert free.status_code == 422  # prezzo finale 0 su un lavoro extra


def test_price_list_crud_and_suggest(client, admin_headers, employee_headers):
    c = _client(client, admin_headers)
    r = client.put(f"/api/clients/{c['id']}/price-list", headers=admin_headers, json={"items": [
        {"category_service": "reel", "price": 120}, {"category_service": "grafica", "price": 45, "notes": "formato post"}]})
    assert r.status_code == 200 and len(r.json()) == 2
    assert client.put(f"/api/clients/{c['id']}/price-list", headers=employee_headers, json={"items": []}).status_code == 403
    s = client.get(f"/api/price-list/suggest?client_id={c['id']}&category_service=reel", headers=employee_headers).json()
    assert s == {"price": 120}
    assert client.get(f"/api/price-list/suggest?client_id={c['id']}&category_service=altro",
                      headers=admin_headers).json() == {"price": None}
    # Sostituzione: le categorie tolte spariscono.
    client.put(f"/api/clients/{c['id']}/price-list", headers=admin_headers, json={"items": [{"category_service": "reel", "price": 130}]})
    rows = client.get(f"/api/clients/{c['id']}/price-list", headers=admin_headers).json()
    assert [(x["category_service"], x["price"]) for x in rows] == [("reel", 130)]
    assert client.put(f"/api/clients/{c['id']}/price-list", headers=admin_headers,
                      json={"items": [{"category_service": "boh", "price": 1}]}).status_code == 422


def test_migration_009_backfills_list_price(tmp_path, monkeypatch):
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "bk"))
    db = old_db(tmp_path)
    conn = sqlite3.connect(db)
    conn.execute("INSERT INTO tasks(id,title,activity_type,subscription_included,price_charged_to_client) VALUES (1,'a','SINGLE_JOB',0,150)")
    conn.execute("INSERT INTO tasks(id,title,activity_type,subscription_included,price_charged_to_client) VALUES (2,'b','SUBSCRIPTION',1,0)")
    conn.commit()
    conn.close()
    migrator.run_migrations(db)
    conn = sqlite3.connect(db)
    rows = conn.execute("SELECT id, list_price, discount_type, discount_value, price_charged_to_client FROM tasks ORDER BY id").fetchall()
    conn.close()
    assert rows == [(1, 150, None, 0, 150), (2, None, None, 0, 0)]
