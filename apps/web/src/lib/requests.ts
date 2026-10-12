/** Requests a teacher decides: leave from their students, assignment extensions, and advisees' credit transfers. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttachmentMeta } from "./files";
import { api } from "./api";
import type { LeaveRequest, RequestStatus } from "./schedule";

export type RequestKind = "leave" | "extensions" | "credits";

interface Person {
  id: string;
  name: string;
}

export type LeaveItem = LeaveRequest & { student: Person };

export interface ExtensionItem {
  id: string;
  status: RequestStatus;
  until: string;
  reason: string;
  autoApproved: boolean;
  note: string | null;
  createdAt: string;
  student: Person;
  assignment: { id: string; title: string; dueAt: string };
  courseCode: string;
}

export interface CreditItem {
  id: string;
  status: RequestStatus;
  scorePercent: number;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  course: { id: string; provider: string; title: string; weeks: number; credits: number; category: string; url: string };
  certificate: AttachmentMeta | null;
  student: Person;
}

export interface Decision {
  approve: boolean;
  note?: string;
}

const PATHS: Record<RequestKind, string> = {
  leave: "/api/v1/teacher/requests/leave",
  extensions: "/api/v1/teacher/requests/extensions",
  credits: "/api/v1/teacher/requests/credits",
};

const keyFor = (kind: RequestKind) => ["requests", kind] as const;

export const useLeaveRequests = () =>
  useQuery({ queryKey: keyFor("leave"), queryFn: () => api<{ items: LeaveItem[] }>(PATHS.leave) });

export const useExtensionRequests = () =>
  useQuery({ queryKey: keyFor("extensions"), queryFn: () => api<{ items: ExtensionItem[] }>(PATHS.extensions) });

export const useCreditRequests = () =>
  useQuery({ queryKey: keyFor("credits"), queryFn: () => api<{ items: CreditItem[]; pending: number }>(PATHS.credits) });

/** The request body for a decision: a note is only sent when the teacher wrote one. */
export function decisionBody({ approve, note }: Decision): { approve: boolean; note?: string } {
  const trimmed = note?.trim();
  return trimmed ? { approve, note: trimmed } : { approve };
}

interface RequestList {
  items: { id: string; status: RequestStatus }[];
  pending?: number;
}

/** The list after one request is decided: its status changes and any pending count drops by one. */
export function withDecision<T extends RequestList>(list: T, id: string, approve: boolean): T {
  const status: RequestStatus = approve ? "approved" : "declined";
  return {
    ...list,
    items: list.items.map((item) => (item.id === id ? { ...item, status } : item)),
    ...(list.pending === undefined ? {} : { pending: Math.max(list.pending - 1, 0) }),
  };
}

/**
 * Approve or decline one request. The row stays as it is (with the teacher's note) while the server decides,
 * so a failure can be shown right there; the list changes only once the decision is saved.
 */
export function useDecide(kind: RequestKind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...decision }: Decision & { id: string }) =>
      api(`${PATHS[kind]}/${id}/decide`, { method: "POST", body: JSON.stringify(decisionBody(decision)) }),
    onSuccess: (_result, { id, approve }) => {
      queryClient.setQueryData<RequestList>(keyFor(kind), (list) => (list ? withDecision(list, id, approve) : list));
      void queryClient.invalidateQueries({ queryKey: keyFor(kind) });
    },
  });
}
