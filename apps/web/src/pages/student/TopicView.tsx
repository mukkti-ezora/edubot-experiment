import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChatsCircle, Sparkle } from "@phosphor-icons/react";
import { useTopic, type TopicDetail } from "@/lib/doubts";
import { useTutor } from "@/lib/tutor";
import { AskTeacher } from "@/components/doubts/AskTeacher";
import { PracticeTopicButton } from "@/components/practice/EntryPoints";
import { DoubtStatusChip } from "@/components/doubts/parts";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui";
import { LessonLink } from "./LessonLink";
import { SubjectGlyph } from "./subject";
import "@/styles/pages/student.css";
import "@/styles/pages/doubts.css";

export function TopicView() {
  const { topicId = "" } = useParams();
  const { data, isLoading, isError, refetch } = useTopic(topicId);
  if (isError) return <div className="st-page"><ErrorState title="This topic couldn't load" onRetry={() => void refetch()} /></div>;
  if (isLoading || !data) return <div className="st-page"><SkeletonRows rows={6} /></div>;
  return <Topic topic={data} />;
}

/** Everything on one concept: its lessons, how far you are, and the doubts you raised on it. */
function Topic({ topic }: { topic: TopicDetail }) {
  const { ask, status } = useTutor();
  const [asking, setAsking] = useState(false);
  const { completed, total } = topic.progress;

  return (
    <div className="st-page">
      <nav className="st-crumbs" aria-label="Breadcrumb">
        <Link to="/s/learn">Learn</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/s/learn/${topic.course.id}`}>{topic.course.code}</Link>
        <span aria-hidden="true">/</span>
        <span>Topics</span>
      </nav>

      <header className="st-lesson-head">
        <SubjectGlyph subject={topic.course.subject} size={24} />
        <div>
          <h1 className="st-title st-title-sm">{topic.title}</h1>
          {topic.summary && <p className="st-muted">{topic.summary}</p>}
        </div>
        <button type="button" className="btn btn-secondary btn-sm st-ask-lesson" disabled={status === "streaming"}
          onClick={() => ask(`Give me an overview of ${topic.title} and check what I already know.`, null)}>
          <Sparkle size={14} weight="fill" aria-hidden="true" /> Ask EduBot about this topic
        </button>
        <PracticeTopicButton topicId={topic.id} title={topic.title} />
      </header>

      <div className="topic-progress">
        <span className="tnum">{completed} of {total} lessons complete</span>
        <span className="st-progress" role="meter" aria-label={`${topic.title} progress`} aria-valuemin={0}
          aria-valuemax={total} aria-valuenow={completed}>
          <span style={{ ["--p" as string]: total ? completed / total : 0 }} />
        </span>
      </div>

      <section className="panel" aria-labelledby="topic-lessons">
        <div className="panel-head"><h2 id="topic-lessons">Lessons</h2></div>
        {topic.lessons.length === 0 ? (
          <EmptyState title="No lessons yet" body="Your teacher hasn't added lessons to this topic yet." />
        ) : (
          <ol className="st-lessons">
            {topic.lessons.map((lesson) => <li key={lesson.id}><LessonLink lesson={lesson} /></li>)}
          </ol>
        )}
      </section>

      <section className="panel" aria-labelledby="topic-doubts">
        <div className="panel-head">
          <h2 id="topic-doubts">Your doubts on this topic</h2>
          {topic.doubts.length > 0 && (
            <div className="spacer">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsking(true)}>Ask your teacher</button>
            </div>
          )}
        </div>
        {topic.doubts.length === 0 ? (
          <EmptyState icon={<ChatsCircle size={20} aria-hidden="true" />} title="No doubts on this topic"
            body="If something here doesn't click after the lessons and EduBot, ask your teacher directly."
            action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => setAsking(true)}>Ask your teacher</button>} />
        ) : (
          <ul className="doubt-list">
            {topic.doubts.map((doubt) => (
              <li key={doubt.id}>
                <Link to={`/s/doubts/${doubt.id}`} className="doubt-row is-compact">
                  <span className="doubt-row-main">
                    <span className="doubt-row-title">{doubt.title}</span>
                    {doubt.lesson && <span className="doubt-row-meta">{doubt.lesson.title}</span>}
                  </span>
                  <span className="doubt-row-side"><DoubtStatusChip status={doubt.status} viewer="student" /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {asking && (
        <AskTeacher onClose={() => setAsking(false)}
          anchor={{ course: topic.course, topic: { id: topic.id, title: topic.title } }} />
      )}
    </div>
  );
}
