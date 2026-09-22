"""Chat "friends" (companions): the two built-in personas (Sõbrad, Friends),
auto-seeded per user, plus any the user adds themselves with their own name,
optional personality/tone description, and optional photo.

Any companion's chat thread -- built-in or custom -- can be "hidden" from the
main chat list while remaining fully reachable (e.g. still findable via
GET /api/search, still directly addressable via /api/chat?companion=<key>).
See models.py's Companion docstring for the full schema rationale and
chat.py's _build_system_prompt for how a custom companion's
personality_prompt is (and is not) layered into the AI system prompt.
"""
import secrets
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import ChatMessage, Companion, User
from app.schemas import CompanionCreate, CompanionOut, CompanionUpdate

router = APIRouter(prefix="/api/companions", tags=["companions"])

# Same content-type allowlist/size cap as the journal-entry-photo feature
# (routers/journal.py) -- kept as a local copy here rather than a shared
# import, same rationale journal.py itself gives for not importing from
# profile.py.
ALLOWED_PHOTO_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_PHOTO_BYTES = 5 * 1024 * 1024

# The two auto-seeded built-in personas -- (key, name). Every user gets both,
# created lazily (see _ensure_default_companions) the first time they touch
# this router, rather than at registration time, so existing pre-feature
# users are backfilled transparently on their next visit to the chat/friends
# list instead of needing a data migration.
DEFAULT_COMPANIONS = [("sobrad", "Sõbrad"), ("friends", "Friends")]


def _ensure_default_companions(db: Session, user: User) -> None:
    """Idempotently create the user's two built-in companion rows if either
    is missing. Cheap and safe to call defensively at the top of any
    companions-listing/creating endpoint -- keeps the seeding logic in one
    place rather than requiring a separate registration-time hook."""
    existing_keys = {
        key
        for (key,) in db.query(Companion.key).filter(Companion.user_id == user.id).all()
    }
    inserted = False
    for key, name in DEFAULT_COMPANIONS:
        if key not in existing_keys:
            db.add(
                Companion(
                    user_id=user.id,
                    key=key,
                    name=name,
                    is_default=True,
                    hidden=False,
                )
            )
            inserted = True
    if inserted:
        db.commit()


def _companion_out(c: Companion) -> CompanionOut:
    return CompanionOut(
        id=c.id,
        key=c.key,
        name=c.name,
        personality_prompt=c.personality_prompt,
        has_avatar=bool(c.avatar),
        hidden=c.hidden,
        is_default=c.is_default,
        created_at=c.created_at,
    )


def _get_owned_companion(db: Session, current_user: User, companion_id: int) -> Companion:
    companion = (
        db.query(Companion)
        .filter(Companion.id == companion_id, Companion.user_id == current_user.id)
        .first()
    )
    if companion is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Companion not found")
    return companion


@router.get("", response_model=List[CompanionOut])
def list_companions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_default_companions(db, current_user)
    companions = (
        db.query(Companion)
        .filter(Companion.user_id == current_user.id)
        .order_by(Companion.is_default.desc(), Companion.created_at.asc())
        .all()
    )
    return [_companion_out(c) for c in companions]


@router.post("", response_model=CompanionOut, status_code=status.HTTP_201_CREATED)
def create_companion(
    payload: CompanionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_default_companions(db, current_user)

    companion = Companion(
        user_id=current_user.id,
        key=secrets.token_urlsafe(12),
        name=payload.name,
        personality_prompt=payload.personality_prompt,
        is_default=False,
        hidden=False,
    )
    db.add(companion)
    db.commit()
    db.refresh(companion)
    return _companion_out(companion)


@router.patch("/{companion_id}", response_model=CompanionOut)
def update_companion(
    companion_id: int,
    payload: CompanionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    companion = _get_owned_companion(db, current_user, companion_id)
    data = payload.model_dump(exclude_unset=True)

    if companion.is_default and (data.get("name") is not None or data.get("personality_prompt") is not None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Sõbrad and Friends can't be renamed or given a different "
                "personality — you can still hide them, or add a new friend "
                "instead."
            ),
        )

    for field, value in data.items():
        setattr(companion, field, value)

    db.commit()
    db.refresh(companion)
    return _companion_out(companion)


@router.delete("/{companion_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_companion(
    companion_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    companion = _get_owned_companion(db, current_user, companion_id)
    if companion.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sõbrad and Friends can't be deleted — you can hide them instead.",
        )

    # This companion's entire chat history goes with it -- there'd be no way
    # to reach it afterward once the Companion row (and its key) is gone.
    # Mirrors tasks.py's _delete_task_cascade bulk-delete-then-commit style.
    db.query(ChatMessage).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.companion == companion.key,
    ).delete(synchronize_session=False)
    db.delete(companion)
    db.commit()
    return None


@router.post("/{companion_id}/avatar", response_model=CompanionOut)
async def upload_companion_avatar(
    companion_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    companion = _get_owned_companion(db, current_user, companion_id)

    if file.content_type not in ALLOWED_PHOTO_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Photo must be one of {sorted(ALLOWED_PHOTO_CONTENT_TYPES)}",
        )

    data = await file.read()
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Photo must be smaller than 5MB",
        )

    companion.avatar = data
    companion.avatar_content_type = file.content_type
    db.commit()
    db.refresh(companion)
    return _companion_out(companion)


@router.get("/{companion_id}/avatar")
def get_companion_avatar(
    companion_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    companion = _get_owned_companion(db, current_user, companion_id)
    if not companion.avatar:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No photo on this companion")
    return Response(content=companion.avatar, media_type=companion.avatar_content_type)
