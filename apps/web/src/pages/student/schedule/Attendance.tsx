import { useId, useState, type FormEvent } from "react";
import { CheckCircle, Clock, QrCode, WarningCircle, XCircle } from "@phosphor-icons/react";
import { ApiError } from "@/lib/api";
import {
  attendanceAdvice, ATTENDANCE_LABELS, CHECKIN_CODE, useAttendance, useCheckin, type AttendanceStatus, type CourseAttendance, INSTITUTION_TIME_ZONE } from "@/lib/schedule";
import { Alert, Button, EmptyState, ErrorState, SkeletonRows } from "@/components/ui";
import { SubjectGlyph } from "../subject";
import { ScheduleNav } from "./Schedule";
import "@/styles/pages/student.css";
import "@/styles/pages/schedule.css";

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: INSTITUTION_TIME_ZONE,
});
const CODE_DIGITS = 6;
const SOURCE_LABELS: Record<string, string> = { teacher: "Marked by teacher", checkin: "Checked in", leave: "From leave" };

/** Attendance per course against the institution's minimum, and check-in for the class in progress. */
export function Attendance() {
  const { data, isLoading, isError, refetch } = useAttendance();

  return (
    <div className="st-page">
      <header>
        <h1 className="st-title st-title-sm">Attendance</h1>
        <p className="st-muted">
          {data ? `Your institution requires ${data.thresholdPercent}% attendance in each course. ` : ""}
          Present, late and on-duty classes count as attended; excused classes don't count against you.
        </p>
      </header>
      <ScheduleNav />

      <CheckinForm />

      <section className="panel" aria-labelledby="att-courses-title">
        <div className="panel-head"><h2 id="att-courses-title">By course</h2></div>
        {isError ? (
          <ErrorState title="Your attendance couldn't load" onRetry={() => void refetch()} />
        ) : isLoading || !data ? (
          <div className="st-pad"><SkeletonRows rows={3} /></div>
        ) : data.courses.length === 0 ? (
          <EmptyState title="No classes yet" body="Attendance appears here once your classes start." />
        ) : (
          <ul className="att-list">
            {data.courses.map((course) => (
              <CourseRow key={course.courseId} course={course} threshold={data.thresholdPercent} />
            ))}
          </ul>
        )}
      </section>

      {data && data.recent.length > 0 && (
        <section className="panel" aria-labelledby="att-recent-title">
          <div className="panel-head"><h2 id="att-recent-title">Recent classes</h2></div>
          <ul className="att-recent">
            {data.recent.map((record) => (
              <li key={record.sessionId} className="att-recent-row">
                <span className="att-recent-when tnum">{dateTimeFormat.format(new Date(record.startsAt))}</span>
                <span className="att-recent-course">{record.courseCode ?? "Class"}</span>
                <AttendanceChip status={record.status} />
                <span className="att-recent-source">{SOURCE_LABELS[record.source] ?? record.source}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function standing(course: CourseAttendance, threshold: number): { label: string; tone: "ok" | "warn" | "danger"; Icon: typeof CheckCircle } {
  if (course.belowThreshold) return { label: `Below ${threshold}%`, tone: "danger", Icon: XCircle };
  if (course.canMiss === 0 && course.percentage !== null) return { label: "At risk", tone: "warn", Icon: WarningCircle };
  return { label: "On track", tone: "ok", Icon: CheckCircle };
}

function CourseRow({ course, threshold }: { course: CourseAttendance; threshold: number }) {
  const state = standing(course, threshold);
  const percent = course.percentage ?? 0;
  return (
    <li className="att-row">
      <div className="att-row-head">
        <SubjectGlyph subject={course.subject} />
        <div className="att-row-title">
          <span className="att-code">{course.courseCode}</span>
          <span className="st-muted att-course">{course.courseTitle}</span>
        </div>
        <span className={`att-standing tone-${state.tone}`}>
          <state.Icon size={14} weight="fill" aria-hidden="true" /> {state.label}
        </span>
        <span className="att-percent tnum">{course.percentage === null ? "–" : `${percent.toFixed(1)}%`}</span>
      </div>
      <div className="att-bar" aria-hidden="true">
        <span className={`att-bar-fill tone-${state.tone}`} style={{ width: `${Math.min(percent, 100)}%` }} />
        <span className="att-bar-threshold" style={{ left: `${threshold}%` }} />
      </div>
      <p className="att-advice">{attendanceAdvice(course, threshold)}</p>
      <dl className="att-stats">
        <div><dt>Held</dt><dd className="tnum">{course.held}</dd></div>
        <div><dt>Attended</dt><dd className="tnum">{course.attended}</dd></div>
        <div><dt>Excused</dt><dd className="tnum">{course.excused}</dd></div>
        <div><dt>Absent</dt><dd className="tnum">{course.absent}</dd></div>
        <div><dt>Left this term</dt><dd className="tnum">{course.remaining}</dd></div>
      </dl>
    </li>
  );
}

const STATUS_ICON: Record<AttendanceStatus, typeof CheckCircle> = {
  present: CheckCircle, late: Clock, absent: XCircle, excused: WarningCircle, on_duty: CheckCircle,
};
const STATUS_TONE: Record<AttendanceStatus, string> = {
  present: "ok", late: "warn", absent: "danger", excused: "neutral", on_duty: "ok",
};

export function AttendanceChip({ status }: { status: AttendanceStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`att-chip tone-${STATUS_TONE[status]}`}>
      <Icon size={13} weight="fill" aria-hidden="true" /> {ATTENDANCE_LABELS[status]}
    </span>
  );
}

/** The 6-digit code the teacher shows in class. Wrong guesses are rate-limited by the server. */
export function CheckinForm() {
  const inputId = useId();
  const messageId = useId();
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const checkin = useCheckin();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!CHECKIN_CODE.test(trimmed)) {
      setProblem("Enter the 6-digit code your teacher is showing.");
      return;
    }
    setProblem(null);
    checkin.mutate(trimmed, { onSuccess: () => setCode("") });
  };

  const serverProblem = checkin.error instanceof ApiError ? checkin.error.message : checkin.isError ? "Check-in failed. Try again." : null;
  const message = problem ?? serverProblem;

  return (
    <section className="panel att-checkin" aria-labelledby="checkin-title">
      <div className="att-checkin-copy">
        <h2 id="checkin-title"><QrCode size={18} aria-hidden="true" /> Check in to class</h2>
        <p className="st-muted">When your teacher opens check-in, enter the code shown in the room. Codes stop working after a few minutes.</p>
      </div>
      <form className="att-checkin-form" onSubmit={submit} noValidate>
        <label htmlFor={inputId} className="sr-only">Check-in code</label>
        <input id={inputId} className="input att-code-input tnum" inputMode="numeric" autoComplete="one-time-code"
          placeholder="000000" value={code}
          onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_DIGITS)); setProblem(null); }}
          aria-invalid={message ? true : undefined} aria-describedby={message ? messageId : undefined} />
        <Button variant="primary" type="submit" loading={checkin.isPending}>Check in</Button>
      </form>
      <div className="att-checkin-result">
        {message && <p id={messageId} className="att-checkin-error" role="alert"><WarningCircle size={14} aria-hidden="true" /> {message}</p>}
        {checkin.isSuccess && !message && (
          <Alert tone="ok">
            {checkin.data.alreadyMarked
              ? `Your teacher had already marked you ${ATTENDANCE_LABELS[checkin.data.status].toLowerCase()} for this class.`
              : `You're checked in. Marked ${ATTENDANCE_LABELS[checkin.data.status].toLowerCase()}.`}
          </Alert>
        )}
      </div>
    </section>
  );
}
