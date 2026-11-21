"""Caption e hashtag sui contenuti del calendario; set di hashtag ricorrenti salvabili per cliente."""
from migrator import add_column


def upgrade(conn):
    add_column(conn, "posts", "caption", "TEXT")
    add_column(conn, "posts", "hashtags", "TEXT")
    conn.execute("""CREATE TABLE IF NOT EXISTS client_hashtag_sets (
        id INTEGER PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        name VARCHAR(80) NOT NULL,
        hashtags TEXT NOT NULL,
        created_at DATETIME
    )""")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_client_hashtag_sets_client ON client_hashtag_sets(client_id)")
