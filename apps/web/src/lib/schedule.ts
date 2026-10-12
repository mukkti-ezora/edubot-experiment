/** Schedule, attendance and leave for students; sessions and attendance marking for teachers. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttachmentMeta } from "./files";
import { api } from "./api";
import type { Subject } from "./student";

export type EventType = "class" | "due" | "assessment";
export type AttendanceStatus = "present" | "late" | "absent" | "excused" | "on_duty";
export type LeaveKind = "leave" | "medical" | "on_duty";
export type RequestStatus = "pending" | "approved" | "declined";

interface CourseRef {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  subject: Subject;
}

export interface ScheduleEvent extends CourseRef {
  id: string;
  type: EventType;
  title: string;
  startsAt: string;
  endsAt: string | null;
  kind: string;
  room?: string;
  status?: "scheduled" | "held" | "cancelled";
  attendance?: AttendanceStatus | null;
}

export interface ScheduleRange {
  from: string;
  to: string;
  events: ScheduleEvent[];
}

export interface CourseAttendance extends CourseRef {
  held: number;
  attended: number;
  excused: number;
  absent: number;
  percentage: number | null;
  remaining: number;
  belowThreshold: boolean;
  canMiss: number;
  mustAttend: number;
  reachable: boolean;
}

export interface AttendanceOverview {
  thresholdPercent: number;
  courses: CourseAttendance[];
  recent: { sessionId: string; courseCode: string | undefined; startsAt: string; status: AttendanceStatus; source: string }[];
}

export interface LeaveRequest {
  id: string;
  kind: LeaveKind;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: RequestStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  attachments: AttachmentMeta[];
}

export interface LeaveInput {
  kind: LeaveKind;
  fromDate: string;
  toDate: string;
  reason: string;
  attachmentIds: string[];
}

export interface RosterEntry {
  personId: string;
  name: string;
  status: AttendanceStatus | null;
  source: string | null;
}

export interface TeacherSession extends CourseRef {
  id: string;
  sectionId: string;
  startsAt: string;
  endsAt: string;
  room: string;
  kind: string;
  status: "scheduled" | "held" | "cancelled";
  checkinOpenUntil: string | null;
  roster: RosterEntry[];
}

export const MAX_LEAVE_DAYS = 30;
export const CHECKIN_CODE = /^\d{6}$/;
const DAY_MS = 86_400_000;

export const LEAVE_KINDS: { id: LeaveKind; label: string }[] = [
  { id: "leave", label: "Personal leave" },
  { id: "medical", label: "Medical leave" },
  { id: "on_duty", label: "On duty" },
];

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: "Present", late: "Late", absent: "Absent", excused: "Excused", on_duty: "On duty",
};

const keys = {
  schedule: (from: string, to: string) => ["schedule", "range", from, to] as const,
  attendance: ["schedule", "attendance"] as const,
  leave: ["schedule", "leave"] as const,
  sessions: (day: string) => ["schedule", "teacher", "sessions", day] as const,
};

/* ---------- the institution's calendar ---------- */

/**
 * The institution's time zone. The server builds every day (today's classes, leave dates, the week's range)
 * in this zone, so the app does too, whatever zone the browser is in. Until the API reports it per
 * institution (OD-12), every EduBot institution is in India.
 */
export const INSTITUTION_TIME_ZONE = "Asia/Kolkata";

const MINUTES_PER_HOUR = 60;
const DAYS_PER_WEEK = 7;
const MIDDAY_UTC = "T12:00:00Z"; // a day key's own date, safe from any zone shift when formatted in UTC

const dayPartsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: INSTITUTION_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
const clockPartsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: INSTITUTION_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const timeOfDayFormat = new Intl.DateTimeFormat(undefined, {
  timeZone: INSTITUTION_TIME_ZONE, hour: "numeric", minute: "2-digit",
});

const part = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
  parts.find((p) => p.type === type)?.value ?? "";

/** YYYY-MM-DD of the institution's calendar day that an instant falls on. */
export function dayKey(instant: Date | string): string {
  const parts = dayPartsFormat.formatToParts(new Date(instant));
  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`;
}

export const todayKey = (now: Date = new Date()): string => dayKey(now);

/** Minutes after the institution's midnight. */
export function minutesInDay(instant: Date | string): number {
  const parts = clockPartsFormat.formatToParts(new Date(instant));
  return Number(part(parts, "hour")) * MINUTES_PER_HOUR + Number(part(parts, "minute"));
}

/** A day key as a Date at midday UTC: format it with `timeZone: "UTC"` to show that day's own date. */
export const keyToDate = (key: string): Date => new Date(`${key}${MIDDAY_UTC}`);

export function addDayKeys(key: string, days: number): string {
  const date = keyToDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The Monday of the week a day falls in. */
export function weekStartKey(key: string): string {
  const daysSinceMonday = (keyToDate(key).getUTCDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  return addDayKeys(key, -daysSinceMonday);
}

export const weekKeys = (monday: string): string[] =>
  Array.from({ length: DAYS_PER_WEEK }, (_, i) => addDayKeys(monday, i));

/** A time of day, as the institution's clock shows it. */
export const formatTime = (instant: Date | string): string => timeOfDayFormat.format(new Date(instant));

/** The zone's short name for labels, e.g. "IST". */
export const ZONE_LABEL = part(
  new Intl.DateTimeFormat("en-IN", { timeZone: INSTITUTION_TIME_ZONE, timeZoneName: "short" }).formatToParts(new Date()),
  "timeZoneName",
) || INSTITUTION_TIME_ZONE;

/** Inclusive day count between two YYYY-MM-DD dates (0 when the end is before the start). */
export function daysBetween(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  return to < from ? 0 : Math.round((to - from) / DAY_MS) + 1;
}

/** The problem with a leave date range, or null when it's acceptable. */
export function leaveRangeProblem(fromDate: string, toDate: string): string | null {
  if (!fromDate || !toDate) return "Choose the first and last day.";
  const days = daysBetween(fromDate, toDate);
  if (days === 0) return "The last day can't be before the first day.";
  if (days > MAX_LEAVE_DAYS) return `Leave can cover up to ${MAX_LEAVE_DAYS} days. Split longer absences into separate requests.`;
  return null;
}

/**
 * What a student can do about their attendance in a course, in plain words. `canMiss` is a projection to the
 * end of term (miss that many of the remaining classes and finish at the minimum), not a promise about the
 * running percentage, so the wording says so.
 */
export function attendanceAdvice(course: CourseAttendance, thresholdPercent: number): string {
  if (course.percentage === null) return "No classes have been held yet.";
  if (!course.belowThreshold) {
    if (course.remaining === 0) return `No classes are left this term. You finish at ${course.percentage}%.`;
    if (course.canMiss === 0) return `Attend every remaining class to finish the term at ${thresholdPercent}% or above.`;
    const classes = course.canMiss === 1 ? "class" : "classes";
    return `By the end of term you can miss up to ${course.canMiss} ${classes} and still finish at ${thresholdPercent}%.`;
  }
  if (!course.reachable) {
    return `You can't reach ${thresholdPercent}% with the classes left this term. Talk to your teacher about leave or on-duty records.`;
  }
  return `Attend the next ${course.mustAttend} ${course.mustAttend === 1 ? "class" : "classes"} to get back to ${thresholdPercent}%.`;
}

export const useSchedule = (from: string, to: string) =>
  useQuery({
    queryKey: keys.schedule(from, to),
    queryFn: () => api<ScheduleRange>(`/api/v1/student/schedule?from=${from}&to=${to}`),
    placeholderData: keepPreviousData,
  });

export const useAttendance = () =>
  useQuery({ queryKey: keys.attendance, queryFn: () => api<AttendanceOverview>("/api/v1/student/attendance") });

export const useLeave = () =>
  useQuery({ queryKey: keys.leave, queryFn: () => api<{ items: LeaveRequest[] }>("/api/v1/student/leave") });

export function useCheckin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      api<{ sessionId: string; status: AttendanceStatus; source: string; alreadyMarked?: boolean }>("/api/v1/student/attendance/checkin", {
        method: "POST", body: JSON.stringify({ code }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["schedule"] }),
  });
}

export function useApplyLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LeaveInput) =>
      api<LeaveRequest>("/api/v1/student/leave", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.leave }),
  });
}

export function useCalendarFeed() {
  return useMutation({
    mutationFn: () => api<{ url: string; days: number }>("/api/v1/student/calendar-feed", { method: "POST", body: "{}" }),
  });
}

export const useTeacherSessions = (day: string) =>
  useQuery({
    queryKey: keys.sessions(day),
    queryFn: () => api<{ date: string; sessions: TeacherSession[] }>(`/api/v1/teacher/sessions?date=${day}`),
    placeholderData: keepPreviousData,
  });

export function useMarkAttendance(day: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, records }: { sessionId: string; records: { personId: string; status: AttendanceStatus }[] }) =>
      api<TeacherSession>(`/api/v1/teacher/sessions/${sessionId}/attendance`, {
        method: "POST", body: JSON.stringify({ records }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.sessions(day) }),
  });
}

export function useOpenCheckin(day: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      api<{ code: string; openUntil: string }>(`/api/v1/teacher/sessions/${sessionId}/checkin`, {
        method: "POST", body: "{}",
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.sessions(day) }),
  });
}
