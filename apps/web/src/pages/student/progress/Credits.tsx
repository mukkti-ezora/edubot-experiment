import { useId, useState, type FormEvent } from "react";
import { ArrowSquareOut, CheckCircle, Clock, Flag, IdentificationCard, XCircle, type Icon } from "@phosphor-icons/react";
import { AttachmentPicker } from "@/components/files/AttachmentPicker";
import { useAttachments } from "@/components/files/useAttachments";
import { Alert, Button, Drawer, EmptyState, ErrorState, Field, PageHead, SkeletonRows } from "@/components/ui";
import { ApiError } from "@/lib/api";
import {
  normaliseApaar,
  useCredits,
  useMoocs,
  useRequestTransfer,
  useSetApaar,
  type AbcRecord,
  type AbcStatus,
  type CreditsData,
  type MoocCatalogue,
  type MoocCourse,
  type RequestStatus,
  type Transfer,
} from "@/lib/progress";
import { ProgressNav } from "./Progress";
import "@/styles/pages/student.css";
import "@/styles/pages/progress.css";

export function Credits() {
  const credits = useCredits();
  const notEnrolled = credits.error instanceof ApiError && credits.error.status === 404;

  return (
    <div className="st-page pg-page">
      <PageHead title="Credits" sub="Credits toward your degree, your exit options under NEP 2020, your ABC record, and SWAYAM/NPTEL credit." />
      <ProgressNav />
      {notEnrolled ? (
        <EmptyState title="You aren't on a programme yet" body={(credits.error as ApiError).message} />
      ) : credits.isError ? (
        <ErrorState title="Credits couldn't load" onRetry={() => void credits.refetch()} />
      ) : credits.isLoading || !credits.data ? (
        <SkeletonRows rows={8} />
      ) : (
        <>
          <Summary data={credits.data} />
          <ExitTrack data={credits.data} />
          <Requirements data={credits.data} />
          <div className="pg-two">
            <AbcCard abc={credits.data.abc} />
            <MoocUsage data={credits.data} />
          </div>
          <Moocs transfers={credits.data.transfers} />
        </>
      )}
    </div>
  );
}

function Summary({ data }: { data: CreditsData }) {
  const total = data.programme.totalCredits;
  const inProgress = Math.min(data.inProgress, Math.max(total - data.earned, 0));
  const share = (n: number) => (total ? n / total : 0);
  return (
    <section className="panel pg-summary" aria-labelledby="programme-title">
      <div className="pg-summary-head">
        <h2 id="programme-title" className="pg-programme">{data.programme.name}</h2>
        <p className="st-muted tnum">Admitted {data.programme.admittedYear} · {total} credits to graduate</p>
      </div>
      <div className="pg-stack" role="img"
        aria-label={`${data.earned} of ${total} credits earned, ${data.inProgress} in progress, ${data.remaining} still to earn`}>
        <span className="pg-stack-earned" style={{ ["--w" as string]: share(data.earned) }} />
        <span className="pg-stack-progress" style={{ ["--w" as string]: share(inProgress) }} />
      </div>
      <dl className="pg-stack-legend">
        <div><dt><span className="pg-key is-earned" aria-hidden="true" />Earned</dt><dd className="tnum">{data.earned}</dd></div>
        <div><dt><span className="pg-key is-progress" aria-hidden="true" />In progress</dt><dd className="tnum">{data.inProgress}</dd></div>
        <div><dt><span className="pg-key is-left" aria-hidden="true" />Still to earn</dt><dd className="tnum">{data.remaining}</dd></div>
      </dl>
    </section>
  );
}

/** NEP 2020 multiple exit points as a track: where you are, and what the next award needs. */
function ExitTrack({ data }: { data: CreditsData }) {
  const total = data.programme.totalCredits || 1;
  const here = Math.min(data.earned / total, 1);
  return (
    <section className="panel" aria-labelledby="exits-title">
      <div className="panel-head">
        <h2 id="exits-title">Exit points</h2>
        <span className="spacer st-due-meta">NEP 2020 lets you leave with an award at each point and return later</span>
      </div>
      <div className="panel-body">
        <p className="pg-next-exit">
          {data.nextExit
            ? <><strong className="tnum">{data.nextExit.creditsNeeded} credits</strong> to a {data.nextExit.award}</>
            : <>You've reached every exit point on this programme.</>}
        </p>
        <div className="pg-track" aria-hidden="true">
          <span className="pg-track-fill" style={{ ["--p" as string]: here }} />
          {data.exitPoints.map((exit) => (
            <span key={exit.credits} className={`pg-track-stop${exit.reached ? " is-reached" : ""}`} style={{ ["--at" as string]: exit.credits / total }} />
          ))}
        </div>
        <ol className="pg-exits">
          {data.exitPoints.map((exit) => (
            <li key={exit.credits} className={exit.reached ? "is-reached" : undefined}>
              {exit.reached
                ? <CheckCircle size={16} weight="fill" aria-hidden="true" />
                : <Flag size={16} aria-hidden="true" />}
              <span>
                <span className="pg-exit-award">{exit.award}</span>
                <span className="st-due-meta tnum">{exit.credits} credits · {exit.reached ? "Reached" : "Not yet"}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Requirements({ data }: { data: CreditsData }) {
  return (
    <section className="panel" aria-labelledby="req-title">
      <div className="panel-head"><h2 id="req-title">Requirements by category</h2></div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col" className="pg-num">Required</th>
              <th scope="col" className="pg-num">Earned</th>
              <th scope="col" className="pg-num">In progress</th>
              <th scope="col">Progress</th>
            </tr>
          </thead>
          <tbody>
            {data.requirements.map((r) => {
              const done = r.earned >= r.required;
              return (
                <tr key={r.category}>
                  <th scope="row" className="pg-row-head">{r.category}</th>
                  <td className="pg-num tnum">{r.required}</td>
                  <td className="pg-num tnum">{r.earned}</td>
                  <td className="pg-num tnum">{r.inProgress}</td>
                  <td>
                    <span className="pg-standing">
                      <span className="pg-meter" aria-hidden="true"><span style={{ ["--p" as string]: r.required ? Math.min(r.earned / r.required, 1) : 1 }} /></span>
                      <span className="st-due-meta tnum">{done ? "Complete" : `${r.required - r.earned} to go`}</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const ABC_STATUS: Record<AbcStatus, { label: string; icon: Icon; tone: string }> = {
  not_linked: { label: "Not linked", icon: XCircle, tone: "is-neutral" },
  pending: { label: "Waiting for your institution", icon: Clock, tone: "is-warn" },
  linked: { label: "Linked", icon: CheckCircle, tone: "is-ok" },
};

/** The student's Academic Bank of Credits record, keyed by their APAAR ID. */
export function AbcCard({ abc }: { abc: AbcRecord }) {
  const status = ABC_STATUS[abc.status];
  const [editing, setEditing] = useState(abc.status === "not_linked");
  return (
    <section className="panel pg-abc" aria-labelledby="abc-title">
      <div className="panel-head">
        <IdentificationCard size={18} aria-hidden="true" />
        <h2 id="abc-title">ABC and APAAR</h2>
      </div>
      <div className="panel-body pg-abc-body">
        <p className={`pg-status ${status.tone}`}><status.icon size={14} weight="fill" aria-hidden="true" /> {status.label}</p>
        {abc.apaarId && <p className="pg-apaar tnum">APAAR ID {abc.apaarId}</p>}
        <p className="st-muted">{abc.note}</p>
        {editing ? (
          <ApaarForm onDone={() => setEditing(false)} canCancel={abc.status !== "not_linked"} />
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>Change APAAR ID</Button>
        )}
      </div>
    </section>
  );
}

function ApaarForm({ onDone, canCancel }: { onDone: () => void; canCancel: boolean }) {
  const inputId = useId();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useSetApaar();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const { value, error: problem } = normaliseApaar(raw);
    setError(problem);
    if (problem) return;
    save.mutate(value, {
      onSuccess: onDone,
      onError: (e) => setError(e instanceof ApiError ? e.message : "Your APAAR ID couldn't be saved. Try again."),
    });
  };

  return (
    <form className="pg-apaar-form" onSubmit={submit} noValidate>
      <Field label="APAAR ID" htmlFor={inputId} error={error ?? undefined}
        help="12 digits, from DigiLocker or your institution. Spaces are fine.">
        <input id={inputId} className="input tnum" inputMode="numeric" autoComplete="off" maxLength={20}
          value={raw} onChange={(e) => setRaw(e.target.value)} />
      </Field>
      <div className="pg-form-actions">
        {canCancel && <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>}
        <Button type="submit" size="sm" loading={save.isPending}>Save APAAR ID</Button>
      </div>
    </form>
  );
}

function MoocUsage({ data }: { data: CreditsData }) {
  const { mooc } = data;
  const left = Math.max(mooc.termCap - mooc.usedThisTerm, 0);
  return (
    <section className="panel" aria-labelledby="cap-title">
      <div className="panel-head"><h2 id="cap-title">SWAYAM / NPTEL credit this term</h2></div>
      <div className="panel-body">
        <p className="pg-cap tnum"><strong>{mooc.usedThisTerm}</strong> of {mooc.termCap} credits used</p>
        <span className="pg-meter pg-meter-lg" role="meter" aria-label="MOOC credits used this term"
          aria-valuemin={0} aria-valuemax={mooc.termCap} aria-valuenow={mooc.usedThisTerm}>
          <span style={{ ["--p" as string]: mooc.termCap ? Math.min(mooc.usedThisTerm / mooc.termCap, 1) : 0 }} />
        </span>
        <p className="st-muted">
          UGC lets up to {mooc.capPercent}% of a term's credits come from SWAYAM courses
          {mooc.term ? ` (${mooc.termCredits} credits in ${mooc.term})` : ""}. {left > 0 ? `You can still claim ${left}.` : "You've reached this term's limit."}
        </p>
      </div>
    </section>
  );
}

const REQUEST_STATUS: Record<RequestStatus, { label: string; icon: Icon; tone: string }> = {
  pending: { label: "Waiting for your advisor", icon: Clock, tone: "is-warn" },
  approved: { label: "Approved", icon: CheckCircle, tone: "is-ok" },
  declined: { label: "Declined", icon: XCircle, tone: "is-danger" },
};

function StatusChip({ status }: { status: RequestStatus }) {
  const s = REQUEST_STATUS[status];
  return <span className={`pg-status ${s.tone}`}><s.icon size={14} weight="fill" aria-hidden="true" /> {s.label}</span>;
}

function Moocs({ transfers }: { transfers: Transfer[] }) {
  const catalogue = useMoocs();
  const [claiming, setClaiming] = useState<MoocCourse | null>(null);

  return (
    <section className="panel" aria-labelledby="moocs-title">
      <div className="panel-head">
        <h2 id="moocs-title">Approved SWAYAM / NPTEL courses</h2>
        <span className="spacer st-due-meta">Finish one, then claim the credit here with your certificate</span>
      </div>
      {catalogue.isError ? (
        <div className="panel-body"><ErrorState title="The course list couldn't load" onRetry={() => void catalogue.refetch()} /></div>
      ) : catalogue.isLoading || !catalogue.data ? (
        <div className="panel-body"><SkeletonRows rows={4} /></div>
      ) : catalogue.data.courses.length === 0 ? (
        <div className="panel-body">
          <EmptyState title="No approved courses yet" body="Your institution hasn't published its SWAYAM/NPTEL list. Ask your advisor which courses count." />
        </div>
      ) : (
        <ul className="pg-moocs">
          {catalogue.data.courses.map((course) => (
            <li key={course.id} className="pg-mooc">
              <span className="pg-mooc-main">
                <a href={course.url} target="_blank" rel="noreferrer" className="pg-mooc-title">
                  {course.title} <ArrowSquareOut size={13} aria-hidden="true" /><span className="sr-only"> (opens {course.provider} in a new tab)</span>
                </a>
                <span className="st-due-meta tnum">
                  {course.provider} · {course.weeks} weeks · {course.credits} credits · {course.category}{course.nextRun ? ` · Next run ${course.nextRun}` : ""}
                </span>
              </span>
              {course.requestStatus && course.requestStatus !== "declined" ? (
                <StatusChip status={course.requestStatus} />
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setClaiming(course)}>Claim credit</Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {transfers.length > 0 && <Transfers transfers={transfers} />}
      {claiming && catalogue.data && (
        <ClaimDrawer course={claiming} passPercent={catalogue.data.passPercent} onClose={() => setClaiming(null)} />
      )}
    </section>
  );
}

function Transfers({ transfers }: { transfers: Transfer[] }) {
  return (
    <div className="pg-transfers">
      <h3 className="pg-subhead">Your claims</h3>
      <ul>
        {transfers.map((t) => (
          <li key={t.id} className="pg-transfer">
            <span>
              <span className="pg-mooc-title">{t.course.title}</span>
              <span className="st-due-meta tnum">
                Scored {t.scorePercent}% · {t.course.credits} credits · asked {new Date(t.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
              </span>
              {t.note && <span className="pg-transfer-note">Advisor's note: {t.note}</span>}
            </span>
            <StatusChip status={t.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Claim credit for a finished course: the certificate score and a copy of the certificate. */
export function ClaimDrawer({ course, passPercent, onClose }: {
  course: MoocCourse;
  passPercent: MoocCatalogue["passPercent"];
  onClose: () => void;
}) {
  const scoreId = useId();
  const [score, setScore] = useState("");
  const [error, setError] = useState<string | null>(null);
  const picked = useAttachments("student");
  // One certificate per claim: choosing another file replaces the first.
  const attachments = { ...picked, full: false, add: (files: File[]) => { picked.clear(); picked.add(files.slice(0, 1)); } };
  const claim = useRequestTransfer();
  const certificate = attachments.items.find((item) => item.status === "ready")?.meta ?? null;
  const uploading = attachments.items.some((item) => item.status === "uploading");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(score);
    if (score.trim() === "" || Number.isNaN(value) || value < 0 || value > 100) return setError("Enter your certificate score, from 0 to 100.");
    if (value < passPercent) return setError(`Credit needs a passing certificate: ${passPercent}% or more.`);
    if (!certificate) return setError("Attach your certificate so your advisor can check it.");
    setError(null);
    claim.mutate(
      { moocCourseId: course.id, scorePercent: value, certificateAttachmentId: certificate.id },
      { onSuccess: onClose, onError: (e) => setError(e instanceof ApiError ? e.message : "Your claim couldn't be sent. Try again.") },
    );
  };

  return (
    <Drawer title="Claim credit" sub={`${course.title} · ${course.credits} credits`} onClose={onClose} dismissible={!claim.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={claim.isPending}>Cancel</Button>
          <Button type="submit" form={`${scoreId}-form`} loading={claim.isPending} disabled={uploading}>Send to my advisor</Button>
        </>
      }>
      <form id={`${scoreId}-form`} className="pg-claim" onSubmit={submit} noValidate>
        <Field label="Certificate score (%)" htmlFor={scoreId} help={`The final score on your ${course.provider} certificate. ${passPercent}% or more counts.`}>
          <input id={scoreId} className="input tnum" type="number" inputMode="decimal" min={0} max={100} step="0.1"
            value={score} onChange={(e) => setScore(e.target.value)} data-autofocus />
        </Field>
        <div className="field">
          <span className="pg-label">Certificate</span>
          <AttachmentPicker attachments={attachments} label={attachments.items.length ? "Replace certificate" : "Attach your certificate"} />
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <p className="st-muted">Your faculty advisor checks the certificate. When it's approved, the credits are added to your record.</p>
      </form>
    </Drawer>
  );
}
