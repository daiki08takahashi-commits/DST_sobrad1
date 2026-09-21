import base64

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    get_current_user,
    hash_password,
    normalize_security_answer,
    verify_password,
)
from app.database import get_db
from app.models import User
from app.schemas import (
    PasswordChange,
    PasswordReset,
    SecurityQuestionCheck,
    SecurityQuestionSet,
    TokenResponse,
    UserCreate,
    UserOut,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Generic, non-leaking error for reset-password -- deliberately the same
# message whether the username doesn't exist, the user never set a security
# question, or the answer was wrong, so a caller can't use the error to
# probe which of those is true.
_RESET_PASSWORD_ERROR = HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail="Unable to reset password with the information provided",
)


def _user_out(user: User) -> UserOut:
    """Build a UserOut from a User row, including the profile photo encoded
    as a data: URI (see UserOut.profile_photo_data_url's docstring in
    schemas.py). Shared by every endpoint here that returns a UserOut
    (directly, or nested in a TokenResponse), plus routers/profile.py, so
    the photo shows up wherever the current user's identity does, in one
    round trip -- no separate fetch needed after an upload/delete.
    """
    photo_data_url = None
    if user.profile_photo and user.profile_photo_content_type:
        encoded = base64.b64encode(user.profile_photo).decode("ascii")
        photo_data_url = f"data:{user.profile_photo_content_type};base64,{encoded}"
    return UserOut(
        id=user.id,
        username=user.username,
        profile_photo_data_url=photo_data_url,
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == payload.username).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Username already taken"
        )

    user = User(username=payload.username, password_hash=hash_password(payload.password))
    # Optional at registration -- only set when both are provided (and
    # non-blank, enforced by UserCreate's validator). Registration otherwise
    # keeps working exactly as before when these are omitted.
    if payload.security_question and payload.security_answer:
        user.security_question = payload.security_question.strip()
        user.security_answer_hash = hash_password(
            normalize_security_answer(payload.security_answer)
        )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    return TokenResponse(token=token, user=_user_out(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: UserCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password"
        )

    token = create_access_token(user.id)
    return TokenResponse(token=token, user=_user_out(user))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return _user_out(current_user)


# ---------------------------------------------------------------------------
# Password reset via security question -- this app doesn't collect email
# addresses, so a link-based reset isn't possible; a security question is
# the client-chosen alternative. See User.security_question/
# security_answer_hash in models.py.
# ---------------------------------------------------------------------------


@router.get("/security-question", response_model=SecurityQuestionCheck)
def get_security_question(username: str, db: Session = Depends(get_db)):
    """Unauthenticated on purpose -- this is looked up *before* the user can
    log in. Always returns 200 with has_question: false rather than 404 for
    an unknown username or one with no question set, so the frontend can
    show a uniform "no reset available" state without special-casing HTTP
    status (and without confirming/denying a username exists).
    """
    user = db.query(User).filter(User.username == username).first()
    if user is None or not user.security_question or not user.security_answer_hash:
        return SecurityQuestionCheck(has_question=False, question=None)
    return SecurityQuestionCheck(has_question=True, question=user.security_question)


@router.post("/reset-password", response_model=TokenResponse)
def reset_password(payload: PasswordReset, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if user is None or not user.security_question or not user.security_answer_hash:
        raise _RESET_PASSWORD_ERROR
    if not verify_password(
        normalize_security_answer(payload.security_answer), user.security_answer_hash
    ):
        raise _RESET_PASSWORD_ERROR

    user.password_hash = hash_password(payload.new_password)
    db.commit()
    db.refresh(user)

    # Log the user straight in, same response shape as login/register, so
    # they don't have to log in again right after resetting.
    token = create_access_token(user.id)
    return TokenResponse(token=token, user=_user_out(user))


@router.post("/change-password", response_model=TokenResponse)
def change_password(
    payload: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="current password is incorrect",
        )

    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    db.refresh(current_user)

    # Reissue a token too, for consistency with reset-password -- the caller
    # is already authenticated, but this keeps both password-change paths
    # returning the same shape.
    token = create_access_token(current_user.id)
    return TokenResponse(
        token=token, user=_user_out(current_user)
    )


@router.post("/security-question", response_model=SecurityQuestionCheck)
def set_security_question(
    payload: SecurityQuestionSet,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lets an already-registered user set or update their security question
    later (e.g. from a settings screen) if they skipped it at signup."""
    current_user.security_question = payload.security_question.strip()
    current_user.security_answer_hash = hash_password(
        normalize_security_answer(payload.security_answer)
    )
    db.commit()
    db.refresh(current_user)
    return SecurityQuestionCheck(has_question=True, question=current_user.security_question)
