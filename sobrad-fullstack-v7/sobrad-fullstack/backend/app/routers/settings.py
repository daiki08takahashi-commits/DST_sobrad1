"""General app settings -- accessibility / sensory preferences, plus the
user's companion persona choice. Not to be confused with /api/study/settings
(study.py), which is the passing/"needs focus" grade threshold -- a
separate, narrower settings surface.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import AccessibilitySettingsOut, AccessibilitySettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])

# The only valid values for User.companion -- see models.py. Anything else
# in a PATCH is rejected outright rather than trusted from the client.
VALID_COMPANIONS = ("sobrad", "friends")


def _accessibility_out(user: User) -> AccessibilitySettingsOut:
    return AccessibilitySettingsOut(
        reduce_animations=user.reduce_animations,
        low_stimulation_mode=user.low_stimulation_mode,
        high_contrast=user.high_contrast,
        sound_enabled=user.sound_enabled,
        screen_break_reminders_enabled=user.screen_break_reminders_enabled,
        companion=user.companion,
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
    if "companion" in data and data["companion"] not in VALID_COMPANIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"companion must be one of {VALID_COMPANIONS}",
        )
    for field, value in data.items():
        setattr(current_user, field, value)
    db.commit()
    db.refresh(current_user)
    return _accessibility_out(current_user)
