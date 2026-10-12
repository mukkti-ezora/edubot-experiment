import "@/styles/timetable.css";

export type TimetableStatus = "completed" | "ongoing" | "upcoming";

const STATUS_LABEL: Record<TimetableStatus, string> = {
  completed: "Completed",
  ongoing: "Ongoing",
  upcoming: "Upcoming",
};

export interface TimetableEntry {
  time: string;
  duration?: string;
  subject: string;
  teacher?: string;
  /** Secondary line under the subject when the teacher isn't shown (e.g. the class). */
  detail?: string;
  room: string;
  students?: number;
  status: TimetableStatus;
}

interface TimetableProps {
  entries: TimetableEntry[];
  showTeacher?: boolean;
}

export function Timetable({ entries, showTeacher = true }: TimetableProps) {
  if (entries.length === 0) {
    return (
      <div className="tt-empty">
        <span className="tt-empty-text">No classes scheduled</span>
      </div>
    );
  }

  return (
    <div className={`tt-table${showTeacher ? "" : " tt-table-students"}`} role="table" aria-label="Today's timetable">
      <div className="tt-header" role="row">
        <span className="tt-col-time" role="columnheader">Time</span>
        <span className="tt-col-subject" role="columnheader">{showTeacher ? "Subject / Teacher" : "Subject / Class"}</span>
        <span className="tt-col-room" role="columnheader">Room</span>
        {!showTeacher && <span className="tt-col-students" role="columnheader">Students</span>}
        <span className="tt-col-status" role="columnheader">Status</span>
      </div>
      {entries.map((entry) => (
        <div key={`${entry.time}-${entry.subject}`} className={`tt-row tt-row-${entry.status}`} role="row">
          <span className="tt-col-time" role="cell">
            <span className="tt-time tnum">{entry.time}</span>
            {entry.duration && (
              <span className="tt-duration">{entry.duration}</span>
            )}
          </span>
          <span className="tt-col-subject" role="cell">
            <span className={`tt-subject${entry.status === "completed" ? " tt-strike" : ""}`}>
              {entry.subject}
            </span>
            {(showTeacher ? entry.teacher : entry.detail) && (
              <span className="tt-teacher">{showTeacher ? entry.teacher : entry.detail}</span>
            )}
          </span>
          <span className="tt-col-room tt-mono" role="cell">{entry.room}</span>
          {!showTeacher && (
            <span className="tt-col-students tnum" role="cell">{entry.students ?? "--"}</span>
          )}
          <span className="tt-col-status" role="cell">
            <span className={`tt-status-badge tt-status-${entry.status}`}>
              {entry.status === "ongoing" && (
                <span className="tt-dot-live" aria-hidden="true" />
              )}
              {STATUS_LABEL[entry.status]}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
