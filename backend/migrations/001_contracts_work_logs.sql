ALTER TABLE clients ADD COLUMN company_name VARCHAR(160);
ALTER TABLE clients ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    type VARCHAR(20) NOT NULL,
    title VARCHAR(255) NOT NULL,
    price FLOAT NOT NULL DEFAULT 0,
    billing_frequency VARCHAR(20),
    due_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME
);
ALTER TABLE tasks ADD COLUMN contract_id INTEGER REFERENCES contracts(id);
ALTER TABLE work_logs ADD COLUMN contract_id INTEGER REFERENCES contracts(id);
ALTER TABLE work_logs ADD COLUMN task_title VARCHAR(255);
ALTER TABLE work_logs ADD COLUMN completed_by INTEGER REFERENCES users(id);
ALTER TABLE work_logs ADD COLUMN completed_at DATETIME;
ALTER TABLE work_logs ADD COLUMN notes TEXT;
ALTER TABLE work_logs ADD COLUMN billing_amount FLOAT;
