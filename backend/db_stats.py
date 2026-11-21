"""Stampa righe per tabella e i totali di controllo di un database SQLite.

Uso: python db_stats.py /percorso/smm.db   (senza argomenti usa DATABASE_URL)
"""
import json
import os
import sqlite3
import sys


def column_exists(conn, table, column):
    return any(r[1] == column for r in conn.execute(f'PRAGMA table_info("{table}")'))


def stats(path):
    conn = sqlite3.connect(path)
    tables = [r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
    out = {"rows": {t: conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for t in tables}}
    if "payments" in tables:
        out["payments_by_status"] = {s or "": [n, round(a or 0, 2)] for s, n, a in conn.execute(
            "SELECT status, COUNT(*), SUM(amount) FROM payments GROUP BY status ORDER BY status")}
    if "work_logs" in tables:
        we, ra = conn.execute("SELECT SUM(worker_expense), SUM(revenue_amount) FROM work_logs").fetchone()
        out["work_logs_worker_expense"] = round(we or 0, 2)
        out["work_logs_revenue_amount"] = round(ra or 0, 2)
        if column_exists(conn, "work_logs", "team_paid"):
            n, s = conn.execute("SELECT COUNT(*), SUM(worker_expense) FROM work_logs WHERE team_paid = 1").fetchone()
        else:
            n, s = conn.execute("SELECT COUNT(*), SUM(worker_expense) FROM work_logs WHERE notes LIKE '%[SALDATO_TEAM]%' "
                                "OR notes LIKE '%[team-paid]%'").fetchone()
        out["team_paid"] = [n, round(s or 0, 2)]
    if "schema_migrations" in tables:
        out["migrations"] = [r[0] for r in conn.execute("SELECT name FROM schema_migrations ORDER BY version")]
    conn.close()
    return out


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else os.environ["DATABASE_URL"].split("sqlite:///", 1)[1]
    print(json.dumps(stats(target), indent=2, ensure_ascii=False))
