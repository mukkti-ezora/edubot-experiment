/** Coursework: assignments, submissions, extension requests and teacher grading. Served by the learning service. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { AttachmentMeta } from "./files";

export type AssignmentStatus = "not_started" | "draft" | "submitted" | "late" | "graded" | "missing";
export type SubmissionType = "text" | "link" | "file";
export type ExtensionStatus = "pending" | "approved" | "declined";

export interface Extension {
  id: string;
  status: ExtensionStatus;
  until: string;
  reason: string;
  autoApproved: boolean;
  note: string | null;
  createdAt: string;
}

export interface AssignmentSummary {
  id: string;
  title: string;
  kind: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  subject: string;
  points: number;
  dueAt: string;
  effectiveDueAt: string;
  closesAt: string;
  status: AssignmentStatus;
  score: number | null;
  lateMinutes: number;
  feedbackReady: boolean;
  extension: Extension | null;
}

export interface RubricCriterion {
  criterion: string;
  description?: string;
  points: number;
}

export interface RubricScore {
  criterion: string;
  points: number;
}

export interface SubmissionDetail {
  id: string;
  status: "draft" | "submitted" | "graded";
  text: string;
  link: string | null;
  attachments: AttachmentMeta[];
  revision: number;
  lateMinutes: number;
  submittedAt: string | null;
  updatedAt: string;
  score: number | null;
  feedback: string | null;
  rubricScores: RubricScore[];
  gradedAt: string | null;
}

export interface AssignmentDetail extends AssignmentSummary {
  instructions: string;
  submissionTypes: SubmissionType[];
  rubric: RubricCriterion[];
  gradeCategory: string;
  latePenaltyPercentPerDay: number;
  acceptsLateDays: number;
  maxResubmissions: number;
  resubmissionsLeft: number;
  submission: SubmissionDetail | null;
  extensions: Extension[];
}

export interface AssignmentList {
  items: AssignmentSummary[];
  counts: Partial<Record<AssignmentStatus, number>>;
}

export interface WorkInput {
  text: string;
  link: string | null;
  attachmentIds: string[];
}

export type GradingTab = "to_grade" | "graded";

export interface SubmissionRow {
  id: string;
  status: "submitted" | "graded";
  student: { id: string; name: string };
  assignment: { id: string; title: string; points: number; dueAt: string };
  courseCode: string;
  submittedAt: string;
  lateMinutes: number;
  revision: number;
  score: number | null;
}

export interface SubmissionQueue {
  items: SubmissionRow[];
  counts: { toGrade: number; graded: number };
}

export interface GradingDetail extends Omit<SubmissionRow, "assignment"> {
  assignment: SubmissionRow["assignment"] & {
    instructions: string;
    rubric: RubricCriterion[];
    latePenaltyPercentPerDay: number;
  };
  work: SubmissionDetail;
}

export interface GradeInput {
  rubricScores: RubricScore[];
  score: number | null;
  feedback: string;
}

// ---- rules (mirroring services/learning/coursework.py so previews match what the server records) ----

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60_000;
const MAX_PENALTY_PERCENT = 100;

/** Days counted for a late penalty: every started day after the deadline. */
export function lateDays(lateMinutes: number): number {
  return Math.ceil(Math.max(0, lateMinutes) / MINUTES_PER_DAY);
}

export function latePenaltyPercent(lateMinutes: number, percentPerDay: number): number {
  return Math.min(MAX_PENALTY_PERCENT, lateDays(lateMinutes) * percentPerDay);
}

/** Whole minutes past the deadline, rounded up; handing in exactly on time is not late. */
export function minutesLate(dueIso: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((now.getTime() - new Date(dueIso).getTime()) / MS_PER_MINUTE));
}

/** "This will be 2 days late. A 20% penalty applies." or null when on time. */
export function lateWarning(dueIso: string, percentPerDay: number, now: Date = new Date()): string | null {
  const minutes = minutesLate(dueIso, now);
  if (minutes === 0) return null;
  const days = lateDays(minutes);
  const penalty = latePenaltyPercent(minutes, percentPerDay);
  const daysText = `${days} ${days === 1 ? "day" : "days"}`;
  return penalty > 0
    ? `This will be ${daysText} late. A ${penalty}% penalty applies (${percentPerDay}% per started day).`
    : `This will be ${daysText} late. No late penalty applies.`;
}

/** Score after the late penalty, never below zero, rounded to 2 places like the server. */
export function lateAdjusted(raw: number, lateMinutes: number, percentPerDay: number): number {
  return round2(Math.max(0, raw * (1 - (lateDays(lateMinutes) * percentPerDay) / 100)));
}

/** Rubric points scaled to the assignment's points. */
export function rubricTotal(rubric: RubricCriterion[], scores: RubricScore[], points: number): number {
  const max = rubric.reduce((sum, c) => sum + c.points, 0);
  if (max === 0) return 0;
  const given = scores.reduce((sum, s) => sum + (Number.isFinite(s.points) ? s.points : 0), 0);
  return round2((given / max) * points);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Only web links a browser can open; the server applies the same rule. */
export function isValidLink(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname.includes("."));
  } catch {
    return false;
  }
}

export function isHandedIn(submission: SubmissionDetail | null): boolean {
  return submission !== null && submission.status !== "draft";
}

// ---- hooks ----

const keys = {
  all: ["coursework"] as const,
  list: ["coursework", "assignments"] as const,
  one: (id: string) => ["coursework", "assignment", id] as const,
  queue: (tab: GradingTab) => ["coursework", "submissions", tab] as const,
  graded: (id: string) => ["coursework", "submission", id] as const,
};

const json = (body: unknown) => ({ body: JSON.stringify(body) });

export const useAssignments = (enabled = true) =>
  useQuery({ queryKey: keys.list, queryFn: () => api<AssignmentList>("/api/v1/student/assignments"), enabled });

export const useAssignment = (id: string) =>
  useQuery({
    queryKey: keys.one(id),
    queryFn: () => api<AssignmentDetail>(`/api/v1/student/assignments/${id}`),
    enabled: Boolean(id),
  });

/** Writes return the full assignment, so the page updates straight away; lists and Today refresh behind. */
function useAssignmentWrite<I>(id: string, request: (input: I) => Promise<AssignmentDetail>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (detail) => {
      client.setQueryData(keys.one(id), detail);
      void client.invalidateQueries({ queryKey: keys.list });
      void client.invalidateQueries({ queryKey: ["student", "today"] });
    },
  });
}

/** A draft save never replaces a handed-in version in the cache, even if its response arrives late. */
export function useSaveDraft(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkInput) =>
      api<AssignmentDetail>(`/api/v1/student/assignments/${id}/draft`, { method: "PUT", ...json(input) }),
    onSuccess: (detail) => {
      client.setQueryData<AssignmentDetail>(keys.one(id), (current) =>
        current && isHandedIn(current.submission) ? current : detail);
      void client.invalidateQueries({ queryKey: keys.list });
    },
  });
}

export const useSubmitWork = (id: string) =>
  useAssignmentWrite(id, (input: WorkInput) =>
    api<AssignmentDetail>(`/api/v1/student/assignments/${id}/submit`, { method: "POST", ...json(input) }));

export const useRequestExtension = (id: string) =>
  useAssignmentWrite(id, (input: { until: string; reason: string }) =>
    api<AssignmentDetail>(`/api/v1/student/assignments/${id}/extension`, { method: "POST", ...json(input) }));

export const useMarkFeedbackSeen = (id: string) =>
  useAssignmentWrite(id, () =>
    api<AssignmentDetail>(`/api/v1/student/assignments/${id}/feedback-seen`, { method: "POST", body: "{}" }));

export const useSubmissionQueue = (tab: GradingTab) =>
  useQuery({
    queryKey: keys.queue(tab),
    queryFn: () => api<SubmissionQueue>(`/api/v1/teacher/submissions?status=${tab}`),
    placeholderData: (previous) => previous,
  });

export const useGradingDetail = (id: string | null) =>
  useQuery({
    queryKey: keys.graded(id ?? ""),
    queryFn: () => api<GradingDetail>(`/api/v1/teacher/submissions/${id}`),
    enabled: Boolean(id),
  });

export function useGrade(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: GradeInput) =>
      api<GradingDetail>(`/api/v1/teacher/submissions/${id}/grade`, { method: "POST", ...json(input) }),
    onSuccess: (detail) => {
      client.setQueryData(keys.graded(id), detail);
      void client.invalidateQueries({ queryKey: ["coursework", "submissions"] });
    },
  });
}
