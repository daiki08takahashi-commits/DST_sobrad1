"""Study support: calendar/schedule, goals + steps, subjects/grades and a
deterministic weak-point analysis derived from entered grades.

No external AI call is involved in the analysis endpoint -- it is a plain
server-side aggregation, matching how Chat is already just canned replies
rather than a real LLM. Keep the tone honest and non-hyped throughout.
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Goal, GoalStep, Grade, StudyEvent, Subject, User
from app.schemas import (
    GoalCreate,
    GoalOut,
    GoalStepCreate,
    GoalStepOut,
    GoalStepUpdate,
    GoalUpdate,
    GradeCreate,
    GradeOut,
    StudyAnalysisOut,
    StudyEventCreate,
    StudyEventOut,
    StudyEventUpdate,
    StudySettingsOut,
    StudySettingsUpdate,
    SubjectAverage,
    SubjectCreate,
    SubjectOut,
)

router = APIRouter(prefix="/api/study", tags=["study"])


def _get_owned_subject(db: Session, current_user: User, subject_id: int) -> Subject:
    subject = (
        db.query(Subject)
        .filter(Subject.id == subject_id, Subject.user_id == current_user.id)
        .first()
    )
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
    return subject


def _get_or_create_subject(db: Session, current_user: User, name: str) -> Subject:
    name = name.strip()
    existing = (
        db.query(Subject)
        .filter(Subject.user_id == current_user.id, Subject.name.ilike(name))
        .first()
    )
    if existing is not None:
        return existing
    subject = Subject(user_id=current_user.id, name=name)
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return subject


def _get_owned_goal(db: Session, current_user: User, goal_id: int) -> Goal:
    goal = (
        db.query(Goal)
        .filter(Goal.id == goal_id, Goal.user_id == current_user.id)
        .first()
    )
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    return goal


def _get_owned_event(db: Session, current_user: User, event_id: int) -> StudyEvent:
    event = (
        db.query(StudyEvent)
        .filter(StudyEvent.id == event_id, StudyEvent.user_id == current_user.id)
        .first()
    )
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _grade_out(grade: Grade) -> GradeOut:
    return GradeOut(
        id=grade.id,
        subject_id=grade.subject_id,
        subject_name=grade.subject.name if grade.subject else None,
        label=grade.label,
        score=grade.score,
        date=grade.date,
        created_at=grade.created_at,
    )


def _event_out(event: StudyEvent) -> StudyEventOut:
    return StudyEventOut(
        id=event.id,
        title=event.title,
        date=event.date,
        event_type=event.event_type,
        subject_id=event.subject_id,
        subject_name=event.subject.name if event.subject else None,
        note=event.note,
        done=event.done,
    )


# ---------------------------------------------------------------------------
# Subjects
# ---------------------------------------------------------------------------


@router.get("/subjects", response_model=List[SubjectOut])
def list_subjects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Subject)
        .filter(Subject.user_id == current_user.id)
        .order_by(Subject.name.asc())
        .all()
    )


@router.post("/subjects", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
def create_subject(
    payload: SubjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Forgiving on purpose: a duplicate name for this user is not an error,
    # just returns the existing subject.
    return _get_or_create_subject(db, current_user, payload.name)


@router.delete("/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(
    subject_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    subject = _get_owned_subject(db, current_user, subject_id)
    db.delete(subject)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Grades
# ---------------------------------------------------------------------------


@router.get("/grades", response_model=List[GradeOut])
def list_grades(
    subject_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Grade).filter(Grade.user_id == current_user.id)
    if subject_id is not None:
        query = query.filter(Grade.subject_id == subject_id)
    grades = query.order_by(Grade.date.desc(), Grade.id.desc()).all()
    return [_grade_out(g) for g in grades]


@router.post("/grades", response_model=GradeOut, status_code=status.HTTP_201_CREATED)
def create_grade(
    payload: GradeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    subject = _get_or_create_subject(db, current_user, payload.subject_name)
    grade = Grade(
        user_id=current_user.id,
        subject_id=subject.id,
        label=payload.label,
        score=payload.score,
        date=payload.date,
    )
    db.add(grade)
    db.commit()
    db.refresh(grade)
    return _grade_out(grade)


@router.delete("/grades/{grade_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_grade(
    grade_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    grade = (
        db.query(Grade)
        .filter(Grade.id == grade_id, Grade.user_id == current_user.id)
        .first()
    )
    if grade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grade not found")
    db.delete(grade)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Goals + steps
# ---------------------------------------------------------------------------


@router.get("/goals", response_model=List[GoalOut])
def list_goals(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Goal)
        .filter(Goal.user_id == current_user.id)
        .order_by(Goal.created_at.desc(), Goal.id.desc())
        .all()
    )


@router.post("/goals", response_model=GoalOut, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: GoalCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    goal = Goal(
        user_id=current_user.id,
        title=payload.title,
        description=payload.description,
        category=payload.category,
        target_date=payload.target_date,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.patch("/goals/{goal_id}", response_model=GoalOut)
def update_goal(
    goal_id: int,
    payload: GoalUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    goal = _get_owned_goal(db, current_user, goal_id)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(goal, field, value)
    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    goal = _get_owned_goal(db, current_user, goal_id)
    db.delete(goal)
    db.commit()
    return None


@router.post(
    "/goals/{goal_id}/steps", response_model=GoalStepOut, status_code=status.HTTP_201_CREATED
)
def create_goal_step(
    goal_id: int,
    payload: GoalStepCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    goal = _get_owned_goal(db, current_user, goal_id)
    next_index = len(goal.steps)
    step = GoalStep(goal_id=goal.id, title=payload.title, order_index=next_index)
    db.add(step)
    db.commit()
    db.refresh(step)
    return step


@router.patch("/goals/{goal_id}/steps/{step_id}", response_model=GoalStepOut)
def update_goal_step(
    goal_id: int,
    step_id: int,
    payload: GoalStepUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_owned_goal(db, current_user, goal_id)  # ownership check
    step = (
        db.query(GoalStep)
        .filter(GoalStep.id == step_id, GoalStep.goal_id == goal_id)
        .first()
    )
    if step is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Step not found")
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(step, field, value)
    db.commit()
    db.refresh(step)
    return step


@router.delete("/goals/{goal_id}/steps/{step_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal_step(
    goal_id: int,
    step_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_owned_goal(db, current_user, goal_id)  # ownership check
    step = (
        db.query(GoalStep)
        .filter(GoalStep.id == step_id, GoalStep.goal_id == goal_id)
        .first()
    )
    if step is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Step not found")
    db.delete(step)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Calendar events
# ---------------------------------------------------------------------------


@router.get("/events", response_model=List[StudyEventOut])
def list_events(
    start: Optional[str] = None,
    end: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(StudyEvent).filter(StudyEvent.user_id == current_user.id)
    if start:
        try:
            start_dt = datetime.fromisoformat(start)
        except ValueError:
            raise HTTPException(status_code=400, detail="start must be YYYY-MM-DD")
        query = query.filter(StudyEvent.date >= start_dt)
    if end:
        try:
            end_dt = datetime.fromisoformat(end)
        except ValueError:
            raise HTTPException(status_code=400, detail="end must be YYYY-MM-DD")
        query = query.filter(StudyEvent.date <= end_dt)
    events = query.order_by(StudyEvent.date.asc()).all()
    return [_event_out(e) for e in events]


@router.post("/events", response_model=StudyEventOut, status_code=status.HTTP_201_CREATED)
def create_event(
    payload: StudyEventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.subject_id is not None:
        _get_owned_subject(db, current_user, payload.subject_id)
    event = StudyEvent(
        user_id=current_user.id,
        title=payload.title,
        date=payload.date,
        event_type=payload.event_type,
        subject_id=payload.subject_id,
        note=payload.note,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return _event_out(event)


@router.patch("/events/{event_id}", response_model=StudyEventOut)
def update_event(
    event_id: int,
    payload: StudyEventUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = _get_owned_event(db, current_user, event_id)
    data = payload.model_dump(exclude_unset=True)
    if "subject_id" in data and data["subject_id"] is not None:
        _get_owned_subject(db, current_user, data["subject_id"])
    for field, value in data.items():
        setattr(event, field, value)
    db.commit()
    db.refresh(event)
    return _event_out(event)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = _get_owned_event(db, current_user, event_id)
    db.delete(event)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Settings -- the passing/"needs focus" threshold. Configurable per user
# because a passing mark differs school to school; defaults to 70% (see
# User.passing_threshold in models.py).
# ---------------------------------------------------------------------------


@router.get("/settings", response_model=StudySettingsOut)
def get_study_settings(
    current_user: User = Depends(get_current_user),
):
    return StudySettingsOut(passing_threshold=current_user.passing_threshold)


@router.patch("/settings", response_model=StudySettingsOut)
def update_study_settings(
    payload: StudySettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.passing_threshold = payload.passing_threshold
    db.commit()
    db.refresh(current_user)
    return StudySettingsOut(passing_threshold=current_user.passing_threshold)


# ---------------------------------------------------------------------------
# Analysis -- deterministic, server-side. No external AI call.
# ---------------------------------------------------------------------------


@router.get("/analysis", response_model=StudyAnalysisOut)
def get_analysis(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    threshold = current_user.passing_threshold
    grades = db.query(Grade).filter(Grade.user_id == current_user.id).all()

    if not grades:
        return StudyAnalysisOut(
            subjects=[],
            summary="No grades logged yet. Add a few and this page will show where extra review might help.",
        )

    by_subject = {}
    for g in grades:
        by_subject.setdefault(g.subject_id, []).append(g)

    rows = []
    for subject_id, entries in by_subject.items():
        subject = entries[0].subject
        avg = sum(e.score for e in entries) / len(entries)
        avg = round(avg, 1)
        needs_focus = avg < threshold
        tip = None
        if needs_focus:
            tip = f"{subject.name}'s average is {avg}% — a bit of extra review here could help."
        rows.append(
            SubjectAverage(
                subject_id=subject_id,
                subject_name=subject.name if subject else "Unknown",
                average=avg,
                entry_count=len(entries),
                needs_focus=needs_focus,
                tip=tip,
            )
        )

    rows.sort(key=lambda r: r.average)

    flagged = [r for r in rows if r.needs_focus]
    threshold_label = f"{threshold:g}"
    if flagged:
        names = ", ".join(r.subject_name for r in flagged)
        summary = f"{len(flagged)} subject(s) could use a bit more attention: {names}."
    else:
        summary = f"Everything's averaging {threshold_label}% or above right now — no subject is flagged for extra focus."

    return StudyAnalysisOut(subjects=rows, summary=summary)
