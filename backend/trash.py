"""Cestino: eliminazioni logiche, ripristino ed eliminazione definitiva dopo 30 giorni.

- Ogni SELECT dell'ORM esclude in automatico gli elementi con ``deleted_at`` valorizzato (listener
  ``do_orm_execute`` con ``with_loader_criteria``): valgono quindi anche totali, dashboard, notifiche e relazioni.
  Per vederli serve ``session.info["include_deleted"] = True`` oppure l'opzione ``include_deleted``.
- Gli elementi eliminati insieme (es. un cliente con i suoi task e pagamenti) condividono ``deleted_batch``
  e si ripristinano insieme. Il primo elemento del gruppo è la "radice" mostrata nel cestino.
"""
import logging
import secrets
import asyncio
from datetime import timedelta

from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria

from models import Client, Contract, Payment, Post, Quote, SoftDelete, Task, VideoScript, WorkLog, utcnow

log = logging.getLogger("trash")
RETENTION_DAYS = 30
ENTITIES = {
    "client": Client, "task": Task, "post": Post, "payment": Payment, "work_log": WorkLog,
    "quote": Quote, "video_script": VideoScript, "contract": Contract,
}
ENTITY_OF = {cls: key for key, cls in ENTITIES.items()}
LABELS = {
    "client": "Cliente", "task": "Task", "post": "Contenuto", "payment": "Pagamento",
    "work_log": "Lavoro registrato", "quote": "Preventivo", "video_script": "Script video", "contract": "Contratto",
}


@event.listens_for(Session, "do_orm_execute")
def _exclude_deleted(state):
    if not state.is_select or state.execution_options.get("include_deleted") or state.session.info.get("include_deleted"):
        return
    state.statement = state.statement.options(*[
        with_loader_criteria(cls, lambda c: c.deleted_at.is_(None), include_aliases=True)
        for cls in ENTITIES.values()
    ])


class include_deleted:
    """Context manager: dentro il blocco la sessione vede anche gli elementi nel cestino."""

    def __init__(self, db):
        self.db = db

    def __enter__(self):
        self.prev = self.db.info.get("include_deleted")
        self.db.info["include_deleted"] = True
        return self.db

    def __exit__(self, *exc):
        if self.prev:
            self.db.info["include_deleted"] = self.prev
        else:
            self.db.info.pop("include_deleted", None)


def new_batch(root) -> str:
    return f"{ENTITY_OF[type(root)]}-{root.id}-{secrets.token_hex(4)}"


def soft_delete(db, root, user=None, linked=(), batch=None):
    """Mette nel cestino ``root`` e gli elementi collegati (solo quelli non già eliminati)."""
    batch = batch or new_batch(root)
    now = utcnow()
    user_id = getattr(user, "id", None)
    for obj in (root, *linked):
        if obj is None or obj.deleted_at is not None:
            continue
        obj.deleted_at, obj.deleted_batch, obj.deleted_by = now, batch, user_id
    return batch


def root_of(batch: str):
    try:
        entity, oid, _ = batch.rsplit("-", 2)
        return entity, int(oid)
    except (AttributeError, ValueError):
        return None, None


def batch_items(db, batch):
    with include_deleted(db):
        return [obj for cls in ENTITIES.values()
                for obj in db.query(cls).filter(cls.deleted_batch == batch).all()]


def title_of(obj) -> str:
    if isinstance(obj, Client):
        return obj.name
    if isinstance(obj, Payment):
        return obj.description or f"Pagamento di € {obj.amount:.2f}"
    if isinstance(obj, Quote):
        return obj.number
    if isinstance(obj, WorkLog):
        return obj.task_title or obj.description
    return getattr(obj, "title", None) or f"#{obj.id}"


def restore_batch(db, batch):
    """Ripristina tutti gli elementi del gruppo. Restituisce gli elementi ripristinati."""
    items = batch_items(db, batch)
    with include_deleted(db):
        for obj in items:
            client_id = getattr(obj, "client_id", None)
            if client_id and not isinstance(obj, Client):
                parent = db.get(Client, client_id)
                if parent is not None and parent.deleted_at is not None and parent.deleted_batch != batch:
                    raise ValueError(f"Prima ripristina il cliente «{parent.name}» dal cestino")
    for obj in items:
        obj.deleted_at = obj.deleted_batch = obj.deleted_by = None
    return items


def _purge_objects(db, items):
    """Eliminazione definitiva: stacca i riferimenti rimasti e cancella le righe."""
    from models import ClientHashtagSet, ClientPriceList, Idea, Lead, SubscriptionHistory
    order = [WorkLog, Payment, Quote, Task, Post, VideoScript, Contract, Client]
    with include_deleted(db):
        for cls in order:
            for obj in [o for o in items if type(o) is cls]:
                if cls is Task:
                    db.query(WorkLog).filter(WorkLog.task_id == obj.id).update({"task_id": None}, synchronize_session=False)
                    db.query(Payment).filter(Payment.task_id == obj.id).update({"task_id": None}, synchronize_session=False)
                elif cls is Post:
                    db.query(Task).filter(Task.post_id == obj.id).update({"post_id": None}, synchronize_session=False)
                elif cls is VideoScript:
                    db.query(Post).filter(Post.video_script_id == obj.id).update({"video_script_id": None}, synchronize_session=False)
                    db.query(Idea).filter(Idea.video_script_id == obj.id).update({"video_script_id": None}, synchronize_session=False)
                elif cls is Contract:
                    db.query(Task).filter(Task.contract_id == obj.id).update({"contract_id": None}, synchronize_session=False)
                    db.query(WorkLog).filter(WorkLog.contract_id == obj.id).update({"contract_id": None}, synchronize_session=False)
                elif cls is Client:
                    # I lavori registrati restano (servono per compensi e resoconti), senza cliente.
                    db.query(WorkLog).filter(WorkLog.client_id == obj.id).update({"client_id": None}, synchronize_session=False)
                    db.query(Lead).filter(Lead.converted_client_id == obj.id).update({"converted_client_id": None}, synchronize_session=False)
                    remaining = sum(db.query(c).filter(c.client_id == obj.id, c.deleted_at.is_(None)).count()
                                    for c in (Task, Post, Payment, Quote, VideoScript, Contract))
                    if remaining:
                        # Elementi del cliente ripristinati a parte: il cliente non si può cancellare del tutto.
                        log.warning("Cliente %s non eliminato: ha ancora %d elementi attivi", obj.id, remaining)
                        continue
                    # Dati che vivono solo con il cliente: idee, listino, set di hashtag, storico abbonamento.
                    for extra in (Idea, ClientPriceList, ClientHashtagSet, SubscriptionHistory):
                        db.query(extra).filter(extra.client_id == obj.id).delete(synchronize_session=False)
                    db.expire(obj)
                db.delete(obj)
                db.flush()


def purge_batch(db, batch):
    items = batch_items(db, batch)
    _purge_objects(db, items)
    return items


def purge_expired(db, days: int = RETENTION_DAYS, now=None):
    cutoff = (now or utcnow()) - timedelta(days=days)
    with include_deleted(db):
        batches = {b for cls in ENTITIES.values()
                   for (b,) in db.query(cls.deleted_batch).filter(cls.deleted_at.isnot(None), cls.deleted_at < cutoff).distinct()}
    purged = 0
    for batch in batches:
        purged += len(purge_batch(db, batch))
    db.commit()
    if purged:
        log.info("Cestino: eliminati definitivamente %d elementi più vecchi di %d giorni", purged, days)
    return purged


async def purge_loop(interval_seconds: int = 6 * 3600):
    from database import SessionLocal

    def run():
        with SessionLocal() as db:
            purge_expired(db)

    while True:
        try:
            await asyncio.to_thread(run)
        except Exception:  # noqa: BLE001
            log.exception("Pulizia del cestino non riuscita")
        await asyncio.sleep(interval_seconds)


__all__ = ["SoftDelete", "soft_delete", "restore_batch", "purge_batch", "purge_expired", "include_deleted"]
