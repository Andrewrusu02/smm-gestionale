-- Spese generali dell'agenzia: ricorrenti (abbonamenti, affitto…) e una tantum (attrezzatura…).
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    category VARCHAR(40) NOT NULL DEFAULT 'altro',
    amount FLOAT NOT NULL DEFAULT 0,
    kind VARCHAR(20) NOT NULL DEFAULT 'one_off',
    date DATE NOT NULL,
    frequency VARCHAR(20),
    end_date DATE,
    notes TEXT,
    created_at DATETIME,
    updated_at DATETIME
);
CREATE INDEX IF NOT EXISTS ix_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS ix_expenses_category ON expenses(category);
