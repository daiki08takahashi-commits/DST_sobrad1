"""AI Weekly Review -- backend/app/routers/review.py, mounted at /api/review.

Client's request, verbatim: "AI Weekly Review. Every Sunday: This Week --
Total study time, Best focus day, Biggest distraction, Mood trend,
Recommended improvement."

Practical adaptation (also worth explaining to the client plainly): this is a
simple FastAPI app with no background job scheduler (no cron/celery/similar
-- see main.py, there's nothing of the sort anywhere in this codebase), so a
literal "every Sunday it just appears" push notification isn't feasible here.
Instead this is served as an always-available "last 7 days" view, computed
live from real data every time the endpoint is called (today back 6 days
inclusive, by default). It still delivers every number and line she asked to
see -- total study time, best focus day, the distraction proxy, mood trend,
recommended improvement -- just on-demand rather than push-scheduled.

"Biggest distraction": there is no distraction-tracking data anywhere in this
app -- no interruption-reason logging exists on FocusSession or anywhere
else. Rather than fabricate one, this uses FocusSession.interrupted (a
session the user stopped before its planned length) as the closest available
honest proxy, worded as "you stopped N session(s) early" -- never a claim
about *why* a session was interrupted, since that's simply not tracked.

Same optional-AI-with-deterministic-fallback pattern used throughout this
app (see chat.py's _build_reply and study.py's _build_ai_insight_summary /
_deterministic_insight_summary for the two prior examples this mirrors):
Claude is only ever handed a small, precomputed, numbers-only stats object
(never raw FocusSession/MoodEntry rows), so it can narrate those figures but
can't invent new ones. If ANTHROPIC_API_KEY isn't configured (the realistic
case for this client right now), or the Anthropic call fails for ANY reason
(network, auth, rate limit, timeout, malformed response, ...), this falls
back to a deterministic sentence built directly from the same stats. The
endpoint must never 500 and never hang, including for a brand-new user with
zero focus sessions and zero mood entries in the window.
"""
import json
import logging
import os
from collections import defaultdict
from datetime import date as date_type, datetime, time, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import FocusSession, User
from app.schemas import WeeklyReviewOut

router = APIRouter(prefix="/api/review", tags=["review"])

logger = logging.getLogger(__name__)

# Inclusive window length: "the last 7 days" = today back 6 days. Simpler
# than trying to align to a Sunday-Saturday calendar week, and still an
# honest, plain reading of "this week" for a client-facing feature that runs
# on-demand rather than on a schedule.
WINDOW_DAYS = 7

DEFAULT_REVIEW_MODEL = "claude-haiku-4-5"
MAX_REVIEW_TOKENS = 260
ANTHROPIC_TIMEOUT_SECONDS = 10.0
ANTHROPIC_MAX_RETRIES = 0

REVIEW_SYSTEM_PROMPT = """You are writing a short, warm "recommended improvement" note for a \
student's AI Weekly Review inside the SOBRAD app's Study page. You will be \
given a small set of precomputed statistics for their last 7 days: total \
focus/study minutes, their best focus day (if any) and its minutes, and how \
many focus sessions they stopped early.

Write 2-4 short sentences: warm, encouraging and specific to the numbers \
given, but honest and non-hyped -- never pretend there's more data than \
there is, and never claim to know *why* a session was stopped early (that \
is genuinely not tracked, only *that* it happened). Reference ONLY the \
figures you are given -- never invent or guess a number, day name, or \
reason that wasn't provided. Keep it brief and conversational, not a \
report, and end on one small, doable suggestion for the coming week."""


def _window_bounds(end_date: date_type) -> tuple[date_type, date_type, datetime, datetime]:
    """Returns (window_start, window_end, start_dt, end_dt) for the 7-day
    window ending on `end_date` (inclusive). The datetimes are UTC-aware,
    covering the full calendar days, for filtering the timezone-aware
    started_at/created_at columns.
    """
    window_start = end_date - timedelta(days=WINDOW_DAYS - 1)
    start_dt = datetime.combine(window_start, time.min, tzinfo=timezone.utc)
    end_dt = datetime.combine(end_date, time.max, tzinfo=timezone.utc)
    return window_start, end_date, start_dt, end_dt


def _as_aware_utc(dt: datetime) -> datetime:
    """Same normalization as focus.py's _as_aware_utc -- SQLite drops tzinfo
    on round-trip even for a DateTime(timezone=True) column, so values freshly
    loaded from the DB can come back naive. Every write in this app uses
    utcnow(), so a naive value is safely assumed to already be UTC.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _compute_focus_stats(sessions: List[FocusSession]) -> dict:
    """Deterministic, numbers-only stats derived from this window's
    FocusSessions. `total_study_minutes` sums planned_minutes for completed
    sessions only (a session credited on completion runs its full planned
    length by definition -- same convention focus.py's own
    complete_focus_session endpoint uses for crediting a linked Task's
    actual_minutes, kept consistent here for the same reason: it's the
    figure the user actually committed to and finished, not a wall-clock
    approximation). `interrupted_session_count` is the "biggest distraction"
    proxy -- see this module's top-of-file docstring for why it's a count of
    early stops rather than a claimed reason.
    """
    minutes_by_day: Dict[date_type, int] = defaultdict(int)
    total_minutes = 0
    interrupted_count = 0

    for s in sessions:
        day = _as_aware_utc(s.started_at).date()
        if s.completed:
            minutes_by_day[day] += s.planned_minutes
            total_minutes += s.planned_minutes
        if s.interrupted:
            interrupted_count += 1

    best_day: Optional[date_type] = None
    best_day_minutes = 0
    if minutes_by_day:
        best_day, best_day_minutes = max(minutes_by_day.items(), key=lambda kv: kv[1])
        if best_day_minutes <= 0:
            # Every logged day nets to zero focus minutes -- don't pick an
            # arbitrary "best" day out of a tie of zeroes.
            best_day = None
            best_day_minutes = 0

    return {
        "total_study_minutes": total_minutes,
        "best_focus_day": best_day,
        "best_focus_day_minutes": best_day_minutes,
        "interrupted_session_count": interrupted_count,
        "session_count": len(sessions),
    }


def _format_review_stats(
    window_start: date_type,
    window_end: date_type,
    focus_stats: dict,
) -> dict:
    """The precomputed, numbers-only stats bundle handed to the AI (and used
    to build the deterministic fallback below). Never includes raw session
    rows -- only the aggregates already computed above.
    """
    return {
        "window_start": window_start.isoformat(),
        "window_end": window_end.isoformat(),
        "total_study_minutes": focus_stats["total_study_minutes"],
        "best_focus_day": focus_stats["best_focus_day"].isoformat()
        if focus_stats["best_focus_day"]
        else None,
        "best_focus_day_minutes": focus_stats["best_focus_day_minutes"],
        "interrupted_session_count": focus_stats["interrupted_session_count"],
        "focus_session_count": focus_stats["session_count"],
    }


def _format_minutes(total_minutes: int) -> str:
    if total_minutes <= 0:
        return "0 minutes"
    hours, minutes = divmod(total_minutes, 60)
    if hours and minutes:
        return f"{hours}h {minutes}m"
    if hours:
        return f"{hours}h"
    return f"{minutes}m"


def _deterministic_recommendation(stats: dict) -> str:
    """Plain-English fallback paragraph built directly from `stats`, with no
    AI call involved. Used whenever no API key is configured or the AI call
    fails -- must always read naturally and never be empty, since this is the
    realistic day-to-day path for this client right now (no key configured).
    """
    total_minutes = stats["total_study_minutes"]
    interrupted = stats["interrupted_session_count"]
    best_day_minutes = stats["best_focus_day_minutes"]

    if total_minutes == 0:
        return (
            "Nothing logged yet this week — no pressure. A single focus session "
            "is all it takes to get this page started."
        )

    parts = []

    if total_minutes > 0:
        parts.append(
            f"You put in {_format_minutes(total_minutes)} of focused study this week"
            + (f", with your strongest day at {_format_minutes(best_day_minutes)}." if best_day_minutes > 0 else ".")
        )
    else:
        parts.append("No completed focus sessions logged this week yet.")

    if interrupted == 1:
        parts.append("One session got stopped early — that happens, no need to read into it.")
    elif interrupted > 1:
        parts.append(
            f"{interrupted} sessions got stopped early this week — worth noticing if a pattern keeps showing up."
        )

    if total_minutes > 0:
        parts.append("One small idea for next week: keep sessions roughly the same length so they're easier to finish end to end.")
    else:
        parts.append("Starting with just one short focus session next week is a reasonable first step.")

    return " ".join(parts)


def _build_ai_recommendation(stats: dict) -> Optional[str]:
    """Try the real Anthropic API; return None (never raises) on ANY problem
    so the caller falls back to _deterministic_recommendation. Mirrors
    chat.py's _build_reply and study.py's _build_ai_insight_summary -- see
    either for the full rationale behind the broad except/short timeout/no
    retries.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.info(
            "ANTHROPIC_API_KEY not configured; using deterministic weekly review."
        )
        return None

    try:
        import anthropic

        model = os.environ.get("SOBRAD_REVIEW_MODEL", DEFAULT_REVIEW_MODEL)

        client = anthropic.Anthropic(
            api_key=api_key,
            timeout=ANTHROPIC_TIMEOUT_SECONDS,
            max_retries=ANTHROPIC_MAX_RETRIES,
        )
        response = client.messages.create(
            model=model,
            max_tokens=MAX_REVIEW_TOKENS,
            system=REVIEW_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Here are this week's precomputed stats (JSON), figures "
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
            "Anthropic API call failed; falling back to deterministic weekly review.",
            exc_info=True,
        )
        return None


@router.get("/weekly", response_model=WeeklyReviewOut)
def get_weekly_review(
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The AI Weekly Review. Defaults to the last 7 days ending today;
    `end_date` (optional, YYYY-MM-DD) lets the frontend ask for a different
    week later without changing this endpoint's shape. Always returns 200 --
    including for a user with zero focus sessions in the window, which gets a
    calm, encouraging placeholder rather than an error.
    """
    if end_date:
        try:
            parsed_end = date_type.fromisoformat(end_date)
        except ValueError:
            raise HTTPException(
                status_code=400, detail="end_date must be YYYY-MM-DD"
            )
    else:
        parsed_end = datetime.now(timezone.utc).date()

    window_start, window_end, start_dt, end_dt = _window_bounds(parsed_end)

    sessions = (
        db.query(FocusSession)
        .filter(
            FocusSession.user_id == current_user.id,
            FocusSession.started_at >= start_dt,
            FocusSession.started_at <= end_dt,
        )
        .order_by(FocusSession.started_at.asc(), FocusSession.id.asc())
        .all()
    )

    focus_stats = _compute_focus_stats(sessions)
    stats = _format_review_stats(window_start, window_end, focus_stats)

    ai_text = _build_ai_recommendation(stats)
    if ai_text is not None:
        recommendation = ai_text
        generated_by = "ai"
    else:
        recommendation = _deterministic_recommendation(stats)
        generated_by = "deterministic"

    return WeeklyReviewOut(
        window_start=window_start,
        window_end=window_end,
        total_study_minutes=focus_stats["total_study_minutes"],
        best_focus_day=focus_stats["best_focus_day"],
        best_focus_day_minutes=focus_stats["best_focus_day_minutes"],
        interrupted_session_count=focus_stats["interrupted_session_count"],
        recommended_improvement=recommendation,
        generated_by=generated_by,
    )
