import sqlite3
from datetime import date

import migrator
from models import WorkLog
from tests.test_migrations import old_db


def test_migration_005_converts_tags(tmp_path, monkeypatch):
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "bk"))
    db = old_db(tmp_path)
    conn = sqlite3.connect(db)
    rows = [
        (1, "[SALDATO_TEAM]", 10),
        (2, "Consegnato in anticipo [SALDATO_TEAM]", 20),
        (3, "[team-paid] riga\nseconda riga", 30),
        (4, "Da pagare", 40),
        (5, None, 50),
    ]
    for wid, notes, cost in rows:
        conn.execute("INSERT INTO work_logs(id,user_id,notes,revenue_amount,date,description,worker_expense) "
                     "VALUES (?,1,?,0,'2026-01-10','x',?)", (wid, notes, cost))
    conn.commit()
    before = conn.execute("SELECT COUNT(*), SUM(worker_expense) FROM work_logs WHERE notes LIKE '%[SALDATO_TEAM]%' "
                          "OR notes LIKE '%[team-paid]%'").fetchone()
    conn.close()
    migrator.run_migrations(db)
    conn = sqlite3.connect(db)
    after = conn.execute("SELECT COUNT(*), SUM(worker_expense) FROM work_logs WHERE team_paid = 1").fetchone()
    assert before == after == (3, 60)
    notes = dict(conn.execute("SELECT id, notes FROM work_logs"))
    assert notes == {1: None, 2: "Consegnato in anticipo", 3: "riga\nseconda riga", 4: "Da pagare", 5: None}
    assert conn.execute("SELECT COUNT(*) FROM work_logs WHERE notes LIKE '%[SALDATO%' OR notes LIKE '%[team-paid]%'").fetchone()[0] == 0
    conn.close()


def _log(db, user, **kw):
    w = WorkLog(user_id=user.id, date=date(2026, 1, 5), description="Reel", worker_expense=kw.pop("cost", 25),
                revenue_amount=kw.pop("revenue", 100), **kw)
    db.add(w)
    db.commit()
    return w


def test_toggle_team_paid_sets_column_and_date(client, admin_headers, db_session, employee):
    w = _log(db_session, employee, notes="Nota")
    r = client.put(f"/api/work-logs/{w.id}", headers=admin_headers, json={"team_paid": True})
    assert r.status_code == 200, r.text
    assert r.json()["team_paid"] is True
    assert r.json()["team_paid_at"] == date.today().isoformat()
    assert r.json()["notes"] == "Nota"
    db_session.expire_all()
    stored = db_session.get(WorkLog, w.id)
    assert stored.team_paid and stored.notes == "Nota"  # niente più tag nelle note
    # Modificare le note non annulla il saldo.
    r = client.put(f"/api/work-logs/{w.id}", headers=admin_headers, json={"notes": "Nuova nota"})
    assert r.json()["team_paid"] is True and r.json()["notes"] == "Nuova nota"
    r = client.put(f"/api/work-logs/{w.id}", headers=admin_headers, json={"team_paid": False})
    assert r.json()["team_paid"] is False and r.json()["team_paid_at"] is None


def test_team_totals_use_column(client, admin_headers, db_session, employee):
    _log(db_session, employee, cost=30, team_paid=True)
    _log(db_session, employee, cost=20)
    _log(db_session, employee, cost=5, notes="[SALDATO_TEAM] testo vecchio")  # il tag non conta più
    users = client.get("/api/users?year=2026&month=1", headers=admin_headers).json()
    me = next(u for u in users if u["id"] == employee.id)
    assert me["paid_total"] == 30
    assert me["pending_payout"] == 25 and me["pending_count"] == 2
    client_logs = client.get("/api/work-logs", headers=admin_headers).json()
    assert sorted(l["team_paid"] for l in client_logs) == [False, False, True]
