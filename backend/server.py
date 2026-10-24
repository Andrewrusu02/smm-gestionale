from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import asyncio  # noqa: E402
import logging  # noqa: E402
import os  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402
from database import SessionLocal  # noqa: E402
import models  # noqa: E402,F401
from security import seed_admin  # noqa: E402
from services import backfill_cycles, refresh_payment_statuses  # noqa: E402
from google_sync import sync_loop  # noqa: E402
from routers import auth_users, clients, contracts, editorial, finance, integrations, leads, quotes, scripts  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

app = FastAPI(title="SMM Agency Gestionale")
for r in (auth_users, clients, contracts, editorial, finance, integrations, leads, quotes, scripts):
    app.include_router(r.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ["CORS_ORIGINS"].split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    with SessionLocal() as db:
        seed_admin(db)
        backfill_cycles(db)
        refresh_payment_statuses(db)
    asyncio.create_task(sync_loop())
