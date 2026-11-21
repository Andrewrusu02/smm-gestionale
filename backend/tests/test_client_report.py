from datetime import date, datetime

from models import Client, Post, Task
from routers.client_report import report_data


def test_report_data_and_pdf(client, admin_headers, employee_headers, db_session):
    db = db_session
    c = Client(name="Pasticceria Dolce", package="standard", start_date=date(2026, 1, 1), cycle_number=1)
    db.add(c)
    db.flush()
    db.add_all([
        Post(client_id=c.id, title="Reel torte", content_type="reel", scheduled_at=datetime(2026, 3, 5, 10), status="consegnato", cycle_number=1),
        Post(client_id=c.id, title="Carosello", content_type="carosello", scheduled_at=datetime(2026, 3, 20, 10), status="programmato", cycle_number=1),
        Post(client_id=c.id, title="Fuori mese", content_type="reel", scheduled_at=datetime(2026, 2, 5, 10), status="consegnato", cycle_number=1),
        Post(client_id=c.id, title="Prossimo", content_type="grafica", scheduled_at=datetime(2026, 4, 2, 9), status="programmato", cycle_number=1),
        Task(title="Volantino", client_id=c.id, price_charged_to_client=80, status="completato", completed_at=datetime(2026, 3, 12, 15)),
        Task(title="Logo", client_id=c.id, price_charged_to_client=150, status="da_fare", due_date=date(2026, 3, 28)),
        Task(title="Altro mese", client_id=c.id, price_charged_to_client=99, status="da_fare", due_date=date(2026, 5, 1)),
    ])
    db.commit()
    data = report_data(db, c, 2026, 3, today=date(2026, 3, 25))
    assert [p.title for p in data["delivered"]] == ["Reel torte"]
    assert [t.title for t in data["extras"]] == ["Volantino", "Logo"]
    assert [p.title for p in data["upcoming"]] == ["Prossimo"]
    reel = next(u for u in data["usage"] if u["type"] == "reel")
    assert reel["used"] == 2 and reel["remaining"] == 2

    client.put("/api/settings/agency", headers=admin_headers, json={"name": "Agenzia Rossi"})
    assert client.get("/api/settings/agency", headers=employee_headers).json() == {"name": "Agenzia Rossi"}
    assert client.get(f"/api/clients/{c.id}/report.pdf?year=2026&month=3", headers=employee_headers).status_code == 403
    r = client.get(f"/api/clients/{c.id}/report.pdf?year=2026&month=3", headers=admin_headers)
    assert r.status_code == 200 and r.content[:5] == b"%PDF-"
    assert 'report_Pasticceria_Dolce_2026-03.pdf' in r.headers["content-disposition"]
    assert client.get(f"/api/clients/{c.id}/report.pdf?year=2026&month=13", headers=admin_headers).status_code == 422
