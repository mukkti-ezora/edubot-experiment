/** Practice: quizzes, mock tests, past papers, attempts and their analysis, AI practice and the review deck. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatScore } from "@/lib/format";
import { api } from "./api";

export type AssessmentKind = "quiz" | "mock" | "past_paper" | "practice" | "exam_check";
export type AssessmentStatus = "open" | "upcoming" | "closed";
export type QuestionKind = "single" | "multiple" | "numeric" | "true_false";

export interface Marking {
  correct: number;
  wrong: number;
}

export interface AssessmentSummary {
  id: string;
  title: string;
  kind: AssessmentKind;
  courseId: string;
  courseCode: string;
  subject: string;
  durationMinutes: number | null;
  questionCount: number;
  opensAt: string | null;
  closesAt: string | null;
  status: AssessmentStatus;
  attemptsUsed: number;
  attemptsLeft: number | null;
  inProgressAttemptId: string | null;
  best: { attemptId: string; score: number; maxScore: number } | null;
  countsTowardGrade: boolean;
  tutorAllowed: boolean;
  marking: Marking;
  personal: boolean;
}

export interface TopicPractice {
  id: string;
  title: string;
  courseId: string;
  courseCode: string;
  questionCount: number;
  answered: number;
  accuracy: number | null;
}

export interface PracticeHubData {
  assessments: AssessmentSummary[];
  improvementSets: AssessmentSummary[];
  review: { dueToday: number; total: number };
  topics: TopicPractice[];
}

export interface AssessmentDetail extends AssessmentSummary {
  instructions: string;
  sections: { title: string; questionCount: number }[];
  attempts: { id: string; number: number; status: string; score: number | null; maxScore: number | null; submittedAt: string | null }[];
}

export interface Option {
  id: string;
  text: string;
}

export type AnswerResponse = { options: string[] } | { value: number };

export interface PlayerQuestion {
  id: string;
  position: number;
  kind: QuestionKind;
  stem: string;
  options: Option[];
  sourceLabel: string | null;
  response: AnswerResponse | null;
  markedForReview: boolean;
  timeSeconds: number;
}

export interface AttemptInProgress {
  id: string;
  assessmentId: string;
  title: string;
  kind: AssessmentKind;
  status: "in_progress";
  number: number;
  startedAt: string;
  deadlineAt: string | null;
  serverNow: string;
  tutorAllowed: boolean;
  marking: Marking;
  sections: { title: string; questions: PlayerQuestion[] }[];
}

export interface Breakdown {
  title: string;
  id?: string;
  correct: number;
  wrong: number;
  skipped: number;
  score: number;
  attempted: number;
  accuracy: number | null;
}

export interface ReviewedQuestion {
  id: string;
  position: number;
  section: string;
  kind: QuestionKind;
  stem: string;
  options: Option[];
  response: AnswerResponse | null;
  correctAnswer: { options?: string[]; value?: number; tolerance?: number };
  isCorrect: boolean | null;
  marks: number;
  explanation: string;
  timeSeconds: number;
  topic: { id: string; title: string } | null;
  sourceLabel: string | null;
}

export interface AttemptResult {
  id: string;
  assessmentId: string;
  title: string;
  kind: AssessmentKind;
  status: "submitted";
  number: number;
  submittedAt: string | null;
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  skipped: number;
  accuracy: number | null;
  timeSpentSeconds: number;
  rank: Rank | null;
  sections: Breakdown[];
  topics: Breakdown[];
  speed: { medianSeconds: number | null; quadrants: { fastRight: number; slowRight: number; fastWrong: number; slowWrong: number } };
  behaviour: { answersChanged: number; markedForReviewLeft: number; secondsOnWrong: number };
  reviewAvailable: boolean;
  reviewAvailableAt: string | null;
  questions: ReviewedQuestion[];
}

export type AttemptView = AttemptInProgress | AttemptResult;

export interface ReviewCard {
  id: string;
  front: string;
  back: string;
  courseCode: string;
  subject: string;
  topic: { id: string; title: string } | null;
  isNew: boolean;
  dueAt: string | null;
  source: string;
}

export type Rating = "again" | "hard" | "good" | "easy";

export interface TeacherAssessment {
  id: string;
  title: string;
  kind: AssessmentKind;
  courseCode: string;
  subject: string;
  status: AssessmentStatus;
  questionCount: number;
  attempts: number;
  averagePercent: number | null;
  opensAt: string | null;
  closesAt: string | null;
}

export interface TeacherResults {
  id: string;
  title: string;
  kind: AssessmentKind;
  courseCode: string;
  averagePercent: number | null;
  students: { rank: number; personId: string; name: string; score: number | null; maxScore: number | null; percent: number | null; submittedAt: string | null }[];
  weakTopics: { id: string; title: string; answered: number; accuracy: number | null }[];
}

const keys = {
  hub: ["practice", "hub"] as const,
  assessment: (id: string) => ["practice", "assessment", id] as const,
  attempt: (id: string) => ["practice", "attempt", id] as const,
  review: ["practice", "review"] as const,
  teacher: ["practice", "teacher"] as const,
  teacherResults: (id: string) => ["practice", "teacher", id] as const,
};

export const usePracticeHub = () =>
  useQuery({ queryKey: keys.hub, queryFn: () => api<PracticeHubData>("/api/v1/student/practice") });

export const useAssessment = (id: string | null) =>
  useQuery({ queryKey: keys.assessment(id ?? ""), enabled: !!id, queryFn: () => api<AssessmentDetail>(`/api/v1/student/assessments/${id}`) });

export const useAttempt = (id: string) =>
  useQuery({ queryKey: keys.attempt(id), enabled: !!id, queryFn: () => api<AttemptView>(`/api/v1/student/attempts/${id}`) });

export function useStartAttempt() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (assessmentId: string) => api<AttemptInProgress>(`/api/v1/student/assessments/${assessmentId}/attempts`, { method: "POST", body: "{}" }),
    onSuccess: (attempt) => {
      client.setQueryData(keys.attempt(attempt.id), attempt);
      void client.invalidateQueries({ queryKey: keys.hub });
    },
  });
}

export interface AnswerPayload {
  response: AnswerResponse | null;
  markedForReview: boolean;
  timeSeconds: number;
}

export const saveAnswer = (attemptId: string, questionId: string, payload: AnswerPayload) =>
  api<{ questionId: string; saved: boolean }>(`/api/v1/student/attempts/${attemptId}/answers/${questionId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export function useSubmitAttempt(attemptId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<AttemptResult>(`/api/v1/student/attempts/${attemptId}/submit`, { method: "POST", body: "{}" }),
    onSuccess: (result) => {
      client.setQueryData(keys.attempt(attemptId), result);
      void client.invalidateQueries({ queryKey: keys.hub });
      void client.invalidateQueries({ queryKey: ["progress"] });
    },
  });
}

export function useImprovementSet(attemptId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<AssessmentSummary>(`/api/v1/student/attempts/${attemptId}/improvement-set`, { method: "POST", body: "{}" }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.hub }),
  });
}

/** A private set of up to 10 bank questions (teacher-written or past papers) on one topic. No AI involved. */
export function useBankPractice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (topicId: string) => api<AssessmentSummary>(`/api/v1/student/topics/${topicId}/bank-practice`, { method: "POST", body: "{}" }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.hub }),
  });
}

export function useAiPractice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (topicId: string) => api<AssessmentSummary>(`/api/v1/student/topics/${topicId}/ai-practice`, { method: "POST", body: "{}" }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.hub }),
  });
}

export function useAiFlashcards() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (lessonId: string) => api<{ cards: ReviewCard[] }>(`/api/v1/student/lessons/${lessonId}/flashcards`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.review });
      void client.invalidateQueries({ queryKey: keys.hub });
    },
  });
}

export const useReviewDue = () =>
  useQuery({ queryKey: keys.review, queryFn: () => api<{ cards: ReviewCard[]; dueToday: number; total: number }>("/api/v1/student/review/due"),
    refetchOnWindowFocus: false });  // a refetch mid-session would reshuffle the cards being reviewed

export function useRateCard() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, rating }: { cardId: string; rating: Rating }) =>
      api<{ cardId: string; dueAt: string; intervalDays: number }>(`/api/v1/student/review/${cardId}`, {
        method: "POST",
        body: JSON.stringify({ rating }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.hub });
      // Mark the deck stale without refetching mid-session; it reloads the next time the deck opens.
      void client.invalidateQueries({ queryKey: keys.review, refetchType: "none" });
    },
  });
}

export const useTeacherAssessments = () =>
  useQuery({ queryKey: keys.teacher, queryFn: () => api<{ assessments: TeacherAssessment[] }>("/api/v1/teacher/assessments") });

export const useTeacherResults = (id: string) =>
  useQuery({ queryKey: keys.teacherResults(id), enabled: !!id, queryFn: () => api<TeacherResults>(`/api/v1/teacher/assessments/${id}/results`) });

export const isInProgress = (view: AttemptView): view is AttemptInProgress => view.status === "in_progress";

/* ---------- pure helpers (tested) ---------- */

export const KIND_LABELS: Record<AssessmentKind, string> = {
  quiz: "Quiz",
  mock: "Mock test",
  past_paper: "Past paper",
  practice: "Practice set",
  exam_check: "Exam check",
};

/** "+4 / −1", or "+1 each, no negative marking". */
export function markingLabel(marking: Marking): string {
  const right = `+${formatScore(marking.correct)}`;
  if (marking.wrong === 0) return `${right} each, no negative marking`;
  return `${right} / −${formatScore(Math.abs(marking.wrong))}`;
}


export type PaletteState = "not_visited" | "not_answered" | "answered" | "marked" | "answered_marked";

/** Where a question stands in the test palette. Visiting without answering is "not answered". */
export function paletteState(question: Pick<PlayerQuestion, "response" | "markedForReview">, visited: boolean): PaletteState {
  const answered = question.response !== null;
  if (question.markedForReview) return answered ? "answered_marked" : "marked";
  if (answered) return "answered";
  return visited ? "not_answered" : "not_visited";
}

export const PALETTE_LABELS: Record<PaletteState, string> = {
  not_visited: "Not visited",
  not_answered: "Not answered",
  answered: "Answered",
  marked: "Marked for review",
  answered_marked: "Answered and marked",
};

export interface PaletteCounts {
  answered: number;
  marked: number;
  notAnswered: number;
}

/** The summary shown before submitting. Answered-and-marked answers still count as answered. */
export function paletteCounts(states: PaletteState[]): PaletteCounts {
  return {
    answered: states.filter((s) => s === "answered" || s === "answered_marked").length,
    marked: states.filter((s) => s === "marked" || s === "answered_marked").length,
    notAnswered: states.filter((s) => s === "not_visited" || s === "not_answered" || s === "marked").length,
  };
}

/** "1:05:09" for an hour or more, "04:09" below. Negative input reads as zero. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export const WARNING_SECONDS = [5 * 60, 60] as const;

export type TimerLevel = "calm" | "warn" | "urgent";

/** Calm until five minutes remain, warn until the last minute, then urgent. */
export function timerLevel(secondsLeft: number): TimerLevel {
  if (secondsLeft <= WARNING_SECONDS[1]) return "urgent";
  if (secondsLeft <= WARNING_SECONDS[0]) return "warn";
  return "calm";
}

/** The warning to announce when the countdown crosses a threshold between two ticks, if any. */
export function crossedWarning(previous: number, current: number): string | null {
  if (previous > WARNING_SECONDS[1] && current <= WARNING_SECONDS[1]) return "One minute left. Your answers are saved.";
  if (previous > WARNING_SECONDS[0] && current <= WARNING_SECONDS[0]) return "Five minutes left.";
  return null;
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/** "12th of 31, 64th percentile". */
/** Position among first attempts in the class; tied students share a position and count half in the percentile. */
export interface Rank {
  position: number;
  of: number;
  tiedWith: number;
  percentile: number;
}

export function rankText(rank: Rank): string {
  const place = rank.tiedWith > 0
    ? `Joint ${ordinal(rank.position)} of ${rank.of} (level with ${rank.tiedWith} ${rank.tiedWith === 1 ? "other" : "others"})`
    : `${ordinal(rank.position)} of ${rank.of}`;
  return `${place}, ${ordinal(Math.round(rank.percentile))} percentile`;
}

/** Human length of a stretch of time: "45 s", "12 min", "1 h 05 min". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/** Next review interval as a person would say it. */
export function intervalText(days: number): string {
  if (days < 1 / 24) return "in a few minutes";
  if (days < 1) return "later today";
  const rounded = Math.round(days);
  return rounded === 1 ? "tomorrow" : `in ${rounded} days`;
}

/** Whether the student's response matches; used only to label the review list. */
export function describeResponse(question: Pick<ReviewedQuestion, "kind" | "options" | "response">): string {
  const response = question.response;
  if (response === null) return "Not answered";
  if ("value" in response) return String(response.value);
  const texts = question.options.filter((o) => response.options.includes(o.id)).map((o) => o.text);
  return texts.join(", ") || "Not answered";
}

export function describeCorrect(question: Pick<ReviewedQuestion, "kind" | "options" | "correctAnswer">): string {
  const key = question.correctAnswer;
  if (question.kind === "numeric") {
    return key.tolerance ? `${key.value} (within ${key.tolerance})` : String(key.value);
  }
  return question.options.filter((o) => key.options?.includes(o.id)).map((o) => o.text).join(", ");
}
