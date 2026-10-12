# Student section for an LMS + AI e-learning platform: research report

*Generated: 2026-10-08 | Sources: ~110 (4 parallel research tracks) | Confidence: Medium-High (vendor claims and prices flagged where unverified)*

Purpose: give EduBot a catalogue of student-facing features to select from, with evidence, so we can decide what goes into the student portal and what stays out. Feature IDs (S-xx, T-xx, F-xx, E-xx, A-xx, C-xx) are for selection.

## Executive summary

1. **The LMS core is a solved, well-known shape.** Every major platform (Canvas, Moodle, Google Classroom, Brightspace, Schoology, Blackboard Ultra, Teams) gives students one cross-course "what's due" list, course pages, assignment submission with status, grades with feedback, a calendar, messaging, notifications, a mobile app and (in K-12) a parent view. These are table stakes; EduBot's student portal currently covers only a subset, on demo data.
2. **AI tutoring has converged on one pattern:** a Socratic, hint-first tutor grounded in the course's own material, assigned and visible to teachers. Canvas, Blackboard, Schoology, Google Classroom, Brightspace, Khanmigo, Claude Learning Mode, ChatGPT Study Mode and Gemini Guided Learning all landed here in 2025-2026.
3. **The evidence says guardrails matter more than raw capability.** In a ~1,000-student RCT (PNAS 2025), unrestricted GPT-4 raised practice scores 48% but cut later exam scores 17%; a hint-only tutor removed the harm but did not raise exam scores. Gains came where the tutor was grounded in verified solutions and structured by teachers (Harvard physics RCT; World Bank Nigeria, +0.31 SD).
4. **"Teach every subject in video, animation and docs" is buildable only as one pipeline, not three generators.** Produce one grounded, teacher-approved *lesson spec* per syllabus topic and render it to notes (on demand, cheap), animations (pre-generated, cached) and video (pre-generated, cached). Pixel text-to-video models (Veo; Sora was shut down in 2026) are not accurate enough to teach from.
5. **Minors change the rules.** COPPA (amended, in force April 2026), FERPA, India's DPDP Act (verifiable parental consent for all under-18s from ~May 2027), California SB 243 (chatbot self-harm protocols, break reminders) and the EU AI Act all apply to an AI tutor for school students. Safety and visibility features are not optional for this audience.

## 1. LMS core: what students expect (table stakes vs differentiators)

| ID | Feature | What it does | Who has it | Tier | EduBot today |
|---|---|---|---|---|---|
| S-01 | Home "what's due" list | One cross-course list, overdue first, plus busiest-days view | Canvas, Moodle, Classroom, Brightspace, Schoology, Blackboard [L1-L8] | Table stakes | Partial (assignments on dashboard, demo) |
| S-02 | Activity feed | What changed since last visit (grades, announcements) | Canvas, Schoology, Blackboard [L1][L7][L8] | Table stakes | No |
| S-03 | Courses and modules | Course cards, module pages, files, readings | All [L1-L3][L7] | Table stakes | No |
| S-04 | Assignment submission | Upload/turn in, status (turned in, returned, missing, late) | All [L10][L11][L12] | Table stakes | View only |
| S-05 | Grades with feedback | Score, rubric, comments, annotations in one obvious place | All [L10][L13] | Table stakes (students say feedback is hard to find [L37]) | Partial (grades page) |
| S-06 | Quizzes and practice tests | Timed/untimed quizzes, auto-grading | All | Table stakes | No |
| S-07 | Calendar and timetable | Due dates, events, class schedule | All; PowerSchool defaults to schedule [L12] | Table stakes | Yes (schedule page) |
| S-08 | Messaging | Message teachers/classmates, announcements | All [L19][L20] | Table stakes | No |
| S-09 | Notifications with controls | Per-event immediate/daily/weekly | Canvas (fine-grained) [L19]; others coarse | Table stakes (overload is the #1 complaint [L37]) | No |
| S-10 | Mastery / outcomes view | Which skills mastered, which need work | Canvas LMG, Moodle competencies [L14][L15] | Differentiator | No |
| S-11 | Adaptive release | Next content unlocks on mastery | Canvas MasteryPaths [L14] | Differentiator | No |
| S-12 | Own attendance record | See attendance, QR self check-in | Moodle, PowerSchool, Teachmint [L17][L18] | Standard in school suites | Stat only |
| S-13 | Badges / portfolio | Open Badges, ePortfolio | Moodle, Brightspace, Canvas [L14][L15][L21] | Differentiator | No |
| S-14 | Offline mode | Download content, auto-sync | Moodle (most complete), Canvas, Classroom [L22-L24] | Differentiator (must for India) | No |
| S-15 | Fees and school admin widgets | Fee balance, payments, bulletins | PowerSchool, Teachmint [L12][L17] | School-suite differentiator | Yes (fees page, demo) |
| S-16 | Reorderable dashboard widgets | Student chooses what the home shows | PowerSchool [L12] | Differentiator | No |
| S-17 | Wellbeing check-in | Emoji mood check | Teams Reflect [L11] | Differentiator | No |
| S-18 | Reading fluency practice | Read aloud, real-time feedback | Teams Reading Coach, Classroom Read Along [L27][L28] | Differentiator (K-12) | No |

Patterns worth copying [L6][L7][L12][L22][L25]: one cross-course due list with overdue first; AI framed as tutor not answer engine; reorderable widgets; offline that shows what is downloaded and syncs; an accessibility button on every page.
Top complaints [L37][L38]: every course laid out differently, notification overload, grades and feedback hard to find, placeholder zeros causing stress.

## 2. AI tutor ("the chatbot that teaches")

| ID | Feature | Description | Best examples | Tier |
|---|---|---|---|---|
| T-01 | Socratic, hint-first by default | Guiding questions and steps; answers only after an attempt | Claude Learning Mode, ChatGPT Study Mode, Gemini Guided Learning, Khanmigo [T6][T9][T12] | Must |
| T-02 | Curriculum grounding (RAG) with citations | Answers from the institution's syllabus, notes, lectures | Coursera Coach, PW AI Guru, Gemini course uploads [T6][T14][T18] | Must |
| T-03 | Verified-solution grounding for STEM | Tutor reasons from a known-correct worked solution; maths checked by a tool/CAS | Harvard PS2 Pal [T24]; error data [T32] | Must for STEM |
| T-04 | Teacher-assigned, teacher-visible | Teacher scopes topics, sees transcripts, locks AI during assessments | Khanmigo, Schoology PowerBuddy, Blackboard AI Conversation [T3][L33][L35] | Must |
| T-05 | Safety moderation and adult alerts | Self-harm/harm classifier, alerts teacher/counselor/parent | Khanmigo, ChatGPT teen controls [T4][T11] | Must (minors) |
| T-06 | Practice and quiz generation | Questions on weak areas, teacher-approved | Khanmigo Practice My Knowledge, Coursera, Quizlet [T5][T14][T16] | Must |
| T-07 | Photo of homework (OCR) | Snap a problem, get scaffolded help | PW, Photomath, Lens [T17][T19] | Nice (high cheating risk; hint-only) |
| T-08 | Voice tutoring | Explain reasoning aloud | Synthesis, Duolingo, PW [T13][T19][T23] | Nice |
| T-09 | Multilingual / code-mixed (Hinglish) | Ask and learn in Indian languages | PW AI Guru, Schoology (5 languages) [T19][L35] | Must for India |
| T-10 | Memory of misconceptions | Remembers what the student struggles with | Study Mode memory [T9] | Nice (privacy-sensitive) |
| T-11 | Study plans | Breaks a goal into steps with check-ins | Guided Learning [T6] | Nice |
| T-12 | Interactive diagrams in chat | Draggable generated visuals | Khanmigo + Gemini [T5] | Nice |
| T-13 | Explain my answer | Explains why an answer was wrong | Duolingo, Moodle "Explain" [T13][L36] | Nice |

Evidence-backed principles:
1. Guardrails beat raw access: unrestricted GPT-4 cut exam scores 17%; the hint-only version avoided the harm [T25][E9].
2. Ground in verified solutions and step the problem: Harvard RCT showed median gains over 2x active learning, in less time (single course, short study) [T1][T24].
3. Structure use with a teacher in the loop: Nigeria RCT +0.31 SD at ~$48/student [T26][T27].
4. AI can coach the human too: Stanford Tutor CoPilot +4 pp mastery, +9 pp for weaker tutors [T28][T29].
5. Design against the LearnLM pedagogy rubric: active learning, cognitive load, metacognition, curiosity, adaptivity [T8][T30].

Risks: 47% of student chats with Claude were direct answer requests [T31]; 32% of ChatGPT maths hints had errors [T32]; photo solvers drive cheating (Google paused a Lens homework button) [T17].

## 3. Teaching in three formats: video, animation, docs

Recommended architecture [F18][F21]: one **lesson spec** per syllabus node (objectives, explanation, worked examples, checks), grounded in the institution's sources and approved by a teacher, then rendered per format. Pre-generate and cache slow formats; generate text on demand. Cache key: topic + grade + language + format + source version. Store the generated script/Manim code so re-renders cost no new LLM calls.

| ID | Format | MVP approach | Later approach | Cost / latency | Key risks |
|---|---|---|---|---|---|
| F-01 | Docs: notes, summaries, worked examples | On-demand from syllabus RAG with mandatory citations, cached per topic and grade [F4] | Verifier pass (second model checks claims), CAS-checked maths | Seconds, token cost only | Hallucination if ungrounded |
| F-02 | Flashcards, mind maps, quizzes | Generated from the lesson spec, teacher-approvable [F4] | Spaced-repetition scheduling (see E-02) | Seconds | Low |
| F-03 | Animations | Curated sims where licensed + LLM filling a **constrained component library** (graphs, vectors, circuits) in a sandboxed iframe [F22] | Offline Manim agent pipeline: plan, code, render, vision check, teacher approval; cached library [F17][F18][F20] | Manim: 15-120 s per scene, CPU only; one bad script took 51 min, so timeouts [F18] | Silent maths errors that render cleanly, layout overlaps, arbitrary code execution (sandbox) |
| F-04 | Video lessons | Link curated videos per topic + short narrated-slide or avatar videos made in batch from approved scripts [F5][F6] | Script to Manim/slides + TTS pipeline, cached [F19] | Avatar API ~$1-5/min (unverified pricing); TEA pipeline max $4.67 per video; Veo ~$24/min standard [F6][F9][F19] | Per-minute cost at scale, avatar likeness/consent, vendor churn (Sora shut down 2026 [F10]) |
| F-05 | Pixel text-to-video (Veo) for teaching | **Do not use** for explanations; on-screen text legibility ~0.4 and poor physics accuracy [F11][F12] | Decorative B-roll only | $0.05-0.40/s [F9] | Teaches wrong things convincingly |

Licensing is a hard constraint for a paid product [F13][F14][F15][F16]: Khan Academy and OpenStax are CC BY-NC-SA (non-commercial; OpenStax has a reuse request route); CK-12 forbids commercial use and forbids using its content to build AI; PhET sims after 2026-03-29 are CC BY-NC (older ones CC BY); GeoGebra is non-commercial. Plan on our own generated content plus links, or budget for licences.

## 4. Engagement and learning science

| ID | Feature | Evidence | Tier |
|---|---|---|---|
| E-01 | Mastery-based progression | Khan Academy: 30+ min/week linked to ~20% above expected gains (correlational) [E7] | Must |
| E-02 | Spaced retrieval practice | Meta-analysis g=0.74 vs massed practice; uniform spacing is fine [E6] | Must |
| E-03 | Diagnostic test + prerequisite graph, teacher can override | Adaptive systems' results vary by implementation (ALEKS, Squirrel AI evidence mostly vendor-funded) [E8] | Recommended |
| E-04 | Forgiving streaks (by school week, freezes, holidays) | Duolingo: 7-day streak learners 3.6x more likely to finish; streak loss can make users quit [E4] | Recommended |
| E-05 | Student-set modest goals and study planner | Ambitious daily goals reduced retention [E4] | Recommended |
| E-06 | Progress vs your own past (mastery map) | Self-comparison supports hope even in low performers [E3] | Must |
| E-07 | Badges for effort and mastery | Gamification helps on average, very heterogeneous [E1][E2] | Nice |
| E-08 | Reminders under quiet hours, no loss-framed nudges | UK Children's Code Std 13 [E5] | Must |

## 5. Accessibility and inclusion

| ID | Feature | Evidence | Tier |
|---|---|---|---|
| A-01 | WCAG 2.2 AA incl. target size 24px, accessible authentication (magic link/QR for young children) | [E10]; US ADA Title II deadlines Apr 2027/2028 [E11] | Must |
| A-02 | Captions + transcripts on all video, read-aloud (TTS) | Canvas Studio auto-captions ~85% [L14]; Immersive Reader common [L25] | Must |
| A-03 | Adjustable spacing and font choice (not "dyslexia fonts") | Dyslexia fonts show no gain; spacing helps [E12] | Must |
| A-04 | Indian languages (Bhashini) with human review | DIKSHA 36 languages [E14] | Must for India |
| A-05 | Mobile-first, low bandwidth, offline packs, QR-linked textbooks | 89% rural teens have a phone at home, only 31% own one [E13]; DIKSHA model [E14] | Must for India |
| A-06 | Fast profile switching on shared phones, no persistent sessions | Shared devices [E13] | Recommended |

## 6. Safety, privacy and compliance (non-optional for minors)

| ID | Requirement | Source |
|---|---|---|
| C-01 | Age assurance; verifiable parental consent (US under 13; India under 18 from ~May 2027, DigiLocker-grade, not a tick box) | COPPA [E15]; DPDP Rules 2025 [E18] |
| C-02 | No training on student data, including LLM subprocessors; zero-retention API settings | COPPA [E15]; FERPA school-official exception [E16] |
| C-03 | High-privacy defaults; no behavioural ads or profiling outside learning | UK Children's Code [E5]; DPDP s.9 [E18] |
| C-04 | Written retention/deletion policy for chat logs; written security program | COPPA amended rule [E15] |
| C-05 | Tell students up front that teachers/parents can see chats; tenant- and role-scoped logs | Khanmigo benchmark [E20] |
| C-06 | Input/output moderation; flagged chats alert teacher, counselor, parent in order | [E20][E21] |
| C-07 | Published self-harm protocol, crisis lines by locale, referral logging | California SB 243 (in force Jan 2026) [E21] |
| C-08 | AI disclosure, break reminder within 3 h, daily caps, quiet hours | SB 243 [E21]; Khanmigo caps [E20] |
| C-09 | Hint-first pedagogy, answers withheld on graded work, AI lockable during assessments | PNAS RCT [E9] |
| C-10 | No companion personas or emotional-bond design | FTC 6(b) inquiry [E22]; Character.AI under-18 ban [E23] |
| C-11 | EU only: risk management, logging and human oversight for AI that assesses learning, by Dec 2027 | EU AI Act Annex III [E19] |

## 7. Avoid list

- Public class-wide leaderboards (anxiety, lower motivation for weaker students) [E1][E3]
- Default predicted grades, class rank, time-on-task as judgement [E3]
- Unrestricted "give me the answer" AI [E9][T25]
- Pixel text-to-video as the teaching medium [F11][F12]
- Marketing "dyslexia fonts" [E12]
- Companion or persona chatbots, engagement-maximising chat [E22][E23]
- Loss-framed nudges and notification floods [E5][L37]

## 8. Suggested bundles (for discussion, not decided)

- **Phase 1, student core (makes the portal a real LMS):** S-01, S-03, S-04, S-05, S-06, S-07, S-08, S-09, S-12, E-06, E-08, A-01, A-02, A-03, C-01 to C-05.
- **Phase 2, AI tutor MVP:** T-01, T-02, T-03, T-04, T-05, T-06, T-09, F-01, F-02, F-03 (component library + curated sims), F-04 (curated links + batch narrated-slide videos), C-06 to C-10, E-01, E-02.
- **Phase 3, depth:** S-10, S-11, S-13, S-14, E-03, E-04, E-05, T-07, T-08, T-10 to T-13, F-03/F-04 full pipelines, A-04 to A-06, S-16 to S-18.

## 9. Decisions needed

1. **Audience and market:** K-12 (minors), higher-ed, or both; India-first or global? This decides consent flows, languages and offline needs.
2. **Who authors content:** schools upload their own syllabus/material (RAG source), EduBot ships a generated library, or both. Paid product means licensing limits on Khan/OpenStax/CK-12.
3. **Video ambition for v1:** curated links + narrated slides (cheap, safe) vs a full generated-video pipeline (expensive, slower to build).
4. **Model/vendor:** which LLM(s), with contractual no-training and zero-retention terms.
5. **Scope documents:** PRODUCT.md and AGENTS.md currently list "LMS, AI features" as out of scope; they need updating once features are chosen.

## Sources

Track L (LMS dashboards):
L1 help.ohio.edu Canvas dashboard; servicedesk.shu.edu Canvas To Do | L2 docs.moodle.org/502/en/Dashboard | L3 sites.google.com Classroom student view | L4 support.google.com/edu/classroom/answer/17231999 | L5 vanderbilt.edu Brightspace Dec 2025 | L6 buffalo.edu/lms/pulse.html | L7 intercom.help Schoology student home; fcps.edu/schoology | L8 bu.edu Blackboard Activity Stream | L9 moodledev.io/general/releases/5.0 | L10 support.google.com/edu/classroom/answer/9335967 | L11 support.microsoft.com Teams grades and insights | L12 itd.sandiegounified.org PowerSchool app | L13 help.anthology.com Blackboard app grades | L14 k-state.edu Canvas LMG; lms.tamu.edu MasteryPaths; athelp.sfsu.edu Canvas Studio captions | L15 docs.moodle.org badges, competencies | L17 apps.apple.com Teachmint | L18 Canvas Roll Call; uvm.edu Brightspace attendance; Moodle Attendance | L19 infocanvas.upenn.edu; support.wharton.upenn.edu | L20 saisd.org parent portal | L21 Brightspace awards ePortfolio | L22 instructure.com offline press release; Canvas Parent app | L23 docs.moodle.org app offline features | L24 support.google.com/edu/classroom/answer/11015503 | L25 support.canvas.fsu.edu Immersive Reader; readspeaker.com | L26 kb.siue.edu Ally | L27 techcommunity.microsoft.com Aug 2025; microsoft.com/en-us/education/blog/2026/06 | L28 workspaceupdates.googleblog.com 2026/06 Read Along | L29 workspaceupdates 2025/09 Gems and notebooks | L30 workspaceupdates 2026/04 NotebookLM in Classroom | L31 instructure.com InstructureCon 2025; sites.udel.edu IgniteAI | L33 tips.uark.edu; ecampus.uconn.edu AI Conversation | L34 learnwise.ai D2L partnership | L35 powerschool.com AI multilingual | L36 docs.moodle.org AI subsystem; blogs.nottingham.ac.uk | L37 columbiachronicle.com; capterra Canvas reviews; ecampus.oregonstate.edu 2026/07 | L38 cat.xula.edu; capterra Brightspace

Track T (AI tutors):
T1 impactaieducation.substack.com Harvard RCT | T2 khanmigo.ai/pricing | T3 support.khanacademy.org chat history | T4 therundown.ai/tools/khanmigo | T5 blog.khanacademy.org Google.org partnership | T6 blog.google Guided Learning | T7 engadget Guided Learning | T8 arxiv.org/pdf/2412.16429 (LearnLM) | T9 venturebeat Study Mode | T11 bitdefender ChatGPT parental controls | T12 venturebeat Claude Learning Mode; bgr.com | T13 beginnersinai.org Duolingo Max | T14 Coursera Coach (tolky.to) | T15 news.umich.edu Coursera Coach | T16 quizgecko.com; nibble-app.com Quizlet | T17 calmatters.org 2025/11 AI cheating | T18 microsoft.com aifirstmovers physicswallah | T19 onlinecoaching4u.in PW AI Guru | T21 digitalterminal.in Vedantu | T22 yourstory.com 2023/06 | T23 homeschoolfox.com Synthesis | T24 barrisreview.com Harvard RCT | T25 pnas.org/doi/10.1073/pnas.2422633122 | T26 openknowledge.worldbank.org Nigeria | T27 voxdev.org Nigeria | T28 arxiv.org/pdf/2410.03017 | T29 nssa.stanford.edu Tutor CoPilot | T30 arxiv.org/pdf/2407.12687 | T31 Anthropic education report (x.com/AnthropicAI); pblfuturelabs | T32 hechingerreport.org AI hallucinations math | T33 arxiv.org/html/2606.03822

Track F (formats):
F1 buildfastwithai NotebookLM cinematic; eesel.ai | F2 techcrunch 2025/05 NotebookLM video | F3 docs.cloud.google.com NotebookLM Enterprise audio API | F4 workspaceupdates 2025/09 flashcards; blog.google NotebookLM student features | F5 synthesia.io/pricing | F6 help.heygen.com; g2.com HeyGen API | F7 workspaceupdates 2026/05 Vids avatars | F8 colossyan.com SCORM | F9 ai.google.dev/gemini-api/docs/pricing | F10 techcrunch 2026/03/24 Sora shutdown | F11 arxiv.org/pdf/2605.16223 | F12 arxiv.org/abs/2601.00943 PhyEduVideo | F13 support.khanacademy.org licensing | F14 phet.colorado.edu/en/licensing; PhET Impact Report 2025; geogebra.org/license | F15 info.ck12.org license and terms; help.openstax.org commercial use | F16 help.openstax.org licensing | F17 arxiv.org/abs/2502.19400 TheoremExplainAgent (ACL 2025) | F18 mcpservers.org manim-video; jdhwilkins.com; github.com/makefinks/manim-generator | F19 docs.buildbleu.com; arxiv.org/pdf/2510.01174 | F20 github.com/HarleyCoops/Math-To-Manim; github.com/marcelo-earth/generative-manim | F21 edtechinnovationhub.com Khan + Gemini 2026 | F22 workspaceupdates 2026/08 Gemini interactive simulations

Track E (engagement, accessibility, safety):
E1 onlinelibrary.wiley.com/doi/10.1002/pits.70056 | E2 bera-journals bjet.13471; sagepub 2026 | E3 sciencedirect S2666557323000083; summit.sfu.ca | E4 oulurepo.oulu.fi 2025 thesis; strivecloud.io Duolingo | E5 ico.org.uk Children's Code Std 13 and edtech | E6 eric.ed.gov EJ1310148; springer s40594-024-00468-5 | E7 blog.khanacademy.org efficacy Nov 2024 | E8 files.eric.ed.gov EJ1317941; technologyreview 2019 Squirrel AI; PMC12580086 | E9 hamsabastani.github.io education_llm.pdf; Wharton | E10 audioeye.com WCAG 2.2 | E11 nysba.org; venable.com 2026/04 ADA Title II | E12 PMC5629233; adrianroselli.com | E13 theprint.in ASER 2024 | E14 unesco.org DIKSHA; pib.gov.in 2182427 | E15 finnegan.com COPPA amended; davispolk.com | E16 ed.gov student privacy; promise.legal | E17 gdpr-info.eu art 8 | E18 sansalegal.com DPDP consent; matters.ai; raysolute.com | E19 gibsondunn.com EU AI Act omnibus; uniwise.eu | E20 support.khanacademy.org; cbsnews 60 Minutes | E21 legiscan.com CA SB243; joneswalker.com; troutmanprivacy.com 2026/01 | E22 ftc.gov 2025/09 AI companions inquiry | E23 cnbc.com 2025/11 Character.AI; techpolicy.press; time.com

## Methodology and limits

Four parallel research agents used web search and page fetches (the skill's preferred Firecrawl/Exa tools were not installed). Sub-questions: LMS student features; AI tutor products and evidence; multi-format content generation feasibility and licensing; engagement, learning science, accessibility and compliance for minors. All fetched content was treated as untrusted data.

Unverified or flagged: several prices (HeyGen, Synthesia, Synthesis, Khanmigo district pricing); avatar and Veo latency; Gemini simulation accuracy; scope of India's DPDP school exemption; whether California SB 243 covers curriculum tutors; FERPA guidance on model training; Tele-MANAS number; FSRS efficacy; Duolingo internal metrics (second-hand). Harvard RCT details come from secondary write-ups (paper behind login). Not legal advice: compliance items need review by counsel before launch.
