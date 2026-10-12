import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Cards, LockSimple, Sparkle, Trophy } from "@phosphor-icons/react";
import { relativeTime } from "@/lib/doubts";
import { formatScore } from "@/lib/format";
import {
  KIND_LABELS,
  markingLabel,
  useAiPractice,
  useBankPractice,
  usePracticeHub,
  type AssessmentStatus,
  type AssessmentSummary,
  type TopicPractice,
} from "@/lib/practice";
import { AssignmentList } from "@/components/coursework/AssignmentList";
import { KindBadge, StartTestDrawer, StatBar, aiErrorMessage } from "@/components/practice/parts";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui";
import { SubjectGlyph } from "../subject";
import "@/styles/pages/student.css";
import "@/styles/pages/practice.css";

const GROUPS: { status: AssessmentStatus; title: string; empty: string }[] = [
  { status: "open", title: "Open now", empty: "No tests are open right now." },
  { status: "upcoming", title: "Coming up", empty: "Nothing scheduled yet." },
  { status: "closed", title: "Finished", empty: "Tests you've sat or that have closed appear here." },
];

/** Everything a student does to prove or strengthen learning: assignments, tests, topic practice, review. */
export function PracticeHub() {
  const { data, isLoading, isError, refetch } = usePracticeHub();
  const [starting, setStarting] = useState<string | null>(null);

  return (
    <div className="st-page pr-page">
      <header className="pr-head">
        <h1 className="st-title st-title-sm">Practice</h1>
        <p className="st-muted">Hand in work, sit tests and keep what you've learned fresh.</p>
      </header>

      {isError ? (
        <ErrorState title="Practice couldn't load" onRetry={() => void refetch()} />
      ) : (
        <>
          <section className="pr-strip" aria-label="Today in practice">
            <ReviewTile due={data?.review.dueToday} total={data?.review.total} loading={isLoading} />
            <OpenTestsTile tests={data?.assessments.filter((t) => t.status === "open") ?? []} loading={isLoading} onStart={setStarting} />
          </section>

          <section className="panel" aria-labelledby="pr-assignments">
            <div className="panel-head">
              <h2 id="pr-assignments">Assignments to hand in</h2>
            </div>
            <div className="panel-body flush">
              <AssignmentList statuses={["not_started", "draft"]} limit={5}
                emptyTitle="You're up to date" emptyBody="Nothing is waiting to be handed in. New assignments appear here with their deadlines." />
            </div>
          </section>

          <section className="panel" aria-labelledby="pr-tests">
            <div className="panel-head"><h2 id="pr-tests">Tests and quizzes</h2></div>
            <div className="panel-body">
              {isLoading || !data ? <SkeletonRows rows={4} /> : <TestGroups tests={data.assessments} onStart={setStarting} />}
            </div>
          </section>

          <section className="panel" aria-labelledby="pr-topics">
            <div className="panel-head">
              <h2 id="pr-topics">Practice by topic</h2>
              <p className="pr-head-note">Practise 10 questions from your course's question bank, or have EduBot write 5 fresh ones from the topic's lessons.</p>
            </div>
            <div className="panel-body flush">
              {isLoading || !data ? <div className="st-pad"><SkeletonRows rows={4} /></div> : <TopicRows topics={data.topics} onStart={setStarting} />}
            </div>
          </section>

          {data && data.improvementSets.length > 0 && (
            <section className="panel" aria-labelledby="pr-mine">
              <div className="panel-head"><h2 id="pr-mine">Your practice sets</h2></div>
              <div className="panel-body flush">
                <ul className="pr-list">
                  {data.improvementSets.map((set) => <TestRow key={set.id} test={set} onStart={setStarting} />)}
                </ul>
              </div>
            </section>
          )}
        </>
      )}

      {starting && <StartTestDrawer testId={starting} onClose={() => setStarting(null)} />}
    </div>
  );
}

function ReviewTile({ due, total, loading }: { due?: number; total?: number; loading: boolean }) {
  return (
    <div className="pr-tile">
      <Cards size={20} aria-hidden="true" className="pr-tile-icon" />
      <div className="pr-tile-main">
        <span className="pr-tile-title">Review deck</span>
        <span className="pr-tile-figure tnum">{loading ? "…" : `${due ?? 0} due today`}</span>
        <span className="pr-tile-note tnum">{loading ? "" : `${total ?? 0} cards in your courses`}</span>
      </div>
      {!loading && (due ?? 0) > 0 ? (
        <Link to="/s/review" className="btn btn-primary btn-sm">Start review</Link>
      ) : (
        <Link to="/s/review" className="btn btn-secondary btn-sm">Open deck</Link>
      )}
    </div>
  );
}

function OpenTestsTile({ tests, loading, onStart }: { tests: AssessmentSummary[]; loading: boolean; onStart: (id: string) => void }) {
  const resume = tests.find((t) => t.inProgressAttemptId);
  const next = resume ?? tests.find((t) => (t.attemptsLeft ?? 1) > 0 && !t.best);
  return (
    <div className="pr-tile">
      <Trophy size={20} aria-hidden="true" className="pr-tile-icon" />
      <div className="pr-tile-main">
        <span className="pr-tile-title">Open tests</span>
        <span className="pr-tile-figure tnum">{loading ? "…" : `${tests.length} open`}</span>
        <span className="pr-tile-note">{next ? `${resume ? "In progress" : "Next"}: ${next.title}` : loading ? "" : "Nothing waiting for you"}</span>
      </div>
      {next && (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onStart(next.id)}>
          {resume ? "Resume" : "Start"}
        </button>
      )}
    </div>
  );
}

function TestGroups({ tests, onStart }: { tests: AssessmentSummary[]; onStart: (id: string) => void }) {
  if (tests.length === 0) {
    return <EmptyState title="No tests yet" body="When your teachers set quizzes, mock tests or past papers, they appear here." />;
  }
  return (
    <div className="pr-groups">
      {GROUPS.map((group) => {
        const items = tests.filter((t) => t.status === group.status);
        return (
          <div key={group.status} className="pr-group">
            <h3 className="pr-group-title">{group.title} <span className="tnum">{items.length}</span></h3>
            {items.length === 0 ? <p className="pr-group-empty">{group.empty}</p> : (
              <ul className="pr-list">{items.map((test) => <TestRow key={test.id} test={test} onStart={onStart} />)}</ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function testTiming(test: AssessmentSummary): string {
  if (test.status === "upcoming" && test.opensAt) return `Opens ${relativeTime(test.opensAt)}`;
  if (test.status === "open" && test.closesAt) return `Closes ${relativeTime(test.closesAt)}`;
  if (test.durationMinutes) return `${test.durationMinutes} min`;
  return "Untimed";
}

function TestRow({ test, onStart }: { test: AssessmentSummary; onStart: (id: string) => void }) {
  const canStart = test.status === "open" && (test.inProgressAttemptId || test.attemptsLeft !== 0);
  return (
    <li className="pr-row">
      <SubjectGlyph subject={test.subject} />
      <div className="pr-row-main">
        <span className="pr-row-title">{test.title}</span>
        <span className="pr-row-meta">
          <KindBadge kind={test.kind} />
          <span>{test.courseCode}</span>
          <span className="tnum">{test.questionCount} questions</span>
          <span>{markingLabel(test.marking)}</span>
          {!test.tutorAllowed && <span className="pr-locked"><LockSimple size={12} weight="bold" aria-hidden="true" /> EduBot off</span>}
          {test.countsTowardGrade && <span>Counts toward your grade</span>}
        </span>
      </div>
      <div className="pr-row-side">
        {test.best ? (
          <Link to={`/s/attempts/${test.best.attemptId}`} className="pr-best tnum" aria-label={`Best score ${test.best.score} of ${test.best.maxScore}, see result`}>
            Best {formatScore(test.best.score)} / {formatScore(test.best.maxScore)}
          </Link>
        ) : (
          <span className="pr-row-when tnum">{testTiming(test)}</span>
        )}
        {canStart && (
          <button type="button" className={`btn btn-sm ${test.inProgressAttemptId ? "btn-primary" : "btn-secondary"}`}
            onClick={() => onStart(test.id)} aria-label={`${test.inProgressAttemptId ? "Resume" : "Start"} ${KIND_LABELS[test.kind].toLowerCase()} ${test.title}`}>
            {test.inProgressAttemptId ? "Resume" : test.best ? "Try again" : "Start"}
          </button>
        )}
      </div>
    </li>
  );
}

function TopicRows({ topics, onStart }: { topics: TopicPractice[]; onStart: (testId: string) => void }) {
  if (topics.length === 0) {
    return <EmptyState title="No topics yet" body="Topics come from your courses. When your teachers add them, you can practise each one here." />;
  }
  return (
    <ul className="pr-list">
      {topics.map((topic) => <TopicRow key={topic.id} topic={topic} onStart={onStart} />)}
    </ul>
  );
}

function TopicRow({ topic, onStart }: { topic: TopicPractice; onStart: (testId: string) => void }) {
  const generate = useAiPractice();
  const bank = useBankPractice();
  return (
    <li className="pr-row pr-topic">
      <div className="pr-row-main">
        <Link to={`/s/topics/${topic.id}`} className="pr-row-title">{topic.title}</Link>
        <span className="pr-row-meta">
          <span>{topic.courseCode}</span>
          <span className="tnum">{topic.answered} answered</span>
        </span>
        {generate.isError && <p className="pr-inline-error" role="alert">{aiErrorMessage(generate.error)}</p>}
        {bank.isError && <p className="pr-inline-error" role="alert">{aiErrorMessage(bank.error)}</p>}
        {generate.isSuccess && (
          <p className="pr-inline-ok" role="status">
            Ready: {generate.data.title}. It's in Your practice sets below.
          </p>
        )}
      </div>
      <div className="pr-row-side pr-topic-side">
        <StatBar label="Accuracy" value={topic.accuracy} display={topic.accuracy === null ? "Not practised" : `${Math.round(topic.accuracy)}%`} />
        <button type="button" className="btn btn-secondary btn-sm" disabled={bank.isPending || topic.questionCount === 0}
          onClick={() => bank.mutate(topic.id, { onSuccess: (set) => onStart(set.id) })}
          aria-label={`Practise 10 questions on ${topic.title}`}>
          {bank.isPending ? "Building set…" : "Practise 10 questions"}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => generate.mutate(topic.id)}
          disabled={generate.isPending} aria-label={`Generate 5 practice questions on ${topic.title}`}>
          {generate.isPending ? <span className="btn-spinner" aria-hidden="true" /> : <Sparkle size={14} weight="fill" aria-hidden="true" />}
          {generate.isPending ? "Writing questions…" : "Practise with AI"}
          {!generate.isPending && <ArrowRight size={12} aria-hidden="true" />}
        </button>
      </div>
    </li>
  );
}
