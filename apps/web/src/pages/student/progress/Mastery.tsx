import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, Circle, CircleHalf, Equals, Medal, SealCheck, Star, type Icon } from "@phosphor-icons/react";
import { EmptyState, ErrorState, PageHead, SkeletonRows } from "@/components/ui";
import { MASTERY_LABEL, masteryRank, useMastery, type MasteryLevel, type TopicMastery } from "@/lib/progress";
import { SubjectGlyph } from "../subject";
import { ProgressNav } from "./Progress";
import "@/styles/pages/student.css";
import "@/styles/pages/progress.css";

const LEVEL_ICON: Record<MasteryLevel, Icon> = {
  not_started: Circle,
  attempted: CircleHalf,
  familiar: Star,
  proficient: Medal,
  mastered: SealCheck,
};

const LEVEL_HINT: Record<MasteryLevel, string> = {
  not_started: "No practice answers yet",
  attempted: "Under 50% of recent answers right",
  familiar: "50% or more right",
  proficient: "70% or more right",
  mastered: "80% or more over 6+ answers, including a test without help",
};

export function Mastery() {
  const { data, isLoading, isError, refetch } = useMastery();
  const byCourse = groupByCourse(data?.topics ?? []);
  const anyAnswered = (data?.topics ?? []).some((t) => t.answered > 0);

  return (
    <div className="st-page pg-page">
      <PageHead title="Mastery" sub="How well you know each topic, from your recent practice and tests. It can go down as well as up." />
      <ProgressNav />
      {isError ? (
        <ErrorState title="Mastery couldn't load" onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <SkeletonRows rows={6} />
      ) : data.topics.length === 0 ? (
        <EmptyState title="No topics yet" body="Topics appear here once your courses are organised into them." />
      ) : (
        <>
          {!anyAnswered && (
            <EmptyState title="Mastery grows as you practise"
              body="Answer practice questions or take a test on a topic and its level appears here. Recent answers count most."
              action={<Link to="/s/practice" className="btn btn-primary btn-sm">Go to Practice</Link>} />
          )}
          <Legend />
          {byCourse.map(([code, topics]) => (
            <section key={code} className="panel" aria-labelledby={`mastery-${code}`}>
              <div className="panel-head pg-mastery-head">
                <SubjectGlyph subject={topics[0].subject} size={18} />
                <h2 id={`mastery-${code}`}>{code}</h2>
                <span className="spacer st-due-meta tnum">{topics.filter((t) => t.level === "mastered").length} of {topics.length} mastered</span>
              </div>
              <ul className="pg-topics">
                {topics.map((topic) => <TopicRow key={topic.id} topic={topic} lookbackDays={data.lookbackDays} />)}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function groupByCourse(topics: TopicMastery[]): [string, TopicMastery[]][] {
  const groups = new Map<string, TopicMastery[]>();
  for (const topic of topics) groups.set(topic.courseCode, [...(groups.get(topic.courseCode) ?? []), topic]);
  return [...groups.entries()];
}

function Legend() {
  return (
    <details className="pg-legend">
      <summary>What the levels mean</summary>
      <dl>
        {(Object.keys(MASTERY_LABEL) as MasteryLevel[]).map((level) => (
          <div key={level}>
            <dt><LevelChip level={level} /></dt>
            <dd>{LEVEL_HINT[level]}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function LevelChip({ level }: { level: MasteryLevel }) {
  const LevelIcon = LEVEL_ICON[level];
  return (
    <span className={`pg-level is-${level}`}>
      <LevelIcon size={14} weight={level === "mastered" ? "fill" : "regular"} aria-hidden="true" />
      {MASTERY_LABEL[level]}
    </span>
  );
}

function TopicRow({ topic, lookbackDays }: { topic: TopicMastery; lookbackDays: number }) {
  const change = masteryRank(topic.level) - masteryRank(topic.previousLevel);
  return (
    <li className="pg-topic">
      <Link to={`/s/topics/${topic.id}`} className="pg-topic-title">{topic.title}</Link>
      <LevelChip level={topic.level} />
      <span className="pg-topic-stat tnum">{topic.accuracy === null ? "No answers" : `${topic.accuracy.toFixed(0)}% right`}</span>
      <span className="pg-topic-stat tnum">{topic.answered} answered</span>
      <Change change={change} previous={topic.previousLevel} lookbackDays={lookbackDays} />
    </li>
  );
}

function Change({ change, previous, lookbackDays }: { change: number; previous: MasteryLevel; lookbackDays: number }) {
  if (change > 0) return <span className="pg-change is-up"><ArrowUp size={13} aria-hidden="true" /> Up from {MASTERY_LABEL[previous].toLowerCase()}</span>;
  if (change < 0) return <span className="pg-change is-down"><ArrowDown size={13} aria-hidden="true" /> Down from {MASTERY_LABEL[previous].toLowerCase()}</span>;
  return <span className="pg-change"><Equals size={13} aria-hidden="true" /> Same as {lookbackDays} days ago</span>;
}
