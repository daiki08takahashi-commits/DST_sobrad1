"""Focus session (Pomodoro / focus timer) support.

See models.py (FocusSession) for the schema and schemas.py for the
request/response shapes.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import FocusSession, Task, User, utcnow
from app.schemas import FocusSessionComplete, FocusSessionOut, FocusSessionStart

router = APIRouter(prefix="/api/focus", tags=["focus"])


def _as_aware_utc(dt: datetime) -> datetime:
    """SQLite drops tzinfo on round-trip even for a DateTime(timezone=True)
    column, so a value freshly loaded from the DB (e.g. session.started_at
    on a request that didn't just create it) comes back naive while
    utcnow() is always timezone-aware. Normalize before doing arithmetic on
    them together, assuming naive values are already UTC (true here, since
    every write in this app uses utcnow()).
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _get_open_session(db: Session, current_user: User) -> Optional[FocusSession]:
    return (
        db.query(FocusSession)
        .filter(FocusSession.user_id == current_user.id, FocusSession.ended_at.is_(None))
        .first()
    )


@router.post("/start", response_model=FocusSessionOut, status_code=status.HTTP_201_CREATED)
def start_focus_session(
    payload: FocusSessionStart,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # If the user already has an open session (a page refresh shouldn't lose
    # a running timer), just return it instead of creating a duplicate.
    existing = _get_open_session(db, current_user)
    if existing is not None:
        return existing

    if payload.task_id is not None:
        task = (
            db.query(Task)
            .filter(Task.id == payload.task_id, Task.user_id == current_user.id)
            .first()
        )
        if task is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    session = FocusSession(
        user_id=current_user.id,
        task_id=payload.task_id,
        mode=payload.mode,
        planned_minutes=payload.planned_minutes,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/active", response_model=Optional[FocusSessionOut])
def get_active_focus_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Powers a "Continue Session" button after a page reload. Returns the
    current user's open session (ended_at is null) if any, else a plain
    JSON `null` with a normal 200 status.
    """
    return _get_open_session(db, current_user)


@router.post("/{session_id}/complete", response_model=FocusSessionOut)
def complete_focus_session(
    session_id: int,
    payload: FocusSessionComplete,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = (
        db.query(FocusSession)
        .filter(FocusSession.id == session_id, FocusSession.user_id == current_user.id)
        .first()
    )
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Focus session not found")
    if session.ended_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Focus session already ended"
        )

    now = utcnow()
    session.ended_at = now
    session.completed = payload.completed
    session.interrupted = not payload.completed

    # Elapsed minutes credited to the linked task's actual_minutes:
    # - completed=True means it ran the full planned length by definition,
    #   so credit planned_minutes exactly rather than relying on wall-clock
    #   rounding.
    # - completed=False (stopped early) credits the real wall-clock elapsed
    #   time instead, since that's genuinely less than planned_minutes.
    if payload.completed:
        elapsed_minutes = session.planned_minutes
    else:
        elapsed_seconds = (
            _as_aware_utc(now) - _as_aware_utc(session.started_at)
        ).total_seconds()
        elapsed_minutes = max(0, int(elapsed_seconds // 60))

    if session.task_id is not None:
        task = (
            db.query(Task)
            .filter(Task.id == session.task_id, Task.user_id == current_user.id)
            .first()
        )
        if task is not None:
            task.actual_minutes = (task.actual_minutes or 0) + elapsed_minutes

    db.commit()
    db.refresh(session)
    return session


@router.get("/history", response_model=List[FocusSessionOut])
def get_focus_history(
    since: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Most recent first. `since` (optional, ISO date or datetime) filters
    to sessions started on/after that point -- used by the AI Weekly Review
    feature to compute total study time and best focus day.
    """
    query = db.query(FocusSession).filter(FocusSession.user_id == current_user.id)
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
        except ValueError:
            raise HTTPException(status_code=400, detail="since must be an ISO date or datetime")
        query = query.filter(FocusSession.started_at >= since_dt)
    sessions = query.order_by(FocusSession.started_at.desc(), FocusSession.id.desc()).all()
    return sessions
