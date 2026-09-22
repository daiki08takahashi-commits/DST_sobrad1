"""SQLAlchemy ORM models for SOBRAD."""
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    # Optional login identifier, in addition to username -- see routers/
    # auth.py's login() docstring and PATCH /api/auth/email. Nullable: most
    # existing/pre-migration users have none set. Uniqueness is enforced by
    # a partial-ish unique index (ix_users_email_unique, created in main.py's
    # migration block) rather than unique=True here, since SQLite unique
    # indexes already treat NULL as distinct from NULL -- any number of users
    # can have no email set while two users still can't share one.
    email = Column(String, nullable=True)
    goals_reached = Column(Integer, default=0, nullable=False)
    # What counts as a "low" grade for this user -- passing marks differ
    # school to school, so this is user-configurable rather than a fixed
    # constant. Drives both the per-grade "Caution" label and the aggregate
    # /api/study/analysis "needs focus" flag on the Study screen.
    passing_threshold = Column(Float, default=70.0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Password reset via security question (no email is collected by this
    # app, so a link-based reset isn't possible). Both nullable: a user who
    # never sets a question simply has no reset path available -- see
    # GET /api/auth/security-question, which reports that gracefully rather
    # than erroring. The answer is hashed with the exact same scheme as
    # password_hash (see app.auth.hash_password) after being normalized
    # (stripped + lowercased) so trivial casing/whitespace differences don't
    # break a legitimate reset attempt.
    security_question = Column(String, nullable=True)
    security_answer_hash = Column(String, nullable=True)

    # Accessibility / sensory settings -- see routers/settings.py. Kept on
    # User directly (like passing_threshold above) rather than a separate
    # table since it's a small, fixed set of per-user flags.
    reduce_animations = Column(Boolean, default=False, nullable=False)
    low_stimulation_mode = Column(Boolean, default=False, nullable=False)
    high_contrast = Column(Boolean, default=False, nullable=False)
    sound_enabled = Column(Boolean, default=True, nullable=False)
    screen_break_reminders_enabled = Column(Boolean, default=True, nullable=False)

    # Which companion persona (avatar + display name + greeting) is shown
    # throughout the chat UI -- 'sobrad' (default, the original prototype
    # behavior) or 'friends' (the male-presenting, more casual alternative).
    # Presentation only -- does not affect the AI reply/system prompt in
    # routers/chat.py. See routers/settings.py for the validated values.
    companion = Column(String, default="sobrad", nullable=False)

    # Profile photo -- stored as raw bytes directly in the SQLite database
    # (not a file on disk: this app's deployment environment has no
    # persistent-disk guarantee, so the DB is the only persistence-consistent
    # place for it, same as every other piece of user data). Exposed to the
    # frontend as a data: URI string (see schemas.UserOut.profile_photo_data_url
    # and routers/auth.py's _user_out helper) rather than a separate
    # binary-fetch endpoint, so an <img> tag doesn't need to send an
    # Authorization header. Both nullable: no photo set is the default state.
    profile_photo = Column(LargeBinary, nullable=True)
    profile_photo_content_type = Column(String, nullable=True)

    journal_entries = relationship(
        "JournalEntry", back_populates="user", cascade="all, delete-orphan"
    )
    breathing_sessions = relationship(
        "BreathingSession", back_populates="user", cascade="all, delete-orphan"
    )
    chat_messages = relationship(
        "ChatMessage", back_populates="user", cascade="all, delete-orphan"
    )
    subjects = relationship(
        "Subject", back_populates="user", cascade="all, delete-orphan"
    )
    grades = relationship(
        "Grade", back_populates="user", cascade="all, delete-orphan"
    )
    goals = relationship(
        "Goal", back_populates="user", cascade="all, delete-orphan"
    )
    study_events = relationship(
        "StudyEvent", back_populates="user", cascade="all, delete-orphan"
    )
    day_notes = relationship(
        "DayNote", back_populates="user", cascade="all, delete-orphan"
    )
    tasks = relationship(
        "Task", back_populates="user", cascade="all, delete-orphan"
    )
    focus_sessions = relationship(
        "FocusSession", back_populates="user", cascade="all, delete-orphan"
    )
    companions = relationship(
        "Companion", back_populates="user", cascade="all, delete-orphan"
    )


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    text = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Optional attached photo -- stored as raw bytes directly in the SQLite
    # database (not a file on disk: this app's deployment environment has no
    # persistent-disk guarantee, so the DB is the only persistence-consistent
    # place for it, same as every other piece of user data). Unlike
    # User.profile_photo above, this is exposed via a dedicated
    # GET /api/journal/{id}/photo endpoint (not inlined as a data: URI on the
    # entry itself) since a journal list can contain many entries and each
    # entry's photo can be up to 5MB -- inlining would make every list
    # response heavy even when no photo is being viewed. Both nullable: no
    # photo attached is the default state.
    photo = Column(LargeBinary, nullable=True)
    photo_content_type = Column(String, nullable=True)

    # Optional attached general file (PDF, Word, Excel, PowerPoint, plain
    # text, CSV) -- separate and additional to the photo attachment above,
    # not a replacement for it: an entry may have a photo, a file, both, or
    # neither. Same "raw bytes in the DB" rationale as photo (no persistent
    # disk), and same "dedicated fetch endpoint, not inlined" rationale (see
    # GET /api/journal/{id}/file). file_name additionally stores the original
    # uploaded filename (e.g. "resignation_letter.pdf") -- photo doesn't need
    # this since it's always displayed inline as an image, but a general file
    # needs to download/display under something more meaningful than a
    # generic name. All three nullable: no file attached is the default
    # state.
    file = Column(LargeBinary, nullable=True)
    file_content_type = Column(String, nullable=True)
    file_name = Column(String, nullable=True)

    user = relationship("User", back_populates="journal_entries")


class BreathingSession(Base):
    __tablename__ = "breathing_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    minutes = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="breathing_sessions")


class Companion(Base):
    """A chat "friend" thread -- either one of the two auto-seeded built-in
    personas (Sõbrad, Friends) or one the user added themselves via "Add a
    friend". See routers/companions.py for the full feature rationale and
    routers/chat.py's _build_system_prompt for how personality_prompt is (and
    is not) layered into the AI system prompt."""

    __tablename__ = "companions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # Identifies this companion's chat thread -- matches ChatMessage.companion
    # (see chat.py). 'sobrad' and 'friends' for the two built-in personas
    # (auto-seeded per user, see companions.py's _ensure_default_companions),
    # an opaque token (secrets.token_urlsafe) for anything the user adds
    # themselves via "Add a friend". Unique per user, not globally.
    key = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    # Free-text tone/personality description the user can set for a companion
    # THEY added -- never set/editable for is_default=True rows, see
    # companions.py's PATCH endpoint. Layered into the AI system prompt as
    # supplementary style guidance only -- see chat.py's _build_system_prompt
    # for the hard safety rule about what this can and can't change.
    personality_prompt = Column(String, nullable=True)
    avatar = Column(LargeBinary, nullable=True)
    avatar_content_type = Column(String, nullable=True)
    hidden = Column(Boolean, nullable=False, default=False)
    # True only for the two auto-seeded built-in personas -- protects their
    # name/personality from being changed (hidden still works on them).
    is_default = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="companions")

    __table_args__ = (
        UniqueConstraint("user_id", "key", name="uq_companions_user_key"),
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    sender = Column(String, nullable=False)  # 'user' or 'sobrad'
    text = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    # Which companion thread this message belongs to -- 'sobrad' or
    # 'friends'. Each companion is now its own independent conversation
    # (separate history), not just a display re-skin of one shared thread --
    # see routers/chat.py. Existing pre-migration rows default to 'sobrad',
    # since that was this app's only/original persona historically.
    companion = Column(String, nullable=False, default="sobrad")

    user = relationship("User", back_populates="chat_messages")


# ---------------------------------------------------------------------------
# Study support: calendar/schedule, goals with steps, subjects + grades and
# the weak-point analysis derived from them.
# ---------------------------------------------------------------------------


class Subject(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="subjects")
    grades = relationship(
        "Grade", back_populates="subject", cascade="all, delete-orphan"
    )
    events = relationship(
        "StudyEvent", back_populates="subject", cascade="all, delete-orphan"
    )


class Grade(Base):
    __tablename__ = "grades"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False, index=True)
    label = Column(String, nullable=False)
    score = Column(Float, nullable=False)
    date = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="grades")
    subject = relationship("Subject", back_populates="grades")


class Goal(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    category = Column(String, nullable=False, default="other")  # graduation/assignment/exam/other
    target_date = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, nullable=False, default="active")  # active/done
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="goals")
    steps = relationship(
        "GoalStep",
        back_populates="goal",
        cascade="all, delete-orphan",
        order_by="GoalStep.order_index",
    )


class GoalStep(Base):
    __tablename__ = "goal_steps"

    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    done = Column(Boolean, default=False, nullable=False)
    order_index = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    goal = relationship("Goal", back_populates="steps")


class StudyEvent(Base):
    __tablename__ = "study_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    date = Column(DateTime(timezone=True), nullable=False)
    event_type = Column(String, nullable=False, default="other")  # assignment/exam/study/reminder/other
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=True, index=True)
    note = Column(String, nullable=True)
    done = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="study_events")
    subject = relationship("Subject", back_populates="events")


class DayNote(Base):
    """Freeform notes on the calendar, separate from the structured
    StudyEvent list -- one note per user per calendar date (upserted from
    the frontend, never explicitly created/deleted as its own resource)."""

    __tablename__ = "day_notes"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_day_notes_user_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    text = Column(String, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    user = relationship("User", back_populates="day_notes")


# ---------------------------------------------------------------------------
# Tasks: to-do items with optional subject link, subtasks (self-referential
# parent_task_id), cross-task dependencies, due dates, time tracking and
# simple recurrence. See routers/tasks.py.
# ---------------------------------------------------------------------------


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    # Simple comma-separated string (e.g. "School,Personal") -- no separate
    # Tag table, per the feature scope.
    tags = Column(String, nullable=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=True, index=True)
    # Self-referential: a task with a parent is a subtask of it. No ORM
    # relationship is declared for this (subtasks/parent lookups are plain
    # queries in routers/tasks.py) to keep delete/cascade behavior explicit
    # and easy to follow rather than relying on adjacency-list relationship
    # cascade config.
    parent_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True, index=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    estimated_minutes = Column(Integer, nullable=True)
    # Accumulated actual time spent, in minutes. Populated by completing a
    # linked FocusSession (see routers/focus.py) and/or manual PATCHes;
    # never overwritten wholesale by the focus-session flow, only added to.
    actual_minutes = Column(Integer, nullable=True)
    progress_percent = Column(Integer, default=0, nullable=False)  # 0-100
    status = Column(String, default="active", nullable=False)  # active/done/archived
    recurrence = Column(String, default="none", nullable=False)  # none/daily/weekly/custom
    recurrence_interval_days = Column(Integer, nullable=True)  # used when recurrence="custom"
    notes = Column(String, nullable=True)  # freeform text notes -- no file storage in this app
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )
    completed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="tasks")
    subject = relationship("Subject")


class TaskDependency(Base):
    """Join table: `task_id` is blocked by `depends_on_task_id`."""

    __tablename__ = "task_dependencies"
    __table_args__ = (
        UniqueConstraint(
            "task_id", "depends_on_task_id", name="uq_task_dependencies_pair"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    depends_on_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)


# ---------------------------------------------------------------------------
# Focus sessions: Pomodoro-style timer runs, optionally linked to a Task.
# See routers/focus.py.
# ---------------------------------------------------------------------------


class FocusSession(Base):
    __tablename__ = "focus_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True, index=True)
    mode = Column(String, nullable=False)  # pomodoro_25_5/pomodoro_50_10/custom
    planned_minutes = Column(Integer, nullable=False)
    started_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    completed = Column(Boolean, default=False, nullable=False)
    interrupted = Column(Boolean, default=False, nullable=False)

    user = relationship("User", back_populates="focus_sessions")


# ---------------------------------------------------------------------------
# Family sharing: a parent-child link, established via an emailed invite
# token, that lets a linked parent view a READ-ONLY copy of the child's
# Study data (subject averages/trends + the AI-narrated insights summary +
# the raw trend series -- see routers/family.py). Deliberately does NOT gate
# anything else -- journal, chat, focus, emergency and progress stay
# completely private and are never exposed through this feature.
# ---------------------------------------------------------------------------


class FamilyLink(Base):
    __tablename__ = "family_links"

    id = Column(Integer, primary_key=True, index=True)
    child_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # Set once accepted; null while the invite is still pending.
    parent_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    parent_email = Column(String, nullable=False)
    invite_token = Column(String, nullable=False, unique=True, index=True)
    status = Column(String, nullable=False, default="pending")  # 'pending' | 'accepted' | 'revoked'
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
