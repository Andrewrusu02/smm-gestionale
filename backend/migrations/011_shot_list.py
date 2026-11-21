"""Shot list delle sessioni di registrazione: location, persone e script collegato sul contenuto,
scene e attrezzatura come elementi spuntabili."""
from migrator import add_column


def upgrade(conn):
    add_column(conn, "posts", "location", "VARCHAR(255)")
    add_column(conn, "posts", "people", "TEXT")
    add_column(conn, "posts", "video_script_id", "INTEGER REFERENCES video_scripts(id)")
    conn.execute("""CREATE TABLE IF NOT EXISTS shot_list_items (
        id INTEGER PRIMARY KEY,
        post_id INTEGER NOT NULL REFERENCES posts(id),
        kind VARCHAR(20) NOT NULL DEFAULT 'scene',
        position INTEGER NOT NULL DEFAULT 0,
        description VARCHAR(500) NOT NULL,
        framing VARCHAR(120),
        duration_seconds INTEGER,
        done BOOLEAN NOT NULL DEFAULT 0,
        done_at DATETIME,
        done_by INTEGER REFERENCES users(id)
    )""")
    conn.execute("CREATE INDEX IF NOT EXISTS ix_shot_list_items_post ON shot_list_items(post_id, kind, position)")
