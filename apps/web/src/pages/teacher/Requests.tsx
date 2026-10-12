import { useId, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Certificate, ClockCountdown, Suitcase } from "@phosphor-icons/react";
import { ApiError } from "@/lib/api";
import { LEAVE_KINDS } from "@/lib/schedule";
import {
  useCreditRequests, useDecide, useExtensionRequests, useLeaveRequests, type CreditItem, type ExtensionItem, type LeaveItem,
  type RequestKind,
} from "@/lib/requests";
import { AttachmentList } from "@/components/files/AttachmentList";
import { Button, ConfirmDialog, EmptyState, ErrorState, SkeletonRows, Tabs } from "@/components/ui";
import { formatRange, RequestStatusChip } from "@/pages/student/schedule/Leave";
import "@/styles/pages/student.css";
import "@/styles/pages/schedule.css";

const dateTimeFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const TABS: { id: RequestKind; label: string }[] = [
  { id: "leave", label: "Leave" },
  { id: "extensions", label: "Extensions" },
  { id: "credits", label: "Credit transfers" },
];
const NOTE_MAX = 1000;

/** Everything waiting on the teacher's decision: leave, assignment extensions and advisees' credit transfers. */
export function TeacherRequests() {
  const [params, setParams] = useSearchParams();
  const active = TABS.find((t) => t.id === params.get("tab"))?.id ?? "leave";
  const leave = useLeaveRequests();
  const extensions = useExtensionRequests();
  const credits = useCreditRequests();
  const pendingCount = (items?: { status: string }[]) => items?.filter((i) => i.status === "pending").length;

  return (
    <div className="st-page">
      <header>
        <h1 className="st-title st-title-sm">Requests</h1>
        <p className="st-muted">Leave from students in your classes, extension requests on your assignments, and credit transfers from students you advise.</p>
      </header>
      <Tabs active={active} onChange={(id) => setParams({ tab: id }, { replace: true })}
        tabs={[
          { id: "leave", label: "Leave", count: pendingCount(leave.data?.items) },
          { id: "extensions", label: "Extensions", count: pendingCount(extensions.data?.items) },
          { id: "credits", label: "Credit transfers", count: credits.data?.pending },
        ]} />

      <section className="panel" role="tabpanel" aria-label={TABS.find((t) => t.id === active)?.label}>
        {active === "leave" && (
          <RequestList query={leave} kind="leave" emptyTitle="No leave waiting"
            emptyBody="Leave requests from students in your classes appear here."
            render={(item: LeaveItem) => <LeaveDetails item={item} />} />
        )}
        {active === "extensions" && (
          <RequestList query={extensions} kind="extensions" emptyTitle="No extension requests"
            emptyBody="Requests that weren't approved automatically come here for you to decide."
            render={(item: ExtensionItem) => <ExtensionDetails item={item} />} />
        )}
        {active === "credits" && (
          <RequestList query={credits} kind="credits" emptyTitle="No credit transfers"
            emptyBody="When a student you advise claims credit for an NPTEL or SWAYAM course, it appears here."
            render={(item: CreditItem) => <CreditDetails item={item} />} />
        )}
      </section>
    </div>
  );
}

interface Decidable {
  id: string;
  status: "pending" | "approved" | "declined";
  student: { name: string };
}

function RequestList<T extends Decidable>({ query, kind, render, emptyTitle, emptyBody }: {
  query: { data?: { items: T[] }; isLoading: boolean; isError: boolean; refetch: () => unknown };
  kind: RequestKind;
  render: (item: T) => React.ReactNode;
  emptyTitle: string;
  emptyBody: string;
}) {
  if (query.isError) return <ErrorState title="These requests couldn't load" onRetry={() => void query.refetch()} />;
  if (query.isLoading || !query.data) return <div className="st-pad"><SkeletonRows rows={3} /></div>;
  if (query.data.items.length === 0) {
    const Icon = kind === "leave" ? Suitcase : kind === "extensions" ? ClockCountdown : Certificate;
    return <EmptyState icon={<Icon size={20} aria-hidden="true" />} title={emptyTitle} body={emptyBody} />;
  }
  return (
    <ul className="req-list">
      {query.data.items.map((item) => (
        <li key={item.id} className="req-row">
          <div className="req-row-head">
            <span className="req-student">{item.student.name}</span>
            <RequestStatusChip status={item.status} />
          </div>
          {render(item)}
          {item.status === "pending" && <DecisionBar kind={kind} id={item.id} student={item.student.name} />}
        </li>
      ))}
    </ul>
  );
}

function LeaveDetails({ item }: { item: LeaveItem }) {
  return (
    <>
      <p className="req-what">
        {LEAVE_KINDS.find((k) => k.id === item.kind)?.label ?? item.kind}
        <span className="tnum"> · {formatRange(item.fromDate, item.toDate)} · {item.days} {item.days === 1 ? "day" : "days"}</span>
      </p>
      <p className="req-reason">{item.reason}</p>
      <AttachmentList attachments={item.attachments} role="teacher" />
    </>
  );
}

function ExtensionDetails({ item }: { item: ExtensionItem }) {
  return (
    <>
      <p className="req-what">
        {item.courseCode} · {item.assignment.title}
        <span className="tnum"> · due {dateTimeFormat.format(new Date(item.assignment.dueAt))}, asks until {dateTimeFormat.format(new Date(item.until))}</span>
      </p>
      <p className="req-reason">{item.reason}</p>
    </>
  );
}

function CreditDetails({ item }: { item: CreditItem }) {
  return (
    <>
      <p className="req-what">
        {item.course.provider} · {item.course.title}
        <span className="tnum"> · {item.course.credits} credits, {item.course.category} · scored {item.scorePercent}%</span>
      </p>
      {item.note && <p className="req-reason">Note: {item.note}</p>}
      {item.certificate ? <AttachmentList attachments={[item.certificate]} role="teacher" /> : <p className="st-muted req-reason">No certificate attached.</p>}
    </>
  );
}

/** Approve or decline with an optional note. Declining asks for confirmation, since the student is told at once. */
function DecisionBar({ kind, id, student }: { kind: RequestKind; id: string; student: string }) {
  const noteId = useId();
  const [note, setNote] = useState("");
  const [writing, setWriting] = useState(false);
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const decide = useDecide(kind);
  const decideAs = (approve: boolean) => decide.mutate({ id, approve, note }, { onSettled: () => setConfirmingDecline(false) });
  const verdict = decide.variables?.approve ? "Approving" : "Declining";

  return (
    <div className="req-decide" aria-busy={decide.isPending}>
      {writing ? (
        <div className="req-note">
          <label htmlFor={noteId} className="sch-sync-label">Note to {student} (optional)</label>
          <textarea id={noteId} className="input" rows={2} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWriting(true)}>Add a note</button>
      )}
      <div className="req-buttons">
        <Button variant="secondary" size="sm" loading={decide.isPending && decide.variables?.approve === false}
          disabled={decide.isPending} onClick={() => setConfirmingDecline(true)}>
          Decline
        </Button>
        <Button variant="primary" size="sm" loading={decide.isPending && decide.variables?.approve === true}
          disabled={decide.isPending} onClick={() => decideAs(true)}>
          Approve
        </Button>
      </div>
      <p className="sr-only" role="status">{decide.isPending ? `${verdict} the request from ${student}…` : ""}</p>
      {decide.isError && (
        <p className="att-checkin-error" role="alert">
          {decide.error instanceof ApiError ? decide.error.message : "That decision didn't save. Try again."}
        </p>
      )}
      {confirmingDecline && (
        <ConfirmDialog title="Decline this request?" confirmLabel="Decline" busy={decide.isPending}
          body={note.trim() ? `${student} will see your note: "${note.trim()}"` : `${student} will be told it was declined. Add a note first if you want to explain why.`}
          onConfirm={() => decideAs(false)} onClose={() => setConfirmingDecline(false)} />
      )}
    </div>
  );
}
