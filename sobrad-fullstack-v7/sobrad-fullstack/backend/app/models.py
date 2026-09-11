"""SQLAlchemy ORM models for SOBRAD."""
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    goals_reached = Column(Integer, default=0, nullable=False)
    # What counts as a "low" grade for this user -- passing marks differ
    # school to school, so this is user-configurable rather than a fixed
    # constant. Drives both the per-grade "Caution" label and the aggregate
    # /api/study/analysis "needs focus" flag on the Study screen.
    passing_threshold = Column(Float, default=70.0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    journal_entries = relationship(
        "JournalEntry", back_populates="user", cascade="all, delete-orphan"
    )
    mood_entries = relationship(
        "MoodEntry", back_populates="user", cascade="all, delete-orphan"
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


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    text = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="journal_entries")


class MoodEntry(Base):
    __tablename__ = "mood_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    word = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="mood_entries")


class BreathingSession(Base):
    __tablename__ = "breathing_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    minutes = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    user = relationship("User", back_populates="breathing_sessions")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    sender = Column(String, nullable=False)  # 'user' or 'sobrad'
    text = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

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
