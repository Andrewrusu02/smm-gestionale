-- Disponibilità del team: ferie, permessi e indisponibilità.
CREATE TABLE IF NOT EXISTS user_absences (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    kind VARCHAR(20) NOT NULL DEFAULT 'ferie',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    note VARCHAR(255),
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME
);
CREATE INDEX IF NOT EXISTS ix_user_absences_user ON user_absences(user_id, start_date, end_date);
