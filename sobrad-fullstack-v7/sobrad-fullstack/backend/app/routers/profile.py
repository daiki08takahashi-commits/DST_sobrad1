"""Profile photo storage.

The photo is stored as raw bytes directly on the User row (see
models.py's User.profile_photo/profile_photo_content_type docstring) rather
than as a file on disk -- this app's deployment environment has no
persistent-disk guarantee, so the SQLite database (where the rest of this
app's data already lives) is the only persistence-consistent place for it.

Both endpoints return the updated UserOut (built by routers/auth.py's
_user_out helper, which encodes the photo as a data: URI), so the frontend
gets the fresh profile_photo_data_url in the same round trip as the
upload/delete -- no second fetch needed.
"""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.routers.auth import _user_out
from app.schemas import UserOut

router = APIRouter(prefix="/api/profile", tags=["profile"])

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5 MB


@router.put("/photo", response_model=UserOut)
async def upload_profile_photo(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "That file type isn't supported. Please upload a JPEG, PNG, "
                "WEBP, or GIF image."
            ),
        )

    # Read into memory to check size -- this is a small prototype app, no
    # need for streaming/chunked validation.
    data = await file.read()
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That image is too large. Please upload one under 5 MB.",
        )
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That file looks empty. Please try a different image.",
        )

    current_user.profile_photo = data
    current_user.profile_photo_content_type = file.content_type
    db.commit()
    db.refresh(current_user)
    return _user_out(current_user)


@router.delete("/photo", response_model=UserOut)
def delete_profile_photo(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.profile_photo = None
    current_user.profile_photo_content_type = None
    db.commit()
    db.refresh(current_user)
    return _user_out(current_user)
