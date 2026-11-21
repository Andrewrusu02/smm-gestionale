from datetime import datetime

from services import normalize_hashtags


def test_normalize_hashtags():
    assert normalize_hashtags("moda, #Estate  saldi #moda") == "#moda #Estate #saldi"
    assert normalize_hashtags("#caffè;#bar\n#BAR") == "#caffè #bar"
    assert normalize_hashtags("  ,# ") is None


def test_post_caption_hashtags_and_backward_compat(client, admin_headers, employee_headers):
    c = client.post("/api/clients", headers=admin_headers, json={"name": "Boutique"}).json()
    base = {"client_id": c["id"], "title": "Nuova collezione", "content_type": "reel",
            "scheduled_at": datetime(2026, 4, 2, 18, 0).isoformat()}
    p = client.post("/api/posts", headers=admin_headers, json={**base, "caption": "  Arriva la primavera 🌸 ",
                                                                  "hashtags": "moda primavera #moda"}).json()
    assert p["caption"] == "Arriva la primavera 🌸" and p["hashtags"] == "#moda #primavera"
    # Un vecchio form senza caption/hashtag non li cancella.
    p2 = client.put(f"/api/posts/{p['id']}", headers=admin_headers, json={**base, "title": "Collezione"}).json()
    assert p2["caption"] == "Arriva la primavera 🌸" and p2["hashtags"] == "#moda #primavera"
    p3 = client.put(f"/api/posts/{p['id']}", headers=admin_headers, json={**base, "caption": "", "hashtags": ""}).json()
    assert p3["caption"] is None and p3["hashtags"] is None
    # Il dipendente vede caption e hashtag nel calendario.
    posts = client.get("/api/posts", headers=employee_headers).json()
    assert "caption" in posts[0]


def test_hashtag_sets(client, admin_headers, employee_headers):
    c = client.post("/api/clients", headers=admin_headers, json={"name": "Boutique"}).json()
    url = f"/api/clients/{c['id']}/hashtag-sets"
    assert client.post(url, headers=employee_headers, json={"name": "Base", "hashtags": "#a"}).status_code == 403
    s = client.post(url, headers=admin_headers, json={"name": "Base", "hashtags": "boutique, milano #moda"}).json()
    assert s["hashtags"] == "#boutique #milano #moda"
    assert client.post(url, headers=admin_headers, json={"name": "Vuoto", "hashtags": "# ,"}).status_code == 422
    assert [x["name"] for x in client.get(url, headers=employee_headers).json()] == ["Base"]
    upd = client.put(f"{url}/{s['id']}", headers=admin_headers, json={"name": "Base 2", "hashtags": "#uno"}).json()
    assert upd["name"] == "Base 2" and upd["hashtags"] == "#uno"
    other = client.post("/api/clients", headers=admin_headers, json={"name": "Altro"}).json()
    assert client.delete(f"/api/clients/{other['id']}/hashtag-sets/{s['id']}", headers=admin_headers).status_code == 404
    assert client.delete(f"{url}/{s['id']}", headers=admin_headers).status_code == 200
