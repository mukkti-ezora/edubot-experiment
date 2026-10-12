import { useAuth } from "@/lib/auth";
import { todayLabel, useRoleDashboard, workTone, type FeeSummaryData, type StatCard, type WorkItem } from "@/lib/roleDashboard";
import { PageHead, EmptyState, Badge } from "@/components/ui";
import { DashboardPending, FeeSummary, MetricStrip } from "@/components/RoleDashboard";
import { Timetable, type TimetableEntry } from "@/components/Timetable";
import { SubjectBars, type SubjectBarEntry } from "@/components/SubjectBars";
import "@/styles/pages/student-dashboard.css";

export interface ExamEntry {
  subject: string;
  title: string;
  date: string;
  time: string;
  room: string;
}

export interface StudentDashboardData {
  profile: { name: string; institution: string; id: string; email: string };
  stats: Record<string, StatCard>;
  timetable: TimetableEntry[];
  subjects: SubjectBarEntry[];
  assignments: WorkItem[];
  exams: ExamEntry[];
  fees: FeeSummaryData;
}

/* ── Component ────────────────────────────────────────── */

export function StudentDashboard() {
  const { me } = useAuth();

  const query = useRoleDashboard<StudentDashboardData>("student");
  const { data } = query;
  if (!data) return <DashboardPending query={query} className="page-student-dashboard" />;

  return (
    <div className="page-student-dashboard">
      <PageHead
        title={data.profile.name || me?.admin.name || "Student"}
        sub={`${data.profile.institution} \u00B7 ${todayLabel()}`}
      />

      <MetricStrip stats={data.stats} />

      {/* Two-column layout */}
      <div className="rd-grid-2col">
        {/* Left column */}
        <div className="rd-col">
          <div className="panel">
            <div className="panel-head"><h2>Today's Schedule</h2></div>
            <div className="panel-body">
              <Timetable entries={data.timetable} showTeacher />
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Subject Performance</h2></div>
            <div className="panel-body">
              <SubjectBars subjects={data.subjects} />
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="rd-col">
          <div className="panel">
            <div className="panel-head">
              <h2>Assignments</h2>
              <div className="spacer">
                <span className="rd-count-tag tnum">{data.assignments.length} total</span>
              </div>
            </div>
            <div className="panel-body flush">
              {data.assignments.length > 0 ? (
                <div className="rd-list">
                  {data.assignments.map((a) => (
                    <div key={a.title} className="rd-list-item">
                      <div className="rd-li-main">
                        <span className="rd-li-title">{a.title}</span>
                        <span className="rd-li-meta">{a.subject} &middot; {a.due}</span>
                      </div>
                      <Badge tone={workTone(a.status)}>{a.score ?? a.status}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No assignments" body="You have no assignments right now." />
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Upcoming Exams</h2></div>
            <div className="panel-body">
              {data.exams.length > 0 ? (
                <div className="rd-compact-table">
                  <div className="rd-ct-header">
                    <span>Subject</span><span>Date</span><span>Time</span><span>Room</span>
                  </div>
                  {data.exams.map((e) => (
                    <div key={`${e.subject}-${e.date}`} className="rd-ct-row">
                      <span className="rd-ct-primary">{e.subject}</span>
                      <span className="tnum">{e.date}</span>
                      <span className="tnum">{e.time}</span>
                      <span className="rd-ct-mono">{e.room}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No upcoming exams" body="Exam schedule will appear here when available." />
              )}
            </div>
          </div>

          <FeeSummary fees={data.fees} />
        </div>
      </div>
    </div>
  );
}
