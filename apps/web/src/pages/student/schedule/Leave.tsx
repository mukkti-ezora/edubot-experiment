import { useState, type FormEvent } from "react";
import { CheckCircle, Hourglass, Plus, Suitcase, XCircle } from "@phosphor-icons/react";
import { ApiError } from "@/lib/api";
import {
  daysBetween, LEAVE_KINDS, leaveRangeProblem, MAX_LEAVE_DAYS, useApplyLeave, useLeave, type LeaveKind, type LeaveRequest,
  type RequestStatus,
} from "@/lib/schedule";
import { useAttachments } from "@/components/files/useAttachments";
import { AttachmentPicker } from "@/components/files/AttachmentPicker";
import { AttachmentList } from "@/components/files/AttachmentList";
import { Button, Drawer, EmptyState, ErrorState, Field, SkeletonRows } from "@/components/ui";
import { ScheduleNav } from "./Schedule";
import "@/styles/pages/student.css";
import "@/styles/pages/schedule.css";

const dayFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const kindLabel = (kind: LeaveKind) => LEAVE_KINDS.find((k) => k.id === kind)?.label ?? kind;
const REASON_MAX = 2000;

/** Leave, medical leave and on-duty requests. Approved days are excused (or counted as on duty) in attendance. */
export function Leave() {
  const [applying, setApplying] = useState(false);
  const { data, isLoading, isError, refetch } = useLeave();

  return (
    <div className="st-page">
      <header className="sch-head">
        <div>
          <h1 className="st-title st-title-sm">Leave</h1>
          <p className="st-muted">Request leave or on-duty days. Once approved, those classes don't count against your attendance.</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setApplying(true)}>
          <Plus size={14} weight="bold" aria-hidden="true" /> Apply for leave
        </button>
      </header>
      <ScheduleNav />

      <section className="panel" aria-label="Your leave requests">
        {isError ? (
          <ErrorState title="Your leave requests couldn't load" onRetry={() => void refetch()} />
        ) : isLoading || !data ? (
          <div className="st-pad"><SkeletonRows rows={3} /></div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={<Suitcase size={20} aria-hidden="true" />} title="No leave requests"
            body="If you'll miss classes for illness, family reasons or an institution event, apply here so your teacher can approve it." />
        ) : (
          <ul className="leave-list">
            {data.items.map((leave) => <LeaveRow key={leave.id} leave={leave} />)}
          </ul>
        )}
      </section>

      {applying && <ApplyLeave onClose={() => setApplying(false)} />}
    </div>
  );
}

function LeaveRow({ leave }: { leave: LeaveRequest }) {
  return (
    <li className="leave-row">
      <div className="leave-row-head">
        <span className="leave-kind">{kindLabel(leave.kind)}</span>
        <RequestStatusChip status={leave.status} />
      </div>
      <p className="leave-dates tnum">
        {formatRange(leave.fromDate, leave.toDate)} · {leave.days} {leave.days === 1 ? "day" : "days"}
      </p>
      <p className="leave-reason">{leave.reason}</p>
      {leave.decisionNote && <p className="leave-note"><span className="leave-note-label">Teacher's note:</span> {leave.decisionNote}</p>}
      <AttachmentList attachments={leave.attachments} role="student" />
    </li>
  );
}

export function formatRange(fromDate: string, toDate: string): string {
  const from = dayFormat.format(new Date(`${fromDate}T00:00:00`));
  return fromDate === toDate ? from : `${from} to ${dayFormat.format(new Date(`${toDate}T00:00:00`))}`;
}

const STATUS_VIEW: Record<RequestStatus, { label: string; tone: string; Icon: typeof CheckCircle }> = {
  pending: { label: "Waiting for approval", tone: "warn", Icon: Hourglass },
  approved: { label: "Approved", tone: "ok", Icon: CheckCircle },
  declined: { label: "Declined", tone: "danger", Icon: XCircle },
};

export function RequestStatusChip({ status }: { status: RequestStatus }) {
  const view = STATUS_VIEW[status];
  return (
    <span className={`att-chip tone-${view.tone}`}>
      <view.Icon size={13} weight="fill" aria-hidden="true" /> {view.label}
    </span>
  );
}

interface FormErrors {
  dates?: string;
  reason?: string;
}

function ApplyLeave({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<LeaveKind>("leave");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const files = useAttachments("student");
  const apply = useApplyLeave();
  const days = fromDate && toDate ? daysBetween(fromDate, toDate) : 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: FormErrors = {};
    const rangeProblem = leaveRangeProblem(fromDate, toDate);
    if (rangeProblem) found.dates = rangeProblem;
    if (!reason.trim()) found.reason = "Tell your teacher why you'll be away.";
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(found.dates ? "leave-from" : "leave-reason")?.focus();
      return;
    }
    apply.mutate({ kind, fromDate, toDate, reason: reason.trim(), attachmentIds: files.ids }, { onSuccess: onClose });
  };

  const serverProblem = apply.error instanceof ApiError ? apply.error.message : apply.isError ? "The request couldn't be sent. Try again." : null;

  return (
    <Drawer title="Apply for leave" sub="Your teacher reviews the request. Approved days are excused in attendance."
      onClose={onClose} dismissible={!apply.isPending}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={apply.isPending}>Cancel</button>
          <Button variant="primary" type="submit" form="leave-form" loading={apply.isPending} disabled={files.uploading}>
            Send request
          </Button>
        </>
      )}>
      <form id="leave-form" className="leave-form" onSubmit={submit} noValidate>
        <fieldset className="leave-kinds">
          <legend>Type</legend>
          {LEAVE_KINDS.map((option) => (
            <label key={option.id} className="leave-kind-option">
              <input type="radio" name="leave-kind" value={option.id} checked={kind === option.id}
                onChange={() => setKind(option.id)} data-autofocus={option.id === "leave" ? true : undefined} />
              {option.label}
            </label>
          ))}
        </fieldset>
        <div className="leave-dates-row">
          <Field label="First day" htmlFor="leave-from" error={errors.dates}>
            <input id="leave-from" type="date" className="input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </Field>
          <Field label="Last day" htmlFor="leave-to">
            <input id="leave-to" type="date" className="input" value={toDate} min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)} />
          </Field>
        </div>
        <p className="st-muted leave-days tnum" aria-live="polite">
          {days > 0 ? `${days} ${days === 1 ? "day" : "days"} (up to ${MAX_LEAVE_DAYS})` : `Up to ${MAX_LEAVE_DAYS} days per request.`}
        </p>
        <Field label="Reason" htmlFor="leave-reason" error={errors.reason}>
          <textarea id="leave-reason" className="input" rows={4} maxLength={REASON_MAX} value={reason}
            onChange={(e) => setReason(e.target.value)} />
        </Field>
        <AttachmentPicker attachments={files}
          label={kind === "medical" ? "Attach a medical certificate" : kind === "on_duty" ? "Attach the duty letter" : "Attach a document"} />
        {serverProblem && <p className="att-checkin-error" role="alert">{serverProblem}</p>}
      </form>
    </Drawer>
  );
}
