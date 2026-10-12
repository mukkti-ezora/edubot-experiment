# EduBot student product map (for approval)

*2026-10-12. Synthesised from four research tracks: established LMSs (Canvas, Brightspace, Blackboard Ultra, Moodle 5, Schoology, Google Classroom, Teams), AI study tools (Khanmigo, NotebookLM, Quizlet, Duolingo, Coursera Coach, Lumi and others), Indian ed-tech (PW, Unacademy, ALLEN, Embibe, Testbook, Vedantu, DIKSHA, SWAYAM/NPTEL) and campus super-apps (Ellucian, Modo, Ready Education, Navigate360, Handshake, Indian ERPs). It supersedes the narrower `student-features-ranked.md`. Vendor numbers are self-reported unless stated otherwise.*

**Tags:** **Must** = table stakes. **Edge** = differentiator. **Later** = valuable, but after the core.
**Status:** ✅ built · 🟡 partly built · ⬜ new.
**Ownership:** **Own** = EduBot is the system. **ERP** = EduBot shows it, and the college ERP/SIS keeps the record. **Hybrid** = EduBot runs the workflow, the ERP stores the outcome.

## Evidence that sets the design rules

1. **Hint-first beats answer-giving.**
   - Answer-giving AI raised practice scores 48% but cut exam scores 17% (PNAS 2025).
   - A guarded, hint-first tutor raised practice 127% with no exam harm.
   - The Harvard randomised trial found more than 2x the learning gain with a scaffolded AI tutor.
   - Design rule: keep the tutor hint-first, lock the mode at institution level, and add an unassisted "exam mode" to measure real learning.
2. **Getting students to use the tool is the real problem.**
   - The Khanmigo 2-year trial found only +0.06 SD, because the median student used it on a third of practice days.
   - Nudges are the best-evidenced lever: Georgia State's randomised trial found −21% summer melt.
   - Design rule: build proactive nudges in the app and on WhatsApp.
3. **Students still turn to people.** 84% go to a person when they struggle (Tyton 2025). The tutor-to-teacher path (Doubts) is therefore core, not an extra.
4. **Basics drive satisfaction.** Students care most about submitting work and seeing grades and feedback on time, and they check grades and due dates on the phone (EDUCAUSE, UCF).
5. **Students want one app.** 75% prefer a single platform (Pathify survey). Campus apps that unify things reach high adoption (Modo/UTA: 100% adoption).
6. **India-specific needs:**
   - 75% attendance rules.
   - Exam-style mock tests with ranks (ALLEN: 47 lakh tests in 2025).
   - Hinglish and vernacular languages, offline use, photo doubts.
   - Compliance: ABC/APAAR credit uploads, SWAYAM/NPTEL credit transfer (up to 40% per semester), and the UGC SGRC grievance and anti-ragging rules.
   - No consumer app handles the credit side for students. That is white space.

## Proposed structure

**Student sidebar, in two groups:**
- **Study:** Today · Learn · Practice · Doubts · Progress
- **Campus:** Schedule · Campus · Career · Services

**Always present:** the EduBot Tutor (panel plus full view), Search, Notifications, Profile and digital ID, Settings (language, accessibility, offline), and a "Get support" link.

## The catalogue

### 1. Today (home)
| Feature | Tag | Status | Notes |
|---|---|---|---|
| Due soon across courses, overdue first | Must | ✅ | |
| Continue learning | Must | ✅ | |
| Ask EduBot bar + suggestions | Must | ✅ | |
| Today's classes (real timetable) | Must | ⬜ | Needs class meeting times |
| Announcements digest | Must | ⬜ | |
| Workload view (busy weeks ahead) | Edge | ⬜ | Brightspace Pulse |
| Attendance at a glance + shortage warning | Must (India) | ⬜ | |
| Weekly goal + forgiving streak | Later | ⬜ | Must not reward streaks over learning |
| AI daily plan ("3 things for today") | Edge | ⬜ | Nudge evidence |

### 2. Learn
| Feature | Tag | Status | Notes |
|---|---|---|---|
| Courses → modules → lessons, Read / Watch / Animate | Must | ✅ | |
| Topics with topic pages | Edge | ✅ | No competitor has the combined page |
| Lesson completion | Must | ✅ | |
| Prerequisites / unlock rules, module progress | Must | ⬜ | Canvas, Brightspace, Blackboard |
| Notes, highlights, bookmarks (also on topic pages) | Edge | ⬜ | A gap in every LMS |
| Read-aloud, captions, translation, dyslexia font | Must | 🟡 | Video captions come from YouTube |
| Hinglish / Indian-language lessons and tutor | Must (India) | ⬜ | |
| AI study tools: summary, flashcards, quiz, cheat sheet from any lesson or topic | Must | ⬜ | Google Classroom, NotebookLM, Quizlet |
| Audio overview (listen to a topic) | Later | ⬜ | Engaging; no learning evidence |
| Lecture recordings → notes | Edge | ⬜ | StudyFetch, Coconote. Needs consent and storage |
| Semantic search across course content | Edge | ⬜ | Canvas IgniteAI |
| Offline download | Must (India) | ⬜ | Moodle app is the model |
| Live classes: join, recordings, missed/watched list | Later | ⬜ | Needs a Zoom/Meet/Teams link |

### 3. Practice
| Feature | Tag | Status | Notes |
|---|---|---|---|
| Assignments: file, text, link, media submissions; drafts; resubmission; rubric visible before submitting | Must | 🟡 | Assignments are listed, but there is no submission yet |
| Group assignments | Must | ⬜ | |
| Ask for an extension (student-initiated, policy auto-approve) | Edge | ⬜ | No LMS does this natively |
| Originality self-check before submitting | Later | ⬜ | Integrates Turnitin-class tools |
| Quizzes: many question types, timed, attempts, accommodations, review page | Must | ⬜ | |
| AI practice per topic (adaptive, explain my mistake) | Must | ⬜ | Duolingo, Coursera Coach, Lumi |
| Exam mode (unassisted check) | Edge | ⬜ | The evidence says this measures real learning |
| Spaced review deck (flashcards due today) | Must | ⬜ | Strong learning-science backing |
| Mock tests with exam-style interface, negative marking, section/college rank, percentile | Must (India) | ⬜ | PW, ALLEN, Testbook. Rank within the class, not all-India |
| Test analytics: accuracy vs speed, time per question, weak-chapter detection, behaviour insights | Edge | ⬜ | Embibe |
| Auto-built "improvement set" from your own mistakes | Edge | ⬜ | ALLEN |
| Past papers (PYQs) by topic, uploaded by the institution | Must (India) | ⬜ | |
| Daily practice problems (DPPs) | Edge | ⬜ | PW |
| Code exercises with an autograder and hints | Edge (colleges) | ⬜ | CS50 Duck, Moodle CodeRunner |
| Writing coach (process feedback, never writes for you) | Later | ⬜ | Khanmigo |
| Photo of handwritten working → AI checks your steps | Edge | ⬜ | Rarer and more useful than "solve" |
| Viva / oral and English-speaking practice | Later | ⬜ | Valuable for placements |
| Class quiz battles / weekly contest | Later | ⬜ | Unacademy Compete, PW Battleground |

### 4. Doubts
| Feature | Tag | Status | Notes |
|---|---|---|---|
| Ask your teacher (from lesson, topic, tutor; private; follow-up; resolve) | Must | ✅ | |
| Teacher inbox, AI drafts, insights | Must | ✅ | |
| Photo / voice doubts | Must (India) | ⬜ | Needs file storage |
| AI answers first in Hinglish, then escalates | Edge | 🟡 | The tutor exists; Hinglish doesn't yet |
| Publish to class FAQ (anonymous) | Edge | ⬜ | |
| Office-hours booking | Edge | ⬜ | Canvas Scheduler |

### 5. Progress
| Feature | Tag | Status | Notes |
|---|---|---|---|
| Grades with weights, "feedback ready" signal, rubric/audio/annotated feedback | Must | 🟡 | A demo Grades page exists |
| What-if grade calculator | Edge | ⬜ | Students love it (Canvas) |
| CGPA / SGPA and grade trends | Must (India) | ⬜ | No LMS does this natively |
| Mastery by topic (can drop), compared with your own past | Edge | ⬜ | Khan Academy, Canvas |
| Credit tracker: earned vs required, ABC/APAAR status, NEP exit points | Edge (India) | ⬜ | White space |
| NPTEL/SWAYAM course finder + credit transfer request | Edge (India) | ⬜ | Hybrid |
| Badges / certificates on completion; portfolio / showcase | Later | ⬜ | Brightspace, Moodle |
| Learning trail you can see (your own activity) | Edge | 🟡 | Teachers can see it; students can't yet |

### 6. Schedule
| Feature | Tag | Status | Notes |
|---|---|---|---|
| Unified calendar: classes, deadlines, exams, events; Google/Apple sync | Must | ⬜ | Top student request (USC) |
| Exam timetable, hall ticket / admit card | Must (India) | ⬜ | ERP |
| Attendance per course, shortage alerts, "classes you can still miss" | Must (India) | ⬜ | |
| QR check-in for classes | Edge | ⬜ | Camu, CampusGroups |
| Leave / on-duty (OD) applications | Must (India) | ⬜ | Own the workflow |

### 7. Campus
| Feature | Tag | Status | Notes |
|---|---|---|---|
| Notices / circulars with read receipts; per-category notification preferences | Must | ⬜ | |
| Events, clubs, RSVPs, QR entry | Edge | ⬜ | CampusGroups, Engage |
| Co-curricular record (activities, volunteering hours) | Edge | ⬜ | Feeds Career |
| Course discussions / study groups (moderated by faculty) | Must | ⬜ | |
| Study buddy matching (AI) | Edge | ⬜ | Navigate360 |
| Feedback surveys (course, faculty, events) | Must | ⬜ | NAAC-driven in India |
| Maps, transport / bus tracking, mess menu | Later | ⬜ | Integrations |

### 8. Career
| Feature | Tag | Status | Notes |
|---|---|---|---|
| Placement drives with eligibility (CGPA, backlogs) and registration | Must (India colleges) | ⬜ | Training and placement officer (TPO) workflow |
| Resume builder with AI feedback | Edge | ⬜ | Symplicity |
| AI mock interviews (technical + HR, voice) | Edge | ⬜ | |
| Internships / jobs board | Later | ⬜ | Handshake |
| Alumni mentoring | Later | ⬜ | |

### 9. Services (requests)
| Feature | Tag | Status | Notes |
|---|---|---|---|
| Documents vault and digital ID (QR) | Must | ⬜ | |
| Certificate requests: bonafide, transcript, NOC | Edge (India) | ⬜ | Hybrid. Not confirmed in any app |
| Fees: dues, pay, receipts, scholarships | Must | 🟡 | A demo Fees page exists. ERP + payment gateway |
| Exam registration, re-evaluation requests | Must (India) | ⬜ | Hybrid |
| Course registration / electives | Must | ⬜ | ERP |
| Library: search, issued books, due dates, e-resources | Later | ⬜ | Integrates Koha |
| Hostel: room, mess, maintenance requests | Later | ⬜ | Residential colleges |
| Grievance (SGRC) and anti-ragging reporting, anonymous option | Must (India, compliance) | ⬜ | Easy sales wedge |

### 10. Wellbeing and safety (always-visible link)
| Feature | Tag | Status | Notes |
|---|---|---|---|
| Crisis lines and "talk to someone" | Must | ⬜ | Static and always visible |
| Counselling booking | Must | ⬜ | Integrate clinical partners. The AI is never a therapist |
| Tutor distress flags routed to the right adult | Must | 🟡 | Flags exist; routing doesn't |
| Mood check-ins | Later | ⬜ | MS Reflect |

### 11. Cross-cutting AI and platform
| Feature | Tag | Status | Notes |
|---|---|---|---|
| Hint-first tutor grounded in the lesson | Must | ✅ | |
| Tutor knows your context (due dates, grades, attendance) | Edge | ⬜ | Blackboard AVA |
| Proactive nudges (app + WhatsApp) | Edge | ⬜ | Best-evidenced lever |
| Reflection prompt at the end of a session | Edge | ⬜ | Cheap, well grounded |
| Role-play / debate / case tutor (instructor-set) | Later | ⬜ | Blackboard AI Conversation |
| Voice tutor | Later | ⬜ | ~2.8x cost for similar mastery outside language practice |
| Integrity: AI-use disclosure, authorship tracking, lock-down during assessments | Must | ⬜ | Google's homework-button incident |
| Minor safety: age tiers, parental consent (DPDP 2025), distress alerts | Must (schools) | 🟡 | |
| Data export / deletion requests | Must | ⬜ | DPDP |
| Parent app view (progress, attendance, fees, PTM booking) | Must (schools) | 🟡 | A demo parent portal exists |

## Suggested phasing
1. **Study core:**
   - Practice: assignments with submission, quizzes, AI practice, review deck, exam mode.
   - Progress: grades, feedback, what-if, CGPA, mastery.
   - Schedule: calendar, attendance, leave.
2. **India edge:**
   - Mock tests with analytics and past papers.
   - Hinglish tutor; photo doubts (needs a storage decision).
   - Credit tracker (ABC/APAAR/NPTEL).
   - Offline downloads.
3. **Campus and services:**
   - Notices and notifications, events and clubs, feedback surveys.
   - Grievance and anti-ragging, certificate requests, documents and ID.
   - Fees through the ERP.
4. **Career and wellbeing:**
   - Placements, resume and mock interviews.
   - Counselling booking, crisis support, distress routing.
5. **AI depth:** nudges, context-aware tutor, study tools, lecture-to-notes, voice and role-play.
