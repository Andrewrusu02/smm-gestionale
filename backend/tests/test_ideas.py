from models import Idea


def _client(client, h):
    return client.post("/api/clients", headers=h, json={"name": "Gelateria"}).json()


def test_idea_crud_permissions_and_conversion(client, admin_headers, employee_headers, db_session):
    c = _client(client, admin_headers)
    r = client.post("/api/ideas", headers=employee_headers, json={
        "client_id": c["id"], "title": "Trend gusto del mese", "note": "Reel con assaggi in strada",
        "reference_url": "https://www.instagram.com/reel/abc"})
    assert r.status_code == 200, r.text
    idea = r.json()
    assert idea["status"] == "nuova" and idea["client_name"] == "Gelateria"
    assert client.post("/api/ideas", headers=admin_headers, json={
        "client_id": c["id"], "title": "x", "reference_url": "javascript:alert(1)"}).status_code == 422

    other = client.post("/api/ideas", headers=admin_headers, json={"client_id": c["id"], "title": "Idea admin"}).json()
    assert client.put(f"/api/ideas/{other['id']}", headers=employee_headers,
                      json={"client_id": c["id"], "title": "Rubata"}).status_code == 403
    upd = client.put(f"/api/ideas/{idea['id']}", headers=employee_headers,
                     json={"client_id": c["id"], "title": "Trend gusto del mese", "note": idea["note"],
                           "reference_url": idea["reference_url"], "status": "approvata"})
    assert upd.json()["status"] == "approvata"

    assert client.post(f"/api/ideas/{idea['id']}/to-script", headers=employee_headers).status_code == 403
    conv = client.post(f"/api/ideas/{idea['id']}/to-script", headers=admin_headers)
    assert conv.status_code == 200, conv.text
    script = conv.json()["script"]
    assert script["title"] == "Trend gusto del mese" and script["concept"] == "Reel con assaggi in strada"
    assert "https://www.instagram.com/reel/abc" in script["notes"] and script["status"] == "BOZZA"
    assert conv.json()["idea"]["status"] == "convertita" and conv.json()["idea"]["video_script_id"] == script["id"]
    assert client.post(f"/api/ideas/{idea['id']}/to-script", headers=admin_headers).status_code == 409

    listed = client.get(f"/api/ideas?client_id={c['id']}", headers=employee_headers).json()
    assert [i["title"] for i in listed] == ["Idea admin", "Trend gusto del mese"]  # le convertite in fondo
    assert client.delete(f"/api/ideas/{other['id']}", headers=admin_headers).status_code == 200


def test_ideas_hidden_with_trashed_client_and_purged_with_it(client, admin_headers, db_session):
    c = _client(client, admin_headers)
    client.post("/api/ideas", headers=admin_headers, json={"client_id": c["id"], "title": "Idea"})
    client.delete(f"/api/clients/{c['id']}", headers=admin_headers)
    assert client.get("/api/ideas", headers=admin_headers).json() == []
    batch = next(i for i in client.get("/api/trash", headers=admin_headers).json()["items"] if i["entity"] == "client")["batch"]
    client.delete(f"/api/trash/{batch}", headers=admin_headers)
    db_session.expire_all()
    assert db_session.query(Idea).count() == 0
