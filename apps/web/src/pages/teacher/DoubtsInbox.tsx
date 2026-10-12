import { Link, useSearchParams } from "react-router-dom";
import { ChatsCircle } from "@phosphor-icons/react";
import { relativeTime, useInbox, type ClassDoubtSummary, type Inbox, type InboxFilter } from "@/lib/doubts";
import { DoubtFilter, DoubtStatusChip } from "@/components/doubts/parts";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui";
import { SubjectGlyph } from "@/pages/student/subject";
import "@/styles/pages/student.css";
import "@/styles/pages/doubts.css";

const FILTERS: { id: InboxFilter; label: string; empty: string }[] = [
  { id: "open", label: "Waiting", empty: "No students are waiting on you. New doubts from your classes appear here." },
  { id: "overdue", label: "Overdue", empty: "Nothing is past its reply target." },
  { id: "answered", label: "Answered", empty: "Doubts you've replied to wait here until the student resolves them or follows up." },
  { id: "resolved", label: "Resolved", empty: "Doubts students have marked resolved are kept here." },
  { id: "all", label: "All", empty: "No doubts from your classes yet." },
];

function countFor(id: InboxFilter, counts: Inbox["counts"] | undefined): number | undefined {
  if (!counts) return undefined;
  return id === "all" ? counts.open + counts.answered + counts.resolved : counts[id];
}

/** Questions from the students in the teacher's classes, most urgent first. */
export function DoubtsInbox() {
  const [params, setParams] = useSearchParams();
  const active = FILTERS.find((f) => f.id === params.get("status")) ?? FILTERS[0];
  const filter = active.id;
  const setFilter = (next: InboxFilter) => setParams({ status: next }, { replace: true });
  const { data, isLoading, isError, refetch } = useInbox(filter);

  return (
    <div className="st-page">
      <header className="doubts-head">
        <div>
          <h1 className="st-title st-title-sm">Doubts</h1>
          <p className="st-muted">Questions from students in your classes. Each one carries the lesson and any EduBot chat it came from.</p>
        </div>
      </header>

      {data && <Insights inbox={data} />}

      <DoubtFilter label="Show doubts" value={filter} onChange={setFilter}
        options={FILTERS.map((f) => ({ id: f.id, label: f.label, count: countFor(f.id, data?.counts) }))} />

      <section className="panel" aria-label={`${active.label} doubts`}>
        {isError ? (
          <ErrorState title="Doubts couldn't load" onRetry={() => void refetch()} />
        ) : isLoading || !data ? (
          <div className="st-pad"><SkeletonRows rows={5} /></div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={<ChatsCircle size={20} aria-hidden="true" />} title="All clear" body={active.empty} />
        ) : (
          <ul className="doubt-list">
            {data.items.map((doubt) => <InboxRow key={doubt.id} doubt={doubt} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

function Insights({ inbox }: { inbox: Inbox }) {
  const { counts, insights } = inbox;
  return (
    <dl className="doubt-insights">
      <div><dt>Waiting</dt><dd className="tnum">{counts.open}</dd></div>
      <div className={counts.overdue ? "is-alert" : undefined}><dt>Overdue</dt><dd className="tnum">{counts.overdue}</dd></div>
      <div>
        <dt>Average first reply</dt>
        <dd className="tnum">{insights.avgFirstResponseHours === null ? "No replies yet" : `${insights.avgFirstResponseHours} h`}</dd>
      </div>
      <div className="is-wide">
        <dt>Most asked, last {insights.windowDays} days</dt>
        <dd>
          {insights.topTopics.length === 0 ? "Not enough doubts yet" : (
            <ul className="doubt-top-topics">
              {insights.topTopics.map((t) => <li key={t.id}>{t.title} <span className="tnum">{t.count}</span></li>)}
            </ul>
          )}
        </dd>
      </div>
    </dl>
  );
}

function InboxRow({ doubt }: { doubt: ClassDoubtSummary }) {
  const when = doubt.status === "open"
    ? doubt.overdue ? `Reply was due ${relativeTime(doubt.replyDueAt)}` : `Reply due ${relativeTime(doubt.replyDueAt)}`
    : `Updated ${relativeTime(doubt.updatedAt)}`;
  return (
    <li>
      <Link to={`/t/doubts/${doubt.id}`} className={`doubt-row${doubt.overdue ? " is-overdue" : ""}`}>
        <SubjectGlyph subject={doubt.subject} />
        <span className="doubt-row-main">
          <span className="doubt-row-title">{doubt.title}</span>
          <span className="doubt-row-meta">
            {doubt.student.name} · {doubt.courseCode}{doubt.topic ? ` · ${doubt.topic.title}` : ""}
          </span>
          {doubt.lastMessage && <span className="doubt-row-preview">{doubt.lastMessage.preview}</span>}
        </span>
        <span className="doubt-row-side">
          <DoubtStatusChip status={doubt.status} overdue={doubt.overdue} viewer="teacher" />
          <span className="doubt-row-when">{when}</span>
        </span>
      </Link>
    </li>
  );
}
