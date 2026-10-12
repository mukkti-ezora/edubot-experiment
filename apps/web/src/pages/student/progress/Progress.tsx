import { Link, NavLink } from "react-router-dom";
import { ChatCenteredText } from "@phosphor-icons/react";
import { Alert, EmptyState, ErrorState, PageHead, Skeleton, SkeletonRows } from "@/components/ui";
import { formatGpa, formatPercent, useProgress, type CourseStanding, type TermRecord } from "@/lib/progress";
import { SubjectGlyph } from "../subject";
import "@/styles/pages/student.css";
import "@/styles/pages/progress.css";

const SECTIONS = [
  { to: "/s/progress", label: "Overview", end: true },
  { to: "/s/progress/mastery", label: "Mastery", end: false },
  { to: "/s/progress/credits", label: "Credits", end: false },
];

/** The sub-navigation shared by every Progress page. */
export function ProgressNav() {
  return (
    <nav className="pg-nav" aria-label="Progress sections">
      {SECTIONS.map((s) => (
        <NavLink key={s.to} to={s.to} end={s.end} className={({ isActive }) => `pg-nav-link${isActive ? " is-active" : ""}`}>
          {s.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Progress() {
  const { data, isLoading, isError, refetch } = useProgress();

  return (
    <div className="st-page pg-page">
      <PageHead title="Progress" sub="Your standing in every course this term, and your record so far." />
      <ProgressNav />
      {isError ? (
        <ErrorState title="Progress couldn't load" onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <ProgressSkeleton />
      ) : (
        <>
          <RecordPanel cgpa={data.record.cgpa} creditsEarned={data.record.creditsEarned} terms={data.record.terms} />
          {data.feedbackReady > 0 && (
            <Alert tone="info" title={`${data.feedbackReady} new ${data.feedbackReady === 1 ? "piece" : "pieces"} of feedback`}>
              Open a course below to read what your teacher wrote.
            </Alert>
          )}
          <CurrentCourses courses={data.courses} />
          {data.record.terms.length > 0 && <TermHistory terms={data.record.terms} />}
        </>
      )}
    </div>
  );
}

function ProgressSkeleton() {
  return (
    <>
      <section className="panel pg-record" aria-busy="true">
        <div className="pg-record-figure"><Skeleton w={120} h={44} /><Skeleton w={160} /></div>
        <Skeleton w="100%" h={120} />
      </section>
      <section className="panel"><div className="panel-body"><SkeletonRows rows={3} /></div></section>
    </>
  );
}

function RecordPanel({ cgpa, creditsEarned, terms }: { cgpa: number | null; creditsEarned: number; terms: TermRecord[] }) {
  return (
    <section className="panel pg-record" aria-labelledby="record-title">
      <div className="pg-record-figure">
        <h2 id="record-title" className="pg-label">CGPA</h2>
        <p className="pg-cgpa tnum">{formatGpa(cgpa)}<span className="pg-cgpa-scale"> / 10</span></p>
        <p className="st-muted tnum">{creditsEarned} credits earned across {terms.length} {terms.length === 1 ? "term" : "terms"}</p>
      </div>
      {terms.length > 0 ? (
        <SgpaTrend terms={terms} />
      ) : (
        <p className="st-muted pg-record-empty">Your CGPA appears once your first term's results are recorded.</p>
      )}
    </section>
  );
}

const SGPA_MAX = 10;
const CHART_HEIGHT = 120;
const BAR_WIDTH = 28;
const BAR_GAP = 36;

/** SGPA per term as bars on the 10-point scale, with the same numbers in a table for screen readers. */
export function SgpaTrend({ terms }: { terms: TermRecord[] }) {
  const width = terms.length * (BAR_WIDTH + BAR_GAP);
  return (
    <figure className="pg-trend">
      <figcaption className="pg-label">SGPA by term</figcaption>
      <svg viewBox={`0 0 ${width} ${CHART_HEIGHT + 36}`} width={width} height={CHART_HEIGHT + 36}
        className="pg-trend-svg" aria-hidden="true">
        {terms.map((t, i) => {
          const value = t.sgpa ?? 0;
          const h = (value / SGPA_MAX) * CHART_HEIGHT;
          const x = i * (BAR_WIDTH + BAR_GAP) + BAR_GAP / 2;
          return (
            <g key={t.term}>
              <rect x={x} y={0} width={BAR_WIDTH} height={CHART_HEIGHT} className="pg-trend-track" rx={3} />
              <rect x={x} y={CHART_HEIGHT - h} width={BAR_WIDTH} height={h} className="pg-trend-bar" rx={3} />
              <text x={x + BAR_WIDTH / 2} y={CHART_HEIGHT - h - 6} textAnchor="middle" className="pg-trend-value">
                {t.sgpa === null ? "" : t.sgpa.toFixed(2)}
              </text>
              <text x={x + BAR_WIDTH / 2} y={CHART_HEIGHT + 20} textAnchor="middle" className="pg-trend-term">{shortTerm(t.term)}</text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>SGPA by term</caption>
        <thead><tr><th scope="col">Term</th><th scope="col">SGPA</th><th scope="col">Credits earned</th></tr></thead>
        <tbody>
          {terms.map((t) => (
            <tr key={t.term}><th scope="row">{t.term}</th><td>{formatGpa(t.sgpa)}</td><td>{t.credits}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** "2025 Autumn" reads as "Aut 25" under a bar. */
function shortTerm(term: string): string {
  const year = term.match(/\d{4}/)?.[0];
  const season = term.replace(/\d{4}/, "").trim();
  return [season.slice(0, 3), year?.slice(2)].filter(Boolean).join(" ") || term;
}

function CurrentCourses({ courses }: { courses: CourseStanding[] }) {
  return (
    <section className="panel" aria-labelledby="current-title">
      <div className="panel-head"><h2 id="current-title">This term</h2></div>
      {courses.length === 0 ? (
        <div className="panel-body">
          <EmptyState title="No courses this term" body="When your institution adds you to a class, your standing in it appears here." />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data pg-courses">
            <thead>
              <tr>
                <th scope="col">Course</th>
                <th scope="col" className="pg-num">Credits</th>
                <th scope="col">Standing</th>
                <th scope="col">Grade</th>
                <th scope="col"><span className="sr-only">Feedback</span></th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/s/progress/courses/${c.id}`} className="pg-course-link">
                      <SubjectGlyph subject={c.subject} size={18} />
                      <span>
                        <span className="pg-course-title">{c.title}</span>
                        <span className="st-due-meta">{c.code} · {c.category}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="pg-num tnum">{c.credits}</td>
                  <td>
                    {c.percent === null ? (
                      <span className="st-muted">Nothing graded yet</span>
                    ) : (
                      <span className="pg-standing">
                        <span className="pg-meter" aria-hidden="true"><span style={{ ["--p" as string]: c.percent / 100 }} /></span>
                        <span className="tnum">{formatPercent(c.percent)}</span>
                        <span className="st-due-meta tnum">{c.gradedItems} graded</span>
                      </span>
                    )}
                  </td>
                  <td>{c.grade ? <span className="pg-grade tnum">{c.grade}{" "}<span className="st-due-meta">· {c.gradePoint} pts</span></span> : <span className="st-muted">Not yet</span>}</td>
                  <td>
                    {c.feedbackReady > 0 && (
                      <Link to={`/s/progress/courses/${c.id}`} className="pg-feedback">
                        <ChatCenteredText size={14} aria-hidden="true" /> {c.feedbackReady} new feedback
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TermHistory({ terms }: { terms: TermRecord[] }) {
  return (
    <section className="panel" aria-labelledby="history-title">
      <div className="panel-head"><h2 id="history-title">Results by term</h2></div>
      <ul className="pg-terms">
        {[...terms].reverse().map((t) => (
          <li key={t.term}>
            <details className="pg-term">
              <summary>
                <span className="pg-term-name">{t.term}</span>
                <span className="tnum">SGPA {formatGpa(t.sgpa)}</span>
                <span className="st-due-meta tnum">{t.credits} credits earned</span>
              </summary>
              <table className="data pg-term-table">
                <thead><tr><th scope="col">Course</th><th scope="col" className="pg-num">Credits</th><th scope="col">Grade</th></tr></thead>
                <tbody>
                  {t.courses.map((c) => (
                    <tr key={c.code}>
                      <td>{c.title} <span className="st-due-meta">{c.code}{c.source === "nptel" ? " · NPTEL" : ""}</span></td>
                      <td className="pg-num tnum">{c.credits}</td>
                      <td className="tnum">{c.grade} <span className="st-due-meta">· {c.gradePoint} pts</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
