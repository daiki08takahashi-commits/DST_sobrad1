from typing import List

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import MoodEntry, User
from app.schemas import MoodEntryCreate, MoodEntryOut

router = APIRouter(prefix="/api/mood", tags=["mood"])


@router.post("", response_model=MoodEntryOut, status_code=status.HTTP_201_CREATED)
def create_mood_entry(
    payload: MoodEntryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = MoodEntry(user_id=current_user.id, word=payload.word)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("", response_model=List[MoodEntryOut])
def list_mood_entries(
    limit: int = Query(default=10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entries = (
        db.query(MoodEntry)
        .filter(MoodEntry.user_id == current_user.id)
        .order_by(MoodEntry.created_at.desc(), MoodEntry.id.desc())
        .limit(limit)
        .all()
    )
    return entries
