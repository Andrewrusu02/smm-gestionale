"""Cestino: eliminazione logica.

Aggiunge deleted_at (quando), deleted_batch (gruppo di elementi eliminati insieme, per ripristinarli insieme)
e deleted_by (chi) alle tabelle degli elementi che finiscono nel cestino. Nessun dato viene toccato.
"""
from migrator import add_column, table_exists

TABLES = ("clients", "tasks", "posts", "payments", "work_logs", "quotes", "video_scripts", "contracts")


def upgrade(conn):
    for table in TABLES:
        if not table_exists(conn, table):
            continue
        add_column(conn, table, "deleted_at", "DATETIME")
        add_column(conn, table, "deleted_batch", "VARCHAR(64)")
        add_column(conn, table, "deleted_by", "INTEGER REFERENCES users(id)")
        conn.execute(f'CREATE INDEX IF NOT EXISTS ix_{table}_deleted_at ON "{table}"(deleted_at)')
