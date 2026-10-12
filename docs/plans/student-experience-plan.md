# Student experience, session logging and learning trail: consolidated plan

*Draft 2026-10-08. Builds on docs/research/student-lms-ai-report.md (feature IDs refer to it). Not yet approved.*

## 1. Login sessions for every role (platform view)

What exists: identity issues rotating refresh tokens (a chain per sign-in, reuse detection kills the chain) and audit records `auth.sign_in` / `auth.sign_out`. There is no stable session id, audit events cannot be grouped by session, and audit `actor_type` only knows admin / anonymous / system.

Design:
- **Session record (identity service):** created at sign-in with a stable `session_id`; fields: account, person, role/scope, institution, IP, user agent (device/browser), started_at, last_seen_at, ended_at, end_reason (sign-out, expired, revoked, reuse-detected). Every rotated refresh token carries the same `session_id`.
- **Session id travels with every request:** added to the access token (`sid` claim), forwarded by the gateway in context headers, stamped on every audit event (new `session_id` column, plus `actor_type` extended to student / teacher / parent).
- **Platform view (Platform Owner only, via `require_perm(ctx, "session.read")`):** Sessions page in the admin console: filter by role, institution, active/ended, date; session detail shows device, timeline and every audited action in that session. Optional `session.revoke` to force sign-out (itself audited).
- **Privacy:** IPs shown masked by default; session metadata kept 60 days after the session ends or goes idle, then rotated out automatically.

## 2. Student learning trail (teacher view)

Kept separate from the audit log on purpose: audit is append-only security evidence; the learning trail is pedagogical data with its own access rules and retention.

- **What is recorded, per learning session (linked to the login `session_id`):** lessons opened (topic, format: read / watch / animation, time spent), AI tutor conversations (student questions, tutor replies, topic, hints vs answers given), searches inside EduBot, practice and quiz attempts with results, mastery changes, and safety flags.
- **Teacher view:** Teacher portal, Students, student, Learning trail: sessions as a timeline with a short AI-written summary per session ("worked on fractions, asked 6 questions, stuck on equivalent fractions"), full transcripts on demand, flagged moments highlighted.
- **Teacher response, "Guide":** the teacher can leave a note or assign a next step on any moment in the trail; it appears in the student's Inbox and can open the related lesson.
- **Scope:** a teacher sees only students in their own classes; parents see a summary (optional, school setting); Platform Owner sees access logs, not content, unless investigating.
- **Rules (required for minors):** students see a clear notice that teachers can review their learning and AI chats (C-05); safety flags alert teacher, then counselor/parent (C-06, C-07); retention 60 days, then rotated out; data never used to train models (C-02).
- **Prerequisite:** a class/section roster (which teacher teaches which students). The current demo has none; it is the one new data model this needs.

## 3. Consolidated student experience: 5 places + 1 tutor

Instead of one page per feature, everything folds into five destinations and one AI tutor that is available everywhere.

| Place | What it combines (report IDs) | One-line purpose |
|---|---|---|
| **Today** | Due list (S-01), what changed (S-02), timetable (S-07), attendance (S-12), weekly goal and forgiving streak (E-04, E-05), teacher guidance cards | Open the app, know exactly what to do next |
| **Learn** | Courses and modules (S-03), every lesson in Read / Watch / Animate tabs (F-01, F-03, F-04), unlock by mastery (S-11, E-01), captions and read-aloud (A-02), offline download (S-14) | One lesson, three ways to understand it |
| **Practice** | Assignments and submission (S-04), quizzes (S-06), spaced review deck and flashcards (E-02, F-02), diagnostic (E-03) | Everything you do to prove or strengthen learning |
| **Progress** | Grades with feedback (S-05), mastery map vs your own past (S-10, E-06), badges (S-13) | How am I doing and where do I improve |
| **Inbox** | Messages (S-08), notifications with controls (S-09, E-08), teacher guidance from the learning trail | One place for every human message |
| **EduBot Tutor** (panel on every page + full view) | Hint-first, syllabus-grounded tutor (T-01..T-06, T-09, T-12, T-13), knows the lesson you are on, can turn an explanation into notes, flashcards, an animation or a video from the library | The teacher who is always there |

Settings (not navigation): accessibility (A-01, A-03), language (A-04), notification preferences, fees (S-15).

Navigation goes from 5 placeholder items to 5 real ones: Today, Learn, Practice, Progress, Inbox, plus the tutor button.

Teacher portal gains: **Students** (roster, learning trail, guide). Admin console gains: **Sessions**.

## 4. Build order (proposed)

1. **Foundation:** session ids end to end + audit `session_id` + Sessions page for Platform Owner; class roster model.
2. **Student shell:** Today, Learn, Practice, Progress, Inbox on the new nav (real data model for courses, lessons, assignments).
3. **Tutor v1:** grounded hint-first chat panel, notes and flashcards on demand, safety layer, learning trail capture.
4. **Teacher review:** learning trail timeline, session summaries, Guide notes to Inbox.
5. **Formats:** animation component library and curated/narrated video library per lesson.

## 5. Decisions (2026-10-08)

- Audience: institutions; colleges are primary (adult students), schools supported per institution. Minor safeguards (consent, alerts, caps) switch on per institution or per under-18 student.
- Content: both school uploads (primary grounding) and an EduBot starter library that teachers approve.
- Video v1: curated videos + narrated slides from approved scripts.
- Build order confirmed: start with sessions + class roster.

## 6. Still open

1. LLM vendor with no-training and zero-retention terms.
2. Retention decided (2026-10-08): 60 days, then rotated out, for session metadata and for the learning trail.
