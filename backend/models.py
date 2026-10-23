from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship, synonym
from database import Base


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(120), nullable=False)
    role = Column(String(20), nullable=False, default="dipendente")
    password_hash = Column(String(255), nullable=False)
    phone = Column(String(40))
    job_title = Column(String(120))
    hourly_rate = Column(Float, default=0)
    monthly_salary = Column(Float, default=0)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)


class Client(Base):
    __tablename__ = "clients"
    id = Column(Integer, primary_key=True)
    name = Column(String(160), nullable=False)
    company_name = Column(String(160))
    status = Column(String(20), default="ACTIVE", nullable=False)
    package = Column(String(20))  # standard | silver | premium | personalizzato
    custom_price = Column(Float)
    custom_reel = Column(Integer)
    custom_sessione = Column(Integer)
    custom_carosello = Column(Integer)
    custom_grafica = Column(Integer)
    custom_storia = Column(Integer)
    contact_name = Column(String(120))
    email = Column(String(255))
    phone = Column(String(40))
    vat_number = Column(String(40))
    notes = Column(Text)
    project_description = Column(Text)
    billing_day = Column(Integer, default=5)
    start_date = Column(Date)
    active = Column(Boolean, default=True)
    cycle_number = Column(Integer, default=1)
    cycle_started_at = Column(DateTime, default=utcnow)
    created_at = Column(DateTime, default=utcnow)

    posts = relationship("Post", back_populates="client", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="client", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="client", cascade="all, delete-orphan")
    quotes = relationship("Quote", back_populates="client", cascade="all, delete-orphan")
    contracts = relationship("Contract", back_populates="client", cascade="all, delete-orphan")
    video_scripts = relationship("VideoScript", back_populates="client", cascade="all, delete-orphan")
    work_logs = relationship("WorkLog", back_populates="client", cascade="all, delete-orphan")


class Contract(Base):
    __tablename__ = "contracts"
    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    type = Column(String(20), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text)
    start_date = Column(Date)
    price = Column(Float, nullable=False, default=0)
    billing_frequency = Column(String(20))
    due_date = Column(Date)
    status = Column(String(20), nullable=False, default="ACTIVE")
    created_at = Column(DateTime, default=utcnow)

    client = relationship("Client", back_populates="contracts")
    tasks = relationship("Task", back_populates="contract")
    work_logs = relationship("WorkLog", back_populates="contract")


class VideoScript(Base):
    __tablename__ = "video_scripts"
    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    concept = Column(Text)
    script_body = Column(Text, nullable=False, default="")
    status = Column(String(30), nullable=False, default="BOZZA", index=True)
    shooting_date = Column(Date, index=True)
    notes = Column(Text)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    client = relationship("Client", back_populates="video_scripts", foreign_keys=[client_id])


class Post(Base):
    __tablename__ = "posts"
    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    content_type = Column(String(20), nullable=False)
    scheduled_at = Column(DateTime, nullable=False, index=True)
    duration_minutes = Column(Integer, default=60)
    description = Column(Text)
    status = Column(String(20), default="programmato")  # programmato | consegnato
    cycle_number = Column(Integer)
    google_event_id = Column(String(255), index=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    client = relationship("Client", back_populates="posts")
    task = relationship("Task", back_populates="post", uselist=False)


class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    client_id = Column(Integer, ForeignKey("clients.id"), index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), index=True)
    post_id = Column(Integer, ForeignKey("posts.id"), index=True)
    category_service = Column(String(40))
    cycle_number = Column(Integer)
    activity_type = Column(String(20), nullable=False, default="SINGLE_JOB")
    start_date = Column(Date)
    subscription_included = Column(Boolean, nullable=False, default=False)
    status = Column(String(20), default="da_fare")
    priority = Column(String(10), default="media")
    assigned_to_id = Column(Integer, ForeignKey("users.id"), index=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    due_date = Column(Date)
    price_charged_to_client = Column(Float, nullable=False, default=0)
    auto_generated = Column(Boolean, default=False)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=utcnow)

    client = relationship("Client", back_populates="tasks")
    contract = relationship("Contract", back_populates="tasks")
    post = relationship("Post", back_populates="task")
    assignee = relationship("User", foreign_keys=[assigned_to_id])
    payments = relationship("Payment", back_populates="task")
    assignee_id = synonym("assigned_to_id")
    price = synonym("price_charged_to_client")


class WorkLog(Base):
    __tablename__ = "work_logs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"))
    contract_id = Column(Integer, ForeignKey("contracts.id"), index=True)
    task_title = Column(String(255))
    completed_by_id = Column(Integer, ForeignKey("users.id"), index=True)
    completed_at = Column(DateTime)
    notes = Column(Text)
    revenue_amount = Column(Float, nullable=False, default=0)
    date = Column(Date, nullable=False, index=True)
    description = Column(Text, nullable=False)
    hours = Column(Float, default=0)
    worker_expense = Column(Float, nullable=False, default=0)
    cost = Column(Float, default=0)
    created_at = Column(DateTime, default=utcnow)

    user = relationship("User", foreign_keys=[user_id])
    client = relationship("Client", back_populates="work_logs", foreign_keys=[client_id])
    task = relationship("Task")
    contract = relationship("Contract", back_populates="work_logs")
    completed_by = relationship("User", foreign_keys=[completed_by_id])
    billing_amount = synonym("revenue_amount")
    fixed_cost = synonym("worker_expense")


class Payment(Base):
    __tablename__ = "payments"
    id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), index=True)
    kind = Column(String(20), nullable=False)  # abbonamento | single_job
    description = Column(String(255))
    invoice_number = Column(String(60))
    amount = Column(Float, nullable=False)
    period = Column(String(7), index=True)
    due_date = Column(Date, nullable=False, index=True)
    paid_date = Column(Date)
    status = Column(String(20), default="in_attesa")  # in_attesa | saldato | in_ritardo
    notes = Column(Text)
    created_at = Column(DateTime, default=utcnow)

    client = relationship("Client", back_populates="payments")
    task = relationship("Task", back_populates="payments")


class Quote(Base):
    __tablename__ = "quotes"
    id = Column(Integer, primary_key=True)
    number = Column(String(40), unique=True, nullable=False, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False, index=True)
    issue_date = Column(Date, nullable=False)
    delivery_date = Column(Date)
    validity_date = Column(Date)
    status = Column(String(20), default="bozza", nullable=False)
    notes = Column(Text)
    subtotal = Column(Float, default=0, nullable=False)
    tax_rate = Column(Float, default=0, nullable=False)
    total = Column(Float, default=0, nullable=False)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    client = relationship("Client", back_populates="quotes")
    items = relationship("QuoteItem", back_populates="quote", cascade="all, delete-orphan",
                          order_by="QuoteItem.position")


class QuoteItem(Base):
    __tablename__ = "quote_items"
    id = Column(Integer, primary_key=True)
    quote_id = Column(Integer, ForeignKey("quotes.id"), nullable=False, index=True)
    description = Column(String(255), nullable=False)
    quantity = Column(Float, default=1, nullable=False)
    unit_price = Column(Float, default=0, nullable=False)
    total = Column(Float, default=0, nullable=False)
    position = Column(Integer, default=0, nullable=False)

    quote = relationship("Quote", back_populates="items")


class Setting(Base):
    __tablename__ = "settings"
    key = Column(String(80), primary_key=True)
    value = Column(Text)


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    identifier = Column(String(320), primary_key=True)
    count = Column(Integer, default=0)
    last_at = Column(DateTime, default=utcnow)


class Lead(Base):
    __tablename__ = "leads"
    id = Column(Integer, primary_key=True)
    name = Column(String(160), nullable=False)
    contact_name = Column(String(120))
    email = Column(String(255))
    phone = Column(String(40))
    meeting_at = Column(DateTime, index=True)
    duration_minutes = Column(Integer, default=60)
    location = Column(String(255))
    notes = Column(Text)
    status = Column(String(20), default="nuovo")  # nuovo | appuntamento | trattativa | convertito | perso
    converted_client_id = Column(Integer, ForeignKey("clients.id"))
    google_event_id = Column(String(255), index=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
