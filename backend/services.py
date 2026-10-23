import calendar
from datetime import date, timedelta
from sqlalchemy import func
from models import Client, Payment, Post, Task, utcnow

PACKAGES = {
    "standard": {"name": "Standard", "price": 300, "limits": {"reel": 4, "sessione": 2, "carosello": 4, "grafica": 5}},
    "silver": {"name": "Silver", "price": 400, "limits": {"reel": 6, "sessione": 2, "carosello": 4, "grafica": 5}},
    "premium": {"name": "Premium", "price": 600, "limits": {"reel": 8, "sessione": 3, "carosello": 5, "grafica": 10}},
}
CONTENT_TYPES = {
    "reel": "Reel", "storia": "Storie", "carosello": "Carosello",
    "grafica": "Grafica", "post": "Post", "sessione": "Sessione di registrazione",
}
TASK_PREFIX = {
    "reel": "Montaggio Reel", "storia": "Creazione Storie", "carosello": "Creazione Carosello",
    "grafica": "Creazione Grafica", "post": "Preparazione Post", "sessione": "Sessione di registrazione",
}
LIMIT_TYPES = ["reel", "sessione", "carosello", "grafica"]
CUSTOM_TYPES = ["reel", "sessione", "carosello", "grafica", "storia"]
PACKAGE_KEYS = [*PACKAGES.keys(), "personalizzato"]


def package_for(client):
    if not client.package:
        return None
    if client.package == "personalizzato":
        return {"name": "Personalizzato", "price": client.custom_price or 0,
                "limits": {t: getattr(client, f"custom_{t}") or 0 for t in CUSTOM_TYPES}}
    return PACKAGES.get(client.package)


def period_of(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def month_bounds(period: str):
    y, m = map(int, period.split("-"))
    return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])


def shift_period(period: str, delta: int) -> str:
    y, m = map(int, period.split("-"))
    idx = y * 12 + (m - 1) + delta
    return f"{idx // 12:04d}-{idx % 12 + 1:02d}"


CREDITS_EXHAUSTED_MSG = "Attenzione: questo cliente ha esaurito i crediti per questo contenuto"


def create_cycle_payment(db, client: Client, cycle: int):
    pkg = package_for(client)
    if not pkg:
        return
    period, due_date = subscription_period_and_due_date(client)
    db.add(Payment(
        client_id=client.id,
        kind="abbonamento",
        period=period,
        amount=pkg["price"],
        description=f"Pacchetto {pkg['name']} - ciclo {cycle}",
        due_date=due_date,
        status="in_attesa",
    ))


def subscription_period_and_due_date(client: Client, reference: date | None = None):
    reference = reference or date.today()
    start = client.start_date or reference
    cycle = start if start > reference else reference
    period = period_of(cycle)
    due_day = min(start.day, calendar.monthrange(cycle.year, cycle.month)[1])
    return period, date(cycle.year, cycle.month, due_day)


def ensure_subscription_payment(db, client: Client, cycle: int | None = None):
    pkg = package_for(client)
    if not pkg:
        return None
    period, due_date = subscription_period_and_due_date(client)
    payment = db.query(Payment).filter(
        Payment.client_id == client.id,
        Payment.kind == "abbonamento",
        Payment.period == period,
    ).order_by(Payment.id.desc()).first()
    if payment:
        if payment.paid_date is None:
            payment.amount = pkg["price"]
            payment.due_date = due_date
            payment.description = payment.description or f"Pacchetto {pkg['name']} - ciclo {cycle or client.cycle_number or 1}"
        return payment
    payment = Payment(
        client_id=client.id,
        kind="abbonamento",
        period=period,
        amount=pkg["price"],
        description=f"Pacchetto {pkg['name']} - ciclo {cycle or client.cycle_number or 1}",
        due_date=due_date,
        status="in_attesa",
    )
    db.add(payment)
    return payment


def backfill_cycles(db):
    db.query(Client).filter(Client.cycle_number.is_(None)).update({"cycle_number": 1}, synchronize_session=False)
    db.query(Post).filter(Post.cycle_number.is_(None)).update({"cycle_number": 1}, synchronize_session=False)
    db.commit()


def refresh_payment_statuses(db):
    today = date.today()
    # Subscription deadlines are derived from the current client start date.
    # This also repairs old records when an existing subscription is moved.
    for payment in db.query(Payment).filter(Payment.kind == "abbonamento", Payment.paid_date.is_(None)).all():
        client = payment.client
        if client and client.start_date and payment.period:
            year, month = map(int, payment.period.split("-"))
            day = min(client.start_date.day, calendar.monthrange(year, month)[1])
            payment.due_date = date(year, month, day)
    db.query(Payment).filter(Payment.paid_date.is_(None), Payment.due_date < today, Payment.status != "in_ritardo") \
        .update({"status": "in_ritardo"}, synchronize_session=False)
    db.query(Payment).filter(Payment.paid_date.is_(None), Payment.due_date >= today, Payment.status == "in_ritardo") \
        .update({"status": "in_attesa"}, synchronize_session=False)
    db.commit()


def client_usage(db, client: Client):
    pkg = package_for(client)
    if not pkg:
        return None
    rows = db.query(Post.content_type, Post.status, func.count(Post.id)) \
        .filter(Post.client_id == client.id, Post.cycle_number == (client.cycle_number or 1)) \
        .group_by(Post.content_type, Post.status).all()
    task_rows = db.query(Task.category_service, Task.status, func.count(Task.id)) \
        .filter(Task.client_id == client.id, Task.cycle_number == (client.cycle_number or 1),
                Task.subscription_included.is_(True)) \
        .group_by(Task.category_service, Task.status).all()
    limits = pkg["limits"]
    types = [t for t in CUSTOM_TYPES if t in limits and (client.package != "personalizzato" or limits[t] > 0)]
    out = []
    for t in types:
        used = sum(n for ct, _, n in rows if ct == t) + sum(n for ct, _, n in task_rows if ct == t)
        out.append({
            "type": t, "label": CONTENT_TYPES[t], "limit": limits[t], "used": used,
            "delivered": sum(n for ct, st, n in rows if ct == t and st == "consegnato")
            + sum(n for ct, st, n in task_rows if ct == t and st == "completato"),
            "remaining": max(limits[t] - used, 0), "over": max(used - limits[t], 0),
        })
    return out


def task_credit_check(db, client: Client, category_service: str):
    pkg = package_for(client)
    if not pkg or category_service not in pkg["limits"]:
        return None
    post_used = db.query(func.count(Post.id)).filter(
        Post.client_id == client.id,
        Post.content_type == category_service,
        Post.cycle_number == (client.cycle_number or 1),
    ).scalar() or 0
    task_used = db.query(func.count(Task.id)).filter(
        Task.client_id == client.id,
        Task.cycle_number == (client.cycle_number or 1),
        Task.category_service == category_service,
        Task.subscription_included.is_(True),
    ).scalar() or 0
    limit = pkg["limits"][category_service]
    return {"limit": limit, "used": post_used + task_used, "remaining": limit - post_used - task_used}


def credit_check(db, client: Client, content_type: str, exclude_post_id=None):
    pkg = package_for(client)
    if not pkg or content_type not in pkg["limits"]:
        return None
    q = db.query(Post).filter(Post.client_id == client.id, Post.content_type == content_type,
                              Post.cycle_number == (client.cycle_number or 1))
    if exclude_post_id:
        q = q.filter(Post.id != exclude_post_id)
    limit = pkg["limits"][content_type]
    used = q.count()
    return {"limit": limit, "used": used, "remaining": limit - used}


def sync_task_for_post(db, post: Post, client_name: str):
    title = f"{TASK_PREFIX[post.content_type]} - {client_name}"
    task = db.query(Task).filter_by(post_id=post.id).first()
    if not task:
        db.add(Task(
            title=title, description=post.title, client_id=post.client_id, post_id=post.id,
            due_date=post.scheduled_at.date(), auto_generated=True, status="da_fare", priority="media",
        ))
    else:
        task.title, task.client_id, task.due_date = title, post.client_id, post.scheduled_at.date()


def apply_task_status(task: Task, new_status: str):
    if new_status == task.status:
        return
    if new_status == "completato":
        task.completed_at = utcnow()
        if task.post:
            task.post.status = "consegnato"
    elif task.status == "completato":
        task.completed_at = None
        if task.post:
            task.post.status = "programmato"
    task.status = new_status


def worklog_cost(user, hours, fixed_cost) -> float:
    if fixed_cost is not None:
        return round(fixed_cost, 2)
    return round((hours or 0) * (user.hourly_rate or 0), 2)
