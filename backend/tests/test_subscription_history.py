import sqlite3

import migrator
from tests.test_migrations import old_db


def _events(client, h, cid):
    return [(e["event"], e["from_package"], e["to_package"], e["from_price"], e["to_price"])
            for e in reversed(client.get(f"/api/clients/{cid}/subscription-history", headers=h).json())]


def test_app_records_start_renewal_and_changes(client, admin_headers):
    c = client.post("/api/clients", headers=admin_headers, json={"name": "Abbonato", "package": "standard"}).json()
    client.post(f"/api/clients/{c['id']}/renew", headers=admin_headers)
    base = {"name": "Abbonato"}
    client.put(f"/api/clients/{c['id']}", headers=admin_headers, json={**base, "package": "premium"})
    client.put(f"/api/clients/{c['id']}", headers=admin_headers, json={**base, "package": "personalizzato", "custom_price": 450})
    client.put(f"/api/clients/{c['id']}", headers=admin_headers, json={**base, "package": "personalizzato", "custom_price": 500})
    client.put(f"/api/clients/{c['id']}", headers=admin_headers, json={**base, "package": "personalizzato", "custom_price": 500})
    client.put(f"/api/clients/{c['id']}", headers=admin_headers, json={**base, "package": None})
    assert _events(client, admin_headers, c["id"]) == [
        ("start", None, "standard", None, 300),
        ("renewal", "standard", "standard", 300, 300),
        ("package_change", "standard", "premium", 300, 600),
        ("package_change", "premium", "personalizzato", 600, 450),
        ("price_change", "personalizzato", "personalizzato", 450, 500),
        ("stop", "personalizzato", None, 500, None),
    ]
    hist = client.get(f"/api/clients/{c['id']}/subscription-history", headers=admin_headers).json()
    renewal = next(e for e in hist if e["event"] == "renewal")
    assert (renewal["from_cycle"], renewal["to_cycle"], renewal["event_label"]) == (1, 2, "Rinnovo")
    assert len(client.get(f"/api/clients/{c['id']}", headers=admin_headers).json()["subscription_history"]) == 6


def test_migration_010_rebuilds_history_from_payments(tmp_path, monkeypatch):
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "bk"))
    db = old_db(tmp_path)
    conn = sqlite3.connect(db)
    conn.execute("UPDATE clients SET package = 'premium' WHERE id = 1")
    conn.execute("INSERT INTO clients(id,name,status) VALUES (2,'Ex abbonato','ACTIVE')")
    pays = [
        (10, 1, "2026-01", 300, "Pacchetto Standard - ciclo 1"),
        (11, 1, "2026-02", 300, "Pacchetto Standard - ciclo 2"),
        (12, 1, "2026-03", 400, "Pacchetto Silver - ciclo 3"),
        (13, 1, "2026-04", 420, "Pacchetto Silver - ciclo 3"),
        (14, 2, "2026-01", 300, "Pacchetto Standard - ciclo 1"),
    ]
    for pid, cid, period, amount, desc in pays:
        conn.execute("INSERT INTO payments(id,client_id,kind,amount,period,due_date,status,description) "
                     "VALUES (?,?,'abbonamento',?,?,?, 'saldato', ?)", (pid, cid, amount, period, period + "-28", desc))
    conn.commit()
    conn.close()
    migrator.run_migrations(db)
    conn = sqlite3.connect(db)
    rows = conn.execute("SELECT client_id, event, date, from_package, to_package, from_price, to_price, source "
                        "FROM subscription_history ORDER BY client_id, id").fetchall()
    conn.close()
    one = [r[1:7] for r in rows if r[0] == 1]
    assert one[0] == ("start", "2026-01-01", None, "standard", None, 300)
    assert one[1] == ("renewal", "2026-02-01", "standard", "standard", 300, 300)
    assert one[2] == ("renewal", "2026-03-01", "standard", "silver", 300, 400)  # rinnovo con cambio pacchetto
    assert one[3] == ("price_change", "2026-04-01", "silver", "silver", 400, 420)
    assert one[4][0] == "package_change" and one[4][2:4] == ("silver", "premium")  # stato attuale diverso
    assert len(one) == 5
    two = [r[1] for r in rows if r[0] == 2]
    assert two == ["start", "stop"]
    assert all(r[7] == "ricostruito" for r in rows)
    # Idempotente: rieseguire non duplica.
    assert migrator.run_migrations(db) == []
