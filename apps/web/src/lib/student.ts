/** Student learning data (slice 1): Today, Learn, lessons. Served by the learning service via the gateway. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type Subject = "physics" | "mathematics" | "computing" | "chemistry" | "biology" | string;
export type DueStatus = "overdue" | "pending" | "submitted" | "graded";
export type LessonFormat = "read" | "watch" | "animate";
export type LessonStatus = "not_started" | "started" | "completed";

export interface DueItem {
  id: string;
  title: string;
  kind: "assignment" | "quiz" | "lab";
  dueAt: string;
  status: DueStatus;
  points: number;
  /** A saved draft that hasn't been handed in yet. */
  hasDraft: boolean;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  subject: Subject;
}

export interface CourseCard {
  id: string;
  code: string;
  title: string;
  summary: string;
  term: string;
  subject: Subject;
  lessonsTotal: number;
  lessonsCompleted: number;
}

export interface ResumeLesson {
  lessonId: string;
  lessonTitle: string;
  moduleTitle: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  subject: Subject;
  status: LessonStatus;
  lastFormat: LessonFormat;
  minutes: number;
  openedAt: string;
}

export interface TodayClass {
  id: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  subject: Subject;
  startsAt: string;
  endsAt: string;
  room: string;
  kind: string;
  status: "scheduled" | "held" | "cancelled";
  attendance: string | null;
}

export interface AttendanceAlert {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  level: "below" | "at_risk";
  percentage: number | null;
  mustAttend: number;
  reachable: boolean;
}

export interface TodayData {
  due: DueItem[];
  continue: ResumeLesson | null;
  courses: CourseCard[];
  classes: TodayClass[];
  attendanceAlerts: AttendanceAlert[];
}

export interface TopicCard {
  id: string;
  title: string;
  summary: string;
  lessonsTotal: number;
  lessonsCompleted: number;
}

export interface LessonRow {
  id: string;
  title: string;
  summary: string;
  minutes: number;
  status: LessonStatus;
  formats: LessonFormat[];
}

export interface CourseDetail extends CourseCard {
  topics: TopicCard[];
  modules: {
    id: string;
    title: string;
    summary: string;
    lessons: (LessonRow & { topicId: string | null })[];
  }[];
}

export interface Video {
  url: string;
  title: string;
  source: string;
}

export interface Animation {
  kind: "projectile" | "derivative" | "loop";
  params: Record<string, unknown>;
  caption: string;
  alt: string;
}

export interface LessonDetail {
  id: string;
  title: string;
  summary: string;
  minutes: number;
  body: string;
  video: Video | null;
  animation: Animation | null;
  status: LessonStatus;
  lastFormat: LessonFormat;
  module: { id: string; title: string };
  topic: { id: string; title: string } | null;
  course: { id: string; code: string; title: string; subject: Subject };
  position: number;
  count: number;
  previous: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
}

const keys = {
  today: ["student", "today"] as const,
  courses: ["student", "courses"] as const,
  course: (id: string) => ["student", "course", id] as const,
  lesson: (id: string) => ["student", "lesson", id] as const,
};

export const useToday = () => useQuery({ queryKey: keys.today, queryFn: () => api<TodayData>("/api/v1/student/today") });

export const useCourses = ({ enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({ queryKey: keys.courses, enabled, queryFn: () => api<{ courses: CourseCard[] }>("/api/v1/student/courses") });

export const useCourse = (id: string) =>
  useQuery({ queryKey: keys.course(id), queryFn: () => api<CourseDetail>(`/api/v1/student/courses/${id}`), enabled: !!id });

export const useLesson = (id: string) =>
  useQuery({ queryKey: keys.lesson(id), queryFn: () => api<LessonDetail>(`/api/v1/student/lessons/${id}`), enabled: !!id });

export function useRecordFormat(lessonId: string) {
  return useMutation({
    mutationFn: (format: LessonFormat) =>
      api(`/api/v1/student/lessons/${lessonId}/format`, { method: "POST", body: JSON.stringify({ format }) }),
  });
}

export function useCompleteLesson(lessonId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/api/v1/student/lessons/${lessonId}/complete`, { method: "POST", body: "{}" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["student"] }),
  });
}

/** "Due today", "Due tomorrow", "Due in 3 days", "1 day overdue". */
export function dueLabel(iso: string, now = new Date()): string {
  const day = 86_400_000;
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date(iso)) - startOf(now)) / day);
  if (days < 0) return `${-days} ${-days === 1 ? "day" : "days"} overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

const EMBED_HOSTS = new Set(["www.youtube-nocookie.com", "www.youtube.com"]);

/** The video URL if it is an https YouTube embed, otherwise null. Lesson data never reaches an iframe unchecked. */
export function safeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && EMBED_HOSTS.has(parsed.hostname) && parsed.pathname.startsWith("/embed/") ? parsed.href : null;
  } catch {
    return null;
  }
}
