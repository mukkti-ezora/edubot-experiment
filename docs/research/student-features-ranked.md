# Student dashboard: ranked feature catalogue (for approval)

*2026-10-11. Builds on `student-lms-ai-report.md` and `docs/plans/student-experience-plan.md`. Already built: Today, Learn, lessons in three formats, the EduBot Tutor and the learning trail.*

Ranking weighs four things: value to students (survey evidence), value to the institution, fit with what EduBot already has, and effort. Items marked **[unverified]** come from vendor claims or user reports.

## Evidence that shaped the ranking

- Students' top LMS request is one place for every due date across courses, with calendar, to-do and performance views together. This came from USC's survey of more than 10,000 students (EDUCAUSE 2025).
- Their top complaints are that course structure changes from course to course and that grades are hidden or unclear (University of Arizona, 2024).
- 86% of students use AI regularly, but 80% say their institution's AI falls short (DEC 2024, n = 3,839). 30% pay for AI study tools themselves (Tyton 2025).
- The handoff from AI to a human is weak everywhere. In one study students rated 22% of AI hints unhelpful but escalated only 11% of those (Phung et al. 2025). No product we found escalates from AI tutor to teacher with the context attached.
- No product offers a topic page that gathers lessons, practice, past questions, your own notes and your tutor chats for a single concept. This is an opening for EduBot.
- 24% of students report a disability, and satisfaction with mental-health support fell to 55% (EDUCAUSE 2025).

## Ranked features

| # | Feature | What the student gets | Why it ranks here | Effort |
|---|---|---|---|---|
| 1 | **Doubts** (ask your teacher) | Ask the subject teacher about a lesson, a video moment or a tutor answer. The tutor transcript and lesson are attached automatically, and photos are accepted. Doubts are private by default. You see the expected reply time, can follow up, and mark the doubt resolved. | You asked for it. It fills the AI-to-human gap the research found. It works on top of the tutor, the roster and the trail, which already exist. | L (student + teacher side) |
| 2 | **Topics** | Each topic page gathers its lessons, practice, past questions, your notes, your tutor chats and your doubts. Each topic has a mastery level (Not started, Familiar, Proficient, Mastered) that can also drop. "What to study next" is driven by prerequisites. | You asked for it. No competitor clearly offers this combined page. It gives Practice, Progress and Doubts a shared spine. | L |
| 3 | **Practice** (planned) | Assignment submission, quizzes, AI-generated practice per topic, and spaced review flashcards. | Practice is what turns learning into mastery data. It feeds Topics and Progress. | L |
| 4 | **Planner and calendar** | Every due date, class and exam across courses in one place: agenda and week views, plus a calendar feed for Google or Apple. | Students' top request (USC). Brings back "Today's classes" with real data. | M |
| 5 | **Progress** (planned) | Grades with feedback, a "what-if" grade calculator, and a mastery map per topic compared with your own past. | Addresses the "hidden grades" complaint. | M |
| 6 | **Inbox and announcements** (planned) | Course announcements, teacher replies to doubts, teacher guidance from the trail, and notification controls. | Doubts, Practice and announcements all need one place to arrive. | M |
| 7 | **AI study tools** | Turn any lesson into a summary, flashcards or a quiz. A study plan built backwards from an exam date, with spaced reviews. | Strong AI demand, and Lumi, NotebookLM and Quizlet have made it expected. Reuses the tutor providers. | M |
| 8 | **Notes, highlights and bookmarks** | Highlight lesson text and add notes; bookmark a video moment. Everything also appears on the topic page. | Makes topic pages personal. Weaker evidence on its own **[unverified as an LMS differentiator]**. | M |
| 9 | **Exams and past papers** | Exam schedule, mock tests, past papers by topic, and a weakness report per topic. | Very high value for Indian exam-focused students (PW, Unacademy) **[depth unverified]**. | M–L |
| 10 | **Search** | Meaning-based search across your courses, lessons, notes and answered doubts. | Canvas made this standard in 2025. | M |
| 11 | **Accessibility pack** | Read-aloud, a dyslexia-friendly font, text size and spacing controls, and translation of lessons and tutor replies. | 24% of students report a disability. Immersive Reader is table stakes in Canvas and Brightspace. | S–M |
| 12 | **Attendance** | Your attendance per course, plus QR check-in for live classes. | Common in Indian colleges. Mostly useful to the institution. | M |
| 13 | **Live classes and recordings** | Join links, recordings, and a list of missed, upcoming and watched sessions. | High value in India (Unacademy, PW). Needs a Zoom, Teams or Meet integration. | M–L |
| 14 | **Class Q&A** (public doubts) | Teachers can publish an answered doubt to the class anonymously, and it joins that lesson's FAQ, which the tutor learns from. | Reduces duplicate questions (Piazza, Ed). Builds directly on Doubts. | S after #1 |
| 15 | **Writing coach** | Coaches outlining, drafting and revising on essays without writing them for you. | Proven by Khan Academy. Narrower audience. | M |
| 16 | **Goals and streaks** | A weekly study goal and a forgiving streak. No leagues. | Proven in consumer apps; weak evidence at college level. Already in the plan. | S |
| 17 | **Wellbeing and safety** | Counselling contacts, a "talk to someone" path, and safety alerts routed to the right adult. | Real need (EDUCAUSE 2025). The tutor already flags distress; this is where those flags go. | S–M |
| 18 | **Career and portfolio** | Showcase projects; course-to-career links. | Students say they want this, but the source is sponsored. Better as a later add-on. | M |
| 19 | **Degree progress, registration, fees, transcripts** | Credits toward the degree, registration status, and documents. | These belong to the student information or ERP system. Integrate with it rather than rebuild it. | Integration |

## Doubts in detail (#1)

**Student side**
- **Where you can ask:**
  - an "Ask your teacher" button on every lesson, including at a video timestamp;
  - inside the tutor ("Still stuck? Ask your teacher"), which carries the transcript over;
  - from the Doubts page.
- **What you can attach:** text, a photo or file, and the topic (filled in automatically from the lesson).
- **Before you send:** EduBot shows similar answered doubts and lets the tutor make one more attempt. This deflects repeats without blocking you.
- **Routing:** the doubt goes to the teacher of that section and subject. Doubts are private by default. A teacher can later publish one to the class anonymously (#14).
- **Status:** Sent, then Seen, then Answered, then Resolved, or Reopened if you say "Still confused?". You also see the expected reply time.
- **Limits:** a fair-use cap per day, so the queue stays manageable.

**Teacher side** (needs a slice of the teacher portal)
- **Triage inbox:** filters for Unanswered, Overdue and Resolved, grouped by course and topic. The student's tutor transcript and lesson are shown alongside each doubt.
- **AI-drafted reply:** built from the lesson and the transcript. Nothing is sent until the teacher edits or approves it, and the draft withholds final answers to active graded work.
- **Ways to reply:** text, image, a voice note, or saved replies.
- **Housekeeping:** mark a doubt as a duplicate, endorse an answer, or publish it to the lesson FAQ.
- **Insights:** the most-asked topics this week and average response time, plus a summary of where students get confused.

**Rules**
- Doubts go into the learning trail.
- Response-time targets are set per institution. Overdue doubts escalate to a co-teacher or head of department.
- Under-18 students follow the guardian-visibility settings, with India's DPDP Rules applying from May 2027.

## Recommended build order

1. **Doubts**, the student and teacher core (escalate from tutor or lesson, triage inbox, AI drafts, resolve), and **Topics v1** (topic tags on lessons, topic pages, topic shown on doubts). These two share the data model, so they go together.
2. **Practice**, then **Progress** with mastery per topic.
3. **Planner and calendar**, plus **Inbox and announcements**.
4. **AI study tools**, **notes**, **search** and the **accessibility pack**.
5. **Exams**, **attendance** and **live classes**, depending on what institutions need.

## Consolidated structure (2026-10-11)

Student sidebar: **Today · Learn · Practice · Doubts · Progress**. Header: Ask EduBot · Search · Notifications.

**Places of their own**
- **Doubts:** used by students and teachers, with its own status lifecycle and a teacher inbox. It absorbs Class Q&A (#14).
- **Practice:** assignments, quizzes, flashcard review, exams and past papers, and mock tests (#3 and #9).

**Merged into existing places**
- **Today:** absorbs the planner and calendar as a Day / Week toggle with calendar sync (#4), announcements (#6), attendance at a glance (#12), and goals and streaks (#16).
- **Learn:** organised by course, then topic, then lesson (#2). The topic page holds your notes, highlights and bookmarks (#8), AI study tools (#7), and your doubts on that topic.
- **Progress:** grades, the what-if calculator, mastery per topic, and attendance detail (#5 and #12). Degree progress comes later through the student information system (#19).

**Tools on every page, not places**
- **Tutor:** gains a handoff into Doubts.
- **Search** (#10).
- **Notifications bell:** replaces a separate Inbox (#6).
- **Reader toolbar and accessibility preferences** (#11).
- **"Get support" and safety routing** (#17).

**Deferred**
- Live-class integration (#13). Until then, schedule entries link to the meeting.
- Writing coach (#15), later inside Practice.
- Career and portfolio (#18).
- Fees move to the account menu.

**Build order**
1. Doubts together with Topics v1, including the teacher's doubts inbox.
2. Practice.
3. Progress.
4. Today v2.
5. Learn v2.
