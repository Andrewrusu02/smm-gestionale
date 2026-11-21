"""Stato "saldato al collaboratore" come colonna vera invece dei tag nelle note.

- work_logs.team_paid (boolean) e work_logs.team_paid_at (data);
- team_paid = 1 dove le note contengono [SALDATO_TEAM] o [team-paid];
- i tag vengono tolti dalle note, il resto del testo resta (note vuote -> NULL).
La data di saldo dei lavori già saldati non è nota: team_paid_at resta vuota.
"""
from migrator import add_column

TAGS = ("[SALDATO_TEAM]", "[team-paid]")


def clean(notes):
    value = notes or ""
    for tag in TAGS:
        value = value.replace(tag, "")
    # Stessa pulizia che l'app faceva in lettura: via i tag e gli spazi ai bordi, il resto resta com'è.
    value = value.strip()
    return value or None


def upgrade(conn):
    add_column(conn, "work_logs", "team_paid", "BOOLEAN NOT NULL DEFAULT 0")
    add_column(conn, "work_logs", "team_paid_at", "DATE")
    rows = conn.execute(
        "SELECT id, notes FROM work_logs WHERE notes LIKE '%[SALDATO_TEAM]%' OR notes LIKE '%[team-paid]%'"
    ).fetchall()
    for wid, notes in rows:
        conn.execute("UPDATE work_logs SET team_paid = 1, notes = ? WHERE id = ?", (clean(notes), wid))
