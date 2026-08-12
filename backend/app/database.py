"""Engine/session setup for the AGL Audit platform.

Local dev defaults to the SQLite file (backend/agl.db). In production (Render),
set DATABASE_URL to a PostgreSQL URL so data survives restarts/redeploys —
SQLite-only behaviors (check_same_thread, the FK pragma, ALTER-based light
migrations) are guarded so the same code runs on both.
"""
import os
from pathlib import Path

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "agl.db"
PHOTOS_PATH = BASE_DIR / "photos"  # uploaded audit photos (gitignored)

# Render's Internal Database URL may use the legacy 'postgres://' scheme;
# SQLAlchemy 2.0 only accepts it as a deprecated alias, so normalize it.
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DB_PATH}").replace(
    "postgres://", "postgresql://", 1
)
_is_sqlite = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    # SQLite requires the same-thread allowance for FastAPI; PostgreSQL
    # benefits from pool_pre_ping so dropped idle connections are recovered.
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    **({"pool_pre_ping": True} if not _is_sqlite else {}),
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _connection_record):
        """SQLite does not enforce FKs by default; turn them on per connection.
        (PostgreSQL enforces foreign keys natively — no-op there.)"""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


class Base(DeclarativeBase):
    pass


# Columns added after the initial release. create_all cannot add columns to an
# existing table, so we ALTER here (pragmatic stand-in for Alembic given the
# single-auditor, no-migrations decision). SQLite-only: a fresh PostgreSQL
# database is created with the complete schema by create_all, so the
# SQLite-flavored ALTER statements aren't needed (nor valid) there.
_COLUMN_MIGRATIONS: dict[str, dict[str, str]] = {
    "drivers": {
        "current_lat": "FLOAT",
        "current_lng": "FLOAT",
        "location_updated_at": "DATETIME",
    },
    "stops": {
        "fedex_cutoff": "TIME",
        "pickup_location": "VARCHAR(200)",
        "clinic_ref": "VARCHAR(100)",
    },
}


def run_light_migrations() -> None:
    """Add columns introduced after the first release, preserving existing data."""
    if not _is_sqlite:
        return
    inspector = inspect(engine)
    for table, columns in _COLUMN_MIGRATIONS.items():
        if table not in inspector.get_table_names():
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        with engine.begin() as conn:
            for column, ddl_type in columns.items():
                if column not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))
        inspector = inspect(engine)  # refresh


def get_db():
    """FastAPI dependency that yields a scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
