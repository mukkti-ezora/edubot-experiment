import { EmptyState } from "@/components/ui";
import { Timetable } from "@/components/Timetable";
import { SubjectBars } from "@/components/SubjectBars";
import type { TeacherDashboardData } from "@/pages/TeacherDashboard";
import { MessageList, Panel, RolePage } from "./RolePage";
import "@/styles/pages/teacher-dashboard.css";

export function TeacherClasses() {
  return (
    <RolePage<TeacherDashboardData> role="teacher" title="My classes" sub={(d) => `${d.classes.length} classes this term`}>
      {(data) => (
        <div className="rd-col">
          <Panel title="Classes" flush>
            <table className="rd-table">
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col">Subject</th>
                  <th scope="col" className="tnum">Students</th>
                  <th scope="col" className="tnum">Attendance</th>
                  <th scope="col" className="tnum">Avg marks</th>
                </tr>
              </thead>
              <tbody>
                {data.classes.map((c) => (
                  <tr key={`${c.name}-${c.subject}`}>
                    <td className="rd-li-title">{c.name}</td>
                    <td>{c.subject}</td>
                    <td className="tnum">{c.students}</td>
                    <td className="tnum">{c.attendance}%</td>
                    <td className="tnum">{c.avgMarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title="Today's periods">
            <Timetable
              entries={data.timetable.map((t) => ({ ...t, detail: t.class }))}
              showTeacher={false}
            />
          </Panel>
        </div>
      )}
    </RolePage>
  );
}

export function TeacherAttendance() {
  return (
    <RolePage<TeacherDashboardData> role="teacher" title="Attendance" sub="Average attendance by class this term">
      {(data) => (
        <Panel title="By class">
          <SubjectBars
            subjects={data.classes.map((c) => ({ name: `${c.name} · ${c.subject}`, score: c.attendance, grade: `${c.students} students` }))}
          />
        </Panel>
      )}
    </RolePage>
  );
}

export function TeacherGrading() {
  return (
    <RolePage<TeacherDashboardData>
      role="teacher"
      title="Grading"
      sub={(d) => `${d.pendingAssignments.length} assignments waiting for review`}
    >
      {(data) =>
        data.pendingAssignments.length === 0 ? (
          <EmptyState title="All caught up" body="Nothing is waiting for review." />
        ) : (
          <Panel title="To review" count={`${data.pendingAssignments.length}`} flush>
            <div className="rd-list">
              {data.pendingAssignments.map((a) => {
                const [done, total] = a.submitted.split("/").map(Number);
                const share = total ? Math.round((done / total) * 100) : 0;
                return (
                  <div key={`${a.title}-${a.class}`} className="rd-list-item">
                    <div className="rd-li-main">
                      <span className="rd-li-title">{a.title}</span>
                      <span className="rd-li-meta">{a.class} &middot; due {a.due.toLowerCase()}</span>
                    </div>
                    <span className="tnum rd-li-meta" aria-label={`${done} of ${total} submitted`}>
                      {a.submitted} submitted ({share}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
        )
      }
    </RolePage>
  );
}

export function TeacherMessages() {
  return (
    <RolePage<TeacherDashboardData> role="teacher" title="Messages" sub="From parents, colleagues and the office">
      {(data) => (
        <Panel title="Inbox" count={`${data.messages.length}`} flush>
          <MessageList messages={data.messages} />
        </Panel>
      )}
    </RolePage>
  );
}
