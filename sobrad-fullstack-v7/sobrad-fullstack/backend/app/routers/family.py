"""Family sharing: lets a student ("child") invite a parent, by email, to a
READ-ONLY view of their Study data -- subject averages/trends, the
AI-narrated insights summary, and the raw trend series. Nothing else in the
app is exposed this way: journal, chat, focus, emergency and progress
stay completely private, and this router never touches those tables. See
models.py's FamilyLink docstring for the storage model.

Flow: the child POSTs /invite with a parent email; an invite email (with a
join link containing a one-time token) is sent via app/email_service.py.
Whoever holds that link -- logged in or not -- can GET /invite-info to see
whose invite it is, then (once logged in, as the parent) POST /accept to
link their account. From then on GET /{child_user_id}/study returns the
child's Study data to that parent, until the child revokes it.
"""
import os
import secrets
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.email_service import EmailSendError, send_family_invite_email
from app.models import FamilyLink, User, utcnow
from app.routers.study import _compute_analysis, _compute_insights
from app.schemas import (
    FamilyAcceptIn,
    FamilyChildOut,
    FamilyInviteCreate,
    FamilyInviteInfoOut,
    FamilyLinkOut,
    FamilyStudyRecordOut,
)

router = APIRouter(prefix="/api/family", tags=["family"])

# Mirrors main.py's SOBRAD_CORS_ORIGINS env-var-with-default pattern -- the
# base URL of the deployed frontend, used to build the join link put in the
# invite email. Defaults to the Vite dev server's default port.
FRONTEND_URL = os.environ.get("SOBRAD_FRONTEND_URL", "http://localhost:5173")


def _family_link_out(link: FamilyLink) -> FamilyLinkOut:
    return FamilyLinkOut(
        id=link.id,
        parent_email=link.parent_email,
        status=link.status,
        created_at=link.created_at,
        accepted_at=link.accepted_at,
    )


@router.post("/invite", response_model=FamilyLinkOut, status_code=status.HTTP_201_CREATED)
def create_invite(
    payload: FamilyInviteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Child sends a parent an invite email. The email is sent FIRST, before
    any database row is created -- if it fails to send, nothing is persisted
    (no orphaned pending invite the child never actually received a link
    for).
    """
    invite_token = secrets.token_urlsafe(24)
    join_url = f"{FRONTEND_URL}/family/join?token={invite_token}"

    try:
        send_family_invite_email(payload.parent_email, current_user.username, join_url)
    except EmailSendError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))

    link = FamilyLink(
        child_user_id=current_user.id,
        parent_email=payload.parent_email,
        invite_token=invite_token,
        status="pending",
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return _family_link_out(link)


@router.get("/invites", response_model=List[FamilyLinkOut])
def list_invites(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Child's view of every invite they've sent (pending/accepted/revoked),
    newest first.
    """
    links = (
        db.query(FamilyLink)
        .filter(FamilyLink.child_user_id == current_user.id)
        .order_by(FamilyLink.created_at.desc())
        .all()
    )
    return [_family_link_out(link) for link in links]


@router.delete("/invites/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invite(
    link_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Child revokes an invite -- whether it's still pending or already
    accepted. Soft-deleted (status set to "revoked", the row is kept for
    history) rather than removed outright. This also cuts off an already-
    accepted parent's future access, since GET /{child_user_id}/study checks
    status == "accepted" fresh on every call, not just once at accept time.
    """
    link = (
        db.query(FamilyLink)
        .filter(FamilyLink.id == link_id, FamilyLink.child_user_id == current_user.id)
        .first()
    )
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    link.status = "revoked"
    db.commit()
    return None


@router.get("/invite-info", response_model=FamilyInviteInfoOut)
def get_invite_info(token: str, db: Session = Depends(get_db)):
    """PUBLIC, no auth required -- this is hit before the parent has
    necessarily logged in (they just clicked a link in an email). Returns
    the invite's CURRENT status even if it's already been accepted or
    revoked, so the frontend can show an appropriate message either way
    rather than treating every non-pending invite as an error.
    """
    link = db.query(FamilyLink).filter(FamilyLink.invite_token == token).first()
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    child = db.query(User).filter(User.id == link.child_user_id).first()
    child_username = child.username if child is not None else "Someone"
    return FamilyInviteInfoOut(child_username=child_username, status=link.status)


@router.post("/accept", response_model=FamilyLinkOut)
def accept_invite(
    payload: FamilyAcceptIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Whoever is logged in when they follow the invite link accepts it as
    the parent. Deliberately does NOT check that current_user's own email
    matches the invite's parent_email -- possession of the token (which only
    ever arrived via that email) is the proof of ownership. Requiring an
    exact match would be brittle in practice (casing differences, or a
    parent who simply registers SOBRAD with a different address than the one
    the invite was sent to), for no real security benefit over the token
    itself.
    """
    link = db.query(FamilyLink).filter(FamilyLink.invite_token == payload.token).first()
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    if link.status != "pending":
        if link.status == "accepted":
            detail = "This invite has already been used."
        else:
            detail = "This invite was revoked."
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    link.parent_user_id = current_user.id
    link.status = "accepted"
    link.accepted_at = utcnow()
    db.commit()
    db.refresh(link)
    return _family_link_out(link)


@router.get("/children", response_model=List[FamilyChildOut])
def list_children(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Parent's view of every child linked to them via an accepted invite."""
    rows = (
        db.query(FamilyLink, User)
        .join(User, FamilyLink.child_user_id == User.id)
        .filter(FamilyLink.parent_user_id == current_user.id, FamilyLink.status == "accepted")
        .all()
    )
    return [
        FamilyChildOut(link_id=link.id, child_user_id=link.child_user_id, child_username=child.username)
        for link, child in rows
    ]


@router.get("/{child_user_id}/study", response_model=FamilyStudyRecordOut)
def get_child_study_record(
    child_user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Parent's read-only view of a linked child's Study data -- the exact
    same analysis/insights the child sees on their own /api/study/analysis
    and /api/study/insights, computed via the shared helpers in study.py so
    the two never disagree. 404 (not 403) whether the child_user_id doesn't
    exist, was never linked to this parent, or the link is pending/revoked
    -- same not-403 ownership-check convention used throughout this app
    (e.g. journal.py's _get_owned_entry), so an unauthorized caller can't
    even confirm a given user id exists.
    """
    link = (
        db.query(FamilyLink)
        .filter(
            FamilyLink.child_user_id == child_user_id,
            FamilyLink.parent_user_id == current_user.id,
            FamilyLink.status == "accepted",
        )
        .first()
    )
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    child = db.query(User).filter(User.id == child_user_id).first()
    if child is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    analysis = _compute_analysis(child, db)
    insights = _compute_insights(child, db)
    return FamilyStudyRecordOut(
        child_username=child.username, analysis=analysis, insights=insights
    )
