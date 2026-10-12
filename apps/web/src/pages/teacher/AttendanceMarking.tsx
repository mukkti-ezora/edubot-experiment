import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowsClockwise, CalendarBlank, CheckCircle, Prohibit, QrCode, UsersThree } from "@phosphor-icons/react";
import { ApiError } from "@/lib/api";
import {
  ATTENDANCE_LABELS, formatTime, todayKey, useMarkAttendance, useOpenCheckin, useTeacherSessions, ZONE_LABEL,
  type AttendanceStatus, type RosterEntry, type TeacherSession,
} from "@/lib/schedule";
import { Alert, Button, ConfirmDialog, Drawer, EmptyState, ErrorState, SkeletonRows } from "@/components/ui";
import "@/styles/pages/student.css";
import "@/styles/pages/schedule.css";

const STATUSES: AttendanceStatus[] = ["present", "late", "absent", "excused", "on_duty"];
const SECOND_MS = 1000;
/** Records the teacher can't override with "Mark all present": approved leave and students' own check-ins. */
const KEPT_SOURCES = new Set(["leave", "checkin"]);

/** "Mark all present": everyone becomes present except students on approved leave or already checked in. */
export function markAllPresent(roster: RosterEntry[], marks: Record<string, AttendanceStatus | null>) {
  return Object.fromEntries(roster.map((r) => [r.personId, r.source && KEPT_SOURCES.has(r.source) ? marks[r.personId] : "present"])) as
    Record<string, AttendanceStatus | null>;
}

/** Take attendance for today's classes, by hand or with a check-in code students type in. */
export function TeacherAttendancePage() {
  const [day, setDay] = useState(() => todayKey());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingChange, setPendingChange] = useState<(() => void) | null>(null);
  // Changing day or class would discard unsaved marks, so ask first. Closing the tab is guarded below.
  const guard = (change: () => void) => (dirty ? setPendingChange(() => change) : change());
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const { data, isLoading, isError, refetch, isFetching } = useTeacherSessions(day);
  const sessions = data?.sessions ?? [];
  const selected = sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null;

  return (
    <div className="st-page">
      <header className="sch-head">
        <div>
          <h1 className="st-title st-title-sm">Attendance</h1>
          <p className="st-muted">Mark each class, or open a check-in code for students to enter on their phones. Times are {ZONE_LABEL}.</p>
        </div>
        <div className="sch-date-pick">
          <label htmlFor="attendance-day" className="sch-sync-label">Day</label>
          <input id="attendance-day" type="date" className="input" value={day}
            onChange={(e) => {
              const next = e.target.value || todayKey();
              guard(() => { setDay(next); setSelectedId(null); setDirty(false); });
            }} />
        </div>
      </header>

      {isError ? (
        <ErrorState title="Today's classes couldn't load" onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <div className="panel st-pad"><SkeletonRows rows={4} /></div>
      ) : sessions.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<CalendarBlank size={20} aria-hidden="true" />} title="No classes on this day"
            body="Pick another day to mark attendance for a class you taught." />
        </div>
      ) : (
        <div className="tatt-layout">
          <nav className="panel tatt-sessions" aria-label="Classes on this day">
            <ul>
              {sessions.map((s) => (
                <li key={s.id}>
                  <button type="button" className="tatt-session" aria-current={selected?.id === s.id ? "true" : undefined}
                    onClick={() => s.id !== selected?.id && guard(() => { setSelectedId(s.id); setDirty(false); })}>
                    <span className="tatt-session-time tnum">{formatTime(s.startsAt)} to {formatTime(s.endsAt)}</span>
                    <span className="tatt-session-title">{s.courseCode} {s.kind}</span>
                    <span className="tatt-session-meta">{[s.room, sessionStateLabel(s)].filter(Boolean).join(" · ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          {selected && (
            <SessionRoster key={selected.id} session={selected} day={day} refreshing={isFetching}
              onRefresh={() => void refetch()} onDirtyChange={setDirty} />
          )}
        </div>
      )}
      {pendingChange && (
        <ConfirmDialog title="Discard unsaved attendance?" confirmLabel="Discard changes"
          body="You've marked students but haven't saved. Leaving this class now loses those marks."
          onConfirm={() => { pendingChange(); setPendingChange(null); }} onClose={() => setPendingChange(null)} />
      )}
    </div>
  );
}

function sessionStateLabel(session: TeacherSession): string {
  if (session.status === "cancelled") return "Cancelled";
  const marked = session.roster.filter((r) => r.status).length;
  if (session.status === "held") return `Marked ${marked} of ${session.roster.length}`;
  return session.checkinOpenUntil ? "Check-in open" : "Not marked";
}

function SessionRoster({ session, day, refreshing, onRefresh, onDirtyChange }: {
  session: TeacherSession;
  day: string;
  refreshing: boolean;
  onRefresh: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const initial = useMemo(
    () => Object.fromEntries(session.roster.map((r) => [r.personId, r.status])) as Record<string, AttendanceStatus | null>,
    [session.roster],
  );
  const [marks, setMarks] = useState(initial);
  const [code, setCode] = useState<{ code: string; openUntil: string } | null>(null);
  const mark = useMarkAttendance(day);
  const openCheckin = useOpenCheckin(day);
  const lastServer = useRef(initial);
  useEffect(() => {
    // New check-ins arrive on refresh; keep any mark the teacher has changed but not saved yet.
    const previous = lastServer.current;
    lastServer.current = initial;
    setMarks((current) => Object.fromEntries(Object.entries(initial).map(([id, status]) =>
      [id, current[id] !== previous[id] ? current[id] : status])));
  }, [initial]);

  const cancelled = session.status === "cancelled";
  const changed = session.roster.some((r) => marks[r.personId] !== r.status);
  useEffect(() => onDirtyChange(changed), [changed, onDirtyChange]);
  const [bulkNote, setBulkNote] = useState("");
  const markEveryonePresent = () => {
    setMarks((current) => markAllPresent(session.roster, current));
    const kept = session.roster.filter((r) => r.source && KEPT_SOURCES.has(r.source)).length;
    setBulkNote(kept ? `Marked the rest present. ${kept} on approved leave or checked in stay as they are.` : "Marked everyone present.");
  };
  const checkedIn = session.roster.filter((r) => r.source === "checkin").length;
  const unmarked = session.roster.filter((r) => !marks[r.personId]).length;

  const save = () => {
    const records = session.roster.flatMap((r) => {
      const status = marks[r.personId];
      return status ? [{ personId: r.personId, status }] : [];
    });
    mark.mutate({ sessionId: session.id, records });
  };

  const startCheckin = () => openCheckin.mutate(session.id, { onSuccess: setCode });
  const problem = [mark.error, openCheckin.error].find(Boolean);

  return (
    <section className="panel tatt-roster" aria-labelledby="roster-title">
      <div className="panel-head tatt-roster-head">
        <div>
          <h2 id="roster-title">{session.courseCode} {session.kind}</h2>
          <p className="st-muted tnum">
            {formatTime(session.startsAt)} to {formatTime(session.endsAt)}
            {session.room ? ` · ${session.room}` : ""} · {session.roster.length} students
          </p>
        </div>
        {!cancelled && (
          <div className="tatt-actions">
            <Button variant="secondary" size="sm" loading={openCheckin.isPending} onClick={startCheckin}>
              <QrCode size={14} aria-hidden="true" /> {session.checkinOpenUntil ? "New check-in code" : "Start check-in"}
            </Button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={markEveryonePresent}>
              <CheckCircle size={14} aria-hidden="true" /> Mark all present
            </button>
          </div>
        )}
      </div>

      {cancelled ? (
        <EmptyState icon={<Prohibit size={20} aria-hidden="true" />} title="This class was cancelled"
          body="Cancelled classes don't count toward attendance, so there's nothing to mark." />
      ) : session.roster.length === 0 ? (
        <EmptyState icon={<UsersThree size={20} aria-hidden="true" />} title="No students in this class" body="The class roster is empty." />
      ) : (
        <>
          {checkedIn > 0 && <p className="tatt-checked st-muted" role="status">{checkedIn} checked in with the code.</p>}
          <p className="sr-only" role="status">{bulkNote}</p>
          <ul className="tatt-list">
            {session.roster.map((student) => (
              <li key={student.personId} className="tatt-student">
                <span className="tatt-name">
                  {student.name}
                  {student.source === "checkin" && <span className="tatt-source">Checked in</span>}
                  {student.source === "leave" && <span className="tatt-source">On approved leave</span>}
                </span>
                <StatusPicker name={student.name} value={marks[student.personId]}
                  onChange={(status) => setMarks((m) => ({ ...m, [student.personId]: status }))} />
              </li>
            ))}
          </ul>
          <div className="tatt-save">
            <span className="st-muted" role="status">
              {mark.isSuccess && !changed ? "Saved." : changed ? `Unsaved changes${unmarked ? `, ${unmarked} not marked` : ""}.` : ""}
            </span>
            <Button variant="primary" loading={mark.isPending} disabled={!changed} onClick={save}>Save attendance</Button>
          </div>
        </>
      )}
      {problem && <div className="st-pad"><Alert tone="danger">{problem instanceof ApiError ? problem.message : "That didn't save. Try again."}</Alert></div>}
      {code && (
        <CheckinCode code={code.code} openUntil={code.openUntil} course={`${session.courseCode} ${session.kind}`}
          refreshing={refreshing} checkedIn={checkedIn} onRefresh={onRefresh} onClose={() => setCode(null)} />
      )}
    </section>
  );
}

/** One radio group per student: arrow keys move between statuses, as in the ARIA radio pattern. */
function StatusPicker({ name, value, onChange }: {
  name: string;
  value: AttendanceStatus | null;
  onChange: (status: AttendanceStatus) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = value ? STATUSES.indexOf(value) : -1;

  const onKey = (event: KeyboardEvent, index: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = (index + step + STATUSES.length) % STATUSES.length;
    onChange(STATUSES[next]);
    refs.current[next]?.focus();
  };

  return (
    <div className="tatt-picker" role="radiogroup" aria-label={`Attendance for ${name}`}>
      {STATUSES.map((status, index) => (
        <button key={status} ref={(el) => { refs.current[index] = el; }} type="button" role="radio"
          aria-checked={value === status} tabIndex={index === Math.max(current, 0) ? 0 : -1}
          className={`tatt-option is-${status}`} onClick={() => onChange(status)} onKeyDown={(e) => onKey(e, index)}>
          {ATTENDANCE_LABELS[status]}
        </button>
      ))}
    </div>
  );
}

/** A large code for projecting in class, with how long it stays valid. */
function CheckinCode({ code, openUntil, course, checkedIn, refreshing, onRefresh, onClose }: {
  code: string;
  openUntil: string;
  course: string;
  checkedIn: number;
  refreshing: boolean;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), SECOND_MS);
    return () => window.clearInterval(timer);
  }, []);
  const secondsLeft = Math.max(0, Math.round((Date.parse(openUntil) - now) / SECOND_MS));
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <Drawer title={`Check-in for ${course}`} sub="Show this on the projector. Students enter it under Schedule, Attendance."
      onClose={onClose}>
      <div className="tatt-code-wrap">
        <p className="tatt-code tnum"><span aria-hidden="true">{code}</span><span className="sr-only">Check-in code {code.split("").join(" ")}</span></p>
        <p className="tatt-countdown tnum" role="timer" aria-live="off">
          {secondsLeft > 0 ? `Closes in ${minutes}:${seconds}` : "Check-in has closed"}
        </p>
        <p className="st-muted" role="status">{checkedIn} {checkedIn === 1 ? "student has" : "students have"} checked in.</p>
        <Button variant="secondary" size="sm" loading={refreshing} onClick={onRefresh}>
          <ArrowsClockwise size={14} aria-hidden="true" /> Refresh count
        </Button>
      </div>
    </Drawer>
  );
}
