import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChatsCircle, Plus } from "@phosphor-icons/react";
import { isReplyLate, relativeTime, useMyDoubts, type DoubtStatus, type DoubtSummary } from "@/lib/doubts";
import { AskTeacher } from "@/components/doubts/AskTeacher";
import { DoubtFilter, DoubtStatusChip } from "@/components/doubts/parts";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui";
import { SubjectGlyph } from "./subject";
import "@/styles/pages/student.css";
import "@/styles/pages/doubts.css";

const FILTERS: { id: DoubtStatus; label: string; empty: { title: string; body: string } }[] = [
  { id: "open", label: "Open", empty: { title: "No open doubts", body: "When something in a lesson doesn't click, use Ask your teacher on the lesson, or start one here." } },
  { id: "answered", label: "Answered", empty: { title: "Nothing answered yet", body: "Teacher replies land here. Follow up if you're still unsure, or mark the doubt resolved." } },
  { id: "resolved", label: "Resolved", empty: { title: "No resolved doubts", body: "Doubts you mark as resolved are kept here for revision." } },
];

/** A student's questions to their teachers, one list per state. */
export function Doubts() {
  const [params, setParams] = useSearchParams();
  const filter = FILTERS.find((f) => f.id === params.get("status")) ?? FILTERS[0];
  const status = filter.id;
  const setStatus = (next: DoubtStatus) => setParams({ status: next }, { replace: true });
  const [asking, setAsking] = useState(false);
  const { data, isLoading, isError, refetch } = useMyDoubts(status);

  return (
    <div className="st-page">
      <header className="doubts-head">
        <div>
          <h1 className="st-title st-title-sm">Doubts</h1>
          <p className="st-muted">Questions you've asked your teachers. Only you and the teacher of that class can see them.</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAsking(true)}>
          <Plus size={14} weight="bold" aria-hidden="true" /> New doubt
        </button>
      </header>

      <DoubtFilter label="Show doubts" value={status} onChange={setStatus}
        options={FILTERS.map((f) => ({ id: f.id, label: f.label, count: data?.counts[f.id] }))} />

      <section className="panel" aria-label={`${filter.label} doubts`}>
        {isError ? (
          <ErrorState title="Your doubts couldn't load" onRetry={() => void refetch()} />
        ) : isLoading || !data ? (
          <div className="st-pad"><SkeletonRows rows={4} /></div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={<ChatsCircle size={20} aria-hidden="true" />} title={filter.empty.title} body={filter.empty.body} />
        ) : (
          <ul className="doubt-list">
            {data.items.map((doubt) => <StudentDoubtRow key={doubt.id} doubt={doubt} />)}
          </ul>
        )}
      </section>

      {asking && <AskTeacher onClose={() => setAsking(false)} />}
    </div>
  );
}

function StudentDoubtRow({ doubt }: { doubt: DoubtSummary }) {
  const when = doubt.status !== "open"
    ? `Updated ${relativeTime(doubt.updatedAt)}`
    : isReplyLate(doubt) ? "Taking longer than usual" : `Reply expected ${relativeTime(doubt.replyDueAt)}`;
  return (
    <li>
      <Link to={`/s/doubts/${doubt.id}`} className="doubt-row">
        <SubjectGlyph subject={doubt.subject} />
        <span className="doubt-row-main">
          <span className="doubt-row-title">{doubt.title}</span>
          <span className="doubt-row-meta">{doubt.courseCode}{doubt.topic ? ` · ${doubt.topic.title}` : ""}</span>
          {doubt.lastMessage && (
            <span className="doubt-row-preview">
              {doubt.lastMessage.authorRole === "teacher" ? "Teacher: " : "You: "}{doubt.lastMessage.preview}
            </span>
          )}
        </span>
        <span className="doubt-row-side">
          <DoubtStatusChip status={doubt.status} viewer="student" />
          <span className="doubt-row-when">{when}</span>
        </span>
      </Link>
    </li>
  );
}
