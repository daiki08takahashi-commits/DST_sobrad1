from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import JournalEntry, User
from app.schemas import JournalEntryCreate, JournalEntryOut

router = APIRouter(prefix="/api/journal", tags=["journal"])

# Same content-type allowlist/size cap rationale as the profile-photo feature
# (routers/profile.py) -- kept as a local copy here rather than a shared
# import so this router has no dependency on that concurrently-developed
# file. 5MB keeps a photo-per-journal-entry from ballooning sobrad.db, while
# still comfortably fitting a normal phone photo saved for the web.
ALLOWED_PHOTO_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_PHOTO_BYTES = 5 * 1024 * 1024

# Same rationale as the photo allowlist/size cap above, but for a separate,
# additional general-document attachment (see models.py's JournalEntry.file
# docstring) -- an entry may have a photo, a file, both, or neither. 10MB
# rather than 5MB since general documents (especially PowerPoint/Excel) run
# larger than a typical phone photo.
ALLOWED_FILE_CONTENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
}
MAX_FILE_BYTES = 10 * 1024 * 1024


def _journal_entry_out(entry: JournalEntry) -> JournalEntryOut:
    return JournalEntryOut(
        id=entry.id,
        text=entry.text,
        created_at=entry.created_at,
        has_photo=bool(entry.photo),
        has_file=bool(entry.file),
        file_name=entry.file_name,
    )


def _get_owned_entry(db: Session, current_user: User, entry_id: int) -> JournalEntry:
    entry = (
        db.query(JournalEntry)
        .filter(JournalEntry.id == entry_id, JournalEntry.user_id == current_user.id)
        .first()
    )
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal entry not found")
    return entry


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
    return _journal_entry_out(entry)


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
    return [_journal_entry_out(e) for e in entries]


# ---------------------------------------------------------------------------
# Journal entry photo -- upload/replace, delete, and fetch the raw bytes.
# Stored as bytes directly on the JournalEntry row (see models.py's
# JournalEntry.photo docstring for why: no persistent disk to keep a file
# on). One photo per entry -- POST also serves as "replace" when one already
# exists, so there's no separate replace endpoint.
# ---------------------------------------------------------------------------


@router.post("/{entry_id}/photo", response_model=JournalEntryOut)
async def upload_journal_entry_photo(
    entry_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = _get_owned_entry(db, current_user, entry_id)

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

    entry.photo = data
    entry.photo_content_type = file.content_type
    db.commit()
    db.refresh(entry)
    return _journal_entry_out(entry)


@router.delete("/{entry_id}/photo", response_model=JournalEntryOut)
def delete_journal_entry_photo(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = _get_owned_entry(db, current_user, entry_id)
    entry.photo = None
    entry.photo_content_type = None
    db.commit()
    db.refresh(entry)
    return _journal_entry_out(entry)


@router.get("/{entry_id}/photo")
def get_journal_entry_photo(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = _get_owned_entry(db, current_user, entry_id)
    if not entry.photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No photo on this entry")
    return Response(content=entry.photo, media_type=entry.photo_content_type)


# ---------------------------------------------------------------------------
# Journal entry file -- upload/replace, delete, and fetch the raw bytes.
# Separate and additional to the photo attachment above (an entry may have a
# photo, a file, both, or neither) -- stored as bytes directly on the
# JournalEntry row, same rationale as photo (see models.py's JournalEntry.file
# docstring: no persistent disk to keep a file on). One file per entry --
# POST also serves as "replace" when one already exists, same as photo.
# ---------------------------------------------------------------------------


@router.post("/{entry_id}/file", response_model=JournalEntryOut)
async def upload_journal_entry_file(
    entry_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = _get_owned_entry(db, current_user, entry_id)

    if file.content_type not in ALLOWED_FILE_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File must be one of {sorted(ALLOWED_FILE_CONTENT_TYPES)}",
        )

    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be smaller than 10MB",
        )

    entry.file = data
    entry.file_content_type = file.content_type
    # UploadFile.filename can be None/empty (e.g. a client that doesn't send
    # one) -- fall back to a generic name rather than storing that as the
    # display/download name.
    entry.file_name = file.filename or "attachment"
    db.commit()
    db.refresh(entry)
    return _journal_entry_out(entry)


@router.delete("/{entry_id}/file", response_model=JournalEntryOut)
def delete_journal_entry_file(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = _get_owned_entry(db, current_user, entry_id)
    entry.file = None
    entry.file_content_type = None
    entry.file_name = None
    db.commit()
    db.refresh(entry)
    return _journal_entry_out(entry)


@router.get("/{entry_id}/file")
def get_journal_entry_file(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = _get_owned_entry(db, current_user, entry_id)
    if not entry.file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No file on this entry")
    # Unlike the photo GET endpoint above (no Content-Disposition header,
    # since a photo is displayed inline as an <img>/blob URL), a general file
    # should prompt a normal browser download under its original filename.
    return Response(
        content=entry.file,
        media_type=entry.file_content_type,
        headers={"Content-Disposition": f'attachment; filename="{entry.file_name}"'},
    )
