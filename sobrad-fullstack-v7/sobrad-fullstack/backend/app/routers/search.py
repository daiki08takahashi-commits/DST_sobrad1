"""Global "search everything" endpoint: a single content-search bar across
Journal entries, Tasks, Study subjects/goals, and Companions (chat
"friends"), all strictly scoped to the logged-in user. See
schemas.SearchResultsOut for the response shape.

Each category is an independent query, filtered by the current user's
ownership and capped at 20 results, newest first -- same ilike/or_ matching
pattern as routers/tasks.py's list_tasks(q=...) and, for tasks specifically,
the same default exclusion of archived tasks. Journal/Task/Companion results
are built via the existing _journal_entry_out/_task_out/_companion_out
helpers (imported from their own routers, same cross-router-import style
routers/family.py uses for study.py's _compute_analysis/_compute_insights)
so this endpoint can never drift from what those routers already return.
Subjects/goals have no existing single-row helper, so SubjectOut/GoalOut are
built directly here; GoalOut deliberately gets steps=[] (no GoalStep query)
to keep this response light, same rationale JournalEntryOut documents for
omitting photo bytes from list views. Companion results deliberately include
hidden=True companions -- hiding a companion only removes it from the main
chat list, not from search, so its thread stays reachable.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Companion, Goal, JournalEntry, Subject, Task, User
from app.routers.companions import _companion_out
from app.routers.journal import _journal_entry_out
from app.routers.tasks import _task_out
from app.schemas import SearchResultsOut, SubjectOut, GoalOut

router = APIRouter(prefix="/api/search", tags=["search"])

RESULTS_LIMIT = 20


@router.get("", response_model=SearchResultsOut)
def search_everything(
    q: str = Query(default=""),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search the current user's Journal entries, Tasks, and Study subjects/
    goals for a substring match (case-insensitive), grouped by category. An
    empty/whitespace-only q returns all four lists empty without touching
    the database.
    """
    q = q.strip()
    if not q:
        return SearchResultsOut()

    like = f"%{q}%"

    journal_entries = (
        db.query(JournalEntry)
        .filter(JournalEntry.user_id == current_user.id, JournalEntry.text.ilike(like))
        .order_by(JournalEntry.created_at.desc(), JournalEntry.id.desc())
        .limit(RESULTS_LIMIT)
        .all()
    )

    tasks = (
        db.query(Task)
        .filter(
            Task.user_id == current_user.id,
            or_(Task.title.ilike(like), Task.description.ilike(like)),
            Task.status != "archived",
        )
        .order_by(Task.created_at.desc(), Task.id.desc())
        .limit(RESULTS_LIMIT)
        .all()
    )

    subjects = (
        db.query(Subject)
        .filter(Subject.user_id == current_user.id, Subject.name.ilike(like))
        .order_by(Subject.created_at.desc(), Subject.id.desc())
        .limit(RESULTS_LIMIT)
        .all()
    )

    goals = (
        db.query(Goal)
        .filter(
            Goal.user_id == current_user.id,
            or_(Goal.title.ilike(like), Goal.description.ilike(like)),
        )
        .order_by(Goal.created_at.desc(), Goal.id.desc())
        .limit(RESULTS_LIMIT)
        .all()
    )

    # Deliberately does NOT filter out hidden=True companions -- a hidden
    # chat thread must still be findable by name here, that's the whole
    # point of the hide feature (it hides from the main chat list, not from
    # the user entirely).
    companions = (
        db.query(Companion)
        .filter(Companion.user_id == current_user.id, Companion.name.ilike(like))
        .order_by(Companion.created_at.desc(), Companion.id.desc())
        .limit(RESULTS_LIMIT)
        .all()
    )

    return SearchResultsOut(
        journal=[_journal_entry_out(e) for e in journal_entries],
        tasks=[_task_out(db, t) for t in tasks],
        subjects=[
            SubjectOut(id=s.id, name=s.name, created_at=s.created_at) for s in subjects
        ],
        goals=[
            GoalOut(
                id=g.id,
                title=g.title,
                description=g.description,
                category=g.category,
                target_date=g.target_date,
                status=g.status,
                created_at=g.created_at,
                steps=[],
            )
            for g in goals
        ],
        companions=[_companion_out(c) for c in companions],
    )
