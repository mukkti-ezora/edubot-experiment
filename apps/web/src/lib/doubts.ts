/** Doubts (a student asks the teacher of their class) and topic pages. Served by the learning service. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttachmentMeta } from "./files";
import { api } from "./api";
import type { LessonRow, Subject } from "./student";

export type DoubtStatus = "open" | "answered" | "resolved";
export type InboxFilter = DoubtStatus | "overdue" | "all";

export interface Ref {
  id: string;
  title: string;
}

export interface DoubtSummary {
  id: string;
  title: string;
  status: DoubtStatus;
  overdue: boolean;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  subject: Subject;
  topic: Ref | null;
  lesson: Ref | null;
  createdAt: string;
  updatedAt: string;
  replyDueAt: string;
  resolvedAt: string | null;
  messageCount: number;
  lastMessage: { authorRole: "student" | "teacher"; preview: string } | null;
}

export interface DoubtMessage {
  id: string;
  authorRole: "student" | "teacher";
  authorName: string | null;
  body: string;
  createdAt: string;
  attachments?: AttachmentMeta[];
}

/** A follow-up or reply: text plus any uploaded photos or PDFs. */
export interface MessageInput {
  body: string;
  attachmentIds?: string[];
}

export interface DoubtDetail extends DoubtSummary {
  videoSeconds: number | null;
  conversationId: string | null;
  messages: DoubtMessage[];
}

export interface Student {
  id: string;
  name: string;
}

export type ClassDoubtSummary = DoubtSummary & { student: Student };

export interface ClassDoubtDetail extends DoubtDetail {
  student: Student;
  tutorTranscript: { role: "user" | "assistant"; content: string; createdAt: string }[];
}

export interface MyDoubts {
  items: DoubtSummary[];
  counts: Record<DoubtStatus, number>;
  /** The institution's reply target, so what students are promised matches the server's config. */
  replyTargetHours: number;
}

export interface Inbox {
  items: ClassDoubtSummary[];
  counts: Record<DoubtStatus | "overdue", number>;
  insights: {
    avgFirstResponseHours: number | null;
    topTopics: (Ref & { count: number })[];
    windowDays: number;
  };
}

export interface TopicDetail {
  id: string;
  title: string;
  summary: string;
  course: { id: string; code: string; title: string; subject: Subject };
  lessons: LessonRow[];
  progress: { completed: number; total: number };
  doubts: DoubtSummary[];
}

export interface AskInput {
  lessonId?: string;
  courseId?: string;
  topicId?: string;
  title: string;
  body: string;
  conversationId?: string | null;
  attachmentIds?: string[];
}

const keys = {
  mine: (status?: DoubtStatus) => ["doubts", "mine", status ?? "all"] as const,
  doubt: (id: string) => ["doubts", "doubt", id] as const,
  inbox: (filter: InboxFilter) => ["doubts", "inbox", filter] as const,
  classDoubt: (id: string) => ["doubts", "class", id] as const,
  topic: (id: string) => ["student", "topic", id] as const,
};

const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });
const query = (status?: string) => (status ? `?status=${encodeURIComponent(status)}` : "");

export const useMyDoubts = (status?: DoubtStatus) =>
  useQuery({
    queryKey: keys.mine(status),
    queryFn: () => api<MyDoubts>(`/api/v1/student/doubts${query(status)}`),
    placeholderData: keepPreviousData,  // switching filters keeps counts on screen instead of flashing empty
  });

export const useDoubt = (id: string) =>
  useQuery({ queryKey: keys.doubt(id), enabled: !!id, queryFn: () => api<DoubtDetail>(`/api/v1/student/doubts/${id}`) });

export const useTopic = (id: string) =>
  useQuery({ queryKey: keys.topic(id), enabled: !!id, queryFn: () => api<TopicDetail>(`/api/v1/student/topics/${id}`) });

/** After any change, the doubt itself is replaced in cache and every list it might appear in is refetched. */
function useDoubtWrite<TInput>(write: (input: TInput) => Promise<DoubtDetail>, detailKey: (d: DoubtDetail) => readonly unknown[]) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: (doubt) => {
      client.setQueryData(detailKey(doubt), doubt);
      void client.invalidateQueries({ queryKey: ["doubts"], refetchType: "active" });
      void client.invalidateQueries({ queryKey: ["student", "topic"] });
    },
  });
}

export const useAskDoubt = () =>
  useDoubtWrite((input: AskInput) => api<DoubtDetail>("/api/v1/student/doubts", post(input)), (d) => keys.doubt(d.id));

export const useFollowUp = (id: string) =>
  useDoubtWrite((message: MessageInput) => api<DoubtDetail>(`/api/v1/student/doubts/${id}/messages`, post(message)), (d) => keys.doubt(d.id));

export const useResolve = (id: string) =>
  useDoubtWrite((_: void) => api<DoubtDetail>(`/api/v1/student/doubts/${id}/resolve`, post({})), (d) => keys.doubt(d.id));

const fetchInbox = (filter: InboxFilter) =>
  api<Inbox>(`/api/v1/teacher/doubts${query(filter === "all" ? undefined : filter)}`);

export const useInbox = (filter: InboxFilter = "open") =>
  useQuery({ queryKey: keys.inbox(filter), queryFn: () => fetchInbox(filter), placeholderData: keepPreviousData });

const WAITING_POLL_MS = 60_000;

/** How many students are waiting, refreshed every minute while the teacher portal is open. */
export const useWaitingCount = () =>
  useQuery({
    queryKey: keys.inbox("open"),
    queryFn: () => fetchInbox("open"),
    refetchInterval: WAITING_POLL_MS,
    select: (inbox) => inbox.counts.open,
  });

export const useClassDoubt = (id: string) =>
  useQuery({ queryKey: keys.classDoubt(id), enabled: !!id, queryFn: () => api<ClassDoubtDetail>(`/api/v1/teacher/doubts/${id}`) });

export const useAnswer = (id: string) =>
  useDoubtWrite(
    (message: MessageInput) => api<ClassDoubtDetail>(`/api/v1/teacher/doubts/${id}/messages`, post(message)),
    (d) => keys.classDoubt(d.id),
  );

export const useDraft = (id: string) =>
  useMutation({ mutationFn: () => api<{ draft: string }>(`/api/v1/teacher/doubts/${id}/draft`, post({})) });

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000]];

/** "in 1 day", "3 hours ago", "just now". Whole units only, so 36 hours reads as 1 day, never rounded up. */
export function relativeTime(iso: string, now = new Date()): string {
  const delta = new Date(iso).getTime() - now.getTime();
  for (const [unit, ms] of UNITS) {
    if (Math.abs(delta) >= ms) return RELATIVE.format(Math.trunc(delta / ms), unit);
  }
  return "just now";
}

/** A waiting doubt whose reply target has passed. Students are told plainly rather than "expected 3 hours ago". */
export function isReplyLate(doubt: Pick<DoubtSummary, "status" | "overdue" | "replyDueAt">, now = new Date()): boolean {
  return doubt.status === "open" && (doubt.overdue || new Date(doubt.replyDueAt).getTime() <= now.getTime());
}
