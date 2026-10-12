import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarPlus, CheckCircle, PaperPlaneTilt } from "@phosphor-icons/react";
import { ApiError } from "@/lib/api";
import {
  isHandedIn, isValidLink, lateWarning, useAssignment, useMarkFeedbackSeen, useRequestExtension, useSaveDraft,
  useSubmitWork, type AssignmentDetail, type Extension, type SubmissionDetail, type WorkInput,
} from "@/lib/coursework";
import { relativeTime } from "@/lib/doubts";
import { Prose } from "@/components/Prose";
import { AttachmentList } from "@/components/files/AttachmentList";
import { AttachmentPicker } from "@/components/files/AttachmentPicker";
import { useAttachments } from "@/components/files/useAttachments";
import { AssignmentStatusChip } from "@/components/coursework/StatusChip";
import { SubmittedLink } from "@/components/coursework/SubmittedLink";
import { formatScore } from "@/lib/format";
import { formatDue } from "@/components/coursework/AssignmentList";
import { Alert, Button, ConfirmDialog, Drawer, ErrorState, Field, SkeletonRows } from "@/components/ui";
import { SubjectGlyph } from "@/pages/student/subject";
import "@/styles/pages/student.css";
import "@/styles/pages/coursework.css";

const AUTOSAVE_DELAY_MS = 1200;

export function AssignmentView() {
  const { assignmentId = "" } = useParams();
  const { data, isLoading, isError, refetch } = useAssignment(assignmentId);
  if (isError) return <div className="st-page"><ErrorState title="This assignment couldn't load" onRetry={() => void refetch()} /></div>;
  if (isLoading || !data) return <div className="st-page"><SkeletonRows rows={8} /></div>;
  return <Assignment key={data.id} assignment={data} />;
}

const CLOCK_TICK_MS = 60_000;

/** The current time, refreshed every minute so "closed" flips while the page stays open. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function Assignment({ assignment }: { assignment: AssignmentDetail }) {
  const now = useNow();
  const closed = now > new Date(assignment.closesAt);
  const graded = assignment.status === "graded";
  const handedIn = isHandedIn(assignment.submission);
  const [replacing, setReplacing] = useState(false);
  const canEdit = !graded && !closed && (!handedIn || replacing);

  return (
    <div className="st-page cw-page">
      <nav className="st-crumbs" aria-label="Breadcrumb">
        <Link to="/s/practice">Practice</Link>
        <span aria-hidden="true">/</span>
        <span>{assignment.courseCode}</span>
      </nav>

      <Header assignment={assignment} />

      <div className="cw-layout">
        <div className="cw-main">
          {graded && assignment.submission && <Feedback assignment={assignment} submission={assignment.submission} />}
          {assignment.instructions && (
            <section className="panel" aria-labelledby="cw-instructions">
              <div className="panel-head"><h2 id="cw-instructions">Instructions</h2></div>
              <div className="panel-body"><Prose text={assignment.instructions} /></div>
            </section>
          )}
          {assignment.rubric.length > 0 && <Rubric assignment={assignment} />}
          {closed && !handedIn && (
            <Alert tone="danger" title="Submissions have closed">
              This closed {formatDue(assignment.closesAt)}. Talk to your teacher if something stopped you handing it in.
            </Alert>
          )}
          {closed && !handedIn && assignment.submission && <UnsubmittedDraft submission={assignment.submission} />}
          {canEdit
            ? <Editor assignment={assignment} replacing={replacing} onDone={() => setReplacing(false)} />
            : handedIn && assignment.submission && (
              <HandedIn assignment={assignment} submission={assignment.submission} closed={closed}
                onReplace={() => setReplacing(true)} />
            )}
        </div>
        <aside className="cw-aside" aria-label="Deadline and rules">
          <Facts assignment={assignment} />
          <Extensions assignment={assignment} closed={closed} />
        </aside>
      </div>
    </div>
  );
}

function Header({ assignment }: { assignment: AssignmentDetail }) {
  const extended = assignment.effectiveDueAt !== assignment.dueAt;
  return (
    <header className="cw-head">
      <SubjectGlyph subject={assignment.subject} size={24} />
      <div className="cw-head-main">
        <h1 className="st-title st-title-sm">{assignment.title}</h1>
        <p className="cw-head-meta">
          <span>{assignment.courseCode} · {assignment.courseTitle}</span>
          <span className="tnum">{assignment.points} points</span>
          <span>
            <time dateTime={assignment.effectiveDueAt}>Due {formatDue(assignment.effectiveDueAt)}</time>
            {extended && <> (extended from {formatDue(assignment.dueAt)})</>}
          </span>
        </p>
      </div>
      <AssignmentStatusChip status={assignment.status} score={assignment.score} points={assignment.points} />
    </header>
  );
}

function Rubric({ assignment }: { assignment: AssignmentDetail }) {
  const scored = new Map(assignment.submission?.rubricScores.map((s) => [s.criterion, s.points]));
  const graded = assignment.status === "graded";
  return (
    <section className="panel" aria-labelledby="cw-rubric">
      <div className="panel-head"><h2 id="cw-rubric">How it's marked</h2></div>
      <table className="cw-rubric">
        <thead>
          <tr><th scope="col">Criterion</th><th scope="col" className="num">{graded ? "Your score" : "Points"}</th></tr>
        </thead>
        <tbody>
          {assignment.rubric.map((criterion) => (
            <tr key={criterion.criterion}>
              <th scope="row">
                <span className="cw-rubric-name">{criterion.criterion}</span>
                {criterion.description && <span className="cw-rubric-desc">{criterion.description}</span>}
              </th>
              <td className="num tnum">
                {graded ? scoredPrefix(scored.get(criterion.criterion)) : ""}
                {criterion.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function scoredPrefix(points: number | undefined): string {
  return points === undefined ? "" : `${formatScore(points)} / `;
}

function Facts({ assignment }: { assignment: AssignmentDetail }) {
  const late = assignment.latePenaltyPercentPerDay;
  return (
    <section className="panel">
      <dl className="panel-body cw-facts">
        <div><dt>Due</dt><dd>{formatDue(assignment.effectiveDueAt)}<span className="cw-sub">{relativeTime(assignment.effectiveDueAt)}</span></dd></div>
        <div>
          <dt>Late work</dt>
          <dd>
            {assignment.acceptsLateDays > 0
              ? `Accepted for ${assignment.acceptsLateDays} ${assignment.acceptsLateDays === 1 ? "day" : "days"} after the deadline${late > 0 ? `, losing ${late}% per started day` : ""}.`
              : "Not accepted after the deadline."}
          </dd>
        </div>
        <div><dt>Closes</dt><dd>{formatDue(assignment.closesAt)}</dd></div>
        <div>
          <dt>Submissions</dt>
          <dd className="tnum">
            {assignment.resubmissionsLeft} of {1 + assignment.maxResubmissions} left
          </dd>
        </div>
        <div><dt>Counts toward</dt><dd>{assignment.gradeCategory}</dd></div>
      </dl>
    </section>
  );
}

// ---- writing and handing in ----

function initialWork(submission: SubmissionDetail | null): WorkInput {
  return { text: submission?.text ?? "", link: submission?.link ?? null, attachmentIds: [] };
}

function describeWork(work: WorkInput, files: number): string {
  const parts: string[] = [];
  const words = work.text.trim() ? work.text.trim().split(/\s+/).length : 0;
  if (words) parts.push(`${words} ${words === 1 ? "word" : "words"} of text`);
  if (work.link) parts.push("a link");
  if (files) parts.push(`${files} ${files === 1 ? "file" : "files"}`);
  return parts.length ? parts.join(", ") : "nothing yet";
}

function Editor({ assignment, replacing, onDone }: { assignment: AssignmentDetail; replacing: boolean; onDone: () => void }) {
  const ids = { text: useId(), link: useId() };
  const types = assignment.submissionTypes;
  const [work, setWork] = useState<WorkInput>(() => initialWork(assignment.submission));
  const [linkError, setLinkError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const attachments = useAttachments("student");
  const existingFiles = assignment.submission?.attachments ?? [];
  const [keptFiles, setKeptFiles] = useState(existingFiles.map((f) => f.id));
  const submit = useSubmitWork(assignment.id);
  const autosave = useAutosave(assignment, work, [...keptFiles, ...attachments.ids], !replacing);
  const partialLink = Boolean(work.link?.trim()) && !isValidLink(work.link?.trim() ?? "");

  const payload = (): WorkInput => ({
    text: work.text,
    link: work.link?.trim() ? work.link.trim() : null,
    attachmentIds: [...keptFiles, ...attachments.ids],
  });
  const empty = !work.text.trim() && !work.link?.trim() && keptFiles.length + attachments.ids.length === 0;
  const warning = lateWarning(assignment.effectiveDueAt, assignment.latePenaltyPercentPerDay);

  const review = (event: FormEvent) => {
    event.preventDefault();
    if (work.link?.trim() && !isValidLink(work.link)) {
      setLinkError("Enter a full web address, starting with https://");
      return;
    }
    setConfirming(true);
  };

  const handIn = () => {
    autosave.cancel(); // the hand-in carries this work; a queued draft must not follow it
    submit.mutate(payload(), {
      onSuccess: () => { setConfirming(false); attachments.clear(); onDone(); },
      onError: () => setConfirming(false),
    });
  };

  return (
    <form className="panel cw-editor" onSubmit={review} aria-labelledby="cw-your-work" noValidate>
      <div className="panel-head">
        <h2 id="cw-your-work">{replacing ? "Your new version" : "Your work"}</h2>
        {!replacing && <span className="cw-save-state" aria-live="off">{autosave.label}</span>}
      </div>
      <div className="panel-body cw-editor-body">
        {replacing && <p className="cw-note">Your new version replaces the one you handed in when you submit it.</p>}
        {types.includes("text") && (
          <Field label="Answer" htmlFor={ids.text}>
            <textarea id={ids.text} className="input cw-textarea" rows={10} maxLength={50_000} value={work.text}
              onChange={(e) => setWork({ ...work, text: e.target.value })} onPaste={attachments.onPaste}
              placeholder="Write your answer here. It saves as you type." />
          </Field>
        )}
        {types.includes("link") && (
          <Field label="Link" htmlFor={ids.link} error={linkError}
            help={partialLink && !replacing
              ? "Link not saved until it's a full web address, starting with https://"
              : "A shared document, repository or video. Make sure your teacher can open it."}>
            <input id={ids.link} className="input" type="url" inputMode="url" value={work.link ?? ""}
              placeholder="https://"
              onChange={(e) => { setWork({ ...work, link: e.target.value }); setLinkError(undefined); }} />
          </Field>
        )}
        {types.includes("file") && (
          <div className="cw-files">
            {existingFiles.filter((f) => keptFiles.includes(f.id)).length > 0 && (
              <ul className="cw-kept" aria-label="Files already attached">
                {existingFiles.filter((f) => keptFiles.includes(f.id)).map((file) => (
                  <li key={file.id}>
                    <span>{file.filename}</span>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setKeptFiles(keptFiles.filter((id) => id !== file.id))}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <AttachmentPicker attachments={attachments} label="Attach a file" />
          </div>
        )}
        {warning && <Alert tone="warn">{warning}</Alert>}
        {autosave.failed && <Alert tone="danger">Couldn't save your draft. Your work is still here; it will try again as you type.</Alert>}
        {submit.isError && <Alert tone="danger">{errorMessage(submit.error, "Your work wasn't handed in. Try again.")}</Alert>}
        <div className="cw-editor-actions">
          {replacing && <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>}
          <Button type="submit" size="sm" icon={<PaperPlaneTilt size={16} aria-hidden="true" />}
            disabled={empty || attachments.uploading}>
            {replacing ? "Submit new version" : "Hand in"}
          </Button>
        </div>
      </div>
      {confirming && (
        <ConfirmDialog
          title={replacing ? "Submit this new version?" : "Hand in your work?"}
          danger={false}
          busy={submit.isPending}
          confirmLabel={replacing ? "Submit new version" : "Hand in"}
          onConfirm={handIn}
          onClose={() => !submit.isPending && setConfirming(false)}
          body={
            <div className="cw-confirm">
              <p>You're handing in {describeWork(payload(), payload().attachmentIds.length)}.</p>
              <p className="tnum">This uses 1 of your {assignment.resubmissionsLeft} remaining {assignment.resubmissionsLeft === 1 ? "submission" : "submissions"}.</p>
              {warning && <p className="cw-confirm-warn">{warning}</p>}
            </div>
          }
        />
      )}
    </form>
  );
}

/**
 * Saves a draft shortly after typing stops. Saves run one at a time and only the latest work is queued, so an older
 * save can never land after a newer one. Unsaved work is sent when the editor closes, and leaving the page warns.
 */
function useAutosave(assignment: AssignmentDetail, work: WorkInput, attachmentIds: string[], enabled: boolean) {
  const save = useSaveDraft(assignment.id);
  const savedLink = assignment.submission?.link ?? null;
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [savedAt, setSavedAt] = useState<string | null>(assignment.submission?.updatedAt ?? null);
  const queued = useRef<WorkInput | null>(null);
  const inFlight = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const first = useRef(true);

  const send = useCallback(async () => {
    if (inFlight.current || !queued.current) return;
    const payload = queued.current;
    queued.current = null;
    inFlight.current = true;
    setState("saving");
    try {
      const detail = await save.mutateAsync(payload);
      setSavedAt(detail.submission?.updatedAt ?? null);
      if (!queued.current) setState("saved");
    } catch {
      setState("failed");
    } finally {
      inFlight.current = false;
      if (queued.current) void send();
    }
  }, [save]);

  const signature = JSON.stringify([work.text, work.link, attachmentIds]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!enabled) return;
    const link = work.link?.trim() ?? "";
    // A half-typed link keeps whatever valid link was saved before, rather than erasing it.
    queued.current = { text: work.text, link: link ? (isValidLink(link) ? link : savedLink) : null, attachmentIds };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void send(), AUTOSAVE_DELAY_MS);
  }, [signature, enabled]); // the signature captures every field that should trigger a save

  // Send unsaved work when the editor closes (route change, hand-in), and warn before the page unloads.
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!queued.current && !inFlight.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => {
      window.removeEventListener("beforeunload", guard);
      window.clearTimeout(timer.current);
      void send();
    };
  }, [send]);

  const label = state === "saving" ? "Saving…"
    : savedAt ? `Draft saved ${relativeTime(savedAt)}` : "Not saved yet";
  return { label, failed: state === "failed", cancel: () => { queued.current = null; window.clearTimeout(timer.current); } };
}

function UnsubmittedDraft({ submission }: { submission: SubmissionDetail }) {
  return (
    <section className="panel" aria-labelledby="cw-unsubmitted">
      <div className="panel-head"><h2 id="cw-unsubmitted">Your unsubmitted draft</h2></div>
      <div className="panel-body cw-work">
        <p className="cw-note">This was saved but never handed in. You can copy it, or show it to your teacher.</p>
        {submission.text && <p className="cw-work-text">{submission.text}</p>}
        <SubmittedLink link={submission.link} />
        <AttachmentList attachments={submission.attachments} role="student" />
      </div>
    </section>
  );
}

function HandedIn({ assignment, submission, closed, onReplace }: {
  assignment: AssignmentDetail;
  submission: SubmissionDetail;
  closed: boolean;
  onReplace: () => void;
}) {
  const graded = submission.status === "graded";
  const canReplace = !graded && !closed && assignment.resubmissionsLeft > 0;
  return (
    <section className="panel" aria-labelledby="cw-handed-in">
      <div className="panel-head">
        <h2 id="cw-handed-in">What you handed in</h2>
        <span className="cw-save-state tnum">Version {submission.revision}</span>
      </div>
      <div className="panel-body cw-work">
        <p className="cw-note" role="status">
          <CheckCircle size={16} weight="fill" aria-hidden="true" />
          Handed in {submission.submittedAt ? formatDue(submission.submittedAt) : ""}
          {submission.lateMinutes > 0 ? ", after the deadline." : ", on time."}
          {!graded && " Your teacher will grade it and you'll see the feedback here."}
        </p>
        {submission.text && <p className="cw-work-text">{submission.text}</p>}
        <SubmittedLink link={submission.link} />
        <AttachmentList attachments={submission.attachments} role="student" />
        {canReplace && (
          <div className="cw-editor-actions">
            <Button type="button" variant="secondary" size="sm" onClick={onReplace}>Submit a new version</Button>
          </div>
        )}
      </div>
    </section>
  );
}

function Feedback({ assignment, submission }: { assignment: AssignmentDetail; submission: SubmissionDetail }) {
  const markSeen = useMarkFeedbackSeen(assignment.id);
  const marked = useRef(false);
  useEffect(() => {
    if (assignment.feedbackReady && !marked.current) {
      marked.current = true;
      markSeen.mutate(undefined);
    }
  }, [assignment.feedbackReady, markSeen]);

  return (
    <section className="panel cw-feedback" aria-labelledby="cw-feedback">
      <div className="panel-head"><h2 id="cw-feedback">Grade and feedback</h2></div>
      <div className="panel-body">
        <p className="cw-score">
          <span className="cw-score-value tnum">{formatScore(submission.score ?? 0)}</span>
          <span className="cw-score-of tnum">out of {assignment.points}</span>
        </p>
        {submission.lateMinutes > 0 && (
          <p className="cw-note">Includes the late penalty for handing in after the deadline.</p>
        )}
        {submission.feedback ? <Prose text={submission.feedback} /> : <p className="st-muted">Your teacher didn't add written feedback.</p>}
      </div>
    </section>
  );
}

// ---- extensions ----

const EXTENSION_LABEL: Record<Extension["status"], string> = {
  pending: "Waiting for your teacher",
  approved: "Approved",
  declined: "Declined",
};

function Extensions({ assignment, closed }: { assignment: AssignmentDetail; closed: boolean }) {
  const [asking, setAsking] = useState(false);
  const pending = assignment.extensions.some((e) => e.status === "pending");
  const canAsk = assignment.status !== "graded" && !pending && !closed;
  return (
    <section className="panel" aria-labelledby="cw-extension">
      <div className="panel-head"><h2 id="cw-extension">More time</h2></div>
      <div className="panel-body cw-ext">
        {assignment.extensions.length === 0 && <p className="st-muted">Need longer? Ask before the deadline if you can.</p>}
        {assignment.extensions.length > 0 && (
          <ol className="cw-ext-list">
            {[...assignment.extensions].reverse().map((request) => (
              <li key={request.id}>
                <span className={`cw-ext-status is-${request.status}`}>
                  {request.autoApproved ? "Approved automatically" : EXTENSION_LABEL[request.status]}
                </span>
                <span className="tnum">Until {formatDue(request.until)}</span>
                {request.note && <span className="cw-ext-note">{request.note}</span>}
              </li>
            ))}
          </ol>
        )}
        {canAsk && (
          <Button variant="secondary" size="sm" icon={<CalendarPlus size={16} aria-hidden="true" />} onClick={() => setAsking(true)}>
            Ask for more time
          </Button>
        )}
      </div>
      {asking && <ExtensionDrawer assignment={assignment} onClose={() => setAsking(false)} />}
    </section>
  );
}

/** A datetime-local value (local time, minutes) for an ISO instant. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ExtensionDrawer({ assignment, onClose }: { assignment: AssignmentDetail; onClose: () => void }) {
  const ids = { until: useId(), reason: useId() };
  const request = useRequestExtension(assignment.id);
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ until?: string; reason?: string }>({});
  const beforeDeadline = new Date() < new Date(assignment.dueAt);

  const send = (event: FormEvent) => {
    event.preventDefault();
    const found: typeof errors = {};
    if (!until) found.until = "Choose the new date and time.";
    else if (new Date(until) <= new Date(assignment.effectiveDueAt)) found.until = "Choose a time after the current deadline.";
    if (!reason.trim()) found.reason = "Tell your teacher why you need more time.";
    setErrors(found);
    if (Object.keys(found).length) return;
    request.mutate({ until: new Date(until).toISOString(), reason: reason.trim() }, { onSuccess: onClose });
  };

  return (
    <Drawer title="Ask for more time" sub={assignment.title} onClose={onClose} dismissible={!request.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={request.isPending}>Cancel</Button>
          <Button type="submit" form="cw-extension-form" loading={request.isPending}>Send request</Button>
        </>
      }>
      <form id="cw-extension-form" className="cw-ext-form" onSubmit={send} noValidate>
        <p className="cw-note">
          {beforeDeadline
            ? "A first request made before the deadline for a short extension may be approved straight away. Otherwise your teacher decides."
            : "The deadline has passed, so your teacher will decide."}
        </p>
        <Field label="New deadline" htmlFor={ids.until} error={errors.until}>
          <input id={ids.until} className="input" type="datetime-local" value={until} data-autofocus
            min={toLocalInput(assignment.effectiveDueAt)} onChange={(e) => setUntil(e.target.value)} />
        </Field>
        <Field label="Reason" htmlFor={ids.reason} error={errors.reason} help="Your teacher sees this.">
          <textarea id={ids.reason} className="input" rows={4} maxLength={2000} value={reason}
            onChange={(e) => setReason(e.target.value)} />
        </Field>
        {request.isError && <Alert tone="danger">{errorMessage(request.error, "Your request wasn't sent. Try again.")}</Alert>}
      </form>
    </Drawer>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback;
}
