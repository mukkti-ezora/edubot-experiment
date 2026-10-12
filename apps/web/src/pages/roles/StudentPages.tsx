import { Badge, EmptyState } from "@/components/ui";
import { FeeSummary } from "@/components/RoleDashboard";
import { SubjectBars } from "@/components/SubjectBars";
import { formatNumber } from "@/lib/format";
import { workTone, type WorkStatus } from "@/lib/roleDashboard";
import type { StudentDashboardData } from "@/pages/StudentDashboard";
import { Panel, RolePage } from "./RolePage";
import "@/styles/pages/student-dashboard.css";

export function StudentGrades() {
  return (
    <RolePage<StudentDashboardData>
      role="student"
      title="Grades"
      sub={(d) => `${d.subjects.length} subjects this term`}
    >
      {(data) => (
        <div className="rd-grid-2col">
          <Panel title="By subject">
            <SubjectBars subjects={data.subjects} />
          </Panel>
          <Panel title="Graded work" flush>
            <WorkList items={data.assignments.filter((a) => a.status === "graded")} empty="No graded work yet." />
          </Panel>
        </div>
      )}
    </RolePage>
  );
}

const STATUS_ORDER: WorkStatus[] = ["overdue", "pending", "submitted", "graded"];
const STATUS_TITLE: Record<WorkStatus, string> = { overdue: "Overdue", pending: "To do", submitted: "Submitted", graded: "Graded" };

export function StudentAssignments() {
  return (
    <RolePage<StudentDashboardData>
      role="student"
      title="Assignments"
      sub={(d) => `${d.assignments.filter((a) => a.status === "pending").length} due soon`}
    >
      {(data) => (
        <div className="rd-col">
          {STATUS_ORDER.map((status) => {
            const items = data.assignments.filter((a) => a.status === status);
            if (items.length === 0) return null;
            return (
              <Panel key={status} title={STATUS_TITLE[status]} count={`${items.length}`} flush>
                <WorkList items={items} empty="" />
              </Panel>
            );
          })}
        </div>
      )}
    </RolePage>
  );
}

export function StudentFees() {
  return (
    <RolePage<StudentDashboardData> role="student" title="Fees" sub="This academic year">
      {(data) => {
        const paidShare = data.fees.total > 0 ? Math.round((data.fees.paid / data.fees.total) * 100) : 0;
        return (
          <div className="rd-grid-2col">
            <FeeSummary fees={data.fees} />
            <Panel title="Progress">
              <div
                className="sb-bar-track"
                role="meter"
                aria-label="Share of fees paid"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={paidShare}
              >
                <div className="sb-bar-fill" style={{ ["--sb-fill-w" as string]: `${paidShare}%`, ["--sb-fill-color" as string]: "var(--success-500)" }} />
              </div>
              <p className="rd-li-meta">
                {paidShare}% paid. ${formatNumber(data.fees.balance)} left, next payment due {data.fees.nextDue}.
              </p>
            </Panel>
          </div>
        );
      }}
    </RolePage>
  );
}

function WorkList({ items, empty }: { items: StudentDashboardData["assignments"]; empty: string }) {
  if (items.length === 0) return <EmptyState title="Nothing here" body={empty} />;
  return (
    <div className="rd-list">
      {items.map((a) => (
        <div key={a.title} className="rd-list-item">
          <div className="rd-li-main">
            <span className="rd-li-title">{a.title}</span>
            <span className="rd-li-meta">{a.subject} &middot; {a.due}</span>
          </div>
          <Badge tone={workTone(a.status)}>{a.score ?? a.status}</Badge>
        </div>
      ))}
    </div>
  );
}
