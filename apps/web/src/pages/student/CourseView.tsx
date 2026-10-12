import { Link, useParams } from "react-router-dom";
import { useCourse, type TopicCard } from "@/lib/student";
import { ErrorState, SkeletonRows } from "@/components/ui";
import { LessonLink } from "./LessonLink";
import { SubjectGlyph } from "./subject";
import "@/styles/pages/student.css";
import "@/styles/pages/doubts.css";

export function CourseView() {
  const { courseId = "" } = useParams();
  const { data, isLoading, isError, refetch } = useCourse(courseId);
  if (isError) return <div className="st-page"><ErrorState title="This course couldn't load" onRetry={() => void refetch()} /></div>;
  if (isLoading || !data) return <div className="st-page"><SkeletonRows rows={6} /></div>;

  return (
    <div className="st-page">
      <nav className="st-crumbs" aria-label="Breadcrumb">
        <Link to="/s/learn">Learn</Link>
        <span aria-hidden="true">/</span>
        <span>{data.code}</span>
      </nav>
      <header className="st-lesson-head">
        <SubjectGlyph subject={data.subject} size={24} />
        <div>
          <h1 className="st-title st-title-sm">{data.title}</h1>
          <p className="st-due-meta tnum">{data.term} · {data.lessonsCompleted} of {data.lessonsTotal} lessons complete</p>
        </div>
      </header>
      {data.topics.length > 0 && <TopicStrip topics={data.topics} />}
      <ol className="st-modules">
        {data.modules.map((m, mi) => (
          <li key={m.id} className="panel st-module">
            <div className="panel-head"><h2><span className="st-module-num tnum">{mi + 1}</span> {m.title}</h2></div>
            <ol className="st-lessons">
              {m.lessons.map((l) => <li key={l.id}><LessonLink lesson={l} /></li>)}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TopicStrip({ topics }: { topics: TopicCard[] }) {
  return (
    <section aria-labelledby="topics-title">
      <div className="st-section-head"><h2 id="topics-title">Topics</h2></div>
      <ul className="topic-strip">
        {topics.map((topic) => (
          <li key={topic.id}>
            <Link to={`/s/topics/${topic.id}`} className="topic-chip">
              <span className="topic-chip-title">{topic.title}</span>
              <span className="topic-chip-meta tnum">{topic.lessonsCompleted} of {topic.lessonsTotal} lessons</span>
              <span className="st-progress" aria-hidden="true">
                <span style={{ ["--p" as string]: topic.lessonsTotal ? topic.lessonsCompleted / topic.lessonsTotal : 0 }} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
