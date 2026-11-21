from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from google_sync import push_post
from models import Post, User, utcnow
from security import require_admin
from trash import (ENTITIES, ENTITY_OF, LABELS, RETENTION_DAYS, batch_items, include_deleted, purge_batch,
                   restore_batch, root_of, title_of)

router = APIRouter()


def _item(obj):
    entity = ENTITY_OF[type(obj)]
    client = getattr(obj, "client_id", None)
    return {"entity": entity, "entity_label": LABELS[entity], "id": obj.id, "title": title_of(obj),
            "client_id": client if entity != "client" else obj.id}


@router.get("/trash")
def list_trash(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    groups = defaultdict(list)
    with include_deleted(db):
        for cls in ENTITIES.values():
            for obj in db.query(cls).filter(cls.deleted_at.isnot(None)).all():
                groups[obj.deleted_batch or f"{ENTITY_OF[cls]}-{obj.id}-x"].append(obj)
        users = {u.id: u.name for u in db.query(User).all()}
        clients = {c.id: c.name for c in db.query(ENTITIES["client"]).all()}
    out = []
    for batch, items in groups.items():
        entity, oid = root_of(batch)
        root = next((o for o in items if ENTITY_OF[type(o)] == entity and o.id == oid), None) or items[0]
        linked = [o for o in items if o is not root]
        counts = defaultdict(int)
        for o in linked:
            counts[LABELS[ENTITY_OF[type(o)]]] += 1
        purge_at = root.deleted_at + timedelta(days=RETENTION_DAYS)
        client_id = getattr(root, "client_id", None)
        out.append({
            **_item(root),
            "batch": batch,
            "deleted_at": root.deleted_at.isoformat(),
            "deleted_by_name": users.get(root.deleted_by) if root.deleted_by else "Sistema",
            "client_name": clients.get(client_id) if client_id else None,
            "purge_at": purge_at.isoformat(),
            "days_left": max(0, (purge_at - utcnow()).days),
            "linked_count": len(linked),
            "linked_summary": [{"label": k, "count": v} for k, v in counts.items()],
        })
    out.sort(key=lambda x: x["deleted_at"], reverse=True)
    return {"retention_days": RETENTION_DAYS, "items": out}


@router.post("/trash/{batch}/restore")
def restore(batch: str, bg: BackgroundTasks, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    if not batch_items(db, batch):
        raise HTTPException(status_code=404, detail="Elemento non trovato nel cestino")
    try:
        items = restore_batch(db, batch)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    db.commit()
    for obj in items:
        if isinstance(obj, Post):
            bg.add_task(push_post, obj.id)
    return {"ok": True, "restored": [_item(o) for o in items]}


@router.delete("/trash/{batch}")
def purge(batch: str, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    if not batch_items(db, batch):
        raise HTTPException(status_code=404, detail="Elemento non trovato nel cestino")
    items = purge_batch(db, batch)
    db.commit()
    return {"ok": True, "purged": len(items)}
