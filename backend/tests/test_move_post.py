from datetime import date, datetime

import google_sync
from models import Post


def _post(client, h):
    c = client.post("/api/clients", headers=h, json={"name": "Palestra"}).json()
    return client.post("/api/posts", headers=h, json={"client_id": c["id"], "title": "Reel allenamento", "content_type": "reel",
                                                      "scheduled_at": datetime(2026, 4, 2, 18, 45).isoformat()}).json()


def test_move_keeps_time_and_updates_task(client, admin_headers, employee_headers):
    p = _post(client, admin_headers)
    assert client.post(f"/api/posts/{p['id']}/move", headers=employee_headers, json={"date": "2026-04-05"}).status_code == 403
    r = client.post(f"/api/posts/{p['id']}/move", headers=admin_headers, json={"date": "2026-04-05"})
    assert r.status_code == 200, r.text
    assert r.json()["scheduled_at"] == "2026-04-05T18:45:00" and r.json()["google_updated"] is False
    task = client.get(f"/api/tasks", headers=admin_headers).json()[0]
    assert task["due_date"] == "2026-04-05"


def test_move_rolls_back_when_google_fails(client, admin_headers, db_session, monkeypatch):
    p = _post(client, admin_headers)

    def boom(*a, **k):
        raise RuntimeError("quota superata")

    monkeypatch.setattr(google_sync, "get_service", lambda db: object())
    monkeypatch.setattr(google_sync, "_push", boom)
    r = client.post(f"/api/posts/{p['id']}/move", headers=admin_headers, json={"date": "2026-04-09"})
    assert r.status_code == 502 and "quota superata" in r.json()["detail"]
    db_session.expire_all()
    assert db_session.get(Post, p["id"]).scheduled_at == datetime(2026, 4, 2, 18, 45)
    assert client.get("/api/tasks", headers=admin_headers).json()[0]["due_date"] == date(2026, 4, 2).isoformat()


def test_move_updates_google_event(client, admin_headers, monkeypatch):
    p = _post(client, admin_headers)
    calls = []

    def fake_push(db, svc, post, body=None):
        calls.append(post.scheduled_at)
        post.google_event_id = "ev1"

    monkeypatch.setattr(google_sync, "get_service", lambda db: object())
    monkeypatch.setattr(google_sync, "_push", fake_push)
    r = client.post(f"/api/posts/{p['id']}/move", headers=admin_headers, json={"date": "2026-04-03"})
    assert r.json()["google_updated"] is True and calls == [datetime(2026, 4, 3, 18, 45)]
