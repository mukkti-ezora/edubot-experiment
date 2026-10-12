import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, ChalkboardTeacher, CheckCircle, MinusCircle, Sparkle, XCircle } from "@phosphor-icons/react";
import { useTutor } from "@/lib/tutor";
import { formatScore } from "@/lib/format";
import {
  KIND_LABELS,
  describeCorrect,
  describeResponse,
  formatDuration,
  isInProgress,
  rankText,
  useAssessment,
  useAttempt,
  useImprovementSet,
  type AttemptResult as Result,
  type Breakdown,
  type ReviewedQuestion,
} from "@/lib/practice";
import { AskTeacher } from "@/components/doubts/AskTeacher";
import { StartTestDrawer, StatBar } from "@/components/practice/parts";
import { Prose } from "@/components/Prose";
import { Alert, ErrorState, SkeletonRows } from "@/components/ui";
import { aiErrorMessage } from "@/components/practice/parts";
import "@/styles/pages/student.css";
import "@/styles/pages/practice.css";


/** A submitted attempt: score, rank, where marks were won and lost, and the answers once review opens. */
export function AttemptResult() {
  const { attemptId = "" } = useParams();
  const { data, isLoading, isError, refetch } = useAttempt(attemptId);
  if (isError) return <div className="st-page"><ErrorState title="This result couldn't load" onRetry={() => void refetch()} /></div>;
  if (isLoading || !data) return <div className="st-page"><SkeletonRows rows={8} /></div>;
  if (isInProgress(data)) return <Navigate to={`/s/attempts/${attemptId}/take`} replace />;
  return <ResultView result={data} />;
}

function ResultView({ result }: { result: Result }) {
  const { data: test } = useAssessment(result.assessmentId);
  const improve = useImprovementSet(result.id);
  const [practising, setPractising] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const percent = result.maxScore > 0 ? Math.max(0, (result.score / result.maxScore) * 100) : 0;
  const allRight = result.wrong === 0 && result.skipped === 0;

  return (
    <div className="st-page pr-page">
      <nav className="st-crumbs" aria-label="Breadcrumb">
        <Link to="/s/practice"><ArrowLeft size={12} aria-hidden="true" /> Practice</Link>
      </nav>
      <header className="pr-result-head">
        <div>
          <p className="pr-player-meta">{KIND_LABELS[result.kind]} · Attempt {result.number}
            {result.submittedAt && ` · Submitted ${new Date(result.submittedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`}
          </p>
          <h1 className="st-title st-title-sm">{result.title}</h1>
        </div>
        <div className="pr-score" aria-label={`Score ${formatScore(result.score)} out of ${formatScore(result.maxScore)}`}>
          <span className="pr-score-figure tnum">{formatScore(result.score)}</span>
          <span className="pr-score-max tnum">/ {formatScore(result.maxScore)}</span>
        </div>
      </header>

      <section className="pr-summary" aria-label="Summary">
        <dl className="pr-facts is-wide">
          <div><dt>Score</dt><dd className="tnum">{Math.round(percent)}%</dd></div>
          <div><dt>Accuracy</dt><dd className="tnum">{result.accuracy === null ? "No answers" : `${Math.round(result.accuracy)}%`}</dd></div>
          <div><dt>Correct</dt><dd className="tnum">{result.correct}</dd></div>
          <div><dt>Wrong</dt><dd className="tnum">{result.wrong}</dd></div>
          <div><dt>Skipped</dt><dd className="tnum">{result.skipped}</dd></div>
          <div><dt>Time spent</dt><dd className="tnum">{formatDuration(result.timeSpentSeconds)}</dd></div>
        </dl>
        <p className="pr-rank">
          {result.rank
            ? <>In your class: <strong className="tnum">{rankText(result.rank)}</strong>, counting each student's first attempt.</>
            : "Your class rank appears once enough classmates have sat this test."}
        </p>
      </section>

      <div className="pr-result-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={improve.isPending || allRight}
          title={allRight ? "Everything was right, so there is nothing to improve" : undefined}
          onClick={() => improve.mutate(undefined, { onSuccess: (set) => setPractising(set.id) })}>
          <Sparkle size={14} weight="fill" aria-hidden="true" /> {improve.isPending ? "Building…" : "Build an improvement set"}
        </button>
        {test && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAsking(true)}>
            <ChalkboardTeacher size={14} aria-hidden="true" /> Ask your teacher
          </button>
        )}
      </div>
      {improve.isError && <Alert tone="info">{aiErrorMessage(improve.error)}</Alert>}

      <div className="pr-analysis">
        <BreakdownPanel title="By section" rows={result.sections} />
        <BreakdownPanel title="By topic" rows={result.topics} linkTopics />
        <SpeedPanel result={result} />
        <BehaviourPanel result={result} />
      </div>

      <section className="panel" aria-labelledby="pr-review">
        <div className="panel-head"><h2 id="pr-review">Question review</h2></div>
        <div className="panel-body">
          {result.reviewAvailable ? (
            <ol className="pr-review-list">
              {result.questions.map((q) => <ReviewItem key={q.id} question={q} testTitle={result.title} />)}
            </ol>
          ) : (
            <p className="st-muted">
              Answers and explanations open {result.reviewAvailableAt
                ? `on ${new Date(result.reviewAvailableAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
                : "when the test closes"}, so classmates still sitting it can't see them.
            </p>
          )}
        </div>
      </section>

      {practising && <StartTestDrawer testId={practising} onClose={() => setPractising(null)} />}
      {asking && test && (
        <AskTeacher onClose={() => setAsking(false)} initialTitle={`Question about ${result.title}`}
          anchor={{ course: { id: test.courseId, code: test.courseCode, title: test.courseCode } }} />
      )}
    </div>
  );
}

function BreakdownPanel({ title, rows, linkTopics = false }: { title: string; rows: Breakdown[]; linkTopics?: boolean }) {
  return (
    <section className="panel" aria-label={title}>
      <div className="panel-head"><h2>{title}</h2></div>
      <div className="panel-body">
        {rows.length === 0 ? <p className="st-muted">Nothing to break down.</p> : (
          <ul className="pr-breakdown">
            {rows.map((row) => (
              <li key={row.id ?? row.title}>
                <div className="pr-breakdown-title">
                  {linkTopics && row.id ? <Link to={`/s/topics/${row.id}`}>{row.title}</Link> : row.title}
                  <span className="pr-breakdown-counts tnum">{row.correct} right · {row.wrong} wrong · {row.skipped} skipped</span>
                </div>
                <StatBar label="Accuracy" value={row.accuracy} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const QUADRANTS = [
  { key: "fastRight", title: "Quick and right", note: "Secure. Keep these sharp with the review deck." },
  { key: "slowRight", title: "Slow but right", note: "You know these. Practise to get faster." },
  { key: "fastWrong", title: "Quick and wrong", note: "Rushed. Read the question twice before answering." },
  { key: "slowWrong", title: "Slow and wrong", note: "Gaps in understanding. Start your revision here." },
] as const;

function SpeedPanel({ result }: { result: Result }) {
  const median = result.speed.medianSeconds;
  return (
    <section className="panel" aria-label="Accuracy and speed">
      <div className="panel-head">
        <h2>Accuracy and speed</h2>
        <p className="pr-head-note">{median === null ? "Answer questions to see your pace." : `Fast means at or under your middle time of ${formatDuration(median)}.`}</p>
      </div>
      <div className="panel-body">
        <ul className="pr-quadrants">
          {QUADRANTS.map((q) => (
            <li key={q.key} className={`pr-quadrant is-${q.key}`}>
              <span className="pr-quadrant-count tnum">{result.speed.quadrants[q.key]}</span>
              <span className="pr-quadrant-title">{q.title}</span>
              <span className="pr-quadrant-note">{q.note}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function BehaviourPanel({ result }: { result: Result }) {
  const { answersChanged, markedForReviewLeft, secondsOnWrong } = result.behaviour;
  return (
    <section className="panel" aria-label="How you worked">
      <div className="panel-head"><h2>How you worked</h2></div>
      <div className="panel-body">
        <ul className="pr-behaviour">
          <li><span className="tnum">{answersChanged}</span> {answersChanged === 1 ? "answer changed" : "answers changed"} after first choosing</li>
          <li><span className="tnum">{markedForReviewLeft}</span> still marked for review when you submitted</li>
          <li><span className="tnum">{formatDuration(secondsOnWrong)}</span> spent on questions you got wrong</li>
        </ul>
      </div>
    </section>
  );
}

function ReviewItem({ question, testTitle }: { question: ReviewedQuestion; testTitle: string }) {
  const { ask } = useTutor();
  const outcome = question.isCorrect === null ? "skipped" : question.isCorrect ? "right" : "wrong";
  const OutcomeIcon = outcome === "right" ? CheckCircle : outcome === "wrong" ? XCircle : MinusCircle;
  const label = outcome === "right" ? "Correct" : outcome === "wrong" ? "Wrong" : "Skipped";
  return (
    <li className={`pr-review-item is-${outcome}`}>
      <div className="pr-review-head">
        <span className="pr-review-outcome"><OutcomeIcon size={16} weight="fill" aria-hidden="true" /> {label}</span>
        <span className="tnum">Question {question.position}</span>
        {question.topic && <Link to={`/s/topics/${question.topic.id}`}>{question.topic.title}</Link>}
        <span className="tnum pr-review-marks">{question.marks > 0 ? "+" : ""}{formatScore(question.marks)} marks</span>
      </div>
      <Prose text={question.stem} />
      <dl className="pr-review-answers">
        <div><dt>Your answer</dt><dd>{describeResponse(question)}</dd></div>
        <div><dt>Correct answer</dt><dd>{describeCorrect(question)}</dd></div>
      </dl>
      {question.explanation && <Prose text={question.explanation} className="pr-explanation" />}
      {outcome !== "right" && (
        <button type="button" className="btn btn-ghost btn-sm"
          onClick={() => ask(`In "${testTitle}", I got this question wrong: ${question.stem}\n\nI answered: ${describeResponse(question)}. Help me see where my thinking went wrong.`)}>
          <Sparkle size={14} weight="fill" aria-hidden="true" /> Ask EduBot about this question
        </button>
      )}
    </li>
  );
}
