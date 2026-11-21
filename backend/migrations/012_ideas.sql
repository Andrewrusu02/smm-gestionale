-- Banca idee per cliente: idee rapide che con un clic diventano uno script video.
CREATE TABLE IF NOT EXISTS ideas (
    id INTEGER PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    title VARCHAR(255) NOT NULL,
    note TEXT,
    reference_url VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'nuova',
    video_script_id INTEGER REFERENCES video_scripts(id),
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME,
    updated_at DATETIME
);
CREATE INDEX IF NOT EXISTS ix_ideas_client_id ON ideas(client_id);
CREATE INDEX IF NOT EXISTS ix_ideas_status ON ideas(status);
