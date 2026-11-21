"""Prezzi dei lavori extra: listino, sconto e prezzo finale; listino personalizzato per cliente e categoria.

Il prezzo finale resta in tasks.price_charged_to_client (usato dai pagamenti). Per i task già esistenti il prezzo
di listino viene impostato uguale al prezzo applicato, senza sconto: nessun importo cambia.
"""
from migrator import add_column


def upgrade(conn):
    add_column(conn, "tasks", "list_price", "FLOAT")
    add_column(conn, "tasks", "discount_type", "VARCHAR(10)")
    add_column(conn, "tasks", "discount_value", "FLOAT NOT NULL DEFAULT 0")
    conn.execute("UPDATE tasks SET list_price = price_charged_to_client "
                 "WHERE list_price IS NULL AND price_charged_to_client > 0")
    conn.execute("""CREATE TABLE IF NOT EXISTS client_price_list (
        id INTEGER PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        category_service VARCHAR(40) NOT NULL,
        price FLOAT NOT NULL DEFAULT 0,
        notes VARCHAR(255),
        updated_at DATETIME
    )""")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_client_price_list ON client_price_list(client_id, category_service)")
