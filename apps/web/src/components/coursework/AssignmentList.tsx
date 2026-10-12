import { Link } from "react-router-dom";
import { CalendarPlus, ChatCircleText } from "@phosphor-icons/react";
import { relativeTime } from "@/lib/doubts";
import { useAssignments, type AssignmentStatus, type AssignmentSummary } from "@/lib/coursework";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui";
import { SubjectGlyph } from "@/pages/student/subject";
import { AssignmentStatusChip } from "./StatusChip";
import "@/styles/pages/coursework.css";

export function formatDue(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function dueLine(item: AssignmentSummary): string {
  if (item.status === "graded" || item.status === "submitted" || item.status === "late") return `Due ${formatDue(item.effectiveDueAt)}`;
  if (item.status === "missing") return `Closed ${relativeTime(item.closesAt)}`;
  const past = new Date(item.effectiveDueAt).getTime() < Date.now();
  return past ? `Was due ${relativeTime(item.effectiveDueAt)}` : `Due ${relativeTime(item.effectiveDueAt)}`;
}

/** Presentational rows; use AssignmentList when the component should fetch for itself. */
export function AssignmentRows({ items }: { items: AssignmentSummary[] }) {
  return (
    <ul className="cw-list">
      {items.map((item) => {
        const extended = item.extension?.status === "approved";
        return (
          <li key={item.id}>
            <Link to={`/s/assignments/${item.id}`} className={`cw-row is-${item.status}`}>
              <SubjectGlyph subject={item.subject} />
              <span className="cw-row-main">
                <span className="cw-row-title">{item.title}</span>
                <span className="cw-row-meta">
                  {item.courseCode} · {item.points} points
                  {extended && <span className="cw-row-flag"><CalendarPlus size={12} aria-hidden="true" /> Extended</span>}
                  {item.extension?.status === "pending" && <span className="cw-row-flag">Extension requested</span>}
                  {item.feedbackReady && <span className="cw-row-flag is-new"><ChatCircleText size={12} aria-hidden="true" /> New feedback</span>}
                </span>
              </span>
              <span className="cw-row-side">
                <AssignmentStatusChip status={item.status} score={item.score} points={item.points} />
                <time className="cw-row-when tnum" dateTime={item.effectiveDueAt} title={formatDue(item.effectiveDueAt)}>
                  {dueLine(item)}
                </time>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The student's assignments across courses, soonest first, for the Practice hub.
 * `statuses` narrows the list (for example ["not_started", "draft"] for "to do"); `limit` caps it.
 */
export function AssignmentList({
  statuses,
  limit,
  emptyTitle = "Nothing to hand in",
  emptyBody = "When your teachers set assignments, they appear here with their deadlines.",
}: {
  statuses?: AssignmentStatus[];
  limit?: number;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const { data, isLoading, isError, refetch } = useAssignments();
  if (isError) return <ErrorState title="Assignments couldn't load" onRetry={() => void refetch()} />;
  if (isLoading || !data) return <div className="cw-pad"><SkeletonRows rows={3} /></div>;
  const shown = data.items.filter((item) => !statuses || statuses.includes(item.status)).slice(0, limit);
  if (shown.length === 0) return <EmptyState title={emptyTitle} body={emptyBody} />;
  return <AssignmentRows items={shown} />;
}
