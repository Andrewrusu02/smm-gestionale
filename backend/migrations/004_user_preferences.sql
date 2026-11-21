-- Preferenze personali salvate sul server (prima erano nel localStorage del browser).
ALTER TABLE users ADD COLUMN avatar_path VARCHAR(255);
ALTER TABLE users ADD COLUMN theme VARCHAR(10);
ALTER TABLE users ADD COLUMN home_page VARCHAR(80);
ALTER TABLE users ADD COLUMN preferences_migrated BOOLEAN NOT NULL DEFAULT 0;
