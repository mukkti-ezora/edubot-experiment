# Study core + India edge: build contract (2026-10-12)

This covers phases 1 and 2 of `docs/research/student-product-map.md`. The data model is already in `services/learning/models.py`. The gateway relays every `/api/v1/student/*` and `/api/v1/teacher/*` call to the learning service through the transparent proxy (CSRF-checked, session-scoped), so new endpoints need no gateway code.

**Conventions**
- Responses are camelCase dicts, and errors use the shared problem-details shape.
- Students are scoped with `student_enrolment`, teachers with `teacher_enrolment` (`services/learning/enrolment.py`).
- Student actions are written to the learning trail as `LearningEvent`. Teacher decisions are audited via `request.app.state.audit`.
- Caps are counted from the database, not in memory.
- AI generation reuses `tutor.provider_for` and closes streams with `aclosing`. Its output must be validated JSON, and a provider failure is `503 AI_UNAVAILABLE`.
- Tests sit in `services/gateway/tests/test_<area>.py` and run through the gateway, with boundary cases.

## Practice (`services/learning/practice.py`, `scripts/seed_practice.py`)

**Student endpoints**
- `GET /student/practice`: the hub data.
  - `assessments`: open, upcoming and completed quizzes, mock tests and past papers for the student's courses, each with `status`, best score and attempts left.
  - `review`: `{dueToday, total}`.
  - `topics`: per-topic practice entry points with mastery.
  - `improvementSets`: the student's own practice sets.
- `GET /student/assessments/{id}`: the summary (sections, question count, duration, marking scheme, attempts) and its rules.
- `POST /student/assessments/{id}/attempts`: start an attempt, enforcing the window, attempts left and the deadline from duration.
  - Returns the attempt with its questions, without answers, grouped by section.
  - A student with an in-progress attempt gets it back, so this is resumable.
- `PUT /student/attempts/{id}/answers/{questionId}` with body `{response, markedForReview, timeSeconds}`. It autosaves, increments `changes` when the response differs, and refuses after the deadline or once submitted.
- `POST /student/attempts/{id}/submit`: scores with `marks_correct`/`marks_wrong`; numeric answers use the tolerance. An expired attempt is auto-submitted on its next read.
- `GET /student/attempts/{id}`: the result.
  - Score, max score, correct, wrong, skipped.
  - **Rank and percentile** among first attempts by students in the same class section, shown only when 3 or more attempted.
  - Per-section and per-topic accuracy.
  - Time per question and accuracy vs speed (quadrants: fast-right, slow-right, fast-wrong, slow-wrong).
  - Behaviour: answers changed, marked-for-review left, time spent on wrong answers.
  - Review of each question with the student's response, the correct answer and the explanation. This is shown only after submission, and for mock tests only once the window closes, if it has one.
- `POST /student/attempts/{id}/improvement-set`: a private practice set (`kind=practice`, `owner_id` = student) from the wrongly answered and skipped questions, topped up with other bank questions from the same topics.
- `POST /student/topics/{topicId}/ai-practice`: AI generates 5 questions from the topic's lessons.
  - The questions are stored with `source=ai` and `owner_id` = the student, inside a private `practice` assessment.
  - Each generated question must validate: a kind it supports, 2 to 6 options, an answer among those options, and an explanation.
  - Capped at `ai_practice_per_day`.
- `GET /student/review/due`: flashcards due now (plus up to 10 new cards from the student's courses).
- `POST /student/review/{cardId}` with body `{rating: again|hard|good|easy}`: SM-2-lite scheduling. Returns the next due date.
- `POST /student/lessons/{lessonId}/flashcards`: AI makes up to 8 cards from the lesson, owned by the student. Capped and validated.
- `exam_check` assessments and any `tutor_allowed=false` attempt in progress make `POST /student/tutor/messages` answer 409 `TUTOR_LOCKED`. Add a helper in practice.py that tutor.py calls.

**Teacher endpoint**
- `GET /teacher/assessments`: the teacher's courses' assessments with attempt counts and average.
- `GET /teacher/assessments/{id}/results`: a ranked list per section, with the weakest topics.

## Coursework (`services/learning/coursework.py`)

**Student endpoints**
- `GET /student/assignments`: the student's courses' assignments with status (`not_started | draft | submitted | late | graded | missing`), due, points, and any extension in effect.
- `GET /student/assignments/{id}`: instructions, rubric, submission types, the student's submission (text, link, attachment metadata, revision, score, feedback, rubric scores), late rules, and extension requests.
- `PUT /student/assignments/{id}/draft` with body `{text, link, attachmentIds}`.
- `POST /student/assignments/{id}/submit`: validates allowed types and a non-empty submission. Computes `late_minutes` against the due date or the approved extension. Refuses after due + `accepts_late_days`, and when resubmissions are exhausted. Marks `feedback_seen_at` as unset.
- `POST /student/assignments/{id}/extension` with body `{until, reason}`. It is auto-approved when asked before the due date, `until` is within `extension_auto_approve_hours` of it, and it's the first request for that assignment. Otherwise it is pending.
- `POST /student/assignments/{id}/feedback-seen`.

**Teacher endpoints**
- `GET /teacher/submissions?status=to_grade|graded`: the teacher's sections' submissions, with student names.
- `GET /teacher/submissions/{id}`
- `POST /teacher/submissions/{id}/grade` with body `{rubricScores, score?, feedback}`. The score is computed from the rubric when present, then the late penalty is applied: `late_penalty_percent_per_day` per started day. Audited.
- Teacher requests: each module owns its own list and decision endpoints, and the frontend combines them.
  - Coursework: `GET /teacher/requests/extensions` and `POST /teacher/requests/extensions/{id}/decide` with body `{approve, note}`. Audited.
  - Schedule: the same pair for leave.
  - Progress: the same pair for credit transfers.

**Also required:** `/student/today` must not count drafts as handed in. I'll make that change in `api.py`; coursework.py should expose `is_handed_in(submission)` for it.

## Progress (`services/learning/progress.py`, `scripts/seed_progress.py`)

**Student endpoints**
- `GET /student/progress`
  - **Current courses:** a percentage per course, from weighted grade categories (Assignments 40, Quizzes 20, Mid-term 40, unless the course sets its own), with the grade letter and point on the UGC 10-point scale (O ≥ 90 = 10, A+ ≥ 80 = 9, A ≥ 70 = 8, B+ ≥ 60 = 7, B ≥ 50 = 6, C ≥ 45 = 5, P ≥ 40 = 4, F = 0) and a "feedback ready" count.
  - **Records:** CGPA, SGPA per term from `CourseResult`, the trend, and credits earned.
- `GET /student/progress/courses/{courseId}`: the graded items by category with weights, the score and feedback for each, plus `whatIf` inputs (categories, weights, earned and max). The what-if maths runs in the client, with the same rules mirrored in a tested pure function on the server.
- `GET /student/mastery`: per topic, a level (`not_started | attempted | familiar | proficient | mastered`) from recent answers, weighted towards the latest. `mastered` needs at least 80% over at least 6 answers, including at least one from an `exam_check` or mock test. Also returns the level 28 days ago, so the student sees movement.
- `GET /student/credits`
  - The programme, its requirements by category, earned and in-progress credits, the next NEP exit point and the credits still needed for it.
  - ABC/APAAR status.
  - MOOC credits used against the cap.
  - Transfer requests.
- `PUT /student/credits/apaar` with body `{apaarId}`: exactly 12 digits, then sets `abc_status=pending`. There is no real ABC integration; this is labelled honestly in the UI.
- `GET /student/credits/moocs`: the approved SWAYAM/NPTEL catalogue.
- `POST /student/credits/transfers` with body `{moocCourseId, scorePercent, certificateAttachmentId}`. Duplicates are refused.
- `GET /teacher/requests/credits` and `POST /teacher/requests/credits/{id}/decide`: for students the teacher advises (`StudentProgramme.advisor_id`). An approval writes a `CourseResult` with `source=nptel`. Audited.

## Schedule (`services/learning/schedule.py`, `scripts/seed_schedule.py`)

**Student endpoints**
- `GET /student/schedule?from=&to=`: a unified list of events. Class sessions (course, room, kind, status, the student's attendance), assignment due dates, and assessment windows; max range 62 days.
- `GET /student/attendance`
  - Per course: held, attended (present, late and on-duty count as attended), excused (taken out of the denominator) and the percentage.
  - The threshold from settings, and the remaining scheduled sessions this term.
  - **`canMiss`**: the most remaining classes the student can miss and stay at or above the threshold. Or **`mustAttend`**: how many consecutive classes are needed to get back above it.
  - Recent records.
- `POST /student/attendance/checkin` with body `{code}`. The code must match an open session of the student's section within the window. Idempotent, and wrong codes are rate-limited.
- `GET /student/leave`, and `POST /student/leave` with body `{kind, fromDate, toDate, reason, attachmentIds}`. At most 30 days, and no overlap with another pending or approved request.
- `POST /student/calendar-feed`: creates (or rotates) the private ICS token and returns its URL, `/api/v1/calendar-feed/{token}.ics`. `GET /public/calendar/{token}.ics` serves the next 60 days as iCalendar. Only the token hash is stored.

**Teacher endpoints**
- `GET /teacher/sessions?date=`: the day's sessions for the teacher's sections, with roster and attendance.
- `POST /teacher/sessions/{id}/attendance` with body `{records: [{personId, status}]}`. Marks the session held. Audited.
- `POST /teacher/sessions/{id}/checkin`: opens a 6-digit code for `checkin_window_minutes` and returns it in plain text once. Only its hash is stored.

**Helpers for other modules**
- `GET /teacher/requests/leave` and `POST /teacher/requests/leave/{id}/decide` with body `{approve, note}`: leave from the teacher's sections' students. Audited. An approved leave marks the overlapping sessions excused (on-duty for `on_duty`); teacher-marked records are never overwritten.
- `today_classes(session, me)` and `attendance_alerts(session, me)` for `/student/today`.

## Frontend (after the backend lands)

**Sidebar groups**
- Study: Today, Learn, Practice, Doubts, Progress.
- Campus: Schedule, Fees.

**Pages**
- Practice hub
- Assignment view and submission
- Test player (exam style: palette with states, sections, timer, mark for review, autosave)
- Result analysis
- Review deck
- Progress, with course detail and what-if
- Mastery
- Credits
- Schedule (week and agenda), Attendance, Leave
- Teacher: Grading, Requests, Attendance, Test results

**Cross-cutting**
- Photo attachments in doubts, submissions and leave.
- Tutor language picker.
- Save a lesson for offline reading (service worker, no new dependency).
