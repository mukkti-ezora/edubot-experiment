"""Learning service data: what students study, how far they are, and their learning trail.

Every row is institution-owned (tenancy is a primitive): `institution_id` on all tables.
People and class sections are referenced by value (they live in the users service).
"""

import uuid
from datetime import UTC, date, datetime, time
from enum import StrEnum

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    Time,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from services.shared.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    section_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)  # users.class_sections.id
    code: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text, default="")
    term: Mapped[str] = mapped_column(String(60))
    subject: Mapped[str] = mapped_column(String(40))  # drives the course accent icon
    credits: Mapped[int] = mapped_column(Integer, default=4)
    category: Mapped[str] = mapped_column(String(40), default="Core")  # programme requirement it counts toward


class Module(Base):
    __tablename__ = "modules"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text, default="")


class Topic(Base):
    """A concept within a course. Lessons are tagged with one topic; doubts and the topic page hang off it."""

    __tablename__ = "topics"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text, default="")


class Lesson(Base):
    """One lesson, studied three ways: Read (body), Watch (curated video), Animate (interactive)."""

    __tablename__ = "lessons"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    module_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("modules.id", ondelete="CASCADE"), index=True)
    topic_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("topics.id", ondelete="SET NULL"),
                                                        index=True)
    position: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text, default="")
    minutes: Mapped[int] = mapped_column(Integer, default=10)
    body: Mapped[str] = mapped_column(Text)  # Markdown subset: paragraphs, ## headings, lists, `code`, fenced code
    video: Mapped[dict | None] = mapped_column(JSON)  # {url, title, source, durationSeconds}
    animation: Mapped[dict | None] = mapped_column(JSON)  # {kind, params, caption, alt}


class LessonProgress(Base):
    __tablename__ = "lesson_progress"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    lesson_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("lessons.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(16), default="started")  # started | completed
    last_format: Mapped[str] = mapped_column(String(16), default="read")  # read | watch | animate
    last_opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (UniqueConstraint("person_id", "lesson_id", name="uq_progress_person_lesson"),)


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(16))  # assignment | quiz | lab
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    points: Mapped[int] = mapped_column(Integer, default=10)
    instructions: Mapped[str] = mapped_column(Text, default="")  # Markdown subset
    submission_types: Mapped[list] = mapped_column(JSON, default=lambda: ["text", "file", "link"])
    rubric: Mapped[list] = mapped_column(JSON, default=list)  # [{criterion, description, points}]
    grade_category: Mapped[str] = mapped_column(String(40), default="Assignments")
    late_penalty_percent_per_day: Mapped[int] = mapped_column(Integer, default=10)
    accepts_late_days: Mapped[int] = mapped_column(Integer, default=3)  # after this, submissions close
    max_resubmissions: Mapped[int] = mapped_column(Integer, default=2)


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    assignment_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("assignments.id", ondelete="CASCADE"))
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    status: Mapped[str] = mapped_column(String(16))  # draft | submitted | graded
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=utcnow)
    score: Mapped[float | None] = mapped_column(Float)  # after any late penalty; rubric scaling gives fractions
    text: Mapped[str] = mapped_column(Text, default="")
    link: Mapped[str | None] = mapped_column(String(500))
    attachment_ids: Mapped[list] = mapped_column(JSON, default=list)
    revision: Mapped[int] = mapped_column(Integer, default=0)  # times submitted
    late_minutes: Mapped[int] = mapped_column(Integer, default=0)
    feedback: Mapped[str | None] = mapped_column(Text)
    rubric_scores: Mapped[list] = mapped_column(JSON, default=list)  # [{criterion, points}]
    graded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    graded_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    feedback_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (UniqueConstraint("assignment_id", "person_id", name="uq_submission_person"),)


class LearningEvent(Base):
    """The learning trail: what a student studied and asked, per sign-in session. Rotated after 60 days."""

    __tablename__ = "learning_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    session_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    # lesson_opened | format_viewed | lesson_completed | tutor_question | tutor_answer | tutor_flagged
    kind: Mapped[str] = mapped_column(String(32), index=True)
    course_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    lesson_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    detail: Mapped[dict | None] = mapped_column(JSON)

    __table_args__ = (Index("ix_learning_events_person_time", "person_id", "occurred_at"),)


class TutorMessage(Base):
    """One turn of a tutor conversation. Visible to the student's teachers; rotated after 60 days."""

    __tablename__ = "tutor_messages"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    session_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    lesson_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    role: Mapped[str] = mapped_column(String(16))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(String(16))
    model: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class InstitutionTutorSetting(Base):
    """Which AI provider an institution's tutor uses (anthropic | openai)."""

    __tablename__ = "institution_tutor_settings"

    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    provider: Mapped[str] = mapped_column(String(16))
    model: Mapped[str | None] = mapped_column(String(64))


class DoubtStatus(StrEnum):
    OPEN = "open"  # waiting for a teacher
    ANSWERED = "answered"  # a teacher replied; the student can follow up or resolve
    RESOLVED = "resolved"  # the student is satisfied


class Doubt(Base):
    """A student's question to the teacher of a class, anchored to a course and usually a lesson and topic."""

    __tablename__ = "doubts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    section_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)  # routes the doubt to that class's teachers
    course_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    topic_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("topics.id", ondelete="SET NULL"))
    lesson_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("lessons.id", ondelete="SET NULL"))
    student_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    session_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)  # the tutor chat it escalated from
    video_seconds: Mapped[int | None] = mapped_column(Integer)  # the video moment it is about
    title: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(16), default=DoubtStatus.OPEN, index=True)
    reply_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    first_answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DoubtMessage(Base):
    __tablename__ = "doubt_messages"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    doubt_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("doubts.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    author_role: Mapped[str] = mapped_column(String(16))  # student | teacher
    author_name: Mapped[str | None] = mapped_column(String(200))  # teachers, as shown to the student
    attachment_ids: Mapped[list] = mapped_column(JSON, default=list)  # photos of working, screenshots
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ---- files ----

class Attachment(Base):
    """An uploaded file (photo of working, submission, certificate). Stored in the database for now (OD-12)."""

    __tablename__ = "attachments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    filename: Mapped[str] = mapped_column(String(200))
    content_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class StudentPreference(Base):
    __tablename__ = "student_preferences"

    person_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    tutor_language: Mapped[str] = mapped_column(String(16), default="en")  # en | hinglish | hi | ...
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ---- practice: questions, tests, attempts, review deck ----

class Question(Base):
    """One question in a course's bank. Teacher-written, from a past paper, or AI-generated for one student."""

    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    topic_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("topics.id", ondelete="SET NULL"),
                                                        index=True)
    kind: Mapped[str] = mapped_column(String(16))  # single | multiple | numeric | true_false
    stem: Mapped[str] = mapped_column(Text)  # Markdown subset
    options: Mapped[list] = mapped_column(JSON, default=list)  # [{id, text}]
    answer: Mapped[dict] = mapped_column(JSON)  # {"options": [ids]} or {"value": n, "tolerance": t}
    explanation: Mapped[str] = mapped_column(Text, default="")
    difficulty: Mapped[int] = mapped_column(Integer, default=2)  # 1 easy, 2 medium, 3 hard
    source: Mapped[str] = mapped_column(String(16), default="teacher")  # teacher | pyq | ai
    source_label: Mapped[str | None] = mapped_column(String(120))  # e.g. "University exam, May 2024"
    owner_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)  # set for a student's AI questions
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Assessment(Base):
    """A quiz, mock test, past paper or practice set. Practice sets with an owner are private to that student."""

    __tablename__ = "assessments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(16))  # quiz | mock | past_paper | practice | exam_check
    instructions: Mapped[str] = mapped_column(Text, default="")
    duration_minutes: Mapped[int | None] = mapped_column(Integer)  # None = untimed
    opens_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    max_attempts: Mapped[int | None] = mapped_column(Integer)  # None = unlimited
    marks_correct: Mapped[float] = mapped_column(Float, default=1.0)
    marks_wrong: Mapped[float] = mapped_column(Float, default=0.0)  # negative marking, e.g. -1.0
    counts_toward_grade: Mapped[bool] = mapped_column(Boolean, default=False)
    grade_category: Mapped[str] = mapped_column(String(40), default="Quizzes")
    tutor_allowed: Mapped[bool] = mapped_column(Boolean, default=True)  # False locks the tutor while attempting
    owner_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)  # personal practice sets
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AssessmentItem(Base):
    __tablename__ = "assessment_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    assessment_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("assessments.id", ondelete="CASCADE"),
                                                     index=True)
    question_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("questions.id", ondelete="CASCADE"))
    section: Mapped[str] = mapped_column(String(80), default="")  # e.g. "Physics" in a mock test
    position: Mapped[int] = mapped_column(Integer)


class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    assessment_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("assessments.id", ondelete="CASCADE"),
                                                     index=True)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    number: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(16), default="in_progress")  # in_progress | submitted
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    score: Mapped[float | None] = mapped_column(Float)
    max_score: Mapped[float | None] = mapped_column(Float)
    correct: Mapped[int] = mapped_column(Integer, default=0)
    wrong: Mapped[int] = mapped_column(Integer, default=0)
    skipped: Mapped[int] = mapped_column(Integer, default=0)

    # A double click or two tabs can't open two "attempt 1"s and slip past max_attempts.
    __table_args__ = (UniqueConstraint("assessment_id", "person_id", "number", name="uq_attempt_number"),)


class AttemptAnswer(Base):
    __tablename__ = "attempt_answers"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    attempt_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("attempts.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("questions.id", ondelete="CASCADE"))
    response: Mapped[dict | None] = mapped_column(JSON)  # {"options": [...]} or {"value": n}; None = skipped
    marked_for_review: Mapped[bool] = mapped_column(Boolean, default=False)
    time_seconds: Mapped[int] = mapped_column(Integer, default=0)
    changes: Mapped[int] = mapped_column(Integer, default=0)  # answer changes, for behaviour insights
    is_correct: Mapped[bool | None] = mapped_column(Boolean)
    marks: Mapped[float] = mapped_column(Float, default=0.0)

    __table_args__ = (UniqueConstraint("attempt_id", "question_id", name="uq_answer_question"),)


class Flashcard(Base):
    __tablename__ = "flashcards"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    topic_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("topics.id", ondelete="SET NULL"))
    lesson_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("lessons.id", ondelete="SET NULL"))
    front: Mapped[str] = mapped_column(Text)
    back: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(16), default="teacher")  # teacher | ai
    owner_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, index=True)  # set for a student's AI cards


class CardReview(Base):
    """Spaced-repetition state of one card for one student."""

    __tablename__ = "card_reviews"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    card_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("flashcards.id", ondelete="CASCADE"))
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    interval_days: Mapped[float] = mapped_column(Float, default=0.0)
    ease: Mapped[float] = mapped_column(Float, default=2.5)
    reps: Mapped[int] = mapped_column(Integer, default=0)
    lapses: Mapped[int] = mapped_column(Integer, default=0)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (UniqueConstraint("person_id", "card_id", name="uq_review_card"),)


# ---- coursework requests ----

class ExtensionRequest(Base):
    __tablename__ = "extension_requests"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    assignment_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("assignments.id", ondelete="CASCADE"),
                                                     index=True)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    requested_until: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending | approved | declined
    auto_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ---- progress: results, programme, credits ----

class CourseResult(Base):
    """A finalised course outcome on the student's record (earlier terms, transfers, MOOCs)."""

    __tablename__ = "course_results"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    term: Mapped[str] = mapped_column(String(60))
    code: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    credits: Mapped[int] = mapped_column(Integer)
    category: Mapped[str] = mapped_column(String(40), default="Core")
    grade: Mapped[str] = mapped_column(String(4))  # O, A+, A, B+, B, C, P, F
    grade_point: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(16), default="institution")  # institution | nptel | transfer


class Programme(Base):
    __tablename__ = "programmes"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    name: Mapped[str] = mapped_column(String(200))
    total_credits: Mapped[int] = mapped_column(Integer)
    requirements: Mapped[list] = mapped_column(JSON, default=list)  # [{category, credits}]
    exit_points: Mapped[list] = mapped_column(JSON, default=list)  # [{credits, award}] (NEP multiple exit)
    mooc_credit_cap_percent: Mapped[int] = mapped_column(Integer, default=40)  # UGC SWAYAM cap per semester


class StudentProgramme(Base):
    __tablename__ = "student_programmes"

    person_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    programme_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("programmes.id", ondelete="CASCADE"))
    admitted_year: Mapped[int] = mapped_column(Integer)
    advisor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)  # faculty advisor (a teacher)
    apaar_id: Mapped[str | None] = mapped_column(String(12))
    abc_status: Mapped[str] = mapped_column(String(16), default="not_linked")  # not_linked | pending | linked
    abc_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MoocCourse(Base):
    """A SWAYAM/NPTEL course the institution accepts for credit transfer."""

    __tablename__ = "mooc_courses"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    provider: Mapped[str] = mapped_column(String(20))  # NPTEL | SWAYAM
    title: Mapped[str] = mapped_column(String(200))
    weeks: Mapped[int] = mapped_column(Integer)
    credits: Mapped[int] = mapped_column(Integer)
    category: Mapped[str] = mapped_column(String(40))
    url: Mapped[str] = mapped_column(String(500))
    next_run: Mapped[str | None] = mapped_column(String(60))  # e.g. "Jan to Apr 2027"


class CreditTransferRequest(Base):
    __tablename__ = "credit_transfer_requests"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    mooc_course_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("mooc_courses.id", ondelete="CASCADE"))
    score_percent: Mapped[float] = mapped_column(Float)
    certificate_attachment_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending | approved | declined
    decided_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ---- schedule and attendance ----

class ClassMeeting(Base):
    """A weekly timetable slot for a class section."""

    __tablename__ = "class_meetings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    section_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    weekday: Mapped[int] = mapped_column(Integer)  # 0 Monday .. 6 Sunday
    starts_at: Mapped[time] = mapped_column(Time)
    ends_at: Mapped[time] = mapped_column(Time)
    room: Mapped[str] = mapped_column(String(60), default="")
    kind: Mapped[str] = mapped_column(String(16), default="lecture")  # lecture | lab | tutorial


class ClassSession(Base):
    """One dated class: what attendance is taken against."""

    __tablename__ = "class_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    section_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    room: Mapped[str] = mapped_column(String(60), default="")
    kind: Mapped[str] = mapped_column(String(16), default="lecture")
    status: Mapped[str] = mapped_column(String(16), default="scheduled")  # scheduled | held | cancelled
    checkin_code_hash: Mapped[str | None] = mapped_column(String(64))
    checkin_open_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    session_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("class_sessions.id", ondelete="CASCADE"),
                                                  index=True)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    status: Mapped[str] = mapped_column(String(16))  # present | late | absent | excused | on_duty
    source: Mapped[str] = mapped_column(String(16), default="teacher")  # teacher | checkin | leave
    marked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (UniqueConstraint("session_id", "person_id", name="uq_attendance_person"),)


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    person_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    kind: Mapped[str] = mapped_column(String(16))  # leave | medical | on_duty
    from_date: Mapped[date] = mapped_column(Date)
    to_date: Mapped[date] = mapped_column(Date)
    reason: Mapped[str] = mapped_column(Text)
    attachment_ids: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending | approved | declined
    decided_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CalendarFeed(Base):
    """A private, revocable token for subscribing to the student's calendar from Google or Apple Calendar."""

    __tablename__ = "calendar_feeds"

    person_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    institution_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
