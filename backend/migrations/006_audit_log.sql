-- Registro delle modifiche (chi, quando, cosa: valori prima/dopo in JSON).
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY,
    created_at DATETIME NOT NULL,
    user_id INTEGER REFERENCES users(id),
    user_name VARCHAR(120),
    entity VARCHAR(40) NOT NULL,
    entity_id INTEGER,
    action VARCHAR(20) NOT NULL,
    before_json TEXT,
    after_json TEXT,
    summary VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS ix_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS ix_audit_log_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS ix_audit_log_user_id ON audit_log(user_id);
