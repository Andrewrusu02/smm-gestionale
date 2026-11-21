"""Storico rinnovi e cambi di pacchetto/prezzo degli abbonamenti.

Crea subscription_history e ricostruisce lo storico, per quanto possibile, dai pagamenti degli abbonamenti
(descrizione "Pacchetto <Nome> - ciclo <N>", periodo e importo). Le righe ricostruite hanno source = 'ricostruito'.
Se lo stato attuale del cliente è diverso dall'ultimo pagamento, si aggiunge un evento datato al giorno della
migrazione (la data vera non è nota). Nessun dato esistente viene modificato.
"""
import re
from datetime import date, datetime

from migrator import table_exists

NAMES = {"standard": "standard", "silver": "silver", "premium": "premium", "personalizzato": "personalizzato"}
PRICES = {"standard": 300, "silver": 400, "premium": 600}
DESC_RE = re.compile(r"Pacchetto\s+(\w+)(?:\s*-\s*ciclo\s+(\d+))?", re.I)


def upgrade(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS subscription_history (
        id INTEGER PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        event VARCHAR(20) NOT NULL,
        date DATE NOT NULL,
        from_package VARCHAR(20),
        to_package VARCHAR(20),
        from_price FLOAT,
        to_price FLOAT,
        from_cycle INTEGER,
        to_cycle INTEGER,
        billing_cycle VARCHAR(20),
        notes VARCHAR(255),
        source VARCHAR(20) NOT NULL DEFAULT 'app',
        created_by INTEGER REFERENCES users(id),
        created_at DATETIME
    )""")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_subscription_history_client ON subscription_history(client_id, date)")
    if not table_exists(conn, "payments"):
        return
    now = datetime.now().isoformat(sep=" ", timespec="seconds")
    has_deleted = any(r[1] == "deleted_at" for r in conn.execute("PRAGMA table_info(payments)"))
    where = " AND deleted_at IS NULL" if has_deleted else ""
    done = {r[0] for r in conn.execute("SELECT DISTINCT client_id FROM subscription_history")}
    rows = conn.execute(
        "SELECT client_id, period, due_date, amount, description FROM payments "
        f"WHERE kind = 'abbonamento'{where} ORDER BY client_id, period, id").fetchall()
    by_client = {}
    for client_id, period, due, amount, desc in rows:
        by_client.setdefault(client_id, []).append((period, due, amount, desc))

    def insert(client_id, event, day, fp, tp, fpr, tpr, fc, tc, notes):
        conn.execute(
            "INSERT INTO subscription_history(client_id, event, date, from_package, to_package, from_price, to_price, "
            "from_cycle, to_cycle, billing_cycle, notes, source, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (client_id, event, day, fp, tp, fpr, tpr, fc, tc, "mensile", notes, "ricostruito", now))

    for client_id, items in by_client.items():
        if client_id in done:
            continue
        prev = None
        for period, due, amount, desc in items:
            m = DESC_RE.search(desc or "")
            pkg = NAMES.get(m.group(1).lower()) if m else None
            cycle = int(m.group(2)) if m and m.group(2) else None
            day = f"{period}-01" if period else (due or date.today().isoformat())
            if prev is None:
                insert(client_id, "start", day, None, pkg, None, amount, None, cycle, "Primo pagamento dell'abbonamento")
            else:
                p_pkg, p_amount, p_cycle = prev
                changed_pkg = bool(pkg and p_pkg and pkg != p_pkg)
                changed_price = round(amount or 0, 2) != round(p_amount or 0, 2)
                if cycle and p_cycle and cycle > p_cycle:
                    # Un rinnovo può portare con sé il cambio di pacchetto o di prezzo: una sola riga da -> a.
                    note = "Rinnovo con cambio pacchetto" if changed_pkg else "Rinnovo con cambio prezzo" if changed_price else None
                    insert(client_id, "renewal", day, p_pkg, pkg or p_pkg, p_amount, amount, p_cycle, cycle, note)
                elif changed_pkg:
                    insert(client_id, "package_change", day, p_pkg, pkg, p_amount, amount, p_cycle, cycle, None)
                elif changed_price:
                    insert(client_id, "price_change", day, pkg, pkg, p_amount, amount, p_cycle, cycle, None)
            prev = (pkg or (prev[0] if prev else None), amount, cycle or (prev[2] if prev else None))

        current = conn.execute("SELECT package, custom_price FROM clients WHERE id = ?", (client_id,)).fetchone()
        if not current or prev is None:
            continue
        cur_pkg, custom_price = current
        cur_price = custom_price if cur_pkg == "personalizzato" else PRICES.get(cur_pkg)
        today = date.today().isoformat()
        note = "Rilevato all'aggiornamento: data effettiva non nota"
        if not cur_pkg:
            insert(client_id, "stop", today, prev[0], None, prev[1], None, prev[2], None, note)
        elif prev[0] and cur_pkg != prev[0]:
            insert(client_id, "package_change", today, prev[0], cur_pkg, prev[1], cur_price, prev[2], None, note)
