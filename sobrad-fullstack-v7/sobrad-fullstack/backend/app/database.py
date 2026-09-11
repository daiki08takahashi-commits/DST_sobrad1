"""
Database setup for SOBRAD.

Uses a local SQLite file (sobrad.db) created automatically on first run.
This is a development configuration only -- see README.md for notes on
what would need to change for a real deployment.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./sobrad.db"

# check_same_thread=False is required for SQLite when it is accessed from
# more than one thread, which FastAPI's threaded request handling does.
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a DB session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
