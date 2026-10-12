/** Progress: grades, what-if, CGPA, mastery and the credit tracker. Served by the learning service. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export interface ScaleStep {
  grade: string;
  min: number;
  point: number;
}

export interface CourseRef {
  id: string;
  code: string;
  title: string;
  subject: string;
  credits: number;
  category: string;
  term: string;
}

export interface CourseStanding extends CourseRef {
  percent: number | null;
  grade: string | null;
  gradePoint: number | null;
  gradedItems: number;
  feedbackReady: number;
}

export interface TermRecord {
  term: string;
  sgpa: number | null;
  credits: number;
  courses: { code: string; title: string; credits: number; grade: string; gradePoint: number; source: string }[];
}

export interface ProgressOverview {
  courses: CourseStanding[];
  feedbackReady: number;
  record: { cgpa: number | null; creditsEarned: number; terms: TermRecord[] };
  scale: ScaleStep[];
}

export interface CategoryStanding {
  name: string;
  weight: number;
  earned: number;
  max: number;
  percent: number | null;
}

export interface GradedItem {
  id: string;
  kind: "assignment" | "assessment";
  title: string;
  category: string;
  score: number;
  max: number;
  feedback: string | null;
  feedbackReady: boolean;
  gradedAt: string | null;
}

export interface CourseGradesData {
  course: CourseRef;
  percent: number | null;
  grade: string | null;
  gradePoint: number | null;
  categories: CategoryStanding[];
  items: GradedItem[];
  scale: ScaleStep[];
}

export type MasteryLevel = "not_started" | "attempted" | "familiar" | "proficient" | "mastered";

export interface TopicMastery {
  id: string;
  title: string;
  courseId: string;
  courseCode: string;
  subject: string;
  level: MasteryLevel;
  previousLevel: MasteryLevel;
  accuracy: number | null;
  answered: number;
}

export interface MasteryData {
  topics: TopicMastery[];
  lookbackDays: number;
  levels: MasteryLevel[];
}

export interface ExitPoint {
  credits: number;
  award: string;
  reached: boolean;
}

export interface MoocCourse {
  id: string;
  provider: string;
  title: string;
  weeks: number;
  credits: number;
  category: string;
  url: string;
  nextRun: string | null;
}

export type RequestStatus = "pending" | "approved" | "declined";

export interface Transfer {
  id: string;
  status: RequestStatus;
  scorePercent: number;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  course: MoocCourse;
  certificate: { id: string; filename: string; contentType: string; size: number } | null;
}

export type AbcStatus = "not_linked" | "pending" | "linked";

export interface AbcRecord {
  apaarId: string | null;
  status: AbcStatus;
  syncedAt: string | null;
  note: string;
}

export interface CreditsData {
  programme: { id: string; name: string; totalCredits: number; admittedYear: number };
  earned: number;
  inProgress: number;
  remaining: number;
  requirements: { category: string; required: number; earned: number; inProgress: number }[];
  exitPoints: ExitPoint[];
  nextExit: (Omit<ExitPoint, "reached"> & { creditsNeeded: number }) | null;
  abc: AbcRecord;
  mooc: { capPercent: number; term: string | null; termCredits: number; termCap: number; usedThisTerm: number };
  transfers: Transfer[];
}

export interface MoocCatalogue {
  courses: (MoocCourse & { requestStatus: RequestStatus | null })[];
  passPercent: number;
}

const keys = {
  overview: ["progress", "overview"] as const,
  course: (id: string) => ["progress", "course", id] as const,
  mastery: ["progress", "mastery"] as const,
  credits: ["progress", "credits"] as const,
  moocs: ["progress", "moocs"] as const,
};

export const useProgress = () =>
  useQuery({ queryKey: keys.overview, queryFn: () => api<ProgressOverview>("/api/v1/student/progress") });

export const useCourseGrades = (id: string) =>
  useQuery({ queryKey: keys.course(id), enabled: !!id,
    queryFn: () => api<CourseGradesData>(`/api/v1/student/progress/courses/${id}`) });

export const useMastery = () =>
  useQuery({ queryKey: keys.mastery, queryFn: () => api<MasteryData>("/api/v1/student/mastery") });

export const useCredits = () =>
  useQuery({ queryKey: keys.credits, queryFn: () => api<CreditsData>("/api/v1/student/credits") });

export const useMoocs = () =>
  useQuery({ queryKey: keys.moocs, queryFn: () => api<MoocCatalogue>("/api/v1/student/credits/moocs") });

export function useSetApaar() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (apaarId: string) =>
      api<AbcRecord>("/api/v1/student/credits/apaar", { method: "PUT", body: JSON.stringify({ apaarId }) }),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.credits }),
  });
}

export interface TransferInput {
  moocCourseId: string;
  scorePercent: number;
  certificateAttachmentId: string | null;
}

export function useRequestTransfer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: TransferInput) =>
      api<Transfer>("/api/v1/student/credits/transfers", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.credits });
      void client.invalidateQueries({ queryKey: keys.moocs });
    },
  });
}

/* ---------- grade maths (mirrors services/learning/progress.py) ---------- */

/** UGC choice-based credit system, 10-point scale. Cut-offs are inclusive: exactly 90 is an O. */
export const GRADE_SCALE: readonly ScaleStep[] = [
  { grade: "O", min: 90, point: 10 },
  { grade: "A+", min: 80, point: 9 },
  { grade: "A", min: 70, point: 8 },
  { grade: "B+", min: 60, point: 7 },
  { grade: "B", min: 50, point: 6 },
  { grade: "C", min: 45, point: 5 },
  { grade: "P", min: 40, point: 4 },
  { grade: "F", min: 0, point: 0 },
];

export function gradeFor(percent: number, scale: readonly ScaleStep[] = GRADE_SCALE): ScaleStep {
  const ordered = [...scale].sort((a, b) => b.min - a.min);
  return ordered.find((step) => percent >= step.min) ?? ordered[ordered.length - 1];
}

export interface WhatIfCategory {
  weight: number;
  /** Marks earned and available. A category with max 0 doesn't count (nothing graded or assumed yet). */
  earned: number;
  max: number;
}

/**
 * Weighted course percentage. Categories that don't count are left out and the remaining weights
 * re-normalised. The arithmetic follows services/learning/progress.py `course_percentage` step for step,
 * so an untouched what-if lands on exactly the server's figure, even at a grade boundary.
 */
export function whatIfPercent(categories: WhatIfCategory[]): number | null {
  const counted = categories.filter((c) => c.max > 0 && c.weight > 0);
  const totalWeight = counted.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight === 0) return null;
  return (counted.reduce((sum, c) => sum + (c.weight * c.earned) / c.max, 0) / totalWeight) * 100;
}

const SHOWN_DECIMALS = 1;

/**
 * A percentage rounded the way the server shows it (Python `round(x, 1)`): to the nearest tenth of the
 * exact value, with exact ties going to the even tenth. At one decimal, exact ties are the quarters (89.25).
 */
export function roundShown(percent: number): number {
  const isExactTie = Number.isInteger(percent * 4) && (percent * 4) % 2 !== 0;
  if (!isExactTie) return Number(percent.toFixed(SHOWN_DECIMALS));
  const lowerTenths = Math.floor(percent * 10);
  return (lowerTenths % 2 === 0 ? lowerTenths : lowerTenths + 1) / 10;
}

/** The grade for a percentage as it's shown, so the figure and the grade never disagree (89.96 shows 90.0: O). */
export const gradeForShown = (percent: number, scale: readonly ScaleStep[] = GRADE_SCALE): ScaleStep =>
  gradeFor(roundShown(percent), scale);

/* ---------- formatting ---------- */

export const formatPercent = (value: number | null): string =>
  value === null ? "Not graded" : `${roundShown(value).toFixed(SHOWN_DECIMALS)}%`;
export const formatGpa = (value: number | null): string => (value === null ? "Not yet" : value.toFixed(2));

export const MASTERY_LABEL: Record<MasteryLevel, string> = {
  not_started: "Not started",
  attempted: "Attempted",
  familiar: "Familiar",
  proficient: "Proficient",
  mastered: "Mastered",
};

export const masteryRank = (level: MasteryLevel): number =>
  (["not_started", "attempted", "familiar", "proficient", "mastered"] as MasteryLevel[]).indexOf(level);

const APAAR_DIGITS = 12;

/** Strips spaces and dashes; returns the 12 digits or an error to show. */
export function normaliseApaar(raw: string): { value: string; error: string | null } {
  const value = raw.replace(/[\s-]/g, "");
  if (!value) return { value, error: "Enter your APAAR ID." };
  if (!/^\d+$/.test(value)) return { value, error: "An APAAR ID has digits only." };
  if (value.length !== APAAR_DIGITS) return { value, error: `An APAAR ID is exactly ${APAAR_DIGITS} digits. You entered ${value.length}.` };
  return { value, error: null };
}
