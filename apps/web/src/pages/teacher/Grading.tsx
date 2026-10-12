import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle, ClockCountdown } from "@phosphor-icons/react";
import { ApiError } from "@/lib/api";
import {
  lateAdjusted, lateDays, latePenaltyPercent, rubricTotal, useGrade, useGradingDetail, useSubmissionQueue,
  type GradingDetail, type GradingTab, type RubricScore, type SubmissionRow,
} from "@/lib/coursework";
import { relativeTime } from "@/lib/doubts";
import { Prose } from "@/components/Prose";
import { AttachmentList } from "@/components/files/AttachmentList";
import { SubmittedLink } from "@/components/coursework/SubmittedLink";
import { DoubtFilter } from "@/components/doubts/parts";
import { formatScore } from "@/lib/format";
import { Alert, Button, EmptyState, ErrorState, Field, PageHead, SkeletonRows } from "@/components/ui";
import "@/styles/pages/student.css";
import "@/styles/pages/coursework.css";

const TABS: readonly GradingTab[] = ["to_grade", "graded"];

function tabFrom(value: string | null): GradingTab {
  return TABS.find((tab) => tab === value) ?? "to_grade";
}

/** The next ungraded submission after `afterId` in queue order, wrapping round; null when none are left. */
export function nextUngradedAfter(rows: { id: string; status: string }[], afterId: string): string | null {
  const start = rows.findIndex((row) => row.id === afterId);
  const ordered = [...rows.slice(start + 1), ...rows.slice(0, Math.max(start, 0))];
  return ordered.find((row) => row.id !== afterId && row.status === "submitted")?.id ?? null;
}

export function TeacherGradingPage() {
  const [params, setParams] = useSearchParams();
  const tab = tabFrom(params.get("status"));
  const selected = params.get("submission");
  const queue = useSubmissionQueue(tab);

  const go = (next: { status?: GradingTab; submission?: string | null }) => {
    const search = new URLSearchParams(params);
    if (next.status) search.set("status", next.status);
    if (next.submission === null) search.delete("submission");
    else if (next.submission) search.set("submission", next.submission);
    setParams(search);
  };

  const nextUngraded = (afterId: string) => nextUngradedAfter(queue.data?.items ?? [], afterId);

  return (
    <div className="st-page cw-grading">
      <PageHead title="Grading" sub="Handed-in work from your classes, oldest first." />
      <DoubtFilter
        label="Show"
        value={tab}
        onChange={(status) => go({ status, submission: null })}
        options={[
          { id: "to_grade", label: "To grade", count: queue.data?.counts.toGrade },
          { id: "graded", label: "Graded", count: queue.data?.counts.graded },
        ]}
      />
      <div className={`cw-grading-layout${selected ? " has-selection" : ""}`}>
        <section className="panel cw-queue" aria-label={tab === "to_grade" ? "Work to grade" : "Graded work"}>
          {queue.isError ? (
            <ErrorState title="Submissions couldn't load" onRetry={() => void queue.refetch()} />
          ) : !queue.data ? (
            <div className="cw-pad"><SkeletonRows rows={5} /></div>
          ) : queue.data.items.length === 0 ? (
            <EmptyState
              icon={<CheckCircle size={22} aria-hidden="true" />}
              title={tab === "to_grade" ? "All caught up" : "Nothing graded yet"}
              body={tab === "to_grade" ? "When students hand in work, it lands here for you to grade." : "Work you grade appears here."}
            />
          ) : (
            <Queue rows={queue.data.items} selected={selected} onSelect={(id) => go({ submission: id })} />
          )}
        </section>
        <section className="cw-grader-pane" aria-label="Grade submission">
          {selected ? (
            <Grader key={selected} id={selected} onBack={() => go({ submission: null })}
              onGraded={(id) => go({ submission: tab === "to_grade" ? nextUngraded(id) : id })} />
          ) : (
            <div className="cw-grader-empty"><p className="st-muted">Choose a submission to grade it.</p></div>
          )}
        </section>
      </div>
    </div>
  );
}

function lateLabel(lateMinutes: number): string | null {
  if (lateMinutes <= 0) return null;
  const days = lateDays(lateMinutes);
  return `${days} ${days === 1 ? "day" : "days"} late`;
}

function Queue({ rows, selected, onSelect }: { rows: SubmissionRow[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <ul className="cw-list">
      {rows.map((row) => (
        <li key={row.id}>
          <button type="button" className={`cw-queue-row${row.id === selected ? " is-selected" : ""}`}
            aria-current={row.id === selected || undefined} onClick={() => onSelect(row.id)}>
            <span className="cw-row-main">
              <span className="cw-row-title">{row.student.name}</span>
              <span className="cw-row-meta">{row.assignment.title} · {row.courseCode}</span>
            </span>
            <span className="cw-row-side">
              {row.status === "graded" && row.score != null
                ? <span className="cw-status tone-ok tnum">{formatScore(row.score)}/{row.assignment.points}</span>
                : lateLabel(row.lateMinutes) && <span className="cw-status tone-warn"><ClockCountdown size={14} weight="fill" aria-hidden="true" /> {lateLabel(row.lateMinutes)}</span>}
              <time className="cw-row-when tnum" dateTime={row.submittedAt}>
                {relativeTime(row.submittedAt)}{row.revision > 1 ? ` · version ${row.revision}` : ""}
              </time>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Grader({ id, onBack, onGraded }: { id: string; onBack: () => void; onGraded: (id: string) => void }) {
  const { data, isLoading, isError, refetch } = useGradingDetail(id);
  if (isError) return <ErrorState title="This submission couldn't load" onRetry={() => void refetch()} />;
  if (isLoading || !data) return <SkeletonRows rows={8} />;
  return <GradingForm detail={data} onBack={onBack} onGraded={onGraded} />;
}

function initialScores(detail: GradingDetail): RubricScore[] {
  const given = new Map(detail.work.rubricScores.map((s) => [s.criterion, s.points]));
  return detail.assignment.rubric.map((c) => ({ criterion: c.criterion, points: given.get(c.criterion) ?? Number.NaN }));
}

export function GradingForm({ detail, onBack, onGraded }: { detail: GradingDetail; onBack: () => void; onGraded: (id: string) => void }) {
  const { assignment, work } = detail;
  const rubric = assignment.rubric;
  const ids = { feedback: useId(), score: useId() };
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Opening a submission (or moving to the next after saving) puts focus on the student's name.
  useEffect(() => headingRef.current?.focus(), []);
  const grade = useGrade(detail.id);
  const [scores, setScores] = useState<RubricScore[]>(() => initialScores(detail));
  const [direct, setDirect] = useState<string>(work.score != null && rubric.length === 0 ? String(work.score) : "");
  const [feedback, setFeedback] = useState(work.feedback ?? "");
  const [error, setError] = useState<string>();

  const raw = rubric.length ? rubricTotal(rubric, scores, assignment.points) : Number(direct || 0);
  const final = lateAdjusted(raw, detail.lateMinutes, assignment.latePenaltyPercentPerDay);
  const penalty = latePenaltyPercent(detail.lateMinutes, assignment.latePenaltyPercentPerDay);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const problem = rubric.length ? rubricProblem(rubric, scores) : directProblem(direct, assignment.points);
    setError(problem ?? undefined);
    if (problem) return;
    grade.mutate(
      { rubricScores: rubric.length ? scores : [], score: rubric.length ? null : Number(direct), feedback: feedback.trim() },
      { onSuccess: () => onGraded(detail.id) },
    );
  };

  return (
    <div className="cw-grader">
      <button type="button" className="btn btn-ghost btn-sm cw-back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" /> All submissions
      </button>
      <header className="cw-grader-head">
        <h2 ref={headingRef} tabIndex={-1}>{detail.student.name}</h2>
        <p className="cw-head-meta">
          <span>{assignment.title} · {detail.courseCode}</span>
          <span>Handed in {relativeTime(detail.submittedAt)}{detail.revision > 1 ? `, version ${detail.revision}` : ""}</span>
          {detail.lateMinutes > 0 && <span className="cw-late-flag">{lateLabel(detail.lateMinutes)}, {penalty}% penalty</span>}
        </p>
      </header>

      <div className="cw-grader-grid">
        <section className="panel" aria-labelledby="cw-work-head">
          <div className="panel-head"><h3 id="cw-work-head">Student's work</h3></div>
          <div className="panel-body cw-work">
            {work.text ? <p className="cw-work-text">{work.text}</p> : null}
            <SubmittedLink link={work.link} />
            <AttachmentList attachments={work.attachments} role="teacher" />
            {!work.text && !work.link && work.attachments.length === 0 && <p className="st-muted">No content was handed in.</p>}
            {assignment.instructions && (
              <details className="cw-instructions">
                <summary>Assignment instructions</summary>
                <Prose text={assignment.instructions} />
              </details>
            )}
          </div>
        </section>

        <form className="panel cw-grade-form" onSubmit={save} aria-labelledby="cw-grade-head" noValidate>
          <div className="panel-head"><h3 id="cw-grade-head">Grade</h3></div>
          <div className="panel-body">
            {rubric.length > 0 ? (
              <RubricInputs rubric={rubric} scores={scores} onChange={setScores} />
            ) : (
              <Field label={`Score out of ${assignment.points}`} htmlFor={ids.score}>
                <input id={ids.score} className="input tnum" type="number" min={0} max={assignment.points} step={0.5}
                  value={direct} onChange={(e) => setDirect(e.target.value)} />
              </Field>
            )}
            <dl className="cw-total">
              <div><dt>Score</dt><dd className="tnum">{formatScore(raw)} / {assignment.points}</dd></div>
              {detail.lateMinutes > 0 && (
                <div><dt>After {penalty}% late penalty</dt><dd className="tnum">{formatScore(final)} / {assignment.points}</dd></div>
              )}
            </dl>
            <Field label="Feedback" htmlFor={ids.feedback} help="The student sees this with their grade. Lists and `code` formatting work.">
              <textarea id={ids.feedback} className="input" rows={6} maxLength={2000} value={feedback}
                onChange={(e) => setFeedback(e.target.value)} />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            {grade.isError && <Alert tone="danger">{grade.error instanceof ApiError ? grade.error.message : "The grade wasn't saved. Try again."}</Alert>}
            <div className="cw-editor-actions">
              <Button type="submit" size="sm" loading={grade.isPending}>{detail.status === "graded" ? "Update grade" : "Save grade"}</Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function rubricProblem(rubric: GradingDetail["assignment"]["rubric"], scores: RubricScore[]): string | null {
  for (const criterion of rubric) {
    const given = scores.find((s) => s.criterion === criterion.criterion)?.points;
    if (given === undefined || !Number.isFinite(given)) return `Score "${criterion.criterion}".`;
    if (given < 0 || given > criterion.points) return `"${criterion.criterion}" takes 0 to ${criterion.points} points.`;
  }
  return null;
}

function directProblem(value: string, points: number): string | null {
  const score = Number(value);
  if (value.trim() === "" || !Number.isFinite(score)) return "Enter a score.";
  if (score < 0 || score > points) return `The score must be between 0 and ${points}.`;
  return null;
}

function RubricInputs({ rubric, scores, onChange }: {
  rubric: GradingDetail["assignment"]["rubric"];
  scores: RubricScore[];
  onChange: (scores: RubricScore[]) => void;
}) {
  const baseId = useId();
  const set = (criterion: string, value: string) =>
    onChange(scores.map((s) => (s.criterion === criterion ? { ...s, points: value === "" ? Number.NaN : Number(value) } : s)));
  return (
    <fieldset className="cw-rubric-inputs">
      <legend>Rubric</legend>
      {rubric.map((criterion, index) => {
        const value = scores.find((s) => s.criterion === criterion.criterion)?.points;
        const id = `${baseId}-${index}`;
        return (
          <div key={criterion.criterion} className="cw-rubric-input">
            <label htmlFor={id}>
              <span className="cw-rubric-name">{criterion.criterion}</span>
              {criterion.description && <span className="cw-rubric-desc">{criterion.description}</span>}
            </label>
            <span className="cw-points">
              <input id={id} className="input tnum" type="number" min={0} max={criterion.points} step={0.5}
                value={value === undefined || Number.isNaN(value) ? "" : value}
                onChange={(e) => set(criterion.criterion, e.target.value)} />
              <span className="tnum">/ {criterion.points}</span>
            </span>
          </div>
        );
      })}
    </fieldset>
  );
}
