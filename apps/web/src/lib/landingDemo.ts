/**
 * Demonstration data for the public landing page.
 *
 * Every figure mirrors the deterministic seed (scripts/seed.py, services/rbac/seed_data.py)
 * as served by the demo stack. The page labels all of it as demo data; nothing here is a
 * customer, testimonial or production metric.
 */
import type { TimetableEntry } from "@/components/Timetable";
import type { SubjectBarEntry } from "@/components/SubjectBars";
import type { StatCard } from "@/lib/roleDashboard";

export const DEMO_SCALE = {
  institutions: 18,
  people: 3308,
  students: 2139,
  teachers: 143,
  parents: 1003,
  administrators: 23,
  permissions: 17,
  systemRoles: 4,
} as const;

export type InstitutionStatus = "active" | "pending" | "suspended";

export interface DemoInstitution {
  code: string;
  name: string;
  type: string;
  city: string;
  status: InstitutionStatus;
  students: number;
  teachers: number;
}

export const DEMO_INSTITUTIONS: DemoInstitution[] = [
  { code: "ASHF", name: "Ashford Institute of Technology", type: "Institute of Technology", city: "Portland, OR", status: "active", students: 621, teachers: 39 },
  { code: "CLWT", name: "Clearwater College", type: "College", city: "Duluth, MN", status: "active", students: 410, teachers: 25 },
  { code: "HILV", name: "Hillview Community College", type: "Community College", city: "Fresno, CA", status: "active", students: 291, teachers: 17 },
  { code: "SORM", name: "Southshore Regional Academy", type: "Academy", city: "Mobile, AL", status: "suspended", students: 160, teachers: 11 },
  { code: "MRDN", name: "Meredian University", type: "University", city: "Burlington, VT", status: "pending", students: 45, teachers: 6 },
];

/** All 18 seeded institutions (code, short name, status) for the hero network. */
export const DEMO_NETWORK: { code: string; short: string; status: InstitutionStatus }[] = [
  { code: "ASHF", short: "Ashford", status: "active" },
  { code: "CLWT", short: "Clearwater", status: "active" },
  { code: "HILV", short: "Hillview", status: "active" },
  { code: "MRDN", short: "Meredian", status: "pending" },
  { code: "SORM", short: "Southshore", status: "suspended" },
  { code: "KRPT", short: "Kestrel Ridge", status: "active" },
  { code: "PANU", short: "Port Anselm", status: "active" },
  { code: "NGCA", short: "Northgate", status: "active" },
  { code: "BHIN", short: "Beacon Hill", status: "active" },
  { code: "CVSC", short: "Carver State", status: "active" },
  { code: "ESTC", short: "Estuary", status: "active" },
  { code: "VXHU", short: "Vauxhall", status: "active" },
  { code: "LNDC", short: "Lindell", status: "active" },
  { code: "QBIT", short: "Quarry Bank", status: "pending" },
  { code: "HLWC", short: "Halloway", status: "active" },
  { code: "THSU", short: "Thessaly", status: "suspended" },
  { code: "MRGC", short: "Marrowgate", status: "active" },
  { code: "CLWI", short: "Calloway", status: "active" },
];

/** Event kinds the hero network narrates; all are actions the platform records. */
export const NETWORK_EVENTS = ["Sign-in", "User updated", "Role assigned", "Institution updated", "User deactivated", "Sign-in denied"];

export const ADMIN_STATS: Record<string, StatCard> = {
  institutions: { value: DEMO_SCALE.institutions, label: "Institutions" },
  students: { value: "2,139", label: "Students" },
  teachers: { value: DEMO_SCALE.teachers, label: "Teachers" },
  parents: { value: "1,003", label: "Parents" },
};

export const STUDENT_STATS: Record<string, StatCard> = {
  attendance: { value: 94, label: "Attendance", unit: "%" },
  gpa: { value: 3.7, label: "GPA", unit: "/4.0" },
  courses: { value: 6, label: "Courses" },
  due: { value: 3, label: "Due this week" },
};

export const TEACHER_STATS: Record<string, StatCard> = {
  classes: { value: 6, label: "Classes today" },
  students: { value: 198, label: "My students" },
  attendance: { value: 93, label: "Avg attendance", unit: "%" },
  grading: { value: 12, label: "To grade" },
};

export const STUDENT_DAY: TimetableEntry[] = [
  { time: "08:00", duration: "45 min", subject: "Mathematics", teacher: "Ms. Teresa Susan", room: "204", status: "completed" },
  { time: "09:00", duration: "45 min", subject: "Science", teacher: "Mr. John Doe", room: "Lab 02", status: "ongoing" },
  { time: "10:15", duration: "45 min", subject: "English", teacher: "Ms. Rita Owen", room: "108", status: "upcoming" },
  { time: "11:15", duration: "45 min", subject: "Social Studies", teacher: "Mr. Alan Poe", room: "110", status: "upcoming" },
];

export const TEACHER_DAY: TimetableEntry[] = [
  { time: "08:00", duration: "45 min", subject: "Mathematics", detail: "Grade III-A", room: "204", students: 42, status: "completed" },
  { time: "09:00", duration: "45 min", subject: "Science", detail: "Grade IV-B", room: "Lab 02", students: 38, status: "ongoing" },
  { time: "10:15", duration: "45 min", subject: "Mathematics", detail: "Grade V-A", room: "108", students: 40, status: "upcoming" },
  { time: "11:15", duration: "45 min", subject: "Chemistry", detail: "Grade VI-A", room: "Lab 01", students: 36, status: "upcoming" },
];

export const CHILD_SUBJECTS: Record<string, SubjectBarEntry[]> = {
  emma: [
    { name: "Mathematics", score: 94, grade: "A+", trend: "up" },
    { name: "Science", score: 91, grade: "A", trend: "up" },
    { name: "English", score: 68, grade: "C+", trend: "down" },
    { name: "Social Studies", score: 85, grade: "B+", trend: "flat" },
  ],
  liam: [
    { name: "Mathematics", score: 82, grade: "B+", trend: "up" },
    { name: "Science", score: 78, grade: "B", trend: "flat" },
    { name: "English", score: 90, grade: "A", trend: "up" },
    { name: "Social Studies", score: 76, grade: "B", trend: "down" },
  ],
};

export const DEMO_CHILDREN = [
  { id: "emma", name: "Emma Abiodun", class: "Grade IV-A" },
  { id: "liam", name: "Liam Abiodun", class: "Grade VI-B" },
];

export type AuditResult = "success" | "denied";

export interface DemoAuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  result: AuditResult;
  scope: string;
}

/** Actions and actors from the seed's audit history; ids are stable for list keys. */
export const DEMO_AUDIT: DemoAuditEvent[] = [
  { id: "a1", actor: "Marisol Vance", action: "Created institution", target: "Meredian University", result: "success", scope: "Platform" },
  { id: "a2", actor: "Tomas Lindqvist", action: "Deactivated user", target: "k.morrow@sorm.example.edu", result: "success", scope: "Southshore Regional Academy" },
  { id: "a3", actor: "Ren Ishikawa", action: "Tried to create institution", target: "Quarry Bank Institute", result: "denied", scope: "Platform" },
  { id: "a4", actor: "Farah Adeyemi", action: "Assigned role", target: "Support Admin to Odile Fontaine", result: "success", scope: "Platform" },
  { id: "a5", actor: "Demetri Kowalczyk", action: "Suspended institution", target: "Southshore Regional Academy", result: "success", scope: "Platform" },
  { id: "a6", actor: "Unknown device", action: "Failed sign-in", target: "c.meyer@edubot.example.edu", result: "denied", scope: "Platform" },
  { id: "a7", actor: "Odile Fontaine", action: "Updated settings", target: "Sign-in notice", result: "success", scope: "Platform" },
  { id: "a8", actor: "Marisol Vance", action: "Reactivated institution", target: "Hillview Community College", result: "success", scope: "Platform" },
];

export const PERMISSION_DOMAINS: { domain: string; keys: string[] }[] = [
  { domain: "Platform", keys: ["dashboard.read"] },
  { domain: "Institutions", keys: ["institution.read", "institution.create", "institution.update", "institution.suspend"] },
  { domain: "Users", keys: ["user.read", "user.update", "user.deactivate"] },
  { domain: "Administrators", keys: ["admin.read", "admin.create", "admin.update"] },
  { domain: "Roles", keys: ["role.read", "role.create", "role.assign"] },
  { domain: "Audit", keys: ["audit.read"] },
  { domain: "Settings", keys: ["settings.read", "settings.update"] },
];

const ALL_KEYS = PERMISSION_DOMAINS.flatMap((d) => d.keys);

export const SYSTEM_ROLES: { name: string; summary: string; grants: string[] }[] = [
  { name: "Platform Owner", summary: "Full control, including administrators and settings.", grants: ALL_KEYS },
  {
    name: "Operations Admin",
    summary: "Runs day-to-day institution and user operations.",
    grants: [
      "dashboard.read", "institution.read", "institution.create", "institution.update", "institution.suspend",
      "user.read", "user.update", "user.deactivate", "admin.read", "admin.create", "admin.update",
      "audit.read", "settings.read", "role.read",
    ],
  },
  {
    name: "Support Admin",
    summary: "Investigates issues and locks compromised accounts.",
    grants: ["dashboard.read", "institution.read", "user.read", "user.deactivate", "audit.read"],
  },
  {
    name: "Read-only Auditor",
    summary: "Reads everything, changes nothing.",
    grants: ["dashboard.read", "institution.read", "user.read", "admin.read", "role.read", "audit.read", "settings.read"],
  },
];
