from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import BreathingSession, User
from app.schemas import BreathingSessionCreate, BreathingSessionOut

router = APIRouter(prefix="/api/breathing-sessions", tags=["breathing"])


@router.post("", response_model=BreathingSessionOut, status_code=status.HTTP_201_CREATED)
def create_breathing_session(
    payload: BreathingSessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session_row = BreathingSession(user_id=current_user.id, minutes=payload.minutes)
    db.add(session_row)
    db.commit()
    db.refresh(session_row)
    return session_row


@router.get("", response_model=List[BreathingSessionOut])
def list_breathing_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sessions = (
        db.query(BreathingSession)
        .filter(BreathingSession.user_id == current_user.id)
        .order_by(BreathingSession.created_at.desc(), BreathingSession.id.desc())
        .all()
    )
    return sessions
