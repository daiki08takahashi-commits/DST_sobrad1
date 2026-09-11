from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import BreathingSession, JournalEntry, MoodEntry, User
from app.schemas import StatsOut

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("", response_model=StatsOut)
def get_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    grounding_minutes = (
        db.query(func.coalesce(func.sum(BreathingSession.minutes), 0))
        .filter(BreathingSession.user_id == current_user.id)
        .scalar()
    )
    journal_entries = (
        db.query(func.count(JournalEntry.id))
        .filter(JournalEntry.user_id == current_user.id)
        .scalar()
    )
    mood_checkins = (
        db.query(func.count(MoodEntry.id))
        .filter(MoodEntry.user_id == current_user.id)
        .scalar()
    )

    return StatsOut(
        grounding_minutes=int(grounding_minutes or 0),
        journal_entries=int(journal_entries or 0),
        mood_checkins=int(mood_checkins or 0),
        goals_reached=current_user.goals_reached,
    )
