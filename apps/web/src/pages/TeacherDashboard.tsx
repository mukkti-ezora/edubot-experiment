import { useAuth } from "@/lib/auth";
import { greetingFor, todayLabel, useRoleDashboard, type StatCard } from "@/lib/roleDashboard";
import { PageHead, EmptyState, Avatar } from "@/components/ui";
import { DashboardPending, MetricStrip } from "@/components/RoleDashboard";
import { Timetable, type TimetableStatus } from "@/components/Timetable";
import { SubjectBars } from "@/components/SubjectBars";
import "@/styles/pages/teacher-dashboard.css";

export interface TeacherTimetableEntry {
  time: string;
  duration?: string;
  class: string;
  subject: string;
  room: string;
  students: number;
  status: TimetableStatus;
}

export interface ClassCard {
  name: string;
  subject: string;
  students: number;
  attendance: number;
  avgMarks: number;
}

export interface ActivityItem {
  action: string;
  detail: string;
  time: string;
}

export interface PendingAssignment {
  title: string;
  class: string;
  due: string;
  submitted: string;
}

export interface TeacherDashboardData {
  profile: { name: string; institution: string; department: string; homeroom: string };
  stats: Record<string, StatCard>;
  timetable: TeacherTimetableEntry[];
  classes: ClassCard[];
  pendingAssignments: PendingAssignment[];
  recentActivity: ActivityItem[];
  messages: { from: string; subject: string; time: string }[];
}

/* ── Component ────────────────────────────────────────── */

export function TeacherDashboard() {
  const { me } = useAuth();
  const query = useRoleDashboard<TeacherDashboardData>("teacher");
  const { data } = query;
  if (!data) return <DashboardPending query={query} className="page-teacher-dashboard" />;

  const name = data.profile.name || me?.admin.name || "Teacher";
  const firstName = name.split(" ")[0];

  const timetableEntries = data.timetable.map((t) => ({
    time: t.time,
    duration: t.duration,
    subject: t.subject,
    detail: t.class,
    room: t.room,
    students: t.students,
    status: t.status,
  }));

  const classPerformance = data.classes.map((c) => ({
    name: c.name,
    score: c.avgMarks,
    grade: letterGrade(c.avgMarks),
  }));

  return (
    <div className="page-teacher-dashboard">
      <PageHead
        title={
          <span className="td-greeting">
            <Avatar name={name} size="md" category="teacher" />
            <span>{greetingFor(new Date().getHours())}, {firstName}</span>
          </span>
        }
        sub={`${data.profile.department} \u00B7 ${data.profile.homeroom} \u00B7 ${todayLabel()}`}
      />

      <MetricStrip stats={data.stats} />

      <div className="rd-grid-2col">
        <div className="rd-col">
          <div className="panel">
            <div className="panel-head"><h2>Today's Classes</h2></div>
            <div className="panel-body">
              <Timetable entries={timetableEntries} showTeacher={false} />
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><h2>Class Performance</h2></div>
            <div className="panel-body">
              <SubjectBars subjects={classPerformance} />
            </div>
          </div>
        </div>

        <div className="rd-col">
          <div className="panel">
            <div className="panel-head">
              <h2>My Classes</h2>
              <div className="spacer"><span className="rd-count-tag tnum">{data.classes.length} classes</span></div>
            </div>
            <div className="panel-body flush">
              <div className="td-classes">
                {data.classes.map((c) => (
                  <div key={c.name} className="td-class-card">
                    <div className="td-cc-main">
                      <span className="td-cc-name">{c.name}</span>
                      <span className="td-cc-subject">{c.subject}</span>
                    </div>
                    <div className="td-cc-meta">
                      <span className="tnum">{c.students} students</span>
                      <span className="tnum">{c.attendance}% att.</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Recent Activity</h2></div>
            <div className="panel-body">
              {data.recentActivity.length > 0 ? (
                <div className="timeline">
                  {data.recentActivity.map((evt) => (
                    <div key={`${evt.action}-${evt.time}`} className="tl-item">
                      <div className="tl-icon tone-success">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3" />
                        </svg>
                      </div>
                      <div className="tl-body">
                        <div className="tl-line">{evt.action}</div>
                        <div className="tl-meta">
                          <span>{evt.detail}</span>
                          <span>{evt.time}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No recent activity" body="Activity will appear here." />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="panel td-pending-panel">
        <div className="panel-head">
          <h2>Assignments to Review</h2>
          <div className="spacer"><span className="rd-count-tag tnum">{data.pendingAssignments.length} pending</span></div>
        </div>
        <div className="panel-body">
          {data.pendingAssignments.length > 0 ? (
            <div className="td-assign-table">
              <div className="td-at-header">
                <span>Title</span><span>Class</span><span>Submissions</span><span>Due</span>
              </div>
              {data.pendingAssignments.map((a) => (
                <div key={`${a.title}-${a.class}`} className="td-at-row">
                  <span className="td-at-title">{a.title}</span>
                  <span>{a.class}</span>
                  <span className="tnum">{a.submitted}</span>
                  <span className="tnum">{a.due}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="All caught up" body="No assignments need review." />
          )}
        </div>
      </div>
    </div>
  );
}

const GRADE_BANDS: [minScore: number, grade: string][] = [[90, "A"], [80, "B+"], [70, "B"]];

function letterGrade(score: number): string {
  return GRADE_BANDS.find(([min]) => score >= min)?.[1] ?? "C";
}
