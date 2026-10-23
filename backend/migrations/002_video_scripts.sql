ALTER TABLE contracts ADD COLUMN description TEXT;
ALTER TABLE contracts ADD COLUMN start_date DATE;

CREATE TABLE IF NOT EXISTS video_scripts (
    id INTEGER PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    concept TEXT,
    script_body TEXT NOT NULL DEFAULT '',
    status VARCHAR(30) NOT NULL DEFAULT 'BOZZA',
    shooting_date DATE,
    notes TEXT,
    created_at DATETIME,
    updated_at DATETIME
);

CREATE INDEX IF NOT EXISTS ix_video_scripts_client_id ON video_scripts(client_id);
CREATE INDEX IF NOT EXISTS ix_video_scripts_shooting_date ON video_scripts(shooting_date);
CREATE INDEX IF NOT EXISTS ix_video_scripts_status ON video_scripts(status);
