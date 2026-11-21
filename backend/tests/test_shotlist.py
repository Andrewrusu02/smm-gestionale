from datetime import datetime


def _session(client, h, ctype="sessione"):
    c = client.post("/api/clients", headers=h, json={"name": "Ristorante"}).json()
    p = client.post("/api/posts", headers=h, json={"client_id": c["id"], "title": "Shooting menu", "content_type": ctype,
                                                   "scheduled_at": datetime(2026, 4, 2, 9, 30).isoformat()}).json()
    return c, p


def test_shotlist_plan_and_checklist(client, admin_headers, employee_headers, employee):
    c, p = _session(client, admin_headers)
    script = client.post("/api/scripts", headers=admin_headers, json={"client_id": c["id"], "title": "Script menu"}).json()
    plan = {"location": "Sala principale", "people": "Chef Marco\nCameriera", "video_script_id": script["id"], "items": [
        {"kind": "scene", "description": "Ingresso chef", "framing": "Piano americano", "duration_seconds": 8},
        {"kind": "scene", "description": "Impiattamento", "framing": "Dettaglio dall'alto", "duration_seconds": 12},
        {"kind": "equipment", "description": "Gimbal"},
    ]}
    assert client.put(f"/api/posts/{p['id']}/shotlist", headers=employee_headers, json=plan).status_code == 403
    r = client.put(f"/api/posts/{p['id']}/shotlist", headers=admin_headers, json=plan)
    assert r.status_code == 200, r.text
    data = r.json()
    assert [s["description"] for s in data["scenes"]] == ["Ingresso chef", "Impiattamento"]
    assert data["progress"] == {"done": 0, "total": 3, "scene_seconds": 20}
    assert data["video_script"]["title"] == "Script menu"

    # Il dipendente apre la shot list e spunta una scena.
    view = client.get(f"/api/posts/{p['id']}/shotlist", headers=employee_headers).json()
    sid = view["scenes"][1]["id"]
    assert client.patch(f"/api/shotlist-items/{sid}", headers=employee_headers, json={"done": True}).json()["done"] is True
    view = client.get(f"/api/posts/{p['id']}/shotlist", headers=employee_headers).json()
    assert view["progress"]["done"] == 1 and view["scenes"][1]["done_by_name"] == employee.name

    # Modifica del piano: gli elementi esistenti (con id) restano spuntati, quelli tolti spariscono.
    keep = view["scenes"][1]
    r = client.put(f"/api/posts/{p['id']}/shotlist", headers=admin_headers, json={**plan, "items": [
        {"id": keep["id"], "kind": "scene", "description": "Impiattamento finale", "duration_seconds": 10},
        {"kind": "scene", "description": "Brindisi"},
    ]}).json()
    assert [(s["description"], s["done"], s["position"]) for s in r["scenes"]] == [("Impiattamento finale", True, 0), ("Brindisi", False, 1)]
    assert r["equipment"] == []


def test_shotlist_only_for_sessions_and_same_client_script(client, admin_headers):
    _, reel = _session(client, admin_headers, "reel")
    assert client.get(f"/api/posts/{reel['id']}/shotlist", headers=admin_headers).status_code == 422
    c, p = _session(client, admin_headers)
    other = client.post("/api/clients", headers=admin_headers, json={"name": "Altro"}).json()
    s = client.post("/api/scripts", headers=admin_headers, json={"client_id": other["id"], "title": "Non mio"}).json()
    assert client.put(f"/api/posts/{p['id']}/shotlist", headers=admin_headers,
                      json={"video_script_id": s["id"], "items": []}).status_code == 422
