import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle, Clock, Flask, Notebook, PencilSimpleLine, Warning, type Icon } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth";
import { greetingFor, todayLabel } from "@/lib/roleDashboard";
import { dueLabel, useToday, type AttendanceAlert, type DueItem, type TodayClass } from "@/lib/student";
import { AskBar } from "@/components/tutor/AskBar";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui";
import { SubjectGlyph } from "./subject";
import "@/styles/pages/student.css";

const KIND_ICON: Record<DueItem["kind"], Icon> = { assignment: PencilSimpleLine, quiz: Notebook, lab: Flask };
const STATUS: Record<DueItem["status"], { label: string; icon: Icon; tone: string }> = {
  overdue: { label: "Overdue", icon: Warning, tone: "danger" },
  pending: { label: "To do", icon: Clock, tone: "neutral" },
  submitted: { label: "Submitted", icon: CheckCircle, tone: "ok" },
  graded: { label: "Graded", icon: CheckCircle, tone: "ok" },
};

export function Today() {
  const { me } = useAuth();
  const today = useToday();
  const firstName = (me?.admin.name ?? "").split(" ")[0];
  const resume = today.data?.continue;

  const suggestions = resume
    ? [`Explain "${resume.lessonTitle}" simply`, `Quiz me on ${resume.lessonTitle}`, "What should I study next?"]
    : ["What's due this week?", "Help me plan my study time", "Explain a concept I'm stuck on"];

  return (
    <div className="st-page">
      <header className="st-hero">
        <p className="st-date">{todayLabel()}</p>
        <h1 className="st-title">{greetingFor(new Date().getHours())}{firstName ? `, ${firstName}` : ""}</h1>
        <AskBar suggestions={suggestions} lesson={resume ? { id: resume.lessonId, title: resume.lessonTitle } : null} />
      </header>

      {today.data && today.data.attendanceAlerts.length > 0 && <AttendanceAlerts alerts={today.data.attendanceAlerts} />}

      {today.isError ? (
        <ErrorState title="Today couldn't load" onRetry={() => void today.refetch()} />
      ) : (
        <div className="st-grid">
          <section className="panel st-due" aria-labelledby="due-title">
            <div className="panel-head">
              <h2 id="due-title">Due this week</h2>
              <div className="spacer"><span className="rd-count-tag tnum">{today.data ? today.data.due.length : ""}</span></div>
            </div>
            <div className="panel-body flush">
              {!today.data ? (
                <div className="st-pad"><SkeletonRows rows={4} /></div>
              ) : today.data.due.length === 0 ? (
                <EmptyState title="Nothing due this week" body="You're clear for the next seven days. A good moment to get ahead in Learn." />
              ) : (
                <ul className="st-due-list">
                  {today.data.due.map((item) => {
                    const KindIcon = KIND_ICON[item.kind];
                    const status = STATUS[item.status];
                    return (
                      <li key={item.id} className={`st-due-item is-${item.status}`}>
                        <SubjectGlyph subject={item.subject} />
                        <div className="st-due-main">
                          <Link to={`/s/assignments/${item.id}`} className="st-due-title">{item.title}</Link>
                          <span className="st-due-meta">
                            <KindIcon size={13} aria-hidden="true" /> {item.courseCode} · {item.points} points
                            {item.hasDraft && " · Draft saved, not handed in"}
                          </span>
                        </div>
                        <div className="st-due-when">
                          <span className={`st-status tone-${status.tone}`}><status.icon size={14} weight="fill" aria-hidden="true" /> {status.label}</span>
                          <time dateTime={item.dueAt}>{dueLabel(item.dueAt)}</time>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <div className="st-side">
            <section className="panel st-resume" aria-labelledby="resume-title">
              <div className="panel-head"><h2 id="resume-title">Continue learning</h2></div>
              <div className="panel-body">
                {today.isLoading ? (
                  <SkeletonRows rows={2} />
                ) : resume ? (
                  <div className="st-resume-card">
                    <SubjectGlyph subject={resume.subject} size={22} />
                    <div>
                      <span className="st-due-meta">{resume.courseCode} · {resume.moduleTitle}</span>
                      <p className="st-resume-title">{resume.lessonTitle}</p>
                      <span className="st-due-meta">{resume.minutes} min lesson{resume.status === "completed" ? " · completed" : ""}</span>
                    </div>
                    <Link to={`/s/lessons/${resume.lessonId}`} className="btn btn-primary btn-sm">Resume <ArrowRight size={14} weight="bold" aria-hidden="true" /></Link>
                  </div>
                ) : (
                  <div className="st-resume-empty">
                    <p>Start your first lesson and it will wait for you here.</p>
                    <Link to="/s/learn" className="btn btn-secondary btn-sm">Browse courses</Link>
                  </div>
                )}
              </div>
            </section>

            <TodaysClasses classes={today.data?.classes} loading={today.isLoading} />

          </div>
        </div>
      )}

      {today.data && today.data.courses.length > 0 && (
        <section className="st-courses" aria-labelledby="courses-title">
          <div className="st-section-head">
            <h2 id="courses-title">Your courses</h2>
            <Link to="/s/learn" className="st-link">All courses <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <div className="st-course-row">
            {today.data.courses.map((c) => (
              <Link key={c.id} to={`/s/learn/${c.id}`} className="st-course">
                <SubjectGlyph subject={c.subject} size={22} />
                <span className="st-course-code">{c.code}</span>
                <span className="st-course-title">{c.title}</span>
                <span className="st-progress" role="meter" aria-label={`${c.title} progress`} aria-valuemin={0} aria-valuemax={c.lessonsTotal} aria-valuenow={c.lessonsCompleted}>
                  <span style={{ ["--p" as string]: c.lessonsTotal ? c.lessonsCompleted / c.lessonsTotal : 0 }} />
                </span>
                <span className="st-due-meta tnum">{c.lessonsCompleted} of {c.lessonsTotal} lessons</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function TodaysClasses({ classes, loading }: { classes?: TodayClass[]; loading: boolean }) {
  return (
    <section className="panel" aria-labelledby="classes-title">
      <div className="panel-head">
        <h2 id="classes-title">Today's classes</h2>
        <div className="spacer"><Link to="/s/schedule" className="st-link">Schedule</Link></div>
      </div>
      <div className="panel-body flush">
        {loading ? (
          <div className="st-pad"><SkeletonRows rows={2} /></div>
        ) : !classes || classes.length === 0 ? (
          <p className="st-muted st-pad">No classes today.</p>
        ) : (
          <ul className="st-class-list">
            {classes.map((c) => (
              <li key={c.id} className={`st-class is-${c.status}`}>
                <time className="st-class-time tnum" dateTime={c.startsAt}>{TIME.format(new Date(c.startsAt))}</time>
                <span className="st-class-main">
                  <span className="st-class-title">{c.courseCode} {c.kind}</span>
                  <span className="st-due-meta">{c.status === "cancelled" ? "Cancelled" : c.room || "Room to be announced"}</span>
                </span>
                {c.attendance && <span className="st-due-meta">{ATTENDANCE_LABEL[c.attendance] ?? c.attendance}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const ATTENDANCE_LABEL: Record<string, string> = {
  present: "Present", late: "Late", absent: "Absent", excused: "Excused", on_duty: "On duty",
};

export function AttendanceAlerts({ alerts }: { alerts: AttendanceAlert[] }) {
  return (
    <section className="st-alerts" aria-label="Attendance warnings">
      {alerts.map((alert) => (
        <Link key={alert.courseId} to="/s/schedule/attendance" className={`st-alert is-${alert.level}`}>
          <Warning size={16} weight="fill" aria-hidden="true" />
          <span>
            <strong>{alert.courseCode} attendance {alert.percentage === null ? "" : `${alert.percentage}%`}</strong>
            {" "}
            {alert.level === "below"
              ? alert.reachable
                ? `Attend the next ${alert.mustAttend} classes to get back above the minimum.`
                : "You can't reach the minimum this term. Talk to your teacher."
              : "One more absence takes you below the minimum."}
          </span>
        </Link>
      ))}
    </section>
  );
}
