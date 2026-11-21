"""Runner delle migrazioni SQLite.

- Le migrazioni stanno in ``backend/migrations`` e si chiamano ``NNN_descrizione.sql`` o ``NNN_descrizione.py``.
- Quelle applicate vengono registrate nella tabella ``schema_migrations``.
- Prima di applicarne una viene fatto un backup del file del database (API ``backup`` di sqlite3).
- Le migrazioni sono idempotenti: ``ADD COLUMN`` su una colonna già presente viene saltato, così il runner
  funziona anche su database a cui le colonne sono state aggiunte a mano.
- Le migrazioni ``.py`` espongono ``upgrade(conn)``, dove ``conn`` è una connessione ``sqlite3`` già dentro
  una transazione: il runner fa COMMIT (o ROLLBACK in caso di errore) insieme alla registrazione.
"""
import importlib.util
import logging
import re
import sqlite3
from datetime import datetime
from pathlib import Path

import backups

log = logging.getLogger("migrator")
MIGRATIONS_DIR = Path(__file__).parent / "migrations"
NAME_RE = re.compile(r"^(\d{3})_[\w-]+\.(sql|py)$")
ADD_COLUMN_RE = re.compile(r"^\s*ALTER\s+TABLE\s+[\"`]?(\w+)[\"`]?\s+ADD\s+(?:COLUMN\s+)?[\"`]?(\w+)[\"`]?", re.I | re.S)


# ----------------------------------------------------------------------------- helper per le migrazioni

def table_exists(conn, table: str) -> bool:
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone() is not None


def column_exists(conn, table: str, column: str) -> bool:
    return any(row[1] == column for row in conn.execute(f'PRAGMA table_info("{table}")'))


def add_column(conn, table: str, column: str, definition: str) -> bool:
    """Aggiunge una colonna solo se manca. Restituisce True se l'ha aggiunta."""
    if not table_exists(conn, table) or column_exists(conn, table, column):
        return False
    conn.execute(f'ALTER TABLE "{table}" ADD COLUMN "{column}" {definition}')
    return True


# ----------------------------------------------------------------------------- lettura delle migrazioni

def list_migrations(directory: Path = MIGRATIONS_DIR):
    out = []
    for path in sorted(directory.iterdir()):
        m = NAME_RE.match(path.name)
        if m:
            out.append((m.group(1), path))
    versions = [v for v, _ in out]
    dup = {v for v in versions if versions.count(v) > 1}
    if dup:
        raise RuntimeError(f"Numeri di migrazione duplicati: {sorted(dup)}")
    return out


def split_sql(script: str):
    """Divide uno script SQL in istruzioni complete (rispetta stringhe e commenti)."""
    statements, buf = [], ""
    for line in script.splitlines(keepends=True):
        buf += line
        if sqlite3.complete_statement(buf):
            stmt = buf.strip()
            if _strip_comments(stmt).strip().rstrip(";").strip():
                statements.append(stmt)
            buf = ""
    if _strip_comments(buf).strip():
        statements.append(buf.strip())
    return statements


def _strip_comments(sql: str) -> str:
    return "\n".join(line for line in sql.splitlines() if not line.strip().startswith("--"))


def _run_sql(conn, path: Path):
    for stmt in split_sql(path.read_text(encoding="utf-8")):
        body = _strip_comments(stmt).strip()
        m = ADD_COLUMN_RE.match(body)
        if m:
            table, column = m.group(1), m.group(2)
            if not table_exists(conn, table) or column_exists(conn, table, column):
                log.info("%s: colonna %s.%s già presente, salto", path.name, table, column)
                continue
        try:
            conn.execute(body)
        except sqlite3.OperationalError as e:
            # Conversioni di dati da colonne legacy che in questo database non esistono: niente da convertire.
            if body.upper().startswith("UPDATE") and "no such column" in str(e):
                log.info("%s: salto conversione legacy (%s)", path.name, e)
                continue
            raise


def _run_py(conn, path: Path):
    spec = importlib.util.spec_from_file_location(f"migration_{path.stem}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.upgrade(conn)


# ----------------------------------------------------------------------------- runner

def _ensure_table(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(10) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at DATETIME NOT NULL
    )""")


def applied_versions(conn):
    _ensure_table(conn)
    return {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}


def _is_fresh(conn) -> bool:
    return not table_exists(conn, "users")


def run_migrations(db_path: str, create_schema=None, directory: Path = MIGRATIONS_DIR, backup: bool = True):
    """Applica le migrazioni mancanti al database ``db_path``.

    ``create_schema`` è una funzione senza argomenti che crea lo schema completo dai modelli: viene usata solo
    su un database nuovo (senza tabelle), dove tutte le migrazioni esistenti vengono segnate come applicate.
    Restituisce l'elenco delle migrazioni applicate.
    """
    migrations = list_migrations(directory)
    conn = sqlite3.connect(db_path, isolation_level=None)
    try:
        conn.execute("PRAGMA foreign_keys=OFF")
        fresh = _is_fresh(conn)
        done = applied_versions(conn)
        if fresh and create_schema is not None:
            conn.close()
            create_schema()
            conn = sqlite3.connect(db_path, isolation_level=None)
            _ensure_table(conn)
            now = datetime.now().isoformat(timespec="seconds")
            conn.executemany("INSERT OR IGNORE INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
                             [(v, p.name, now) for v, p in migrations])
            log.info("Database nuovo: schema creato dai modelli, %d migrazioni segnate come applicate", len(migrations))
            return []
        applied = []
        for version, path in migrations:
            if version in done:
                continue
            if backup:
                backups.create_backup(kind="pre-migrazione", label=path.stem, db_path=db_path)
            log.info("Applico la migrazione %s", path.name)
            conn.execute("BEGIN")
            try:
                if path.suffix == ".sql":
                    _run_sql(conn, path)
                else:
                    _run_py(conn, path)
                conn.execute("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
                             (version, path.name, datetime.now().isoformat(timespec="seconds")))
                conn.execute("COMMIT")
            except Exception:
                conn.execute("ROLLBACK")
                log.exception("Migrazione %s fallita: database lasciato com'era", path.name)
                raise
            applied.append(path.name)
        return applied
    finally:
        conn.close()
