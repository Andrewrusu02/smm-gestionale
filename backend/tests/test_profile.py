import base64
import io

from PIL import Image

import avatars


def _png_data_url(w=800, h=400, mode="RGBA"):
    img = Image.new(mode, (w, h), (255, 0, 0, 128) if mode == "RGBA" else (255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def test_preferences_are_saved_on_server(client, employee_headers):
    me = client.get("/api/auth/me", headers=employee_headers).json()
    assert me["theme"] is None and me["preferences_migrated"] is False
    r = client.put("/api/auth/me/preferences", headers=employee_headers,
                   json={"theme": "auto", "home_page": "/task", "preferences_migrated": True})
    assert r.status_code == 200, r.text
    me = client.get("/api/auth/me", headers=employee_headers).json()
    assert (me["theme"], me["home_page"], me["preferences_migrated"]) == ("auto", "/task", True)
    # Un aggiornamento parziale non tocca gli altri campi.
    client.put("/api/auth/me/preferences", headers=employee_headers, json={"theme": "dark"})
    me = client.get("/api/auth/me", headers=employee_headers).json()
    assert (me["theme"], me["home_page"]) == ("dark", "/task")


def test_preferences_validation(client, employee_headers):
    assert client.put("/api/auth/me/preferences", headers=employee_headers, json={"theme": "rosa"}).status_code == 422
    assert client.put("/api/auth/me/preferences", headers=employee_headers,
                      json={"home_page": "https://evil.example"}).status_code == 422


def test_avatar_upload_resize_and_serve(client, employee_headers, employee):
    r = client.post("/api/auth/me/avatar", headers=employee_headers, json={"data_url": _png_data_url()})
    assert r.status_code == 200, r.text
    url = r.json()["avatar_url"]
    assert url.startswith("/api/avatars/")
    name = url.rsplit("/", 1)[1]
    assert (avatars.avatar_dir() / name).exists()
    img = client.get(url)  # pubblico per i tag <img>
    assert img.status_code == 200
    assert Image.open(io.BytesIO(img.content)).size == (256, 256)
    # Visibile anche in users/basic e accanto ai task assegnati.
    basic = client.get("/api/users/basic", headers=employee_headers).json()
    assert next(u for u in basic if u["id"] == employee.id)["avatar_url"] == url
    t = client.post("/api/tasks", headers=employee_headers, json={
        "title": "Montaggio", "category_service": "altro", "assignee_id": employee.id,
    })
    # Senza cliente e senza prezzo il lavoro extra è rifiutato: usiamo un prezzo.
    if t.status_code == 422:
        t = client.post("/api/tasks", headers=employee_headers, json={
            "title": "Montaggio", "category_service": "altro", "assignee_id": employee.id,
            "price_charged_to_client": 10})
    assert t.json()["assignee_avatar_url"] == url
    # Una nuova foto sostituisce e cancella la vecchia.
    r2 = client.post("/api/auth/me/avatar", headers=employee_headers, json={"data_url": _png_data_url(100, 300, "RGB")})
    assert not (avatars.avatar_dir() / name).exists()
    assert client.delete("/api/auth/me/avatar", headers=employee_headers).json()["avatar_url"] is None
    assert client.get(r2.json()["avatar_url"]).status_code == 404


def test_avatar_rejects_non_images_and_bad_names(client, employee_headers):
    bad = "data:image/png;base64," + base64.b64encode(b"non sono un'immagine").decode()
    assert client.post("/api/auth/me/avatar", headers=employee_headers, json={"data_url": bad}).status_code == 422
    assert client.get("/api/avatars/..%2F..%2Ftest.db").status_code == 404
    assert client.get("/api/avatars/1-zz.jpg").status_code == 404
