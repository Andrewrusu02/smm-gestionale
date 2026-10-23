-- Financial separation for operational tasks and completion logs.
ALTER TABLE tasks ADD COLUMN activity_type VARCHAR(20) NOT NULL DEFAULT 'SINGLE_JOB';
ALTER TABLE tasks ADD COLUMN start_date DATE;
ALTER TABLE tasks ADD COLUMN subscription_included BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN assigned_to_id INTEGER REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN price_charged_to_client FLOAT NOT NULL DEFAULT 0;

ALTER TABLE work_logs ADD COLUMN completed_by_id INTEGER REFERENCES users(id);
ALTER TABLE work_logs ADD COLUMN revenue_amount FLOAT NOT NULL DEFAULT 0;
ALTER TABLE work_logs ADD COLUMN worker_expense FLOAT NOT NULL DEFAULT 0;

-- Legacy values represented the same client-side amount in multiple cost fields.
UPDATE tasks SET price_charged_to_client = COALESCE(price, 0)
WHERE price_charged_to_client = 0 AND price IS NOT NULL;
UPDATE tasks SET assigned_to_id = assignee_id
WHERE assigned_to_id IS NULL AND assignee_id IS NOT NULL;
UPDATE work_logs SET completed_by_id = completed_by
WHERE completed_by_id IS NULL AND completed_by IS NOT NULL;
UPDATE work_logs SET revenue_amount = COALESCE(billing_amount, 0)
WHERE revenue_amount = 0 AND billing_amount IS NOT NULL;
