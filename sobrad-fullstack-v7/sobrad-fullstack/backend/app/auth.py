"""
Auth helpers: password hashing (passlib, pbkdf2_sha256) and JWT issuing/
verification (PyJWT), plus a FastAPI dependency that resolves the current
user from a bearer token.

pbkdf2_sha256 is used instead of bcrypt deliberately: it is implemented in
pure Python (via the standard library's hashlib), so it needs no compiled
C-extension wheel. bcrypt's wheel availability lags behind brand-new Python
releases on some platforms (notably Windows), which breaks `pip install` for
non-technical users on a fresh Python version through no fault of their own.
pbkdf2_sha256 with a high iteration count is a well-established, secure
choice (NIST-recommended) that sidesteps that entire class of problem.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User

# --- Config -----------------------------------------------------------------
# Dev-only fallback secret. In any real deployment this MUST be overridden via
# the SOBRAD_JWT_SECRET environment variable -- do not ship this default.
JWT_SECRET = os.environ.get(
    "SOBRAD_JWT_SECRET", "sobrad-dev-secret-change-me-before-deploying"
)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days, generous for a prototype

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def normalize_security_answer(answer: str) -> str:
    """Normalize a security-question answer before hashing/comparing it, so
    trivial casing/whitespace differences (e.g. "Rex " vs "rex") don't break
    a legitimate password reset. Uses the exact same hashing scheme as
    passwords (hash_password/verify_password above) -- no second hashing
    scheme is introduced for this.
    """
    return answer.strip().lower()


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[int]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    if sub is None:
        return None
    try:
        return int(sub)
    except (TypeError, ValueError):
        return None


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or not credentials.credentials:
        raise unauthorized

    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise unauthorized

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise unauthorized

    return user
