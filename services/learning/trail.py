"""The learning trail: what a student did, recorded for the student's teachers and rotated after 60 days."""

from __future__ import annotations

from services.learning.enrolment import Enrolment
from services.learning.models import LearningEvent
from services.shared.context import RequestContext


def trail_event(me: Enrolment, ctx: RequestContext, kind: str, **fields) -> LearningEvent:  # noqa: ANN003
    """A trail event for the calling student, stamped with their sign-in session."""
    return LearningEvent(institution_id=me.institution_id, person_id=me.person_id, session_id=ctx.session_id,
                         kind=kind, **fields)
