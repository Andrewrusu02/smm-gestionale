import os
from datetime import date, datetime
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.environ["DATABASE_URL"]
IS_SQLITE = DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    db_path = DATABASE_URL.split("sqlite:///", 1)[1]
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if IS_SQLITE else {},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    def to_dict(self, exclude=()):
        out = {}
        for col in self.__table__.columns:
            if col.name in exclude:
                continue
            val = getattr(self, col.name)
            if isinstance(val, (datetime, date)):
                val = val.isoformat()
            out[col.name] = val
        return out


def add_missing_columns():
    insp = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            existing = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name not in existing:
                    conn.execute(text(f'ALTER TABLE {table.name} ADD COLUMN {col.name} {col.type.compile(engine.dialect)}'))
        task_columns = {c["name"] for c in insp.get_columns("tasks")} if insp.has_table("tasks") else set()
        if {"price", "price_charged_to_client"} <= task_columns:
            conn.execute(text("UPDATE tasks SET price_charged_to_client = COALESCE(price, 0) "
                              "WHERE price_charged_to_client = 0 AND price IS NOT NULL"))
        if {"assignee_id", "assigned_to_id"} <= task_columns:
            conn.execute(text("UPDATE tasks SET assigned_to_id = assignee_id "
                              "WHERE assigned_to_id IS NULL AND assignee_id IS NOT NULL"))
        log_columns = {c["name"] for c in insp.get_columns("work_logs")} if insp.has_table("work_logs") else set()
        if {"completed_by", "completed_by_id"} <= log_columns:
            conn.execute(text("UPDATE work_logs SET completed_by_id = completed_by "
                              "WHERE completed_by_id IS NULL AND completed_by IS NOT NULL"))
        if {"billing_amount", "revenue_amount"} <= log_columns:
            conn.execute(text("UPDATE work_logs SET revenue_amount = COALESCE(billing_amount, 0) "
                              "WHERE revenue_amount = 0 AND billing_amount IS NOT NULL"))
        if insp.has_table("payments"):
            conn.execute(text("UPDATE payments SET kind = 'single_job' WHERE kind = 'occasionale'"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
