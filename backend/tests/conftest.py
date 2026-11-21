"""Configurazione dei test: ogni worker usa un database SQLite temporaneo, mai quello reale."""
import os
import sys
import tempfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

_WORKER = os.environ.get("PYTEST_XDIST_WORKER", "main")
_TMP = Path(tempfile.mkdtemp(prefix=f"smm-test-{_WORKER}-"))
os.environ.update({
    "DATABASE_URL": f"sqlite:///{(_TMP / 'test.db').as_posix()}",
    "DATA_DIR": str(_TMP),
    "BACKUP_DIR": str(_TMP / "backups"),
    "JWT_SECRET": "test-secret-test-secret-test-secret",
    "TOKEN_HOURS": "1",
    "ADMIN_EMAIL": "admin@test.it",
    "ADMIN_PASSWORD": "password-admin",
    "ADMIN_NAME": "Admin Test",
    "CORS_ORIGINS": "http://localhost",
    "APP_TIMEZONE": "Europe/Rome",
    "GOOGLE_SYNC_INTERVAL": "300",
    "PUBLIC_BACKEND_URL": "http://localhost",
    "FRONTEND_URL": "http://localhost",
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import models  # noqa: E402,F401
from database import Base, SessionLocal, engine  # noqa: E402
from security import create_token, hash_password, seed_admin  # noqa: E402


@pytest.fixture
def db_session():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_admin(db)
        yield db


@pytest.fixture
def client(db_session):
    from server import app
    return TestClient(app)


@pytest.fixture
def admin(db_session):
    return db_session.query(models.User).filter_by(role="admin").first()


@pytest.fixture
def admin_headers(admin):
    return {"Authorization": f"Bearer {create_token(admin)}"}


@pytest.fixture
def employee(db_session):
    u = models.User(email="dip@test.it", name="Dipendente Test", role="dipendente",
                    password_hash=hash_password("password-dip"))
    db_session.add(u)
    db_session.commit()
    return u


@pytest.fixture
def employee_headers(employee):
    return {"Authorization": f"Bearer {create_token(employee)}"}


@pytest.fixture
def tmp_data_dir():
    return _TMP
