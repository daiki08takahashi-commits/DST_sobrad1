from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import JournalEntry, User
from app.schemas import JournalEntryCreate, JournalEntryOut

router = APIRouter(prefix="/api/journal", tags=["journal"])


@router.post("", response_model=JournalEntryOut, status_code=status.HTTP_201_CREATED)
def create_journal_entry(
    payload: JournalEntryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = JournalEntry(user_id=current_user.id, text=payload.text)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("", response_model=List[JournalEntryOut])
def list_journal_entries(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entries = (
        db.query(JournalEntry)
        .filter(JournalEntry.user_id == current_user.id)
        .order_by(JournalEntry.created_at.desc(), JournalEntry.id.desc())
        .all()
    )
    return entries
