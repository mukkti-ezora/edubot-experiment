import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Exam } from "@phosphor-icons/react";
import { formatScore } from "@/lib/format";
import { KIND_LABELS, ordinal, useTeacherAssessments, useTeacherResults, type TeacherAssessment } from "@/lib/practice";
import { KindBadge, StatBar } from "@/components/practice/parts";
import { EmptyState, ErrorState, PageHead, SkeletonRows } from "@/components/ui";
import "@/styles/pages/practice.css";

/** Teacher view of tests in their classes: the list, or one test's ranked results when an id is in the route. */
export function TeacherTests() {
  const { assessmentId } = useParams();
  return assessmentId ? <TestResultDetail id={assessmentId} /> : <TestList />;
}

function percentText(value: number | null): string {
  return value === null ? "No attempts" : `${Math.round(value)}%`;
}

function TestList() {
  const { data, isLoading, isError, refetch } = useTeacherAssessments();
  return (
    <div className="pr-page">
      <PageHead title="Tests" sub="Quizzes, mock tests and past papers in your classes, with how students did on their first attempt." />
      <section className="panel">
        {isError ? (
          <ErrorState title="Tests couldn't load" onRetry={() => void refetch()} />
        ) : isLoading || !data ? (
          <div className="st-pad"><SkeletonRows rows={5} /></div>
        ) : data.assessments.length === 0 ? (
          <EmptyState icon={<Exam size={20} aria-hidden="true" />} title="No tests yet"
            body="Tests set for your classes appear here with attempt counts and class averages." />
        ) : (
          <ul className="pr-list">
            {data.assessments.map((test) => <TestRow key={test.id} test={test} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

function TestRow({ test }: { test: TeacherAssessment }) {
  return (
    <li className="pr-row">
      <div className="pr-row-main">
        <Link to={`/t/tests/${test.id}`} className="pr-row-title">{test.title}</Link>
        <span className="pr-row-meta">
          <KindBadge kind={test.kind} />
          <span>{test.courseCode}</span>
          <span className="tnum">{test.questionCount} questions</span>
          <span>{test.status === "open" ? "Open now" : test.status === "upcoming" ? "Not open yet" : "Closed"}</span>
        </span>
      </div>
      <div className="pr-row-side pr-teacher-side">
        <span className="tnum">{test.attempts} {test.attempts === 1 ? "student" : "students"}</span>
        <span className="tnum pr-best">{percentText(test.averagePercent)} average</span>
      </div>
    </li>
  );
}

function TestResultDetail({ id }: { id: string }) {
  const { data, isLoading, isError, refetch } = useTeacherResults(id);
  if (isError) return <ErrorState title="These results couldn't load" onRetry={() => void refetch()} />;
  if (isLoading || !data) return <SkeletonRows rows={8} />;
  return (
    <div className="pr-page">
      <nav className="st-crumbs" aria-label="Breadcrumb">
        <Link to="/t/tests"><ArrowLeft size={12} aria-hidden="true" /> Tests</Link>
      </nav>
      <PageHead title={data.title} sub={`${data.courseCode} · ${KIND_LABELS[data.kind]} · ${data.students.length} students · ${percentText(data.averagePercent)} class average`} />

      <div className="pr-analysis is-teacher">
        <section className="panel" aria-labelledby="t-ranked">
          <div className="panel-head"><h2 id="t-ranked">First attempts, ranked</h2></div>
          {data.students.length === 0 ? (
            <EmptyState title="No one has sat this yet" body="Results appear as students submit their first attempt." />
          ) : (
            <table className="pr-table">
              <thead>
                <tr><th scope="col">Rank</th><th scope="col">Student</th><th scope="col" className="num">Score</th><th scope="col" className="num">Percent</th></tr>
              </thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.personId}>
                    <td className="tnum">{ordinal(s.rank)}</td>
                    <td>{s.name}</td>
                    <td className="num tnum">{s.score === null ? "–" : `${formatScore(s.score)} / ${formatScore(s.maxScore ?? 0)}`}</td>
                    <td className="num tnum">{percentText(s.percent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="panel" aria-labelledby="t-weak">
          <div className="panel-head"><h2 id="t-weak">Hardest topics for the class</h2></div>
          <div className="panel-body">
            {data.weakTopics.length === 0 ? <p className="st-muted">Topic accuracy appears once students answer.</p> : (
              <ul className="pr-breakdown">
                {data.weakTopics.map((topic) => (
                  <li key={topic.id}>
                    <div className="pr-breakdown-title">{topic.title}<span className="pr-breakdown-counts tnum">{topic.answered} answers</span></div>
                    <StatBar label="Class accuracy" value={topic.accuracy} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
