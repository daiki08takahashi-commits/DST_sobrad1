"""General app settings -- currently just accessibility / sensory
preferences. Not to be confused with /api/study/settings (study.py), which
is the passing/"needs focus" grade threshold -- a separate, narrower
settings surface.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import AccessibilitySettingsOut, AccessibilitySettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _accessibility_out(user: User) -> AccessibilitySettingsOut:
    return AccessibilitySettingsOut(
        reduce_animations=user.reduce_animations,
        low_stimulation_mode=user.low_stimulation_mode,
        high_contrast=user.high_contrast,
        sound_enabled=user.sound_enabled,
    )


@router.get("/accessibility", response_model=AccessibilitySettingsOut)
def get_accessibility_settings(current_user: User = Depends(get_current_user)):
    return _accessibility_out(current_user)


@router.patch("/accessibility", response_model=AccessibilitySettingsOut)
def update_accessibility_settings(
    payload: AccessibilitySettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(current_user, field, value)
    db.commit()
    db.refresh(current_user)
    return _accessibility_out(current_user)
