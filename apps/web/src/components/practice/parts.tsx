import { useNavigate } from "react-router-dom";
import { ClipboardText, Exam, FileText, Lightning, LockSimple, Notebook, type Icon } from "@phosphor-icons/react";
import { ApiError } from "@/lib/api";
import {
  KIND_LABELS,
  markingLabel,
  useAssessment,
  useStartAttempt,
  type AssessmentKind,
  type AssessmentSummary,
} from "@/lib/practice";
import { Alert, Button, Drawer, SkeletonRows } from "@/components/ui";
import { Prose } from "@/components/Prose";

const KIND_ICONS: Record<AssessmentKind, Icon> = {
  quiz: ClipboardText,
  mock: Exam,
  past_paper: FileText,
  practice: Lightning,
  exam_check: Notebook,
};

export function KindBadge({ kind }: { kind: AssessmentKind }) {
  const KindIcon = KIND_ICONS[kind];
  return (
    <span className={`pr-kind is-${kind}`}>
      <KindIcon size={13} weight="bold" aria-hidden="true" />
      {KIND_LABELS[kind]}
    </span>
  );
}

/** A labelled horizontal measure. The number is always printed, so the bar never carries meaning alone. */
export function StatBar({ label, value, max = 100, display }: { label: string; value: number | null; max?: number; display?: string }) {
  const percent = value === null || max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="pr-bar">
      <span className="pr-bar-label">{label}</span>
      <span className="pr-bar-track" aria-hidden="true">
        <span className="pr-bar-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="pr-bar-value tnum">{display ?? (value === null ? "No answers" : `${Math.round(percent)}%`)}</span>
    </div>
  );
}

/** Turns a failed AI request into the sentence a student should read. */
export function aiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "AI_UNAVAILABLE") return "EduBot couldn't write questions right now. Try again in a few minutes, or practise from your past papers.";
    if (error.code === "RATE_LIMITED") return "You've reached today's limit for practice sets. Your past papers and review deck are still open.";
    if (error.code === "TUTOR_LOCKED") return "AI help is off while you have an unassisted test in progress. Finish it first.";
    return error.message;
  }
  return "Something went wrong. Try again.";
}

function windowText(test: AssessmentSummary): string | null {
  if (test.closesAt) return `Closes ${new Date(test.closesAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
  return null;
}

/** The rules before a test starts or resumes. Starting is the only way into the player. */
export function StartTestDrawer({ testId, onClose }: { testId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useAssessment(testId);
  const start = useStartAttempt();
  const resuming = !!data?.inProgressAttemptId;
  const outOfAttempts = data?.attemptsLeft === 0 && !resuming;

  const begin = () =>
    start.mutate(testId, { onSuccess: (attempt) => navigate(`/s/attempts/${attempt.id}/take`) });

  return (
    <Drawer
      title={data?.title ?? "Test"}
      sub={data ? `${data.courseCode} · ${KIND_LABELS[data.kind]}` : undefined}
      onClose={onClose}
      dismissible={!start.isPending}
      footer={data && (
        <>
          <Button variant="ghost" onClick={onClose} disabled={start.isPending}>Not now</Button>
          <Button onClick={begin} loading={start.isPending} disabled={outOfAttempts || data.status !== "open"} data-autofocus>
            {resuming ? "Resume test" : "Start test"}
          </Button>
        </>
      )}
    >
      {isError ? (
        <Alert tone="danger" title="This test couldn't load">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void refetch()}>Retry</button>
        </Alert>
      ) : isLoading || !data ? (
        <SkeletonRows rows={5} />
      ) : (
        <div className="pr-rules">
          <dl className="pr-facts">
            <div><dt>Questions</dt><dd className="tnum">{data.questionCount}</dd></div>
            <div><dt>Time</dt><dd className="tnum">{data.durationMinutes ? `${data.durationMinutes} minutes` : "Untimed"}</dd></div>
            <div><dt>Marking</dt><dd>{markingLabel(data.marking)}</dd></div>
            <div><dt>Attempts left</dt><dd className="tnum">{data.attemptsLeft ?? "Unlimited"}</dd></div>
          </dl>
          {data.sections.length > 1 && (
            <p className="pr-note">Sections: {data.sections.map((s) => `${s.title} (${s.questionCount})`).join(", ")}</p>
          )}
          <ul className="pr-rule-list">
            <li>Answers save as you go, so a dropped connection or a refresh won't lose work.</li>
            {data.durationMinutes && <li>The timer keeps running if you leave. When it reaches zero, the test is submitted for you.</li>}
            {data.marking.wrong < 0 && <li>Wrong answers lose marks. Leave a question blank if you're guessing.</li>}
            {!data.tutorAllowed && (
              <li className="pr-locked"><LockSimple size={14} weight="bold" aria-hidden="true" /> EduBot is off during this test, so it shows what you know on your own.</li>
            )}
            {windowText(data) && <li>{windowText(data)}.</li>}
          </ul>
          {data.instructions && <Prose text={data.instructions} />}
          {outOfAttempts && <Alert tone="info">You've used all your attempts. Your best result is on the Practice page.</Alert>}
          {data.status === "upcoming" && <Alert tone="info">This test hasn't opened yet.</Alert>}
          {start.isError && <Alert tone="danger">{start.error instanceof ApiError ? start.error.message : "The test couldn't start. Try again."}</Alert>}
        </div>
      )}
    </Drawer>
  );
}
