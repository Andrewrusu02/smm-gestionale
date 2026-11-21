import os
import sqlite3
import time
from datetime import datetime, timedelta
from pathlib import Path

import pytest

import backups
import migrator

FIXTURE = Path(__file__).parent / "fixtures" / "schema_003.sql"


def old_db(tmp_path) -> str:
    """Database con lo schema reale precedente alla 004 e qualche riga di prova."""
    path = tmp_path / "old.db"
    conn = sqlite3.connect(path)
    conn.executescript(FIXTURE.read_text(encoding="utf-8"))
    conn.execute("INSERT INTO users(id,email,name,role,password_hash,active) VALUES (1,'a@b.it','A','admin','x',1)")
    conn.execute("INSERT INTO clients(id,name,status) VALUES (1,'Cliente','ACTIVE')")
    conn.execute("INSERT INTO payments(id,client_id,kind,amount,due_date,status) "
                 "VALUES (1,1,'single_job',100,'2026-01-01','saldato')")
    conn.commit()
    conn.close()
    return str(path)


def test_split_sql_handles_comments_and_strings():
    stmts = migrator.split_sql("-- commento\nCREATE TABLE a (x TEXT DEFAULT ';');\n\nUPDATE a SET x = 'b;c';\n")
    assert len(stmts) == 2
    assert stmts[1].startswith("UPDATE")


def test_existing_db_with_manual_columns_is_migrated_idempotently(tmp_path, monkeypatch):
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "bk"))
    db = old_db(tmp_path)
    applied = migrator.run_migrations(db)
    # Le colonne di 001-003 esistono già (create a mano): il runner le salta senza errori.
    assert "001_contracts_work_logs.sql" in applied
    conn = sqlite3.connect(db)
    versions = {r[0] for r in conn.execute("SELECT version FROM schema_migrations")}
    assert {"001", "002", "003"} <= versions
    assert conn.execute("SELECT COUNT(*) FROM payments").fetchone()[0] == 1
    conn.close()
    # Un backup per ogni migrazione applicata.
    assert len(list((tmp_path / "bk").glob("pre-migrazione-*.db"))) == len(applied)
    # Seconda esecuzione: niente da fare.
    assert migrator.run_migrations(db) == []


def test_fresh_db_uses_models_and_marks_all_applied(tmp_path, monkeypatch):
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "bk"))
    db = str(tmp_path / "fresh.db")
    called = []

    def create():
        conn = sqlite3.connect(db)
        conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY)")
        conn.commit()
        conn.close()
        called.append(True)

    assert migrator.run_migrations(db, create_schema=create) == []
    assert called
    conn = sqlite3.connect(db)
    n = conn.execute("SELECT COUNT(*) FROM schema_migrations").fetchone()[0]
    conn.close()
    assert n == len(migrator.list_migrations())


def test_failed_migration_rolls_back_and_is_not_recorded(tmp_path, monkeypatch):
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "bk"))
    db = old_db(tmp_path)
    mig = tmp_path / "mig"
    mig.mkdir()
    (mig / "001_ok.sql").write_text("CREATE TABLE IF NOT EXISTS t1 (id INTEGER);\n")
    (mig / "002_bad.sql").write_text("CREATE TABLE t2 (id INTEGER);\nINSERT INTO non_esiste VALUES (1);\n")
    with pytest.raises(sqlite3.OperationalError):
        migrator.run_migrations(db, directory=mig)
    conn = sqlite3.connect(db)
    assert [r[0] for r in conn.execute("SELECT version FROM schema_migrations")] == ["001"]
    assert not migrator.table_exists(conn, "t2")
    conn.close()


def test_python_migration_and_add_column_helper(tmp_path, monkeypatch):
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "bk"))
    db = old_db(tmp_path)
    mig = tmp_path / "mig"
    mig.mkdir()
    (mig / "001_py.py").write_text(
        "from migrator import add_column\n"
        "def upgrade(conn):\n"
        "    assert add_column(conn, 'clients', 'extra', 'TEXT')\n"
        "    assert not add_column(conn, 'clients', 'extra', 'TEXT')\n"
    )
    assert migrator.run_migrations(db, directory=mig) == ["001_py.py"]
    conn = sqlite3.connect(db)
    assert migrator.column_exists(conn, "clients", "extra")
    conn.close()


def test_backup_prune_keeps_recent_and_latest(tmp_path, monkeypatch):
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "bk"))
    db = old_db(tmp_path)
    old = backups.create_backup(kind="auto", db_path=db)
    recent = backups.create_backup(kind="manuale", db_path=db)
    past = time.time() - 40 * 86400
    os.utime(old, (past, past))
    assert backups.prune_backups(db_path=db) == [old.name]
    assert recent.exists()
    # Il backup è un database valido con gli stessi dati.
    conn = sqlite3.connect(recent)
    assert conn.execute("SELECT COUNT(*) FROM payments").fetchone()[0] == 1
    conn.close()
    # L'ultimo backup rimasto non viene mai cancellato, anche se vecchio.
    os.utime(recent, (past, past))
    assert backups.prune_backups(db_path=db, now=datetime.now() + timedelta(days=1)) == []


def test_nightly_due(tmp_path, monkeypatch):
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "bk"))
    db = old_db(tmp_path)
    assert not backups.nightly_due(now=datetime(2026, 1, 1, 2, 0), db_path=db, hour=3)
    assert backups.nightly_due(now=datetime(2026, 1, 1, 3, 30), db_path=db, hour=3)
    (tmp_path / "bk" / "auto-20260101-030000.db").write_bytes(b"")
    assert not backups.nightly_due(now=datetime(2026, 1, 1, 9, 0), db_path=db, hour=3)


def test_resolve_backup_rejects_traversal(tmp_path, monkeypatch):
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "bk"))
    backups.backup_dir()
    for bad in ("../test.db", "..\\x.db", ".hidden.db", "a/b.db", "x.txt"):
        assert backups.resolve_backup(bad) is None


def test_backup_api(client, admin_headers, employee_headers):
    assert client.get("/api/backups", headers=employee_headers).status_code == 403
    r = client.post("/api/backups", headers=admin_headers)
    assert r.status_code == 200, r.text
    name = r.json()["name"]
    assert name.startswith("manuale-")
    items = client.get("/api/backups", headers=admin_headers).json()["items"]
    assert any(i["name"] == name and i["size"] > 0 for i in items)
    d = client.get(f"/api/backups/{name}/download", headers=admin_headers)
    assert d.status_code == 200 and d.content[:15] == b"SQLite format 3"
    assert client.get("/api/backups/..%2Fx.db/download", headers=admin_headers).status_code == 404


def test_migrated_old_db_matches_models(tmp_path, monkeypatch):
    """Ogni tabella/colonna dei modelli deve essere creata da una migrazione sul database di produzione."""
    from database import Base
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "bk"))
    db = old_db(tmp_path)
    migrator.run_migrations(db)
    conn = sqlite3.connect(db)
    missing = []
    for table in Base.metadata.sorted_tables:
        if not migrator.table_exists(conn, table.name):
            missing.append(table.name)
            continue
        missing += [f"{table.name}.{c.name}" for c in table.columns if not migrator.column_exists(conn, table.name, c.name)]
    conn.close()
    assert missing == []
