-- Schema (solo struttura, nessun dato) del database di produzione prima della migrazione 004.
CREATE TABLE clients (
	id INTEGER NOT NULL, 
	name VARCHAR(160) NOT NULL, 
	company_name VARCHAR(160), 
	status VARCHAR(20) NOT NULL, 
	package VARCHAR(20), 
	custom_price FLOAT, 
	custom_reel INTEGER, 
	custom_sessione INTEGER, 
	custom_carosello INTEGER, 
	custom_grafica INTEGER, 
	custom_storia INTEGER, 
	contact_name VARCHAR(120), 
	email VARCHAR(255), 
	phone VARCHAR(40), 
	vat_number VARCHAR(40), 
	notes TEXT, 
	project_description TEXT, 
	billing_day INTEGER, 
	start_date DATE, 
	active BOOLEAN, 
	cycle_number INTEGER, 
	cycle_started_at DATETIME, 
	created_at DATETIME, 
	PRIMARY KEY (id)
);

CREATE TABLE contracts (
	id INTEGER NOT NULL, 
	client_id INTEGER NOT NULL, 
	type VARCHAR(20) NOT NULL, 
	title VARCHAR(255) NOT NULL, 
	description TEXT, 
	start_date DATE, 
	price FLOAT NOT NULL, 
	billing_frequency VARCHAR(20), 
	due_date DATE, 
	status VARCHAR(20) NOT NULL, 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(client_id) REFERENCES clients (id)
);

CREATE TABLE leads (
	id INTEGER NOT NULL, 
	name VARCHAR(160) NOT NULL, 
	contact_name VARCHAR(120), 
	email VARCHAR(255), 
	phone VARCHAR(40), 
	meeting_at DATETIME, 
	duration_minutes INTEGER, 
	location VARCHAR(255), 
	notes TEXT, 
	status VARCHAR(20), 
	converted_client_id INTEGER, 
	google_event_id VARCHAR(255), 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(converted_client_id) REFERENCES clients (id)
);

CREATE TABLE login_attempts (
	identifier VARCHAR(320) NOT NULL, 
	count INTEGER, 
	last_at DATETIME, 
	PRIMARY KEY (identifier)
);

CREATE TABLE payments (
	id INTEGER NOT NULL, 
	client_id INTEGER NOT NULL, 
	task_id INTEGER, 
	kind VARCHAR(20) NOT NULL, 
	description VARCHAR(255), 
	invoice_number VARCHAR(60), 
	amount FLOAT NOT NULL, 
	period VARCHAR(7), 
	due_date DATE NOT NULL, 
	paid_date DATE, 
	status VARCHAR(20), 
	notes TEXT, 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(client_id) REFERENCES clients (id), 
	FOREIGN KEY(task_id) REFERENCES tasks (id)
);

CREATE TABLE posts (
	id INTEGER NOT NULL, 
	client_id INTEGER NOT NULL, 
	title VARCHAR(200) NOT NULL, 
	content_type VARCHAR(20) NOT NULL, 
	scheduled_at DATETIME NOT NULL, 
	duration_minutes INTEGER, 
	description TEXT, 
	status VARCHAR(20), 
	cycle_number INTEGER, 
	google_event_id VARCHAR(255), 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(client_id) REFERENCES clients (id)
);

CREATE TABLE quote_items (
	id INTEGER NOT NULL, 
	quote_id INTEGER NOT NULL, 
	description VARCHAR(255) NOT NULL, 
	quantity FLOAT NOT NULL, 
	unit_price FLOAT NOT NULL, 
	total FLOAT NOT NULL, 
	position INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(quote_id) REFERENCES quotes (id)
);

CREATE TABLE quotes (
	id INTEGER NOT NULL, 
	number VARCHAR(40) NOT NULL, 
	client_id INTEGER NOT NULL, 
	issue_date DATE NOT NULL, 
	delivery_date DATE, 
	validity_date DATE, 
	status VARCHAR(20) NOT NULL, 
	notes TEXT, 
	subtotal FLOAT NOT NULL, 
	tax_rate FLOAT NOT NULL, 
	total FLOAT NOT NULL, 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(client_id) REFERENCES clients (id)
);

CREATE TABLE settings (
	"key" VARCHAR(80) NOT NULL, 
	value TEXT, 
	PRIMARY KEY ("key")
);

CREATE TABLE tasks (
	id INTEGER NOT NULL, 
	title VARCHAR(200) NOT NULL, 
	description TEXT, 
	client_id INTEGER, 
	contract_id INTEGER, 
	post_id INTEGER, 
	category_service VARCHAR(40), 
	cycle_number INTEGER, 
	activity_type VARCHAR(20) NOT NULL, 
	start_date DATE, 
	subscription_included BOOLEAN NOT NULL, 
	status VARCHAR(20), 
	priority VARCHAR(10), 
	assigned_to_id INTEGER, 
	created_by INTEGER, 
	due_date DATE, 
	price_charged_to_client FLOAT NOT NULL, 
	auto_generated BOOLEAN, 
	completed_at DATETIME, 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(client_id) REFERENCES clients (id), 
	FOREIGN KEY(contract_id) REFERENCES contracts (id), 
	FOREIGN KEY(post_id) REFERENCES posts (id), 
	FOREIGN KEY(assigned_to_id) REFERENCES users (id), 
	FOREIGN KEY(created_by) REFERENCES users (id)
);

CREATE TABLE users (
	id INTEGER NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	role VARCHAR(20) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	phone VARCHAR(40), 
	job_title VARCHAR(120), 
	hourly_rate FLOAT, 
	monthly_salary FLOAT, 
	active BOOLEAN, 
	created_at DATETIME, 
	PRIMARY KEY (id)
);

CREATE TABLE video_scripts (
	id INTEGER NOT NULL, 
	client_id INTEGER NOT NULL, 
	title VARCHAR(255) NOT NULL, 
	concept TEXT, 
	script_body TEXT NOT NULL, 
	status VARCHAR(30) NOT NULL, 
	shooting_date DATE, 
	notes TEXT, 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(client_id) REFERENCES clients (id)
);

CREATE TABLE work_logs (
	id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	client_id INTEGER, 
	task_id INTEGER, 
	contract_id INTEGER, 
	task_title VARCHAR(255), 
	completed_by_id INTEGER, 
	completed_at DATETIME, 
	notes TEXT, 
	revenue_amount FLOAT NOT NULL, 
	date DATE NOT NULL, 
	description TEXT NOT NULL, 
	hours FLOAT, 
	worker_expense FLOAT NOT NULL, 
	cost FLOAT, 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	FOREIGN KEY(client_id) REFERENCES clients (id), 
	FOREIGN KEY(task_id) REFERENCES tasks (id), 
	FOREIGN KEY(contract_id) REFERENCES contracts (id), 
	FOREIGN KEY(completed_by_id) REFERENCES users (id)
);

CREATE INDEX ix_contracts_client_id ON contracts (client_id);

CREATE INDEX ix_contracts_type ON contracts (type);

CREATE INDEX ix_leads_google_event_id ON leads (google_event_id);

CREATE INDEX ix_leads_meeting_at ON leads (meeting_at);

CREATE INDEX ix_payments_client_id ON payments (client_id);

CREATE INDEX ix_payments_due_date ON payments (due_date);

CREATE INDEX ix_payments_period ON payments (period);

CREATE INDEX ix_payments_task_id ON payments (task_id);

CREATE INDEX ix_posts_client_id ON posts (client_id);

CREATE INDEX ix_posts_google_event_id ON posts (google_event_id);

CREATE INDEX ix_posts_scheduled_at ON posts (scheduled_at);

CREATE INDEX ix_quote_items_quote_id ON quote_items (quote_id);

CREATE INDEX ix_quotes_client_id ON quotes (client_id);

CREATE UNIQUE INDEX ix_quotes_number ON quotes (number);

CREATE INDEX ix_tasks_assigned_to_id ON tasks (assigned_to_id);

CREATE INDEX ix_tasks_client_id ON tasks (client_id);

CREATE INDEX ix_tasks_contract_id ON tasks (contract_id);

CREATE INDEX ix_tasks_post_id ON tasks (post_id);

CREATE UNIQUE INDEX ix_users_email ON users (email);

CREATE INDEX ix_video_scripts_client_id ON video_scripts (client_id);

CREATE INDEX ix_video_scripts_shooting_date ON video_scripts (shooting_date);

CREATE INDEX ix_video_scripts_status ON video_scripts (status);

CREATE INDEX ix_work_logs_client_id ON work_logs (client_id);

CREATE INDEX ix_work_logs_completed_by_id ON work_logs (completed_by_id);

CREATE INDEX ix_work_logs_contract_id ON work_logs (contract_id);

CREATE INDEX ix_work_logs_date ON work_logs (date);

CREATE INDEX ix_work_logs_user_id ON work_logs (user_id);

