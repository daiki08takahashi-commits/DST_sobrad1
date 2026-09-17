"""Task management: to-do items with optional subject link, subtasks,
cross-task dependencies, due dates, simple time tracking, and recurrence.

See models.py (Task, TaskDependency) for the schema and schemas.py for the
request/response shapes.
"""
from datetime import timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Subject, Task, TaskDependency, User, utcnow
from app.schemas import (
    TaskCreate,
    TaskDependencyCreate,
    TaskDetailOut,
    TaskOut,
    TaskUpdate,
)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_owned_task(db: Session, current_user: User, task_id: int) -> Task:
    task = (
        db.query(Task)
        .filter(Task.id == task_id, Task.user_id == current_user.id)
        .first()
    )
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


def _get_owned_subject(db: Session, current_user: User, subject_id: int) -> Subject:
    subject = (
        db.query(Subject)
        .filter(Subject.id == subject_id, Subject.user_id == current_user.id)
        .first()
    )
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
    return subject


def _depends_on_ids(db: Session, task_id: int) -> List[int]:
    rows = (
        db.query(TaskDependency.depends_on_task_id)
        .filter(TaskDependency.task_id == task_id)
        .all()
    )
    return [r[0] for r in rows]


def _task_out(db: Session, task: Task) -> TaskOut:
    return TaskOut(
        id=task.id,
        title=task.title,
        description=task.description,
        tags=task.tags,
        subject_id=task.subject_id,
        parent_task_id=task.parent_task_id,
        due_date=task.due_date,
        estimated_minutes=task.estimated_minutes,
        actual_minutes=task.actual_minutes,
        progress_percent=task.progress_percent,
        status=task.status,
        recurrence=task.recurrence,
        recurrence_interval_days=task.recurrence_interval_days,
        notes=task.notes,
        created_at=task.created_at,
        updated_at=task.updated_at,
        completed_at=task.completed_at,
        depends_on=_depends_on_ids(db, task.id),
    )


def _delete_task_cascade(db: Session, task: Task) -> None:
    """Delete `task`, all of its descendant subtasks (any depth), and every
    dependency row that references any of those tasks on either side."""
    to_delete_ids = [task.id]
    frontier = [task.id]
    while frontier:
        rows = db.query(Task.id).filter(Task.parent_task_id.in_(frontier)).all()
        child_ids = [r[0] for r in rows]
        if not child_ids:
            break
        to_delete_ids.extend(child_ids)
        frontier = child_ids

    db.query(TaskDependency).filter(
        or_(
            TaskDependency.task_id.in_(to_delete_ids),
            TaskDependency.depends_on_task_id.in_(to_delete_ids),
        )
    ).delete(synchronize_session=False)
    db.query(Task).filter(Task.id.in_(to_delete_ids)).delete(synchronize_session=False)
    db.commit()


def _advance_due_date(task: Task):
    """Compute the follow-up due_date for a completed recurring task, per its
    recurrence setting. Returns None if the completed task had no due_date.
    """
    if task.due_date is None:
        return None
    if task.recurrence == "daily":
        return task.due_date + timedelta(days=1)
    if task.recurrence == "weekly":
        return task.due_date + timedelta(days=7)
    if task.recurrence == "custom":
        days = task.recurrence_interval_days or 1
        return task.due_date + timedelta(days=days)
    return None


def _create_recurring_followup(db: Session, completed_task: Task) -> None:
    """Auto-create a fresh follow-up task when a recurring task is marked
    done. Copies the identifying fields (title/description/tags/subject/
    estimated_minutes/recurrence settings), resets progress/status, and
    advances due_date per the recurrence rule.
    """
    followup = Task(
        user_id=completed_task.user_id,
        title=completed_task.title,
        description=completed_task.description,
        tags=completed_task.tags,
        subject_id=completed_task.subject_id,
        due_date=_advance_due_date(completed_task),
        estimated_minutes=completed_task.estimated_minutes,
        status="active",
        progress_percent=0,
        recurrence=completed_task.recurrence,
        recurrence_interval_days=completed_task.recurrence_interval_days,
    )
    db.add(followup)
    db.commit()


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@router.get("", response_model=List[TaskOut])
def list_tasks(
    q: Optional[str] = None,
    tag: Optional[str] = None,
    status_: Optional[str] = Query(default=None, alias="status"),
    parent_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the current user's tasks.

    Query params (all optional):
    - q: substring match (case-insensitive) against title OR description.
    - tag: substring match (case-insensitive) within the comma-separated
      tags field.
    - status: filter to an exact status ("active"/"done"/"archived"). When
      omitted, "archived" tasks are excluded by default so they don't
      clutter normal views -- pass status=archived explicitly to see them.
    - parent_id: 0 returns only top-level tasks (parent_task_id IS NULL);
      any other positive id returns only the direct subtasks of that task;
      omitted (the default) returns tasks at every level, mixed together.
    """
    query = db.query(Task).filter(Task.user_id == current_user.id)

    if q:
        like = f"%{q}%"
        query = query.filter(or_(Task.title.ilike(like), Task.description.ilike(like)))
    if tag:
        query = query.filter(Task.tags.ilike(f"%{tag}%"))
    if status_ is not None:
        query = query.filter(Task.status == status_)
    else:
        query = query.filter(Task.status != "archived")
    if parent_id is not None:
        if parent_id == 0:
            query = query.filter(Task.parent_task_id.is_(None))
        else:
            query = query.filter(Task.parent_task_id == parent_id)

    tasks = query.order_by(Task.created_at.desc(), Task.id.desc()).all()
    return [_task_out(db, t) for t in tasks]


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.subject_id is not None:
        _get_owned_subject(db, current_user, payload.subject_id)
    if payload.parent_task_id is not None:
        _get_owned_task(db, current_user, payload.parent_task_id)

    task = Task(
        user_id=current_user.id,
        title=payload.title,
        description=payload.description,
        tags=payload.tags,
        subject_id=payload.subject_id,
        parent_task_id=payload.parent_task_id,
        due_date=payload.due_date,
        estimated_minutes=payload.estimated_minutes,
        actual_minutes=payload.actual_minutes,
        progress_percent=payload.progress_percent,
        status=payload.status,
        recurrence=payload.recurrence,
        recurrence_interval_days=payload.recurrence_interval_days,
        notes=payload.notes,
    )
    if task.status == "done":
        task.completed_at = utcnow()
    db.add(task)
    db.commit()
    db.refresh(task)
    return _task_out(db, task)


@router.get("/{task_id}", response_model=TaskDetailOut)
def get_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = _get_owned_task(db, current_user, task_id)
    subtasks = (
        db.query(Task)
        .filter(Task.parent_task_id == task.id)
        .order_by(Task.created_at.asc(), Task.id.asc())
        .all()
    )
    base = _task_out(db, task)
    return TaskDetailOut(
        **base.model_dump(),
        subtasks=[_task_out(db, st) for st in subtasks],
    )


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = _get_owned_task(db, current_user, task_id)
    data = payload.model_dump(exclude_unset=True)

    if "subject_id" in data and data["subject_id"] is not None:
        _get_owned_subject(db, current_user, data["subject_id"])
    if "parent_task_id" in data and data["parent_task_id"] is not None:
        if data["parent_task_id"] == task.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="a task cannot be its own parent",
            )
        _get_owned_task(db, current_user, data["parent_task_id"])

    was_done = task.status == "done"

    for field, value in data.items():
        setattr(task, field, value)

    now_done = task.status == "done"
    if now_done and not was_done:
        task.completed_at = utcnow()
    elif not now_done and was_done:
        task.completed_at = None

    db.commit()
    db.refresh(task)

    # Recurrence: only fires on the active->done transition, not when a task
    # is created already-done or PATCHed while already done.
    if now_done and not was_done and task.recurrence != "none":
        _create_recurring_followup(db, task)

    return _task_out(db, task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = _get_owned_task(db, current_user, task_id)
    _delete_task_cascade(db, task)
    return None


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------


@router.post(
    "/{task_id}/dependencies", response_model=TaskOut, status_code=status.HTTP_201_CREATED
)
def add_dependency(
    task_id: int,
    payload: TaskDependencyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = _get_owned_task(db, current_user, task_id)
    if payload.depends_on_task_id == task_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="a task cannot depend on itself",
        )
    _get_owned_task(db, current_user, payload.depends_on_task_id)  # ownership + existence

    existing = (
        db.query(TaskDependency)
        .filter(
            TaskDependency.task_id == task_id,
            TaskDependency.depends_on_task_id == payload.depends_on_task_id,
        )
        .first()
    )
    if existing is None:
        db.add(
            TaskDependency(
                task_id=task_id, depends_on_task_id=payload.depends_on_task_id
            )
        )
        db.commit()

    return _task_out(db, task)


@router.delete(
    "/{task_id}/dependencies/{depends_on_task_id}", status_code=status.HTTP_204_NO_CONTENT
)
def remove_dependency(
    task_id: int,
    depends_on_task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_owned_task(db, current_user, task_id)  # ownership check
    db.query(TaskDependency).filter(
        TaskDependency.task_id == task_id,
        TaskDependency.depends_on_task_id == depends_on_task_id,
    ).delete(synchronize_session=False)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# Smart rescheduling
# ---------------------------------------------------------------------------


@router.post("/{task_id}/reschedule-tomorrow", response_model=TaskOut)
def reschedule_tomorrow(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """"Skip today's task" -- moves due_date to the same time-of-day on the
    next calendar day. A no-op (task returned unchanged) if the task has no
    due_date, since there's nothing to reschedule.
    """
    task = _get_owned_task(db, current_user, task_id)
    if task.due_date is not None:
        task.due_date = task.due_date + timedelta(days=1)
        db.commit()
        db.refresh(task)
    return _task_out(db, task)
