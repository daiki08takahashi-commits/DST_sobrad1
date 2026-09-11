"""Pydantic request/response schemas for SOBRAD."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


# ---- Auth ----

class UserCreate(BaseModel):
    username: str
    password: str

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


class UserOut(BaseModel):
    id: int
    username: str


class TokenResponse(BaseModel):
    token: str
    user: UserOut


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
    tip: Optional[str] = None


class StudyAnalysisOut(BaseModel):
    subjects: List[SubjectAverage] = []
    summary: str


# ---- Study: settings (configurable passing/caution threshold) ----

class StudySettingsOut(BaseModel):
    passing_threshold: float


class StudySettingsUpdate(BaseModel):
    passing_threshold: float = Field(ge=0, le=100)
