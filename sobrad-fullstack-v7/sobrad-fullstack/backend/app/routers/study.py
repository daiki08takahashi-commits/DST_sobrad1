"""Study support: calendar/schedule, goals + steps, subjects/grades and a
deterministic weak-point analysis derived from entered grades.

No external AI call is involved in the analysis endpoint -- it is a plain
server-side aggregation, matching how Chat is already just canned replies
rather than a real LLM. Keep the tone honest and non-hyped throughout.

The /insights endpoint below is the one place in this file that *can* call
a real AI model (same optional-AI-with-deterministic-fallback pattern as
chat.py) -- see the big comment above get_insights() for details.
"""
import json
import logging
import os
from datetime import date as date_type, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import DayNote, Goal, GoalStep, Grade, StudyEvent, Subject, User
from app.schemas import (
    DayNoteOut,
    DayNoteUpdate,
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
    StudyInsightPoint,
    StudyInsightsOut,
    StudySettingsOut,
    StudySettingsUpdate,
    SubjectAverage,
    SubjectCreate,
    SubjectOut,
)

router = APIRouter(prefix="/api/study", tags=["study"])

logger = logging.getLogger(__name__)


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
# Day notes -- freeform text on the calendar, separate from the structured
# StudyEvent list. One note per user per date; upserted from the frontend
# (there's no separate create/delete -- an empty string just means "no note
# right now" so the frontend can treat "no note yet" as a normal empty
# state rather than a 404).
# ---------------------------------------------------------------------------


def _parse_note_date(raw: str) -> date_type:
    try:
        return date_type.fromisoformat(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")


@router.get("/notes/{note_date}", response_model=DayNoteOut)
def get_day_note(
    note_date: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    parsed = _parse_note_date(note_date)
    note = (
        db.query(DayNote)
        .filter(DayNote.user_id == current_user.id, DayNote.date == parsed)
        .first()
    )
    if note is None:
        # No note yet for this date -- a normal empty state, not a 404.
        return DayNoteOut(date=parsed, text="", updated_at=None)
    return DayNoteOut(date=note.date, text=note.text, updated_at=note.updated_at)


@router.put("/notes/{note_date}", response_model=DayNoteOut)
def upsert_day_note(
    note_date: str,
    payload: DayNoteUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    parsed = _parse_note_date(note_date)
    note = (
        db.query(DayNote)
        .filter(DayNote.user_id == current_user.id, DayNote.date == parsed)
        .first()
    )
    if note is None:
        note = DayNote(user_id=current_user.id, date=parsed, text=payload.text)
        db.add(note)
    else:
        note.text = payload.text
    db.commit()
    db.refresh(note)
    return DayNoteOut(date=note.date, text=note.text, updated_at=note.updated_at)


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


def _subject_averages(grades: List[Grade], threshold: float) -> List[SubjectAverage]:
    """Group `grades` by subject and compute each subject's average, flagging
    any subject whose average sits below `threshold`. Shared by both
    /analysis and /insights so the two endpoints never disagree about what a
    subject's average is.
    """
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
    return rows


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

    rows = _subject_averages(grades, threshold)

    flagged = [r for r in rows if r.needs_focus]
    threshold_label = f"{threshold:g}"
    if flagged:
        names = ", ".join(r.subject_name for r in flagged)
        summary = f"{len(flagged)} subject(s) could use a bit more attention: {names}."
    else:
        summary = f"Everything's averaging {threshold_label}% or above right now — no subject is flagged for extra focus."

    return StudyAnalysisOut(subjects=rows, summary=summary)


# ---------------------------------------------------------------------------
# Insights -- an AI-narrated (with deterministic fallback) study-progress
# summary, plus the raw chronological point series the frontend charts.
#
# Same optional-AI pattern as chat.py: if ANTHROPIC_API_KEY isn't set (the
# realistic case for this client right now, per her own account -- see the
# comment at the top of chat.py), or the Anthropic call fails for ANY reason
# (network, auth, rate limit, timeout, malformed response, ...), this falls
# back to a deterministic, plain-English sentence built directly from the
# trend stats computed below. The endpoint must never 500 and never hang.
#
# Importantly: the model is never given the raw grade list. It only ever
# sees a small, precomputed, numbers-only summary of stats we already
# calculated server-side (subject averages, entry counts, trend direction/
# magnitude, passing threshold) and is told to narrate only those figures --
# this is what keeps it from hallucinating numbers it wasn't given.
# ---------------------------------------------------------------------------

DEFAULT_INSIGHTS_MODEL = "claude-haiku-4-5"

# Short narrative only -- a couple of sentences, not a report.
MAX_INSIGHTS_TOKENS = 220

# Same rationale as chat.py's ANTHROPIC_TIMEOUT_SECONDS/ANTHROPIC_MAX_RETRIES:
# a short timeout and no SDK retries so a stalled/unreachable network still
# resolves quickly into the deterministic fallback instead of hanging the
# request.
ANTHROPIC_TIMEOUT_SECONDS = 10.0
ANTHROPIC_MAX_RETRIES = 0

# Point difference (percentage points) between the earlier-half and later-
# half averages below which the trend is called "steady" rather than
# "improving"/"declining" -- small fluctuations shouldn't read as a trend.
TREND_STEADY_BAND = 2.0

INSIGHTS_SYSTEM_PROMPT = """You are writing a short study-progress note for a student inside the \
SOBRAD app's Study page. You will be given a small set of precomputed \
statistics (subject averages, entry counts, trend direction and point \
change, passing threshold). Write 2-4 short sentences, warm and \
encouraging but honest and non-hyped, narrating that trend in plain \
English.

Rules: reference ONLY the figures you are given -- never invent, guess, or \
round differently than what's provided, and never mention grades, dates, or \
subjects that were not given to you. Do not add generic study tips unless a \
"needs focus" subject is explicitly given. Keep it brief and conversational, \
not a report."""


def _format_trend_stats(
    subjects: List[SubjectAverage],
    trend: str,
    earlier_avg: Optional[float],
    later_avg: Optional[float],
    point_diff: Optional[float],
    entry_count: int,
    threshold: float,
) -> dict:
    """The precomputed, numbers-only stats bundle handed to the AI (and used
    to build the deterministic fallback). Never includes the raw grade list.
    """
    return {
        "entry_count": entry_count,
        "passing_threshold": threshold,
        "trend": trend,
        "earlier_half_average": earlier_avg,
        "later_half_average": later_avg,
        "point_change": point_diff,
        "subjects": [
            {
                "subject_name": s.subject_name,
                "average": s.average,
                "entry_count": s.entry_count,
                "needs_focus": s.needs_focus,
            }
            for s in subjects
        ],
    }


def _deterministic_insight_summary(
    stats: dict, subjects: List[SubjectAverage]
) -> str:
    """Plain-English fallback narrative built directly from `stats`, with no
    AI call involved. Used whenever no API key is configured or the AI call
    fails -- must always read naturally and never be empty.
    """
    trend = stats["trend"]
    earlier = stats["earlier_half_average"]
    later = stats["later_half_average"]
    n = stats["entry_count"]

    if trend == "not_enough_data":
        if n == 1:
            return "You've logged one grade so far — add a few more and this page will start showing your trend over time."
        return "No grades logged yet. Add a few and this page will show how your study progress is trending."

    if trend == "improving":
        return (
            f"Your average has gone from {earlier}% to {later}% over your last "
            f"{n} grades — that's trending upward. Keep it up!"
        )

    if trend == "declining":
        weakest = subjects[0] if subjects else None
        tail = (
            f" It might be worth a closer look at {weakest.subject_name}."
            if weakest and weakest.needs_focus
            else ""
        )
        return (
            f"Your average has slipped from {earlier}% to {later}% over your "
            f"last {n} grades.{tail}"
        )

    # steady
    overall = round((earlier + later) / 2, 1) if earlier is not None and later is not None else later
    return f"Your average has been holding steady around {overall}% over your last {n} grades."


def _build_ai_insight_summary(stats: dict) -> Optional[str]:
    """Try the real Anthropic API; return None (never raises) on ANY problem
    so the caller can fall back to the deterministic summary. Mirrors
    chat.py's _build_reply -- see that function's docstring for the full
    rationale.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.info(
            "ANTHROPIC_API_KEY not configured; using deterministic study insights."
        )
        return None

    try:
        import anthropic

        model = os.environ.get("SOBRAD_INSIGHTS_MODEL", DEFAULT_INSIGHTS_MODEL)

        client = anthropic.Anthropic(
            api_key=api_key,
            timeout=ANTHROPIC_TIMEOUT_SECONDS,
            max_retries=ANTHROPIC_MAX_RETRIES,
        )
        response = client.messages.create(
            model=model,
            max_tokens=MAX_INSIGHTS_TOKENS,
            system=INSIGHTS_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Here are the precomputed study stats (JSON), figures "
                        "only, nothing else: " + json.dumps(stats)
                    ),
                }
            ],
        )
        text = "".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        ).strip()
        if not text:
            raise ValueError("empty response from Anthropic API")
        return text
    except Exception:
        # Broad on purpose -- see chat.py's _build_reply for the rationale.
        # Any failure here must silently fall back, never crash the request.
        logger.warning(
            "Anthropic API call failed; falling back to deterministic study insights.",
            exc_info=True,
        )
        return None


@router.get("/insights", response_model=StudyInsightsOut)
def get_insights(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    threshold = current_user.passing_threshold
    grades = (
        db.query(Grade)
        .filter(Grade.user_id == current_user.id)
        .order_by(Grade.date.asc(), Grade.id.asc())
        .all()
    )

    if not grades:
        stats = _format_trend_stats(
            subjects=[],
            trend="not_enough_data",
            earlier_avg=None,
            later_avg=None,
            point_diff=None,
            entry_count=0,
            threshold=threshold,
        )
        summary = _deterministic_insight_summary(stats, [])
        return StudyInsightsOut(
            series=[],
            subjects=[],
            overall_summary=summary,
            trend="not_enough_data",
            generated_by="deterministic",
        )

    series = [
        StudyInsightPoint(
            date=g.date,
            score=g.score,
            subject_name=g.subject.name if g.subject else "Unknown",
        )
        for g in grades
    ]
    subjects = _subject_averages(grades, threshold)

    n = len(grades)
    if n < 2:
        trend = "not_enough_data"
        earlier_avg = later_avg = round(grades[0].score, 1)
        point_diff = 0.0
    else:
        half = n // 2
        earlier_half = grades[:half]
        later_half = grades[half:]
        earlier_avg = round(sum(g.score for g in earlier_half) / len(earlier_half), 1)
        later_avg = round(sum(g.score for g in later_half) / len(later_half), 1)
        point_diff = round(later_avg - earlier_avg, 1)
        if point_diff > TREND_STEADY_BAND:
            trend = "improving"
        elif point_diff < -TREND_STEADY_BAND:
            trend = "declining"
        else:
            trend = "steady"

    stats = _format_trend_stats(
        subjects=subjects,
        trend=trend,
        earlier_avg=earlier_avg,
        later_avg=later_avg,
        point_diff=point_diff,
        entry_count=n,
        threshold=threshold,
    )

    ai_summary = _build_ai_insight_summary(stats)
    if ai_summary is not None:
        overall_summary = ai_summary
        generated_by = "ai"
    else:
        overall_summary = _deterministic_insight_summary(stats, subjects)
        generated_by = "deterministic"

    return StudyInsightsOut(
        series=series,
        subjects=subjects,
        overall_summary=overall_summary,
        trend=trend,
        generated_by=generated_by,
    )
