"""Pydantic request/response schemas for SOBRAD."""
from datetime import date as date_type, datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


# ---- Auth ----

class UserCreate(BaseModel):
    username: str
    password: str
    # Optional at registration time -- registration must keep working fine
    # when these are omitted (existing/other callers, and users who skip
    # this step). Both are also accepted (and used) by /api/auth/login's
    # reuse of this same schema, where they're simply ignored.
    security_question: Optional[str] = None
    security_answer: Optional[str] = None

    @field_validator("username")
    @classmethod
    def username_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("username must not be empty")
        return v

    @field_validator("password")
    @classmethod
    def password_not_blank(cls, v: str) -> str:
        if not v:
            raise ValueError("password must not be empty")
        return v

    @field_validator("security_question", "security_answer")
    @classmethod
    def security_field_not_blank_if_given(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("must not be blank if provided")
        return v


class UserOut(BaseModel):
    id: int
    username: str
    # Full "data:image/jpeg;base64,..." URI, or None when no photo is set.
    # Built from User.profile_photo/profile_photo_content_type (see
    # routers/auth.py's _user_out helper and routers/profile.py) -- exposed
    # this way (rather than a separate binary-fetch endpoint) so an <img>
    # tag can render it directly without needing to send an Authorization
    # header.
    profile_photo_data_url: Optional[str] = None


class TokenResponse(BaseModel):
    token: str
    user: UserOut


# ---- Auth: password reset (security question) + change-password ----

class SecurityQuestionCheck(BaseModel):
    has_question: bool
    question: Optional[str] = None


class SecurityQuestionSet(BaseModel):
    security_question: str
    security_answer: str

    @field_validator("security_question", "security_answer")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must not be empty")
        return v


class PasswordReset(BaseModel):
    username: str
    security_answer: str
    new_password: str

    @field_validator("username", "security_answer", "new_password")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must not be empty")
        return v


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator("current_password", "new_password")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v:
            raise ValueError("must not be empty")
        return v


# ---- Journal ----

class JournalEntryCreate(BaseModel):
    text: str

    @field_validator("text")
    @classmethod
    def text_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("text must not be empty or whitespace-only")
        return v


class JournalEntryOut(BaseModel):
    id: int
    text: str
    created_at: datetime
    # Whether a photo is attached -- never the image bytes/a data URL here:
    # a journal list can contain many entries, so keep this response light.
    # The photo itself is fetched separately, only when actually viewed, via
    # GET /api/journal/{id}/photo.
    has_photo: bool = False


# ---- Mood ----

class MoodEntryCreate(BaseModel):
    word: str

    @field_validator("word")
    @classmethod
    def word_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("word must not be empty")
        return v


class MoodEntryOut(BaseModel):
    id: int
    word: str
    created_at: datetime


# ---- Breathing sessions ----

class BreathingSessionCreate(BaseModel):
    minutes: int = Field(ge=1)


class BreathingSessionOut(BaseModel):
    id: int
    minutes: int
    created_at: datetime


# ---- Stats ----

class StatsOut(BaseModel):
    grounding_minutes: int
    journal_entries: int
    mood_checkins: int
    goals_reached: int


# ---- Chat ----

class ChatMessageCreate(BaseModel):
    message: str
    # Which companion thread this message belongs to -- 'sobrad' or
    # 'friends'. Required: the frontend always knows exactly which
    # conversation it's operating on, so this is never inferred from the
    # user's stored persona default (see routers/chat.py).
    companion: str

    @field_validator("message")
    @classmethod
    def message_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("message must not be empty")
        return v


class ChatMessageOut(BaseModel):
    id: int
    sender: str
    text: str
    created_at: datetime


class ChatExchangeOut(BaseModel):
    user_message: ChatMessageOut
    reply: ChatMessageOut


class ChatClearOut(BaseModel):
    deleted: bool


# ---- Study: subjects ----

class SubjectCreate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("name must not be empty")
        return v.strip()


class SubjectOut(BaseModel):
    id: int
    name: str
    created_at: datetime


# ---- Study: grades ----

class GradeCreate(BaseModel):
    subject_name: str
    label: str
    score: float = Field(ge=0, le=100)
    date: datetime

    @field_validator("subject_name", "label")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must not be empty")
        return v.strip()


class GradeOut(BaseModel):
    id: int
    subject_id: int
    subject_name: Optional[str] = None
    label: str
    score: float
    date: datetime
    created_at: datetime


# ---- Study: goals + steps ----

class GoalStepCreate(BaseModel):
    title: str

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("title must not be empty")
        return v.strip()


class GoalStepUpdate(BaseModel):
    title: Optional[str] = None
    done: Optional[bool] = None


class GoalStepOut(BaseModel):
    id: int
    goal_id: int
    title: str
    done: bool
    order_index: int


class GoalCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: str = "other"
    target_date: Optional[datetime] = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("title must not be empty")
        return v.strip()

    @field_validator("category")
    @classmethod
    def category_valid(cls, v: str) -> str:
        allowed = {"graduation", "assignment", "exam", "other"}
        if v not in allowed:
            raise ValueError(f"category must be one of {sorted(allowed)}")
        return v


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    target_date: Optional[datetime] = None
    status: Optional[str] = None

    @field_validator("status")
    @classmethod
    def status_valid(cls, v):
        if v is not None and v not in {"active", "done"}:
            raise ValueError("status must be 'active' or 'done'")
        return v


class GoalOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    category: str
    target_date: Optional[datetime] = None
    status: str
    created_at: datetime
    steps: List[GoalStepOut] = []


# ---- Study: calendar events ----

class StudyEventCreate(BaseModel):
    title: str
    date: datetime
    event_type: str = "other"
    subject_id: Optional[int] = None
    note: Optional[str] = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("title must not be empty")
        return v.strip()

    @field_validator("event_type")
    @classmethod
    def event_type_valid(cls, v: str) -> str:
        allowed = {"assignment", "exam", "study", "reminder", "other"}
        if v not in allowed:
            raise ValueError(f"event_type must be one of {sorted(allowed)}")
        return v


class StudyEventUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[datetime] = None
    event_type: Optional[str] = None
    subject_id: Optional[int] = None
    note: Optional[str] = None
    done: Optional[bool] = None


class StudyEventOut(BaseModel):
    id: int
    title: str
    date: datetime
    event_type: str
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    note: Optional[str] = None
    done: bool


# ---- Study: analysis ----

class SubjectAverage(BaseModel):
    subject_id: int
    subject_name: str
    average: float
    entry_count: int
    needs_focus: bool
    trend: str  # "improving" | "steady" | "declining" | "not_enough_data" -- same vocabulary as StudyInsightsOut.trend below, computed per-subject
    tip: Optional[str] = None


class StudyAnalysisOut(BaseModel):
    subjects: List[SubjectAverage] = []
    summary: str


# ---- Study: AI-assisted insights + trend graph ----
# See routers/study.py get_insights() -- same subject-average computation as
# StudyAnalysisOut above, plus a chronological point series for charting and
# a short narrated trend summary (AI-generated when ANTHROPIC_API_KEY is
# configured, deterministic otherwise -- see chat.py for the same pattern).

class StudyInsightPoint(BaseModel):
    date: datetime
    score: float
    subject_name: str


class StudyInsightsOut(BaseModel):
    series: List[StudyInsightPoint] = []
    subjects: List[SubjectAverage] = []
    overall_summary: str
    trend: str  # "improving" | "steady" | "declining" | "not_enough_data"
    generated_by: str  # "ai" | "deterministic"


# ---- Study: settings (configurable passing/caution threshold) ----

class StudySettingsOut(BaseModel):
    passing_threshold: float


class StudySettingsUpdate(BaseModel):
    passing_threshold: float = Field(ge=0, le=100)


# ---- Study: day notes (freeform notes on the calendar, one per date) ----

class DayNoteUpdate(BaseModel):
    text: str = ""


class DayNoteOut(BaseModel):
    date: date_type
    text: str = ""
    updated_at: Optional[datetime] = None


# ---- Tasks ----

TASK_STATUSES = {"active", "done", "archived"}
TASK_RECURRENCES = {"none", "daily", "weekly", "custom"}


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    tags: Optional[str] = None  # comma-separated, e.g. "School,Personal"
    subject_id: Optional[int] = None
    parent_task_id: Optional[int] = None
    due_date: Optional[datetime] = None
    estimated_minutes: Optional[int] = Field(default=None, ge=0)
    actual_minutes: Optional[int] = Field(default=None, ge=0)
    progress_percent: int = Field(default=0, ge=0, le=100)
    status: str = "active"
    recurrence: str = "none"
    recurrence_interval_days: Optional[int] = Field(default=None, ge=1)
    notes: Optional[str] = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("title must not be empty")
        return v.strip()

    @field_validator("status")
    @classmethod
    def status_valid(cls, v: str) -> str:
        if v not in TASK_STATUSES:
            raise ValueError(f"status must be one of {sorted(TASK_STATUSES)}")
        return v

    @field_validator("recurrence")
    @classmethod
    def recurrence_valid(cls, v: str) -> str:
        if v not in TASK_RECURRENCES:
            raise ValueError(f"recurrence must be one of {sorted(TASK_RECURRENCES)}")
        return v


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[str] = None
    subject_id: Optional[int] = None
    parent_task_id: Optional[int] = None
    due_date: Optional[datetime] = None
    estimated_minutes: Optional[int] = Field(default=None, ge=0)
    actual_minutes: Optional[int] = Field(default=None, ge=0)
    progress_percent: Optional[int] = Field(default=None, ge=0, le=100)
    status: Optional[str] = None
    recurrence: Optional[str] = None
    recurrence_interval_days: Optional[int] = Field(default=None, ge=1)
    notes: Optional[str] = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("title must not be empty")
        return v.strip() if v is not None else v

    @field_validator("status")
    @classmethod
    def status_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in TASK_STATUSES:
            raise ValueError(f"status must be one of {sorted(TASK_STATUSES)}")
        return v

    @field_validator("recurrence")
    @classmethod
    def recurrence_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in TASK_RECURRENCES:
            raise ValueError(f"recurrence must be one of {sorted(TASK_RECURRENCES)}")
        return v


class TaskOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    tags: Optional[str] = None
    subject_id: Optional[int] = None
    parent_task_id: Optional[int] = None
    due_date: Optional[datetime] = None
    estimated_minutes: Optional[int] = None
    actual_minutes: Optional[int] = None
    progress_percent: int
    status: str
    recurrence: str
    recurrence_interval_days: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    depends_on: List[int] = []


class TaskDetailOut(TaskOut):
    """Response for GET /api/tasks/{id}: TaskOut plus one level of direct
    subtasks (each a full TaskOut, including its own depends_on)."""

    subtasks: List[TaskOut] = []


class TaskDependencyCreate(BaseModel):
    depends_on_task_id: int


# ---- Focus sessions ----

FOCUS_MODES = {"pomodoro_25_5", "pomodoro_50_10", "custom"}


class FocusSessionStart(BaseModel):
    mode: str
    planned_minutes: int = Field(ge=1)
    task_id: Optional[int] = None

    @field_validator("mode")
    @classmethod
    def mode_valid(cls, v: str) -> str:
        if v not in FOCUS_MODES:
            raise ValueError(f"mode must be one of {sorted(FOCUS_MODES)}")
        return v


class FocusSessionComplete(BaseModel):
    completed: bool


class FocusSessionOut(BaseModel):
    id: int
    task_id: Optional[int] = None
    mode: str
    planned_minutes: int
    started_at: datetime
    ended_at: Optional[datetime] = None
    completed: bool
    interrupted: bool


# ---- AI Weekly Review ----
# See routers/review.py for the full endpoint docstring and rationale.
# Client's request, verbatim: "AI Weekly Review. Every Sunday: This Week --
# Total study time, Best focus day, Biggest distraction, Mood trend,
# Recommended improvement." There's no background job scheduler in this app
# (see review.py), so this is served as an always-available "last 7 days"
# view computed live on request rather than pushed every Sunday.


class WeeklyReviewOut(BaseModel):
    window_start: date_type
    window_end: date_type

    # Total minutes across completed focus sessions in the window (see
    # review.py for exactly what counts as "completed" and how minutes are
    # summed).
    total_study_minutes: int

    # "Best focus day" -- the single calendar date (within the window) with
    # the most completed focus minutes. Both null when every day in the
    # window has zero focus minutes (no arbitrary day is ever picked).
    best_focus_day: Optional[date_type] = None
    best_focus_day_minutes: int = 0

    # "Biggest distraction" proxy -- see review.py's big comment for why this
    # is a count of sessions stopped early rather than a real reason/cause
    # (nothing in this app tracks *why* a session was interrupted).
    interrupted_session_count: int

    # "improving" | "steady" | "declining" | "not_enough_data"
    mood_trend: str
    # Precomputed numeric detail behind mood_trend, for the frontend to show
    # alongside the word if it wants to (both None when not enough data).
    mood_earlier_avg: Optional[float] = None
    mood_later_avg: Optional[float] = None

    # Warm, encouraging 2-4 sentence paragraph built from the numbers above
    # -- AI-narrated when ANTHROPIC_API_KEY is configured, deterministic
    # fallback sentence otherwise. Never empty.
    recommended_improvement: str
    generated_by: str  # "ai" | "deterministic"


# ---- Accessibility / sensory settings ----

class AccessibilitySettingsOut(BaseModel):
    reduce_animations: bool
    low_stimulation_mode: bool
    high_contrast: bool
    sound_enabled: bool
    screen_break_reminders_enabled: bool
    # Which companion persona ('sobrad' or 'friends') is shown throughout
    # the chat UI -- see routers/settings.py for validation.
    companion: str


class AccessibilitySettingsUpdate(BaseModel):
    reduce_animations: Optional[bool] = None
    low_stimulation_mode: Optional[bool] = None
    high_contrast: Optional[bool] = None
    sound_enabled: Optional[bool] = None
    screen_break_reminders_enabled: Optional[bool] = None
    companion: Optional[str] = None


# ---- AI Study Tools ----
# See routers/ai_tools.py for the full rationale. Every response below
# carries `available: bool` so the frontend can tell "here's real AI output"
# apart from "no ANTHROPIC_API_KEY configured / the AI call or its JSON
# parsing failed" cleanly and uniformly across all seven tools -- unlike
# chat.py's canned-reply fallback, there's no honest deterministic
# substitute for a quiz or a set of flashcards, so when `available` is
# False every other field is simply absent/empty rather than faked.

class AIExplainRequest(BaseModel):
    topic_or_text: str

    @field_validator("topic_or_text")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("topic_or_text must not be empty")
        return v.strip()


class AIExplainResponse(BaseModel):
    available: bool
    explanation: Optional[str] = None


class AIQuizRequest(BaseModel):
    topic_or_text: str
    num_questions: Optional[int] = Field(default=5, ge=1, le=15)

    @field_validator("topic_or_text")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("topic_or_text must not be empty")
        return v.strip()


class AIQuizQuestion(BaseModel):
    question: str
    choices: Optional[List[str]] = None
    answer: str


class AIQuizResponse(BaseModel):
    available: bool
    questions: List[AIQuizQuestion] = []


class AIFlashcardsRequest(BaseModel):
    topic_or_text: str
    num_cards: Optional[int] = Field(default=8, ge=1, le=20)

    @field_validator("topic_or_text")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("topic_or_text must not be empty")
        return v.strip()


class AIFlashcard(BaseModel):
    front: str
    back: str


class AIFlashcardsResponse(BaseModel):
    available: bool
    cards: List[AIFlashcard] = []


class AISummarizeRequest(BaseModel):
    text: str

    @field_validator("text")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("text must not be empty")
        return v.strip()


class AISummarizeResponse(BaseModel):
    available: bool
    summary: Optional[str] = None


class AIStudyPlanRequest(BaseModel):
    goal: str
    timeframe: Optional[str] = None
    subjects: Optional[List[str]] = None

    @field_validator("goal")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("goal must not be empty")
        return v.strip()


class AIStudyPlanResponse(BaseModel):
    available: bool
    plan: Optional[str] = None


class AIExplainMistakeRequest(BaseModel):
    question: str
    wrong_answer: str
    correct_answer: Optional[str] = None

    @field_validator("question", "wrong_answer")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must not be empty")
        return v.strip()


class AIExplainMistakeResponse(BaseModel):
    available: bool
    explanation: Optional[str] = None


class AIStudyTechniqueRequest(BaseModel):
    subject: Optional[str] = None
    challenge: Optional[str] = None


class AIStudyTechniqueResponse(BaseModel):
    available: bool
    techniques: List[str] = []
