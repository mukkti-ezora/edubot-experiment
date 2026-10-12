import { useId, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChatCenteredText } from "@phosphor-icons/react";
import { Prose } from "@/components/Prose";
import { Button, EmptyState, ErrorState, SkeletonRows } from "@/components/ui";
import {
  formatPercent,
  gradeForShown,
  useCourseGrades,
  whatIfPercent,
  type CategoryStanding,
  type GradedItem,
  type ScaleStep,
} from "@/lib/progress";
import { SubjectGlyph } from "../subject";
import { ProgressNav } from "./Progress";
import "@/styles/pages/student.css";
import "@/styles/pages/progress.css";

export function CourseGrades() {
  const { courseId = "" } = useParams();
  const { data, isLoading, isError, refetch } = useCourseGrades(courseId);

  return (
    <div className="st-page pg-page">
      <nav className="st-crumbs" aria-label="Breadcrumb">
        <Link to="/s/progress">Progress</Link>
        <span aria-hidden="true">/</span>
        <span>{data?.course.code ?? "Course"}</span>
      </nav>
      {isError ? (
        <ErrorState title="This course's grades couldn't load" onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <SkeletonRows rows={6} />
      ) : (
        <>
          <header className="st-lesson-head pg-course-head">
            <SubjectGlyph subject={data.course.subject} size={24} />
            <div>
              <h1 className="st-title st-title-sm">{data.course.title}</h1>
              <p className="st-due-meta tnum">{data.course.code} · {data.course.credits} credits · {data.course.term}</p>
            </div>
            <div className="pg-course-standing">
              <span className="pg-label">Current standing</span>
              <span className="pg-standing-figure tnum">{formatPercent(data.percent)}</span>
              {data.grade && <span className="st-due-meta tnum">Grade {data.grade} · {data.gradePoint} pts</span>}
            </div>
          </header>
          <ProgressNav />
          <Categories categories={data.categories} />
          <WhatIf categories={data.categories} scale={data.scale} />
          <Items items={data.items} />
        </>
      )}
    </div>
  );
}

function Categories({ categories }: { categories: CategoryStanding[] }) {
  return (
    <section className="panel" aria-labelledby="categories-title">
      <div className="panel-head">
        <h2 id="categories-title">How this course is weighted</h2>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col" className="pg-num">Weight</th>
              <th scope="col" className="pg-num">Marks</th>
              <th scope="col" className="pg-num">Score</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.name}>
                <th scope="row" className="pg-row-head">{c.name}</th>
                <td className="pg-num tnum">{c.weight}%</td>
                <td className="pg-num tnum">{c.max > 0 ? `${trim(c.earned)} / ${trim(c.max)}` : "Not graded yet"}</td>
                <td className="pg-num tnum">{formatPercent(c.percent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="panel-foot st-muted">Categories with nothing graded yet don't count, so your standing reflects only work that's been marked.</p>
    </section>
  );
}

const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

interface Assumption {
  counted: boolean;
  /** null until the student moves the slider: the category then counts with its real marks. */
  percent: number | null;
}

const UNGRADED_START_PERCENT = 75;
const PERCENT_MAX = 100;

/** The marks a category contributes: its real marks until the student tries a score of their own. */
function assumedMarks(category: CategoryStanding, assumption: Assumption): { earned: number; max: number } {
  if (!assumption.counted) return { earned: 0, max: 0 };
  if (assumption.percent === null) {
    return category.max > 0 ? { earned: category.earned, max: category.max } : { earned: UNGRADED_START_PERCENT, max: PERCENT_MAX };
  }
  return { earned: assumption.percent, max: PERCENT_MAX };
}

/** What the slider shows before the student moves it: the category's exact real percentage. */
const realPercent = (c: CategoryStanding): number => (c.max > 0 ? (c.earned / c.max) * PERCENT_MAX : UNGRADED_START_PERCENT);

/** A category name made safe for use inside an element id. */
const idSafe = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Try out scores for each category and see the course grade they'd give. Nothing here is saved. */
export function WhatIf({ categories, scale }: { categories: CategoryStanding[]; scale: ScaleStep[] }) {
  const weighted = categories.filter((c) => c.weight > 0);
  const initial = () => Object.fromEntries(weighted.map((c) => [c.name, { counted: c.max > 0, percent: null }]));
  const [assumed, setAssumed] = useState<Record<string, Assumption>>(initial);
  const baseId = useId();

  const percent = whatIfPercent(weighted.map((c) => ({ weight: c.weight, ...assumedMarks(c, assumed[c.name]) })));
  const grade = percent === null ? null : gradeForShown(percent, scale);
  const update = (name: string, change: Partial<Assumption>) => setAssumed((prev) => ({ ...prev, [name]: { ...prev[name], ...change } }));

  if (weighted.length === 0) return null;
  return (
    <section className="panel pg-whatif" aria-labelledby={`${baseId}-title`}>
      <div className="panel-head">
        <h2 id={`${baseId}-title`}>What if</h2>
        <div className="spacer"><Button variant="ghost" size="sm" onClick={() => setAssumed(initial())}>Reset</Button></div>
      </div>
      <div className="pg-whatif-body">
        <ul className="pg-whatif-rows">
          {weighted.map((c) => {
            const a = assumed[c.name];
            const sliderId = `${baseId}-${idSafe(c.name)}`;
            const shownValue = a.percent ?? realPercent(c);
            return (
              <li key={c.name} className={`pg-whatif-row${a.counted ? "" : " is-off"}`}>
                <label className="pg-whatif-toggle">
                  <input type="checkbox" checked={a.counted} onChange={(e) => update(c.name, { counted: e.target.checked })} />
                  <span>{c.name} <span className="st-due-meta tnum">{c.weight}%</span></span>
                </label>
                <label htmlFor={sliderId} className="sr-only">{c.name} score</label>
                <input id={sliderId} type="range" min={0} max={PERCENT_MAX} step="any" value={shownValue} disabled={!a.counted}
                  onChange={(e) => update(c.name, { percent: Number(e.target.value) })} />
                <span className="pg-whatif-value tnum" aria-hidden="true">{a.counted ? formatPercent(shownValue) : "Not counted"}</span>
              </li>
            );
          })}
        </ul>
        <div className="pg-whatif-result" role="status" aria-live="polite">
          <span className="pg-label">That would give</span>
          <span className="pg-standing-figure tnum">{percent === null ? "Nothing counted" : formatPercent(percent)}</span>
          {grade && <span className="pg-whatif-grade tnum">Grade {grade.grade} · {grade.point} pts</span>}
        </div>
      </div>
    </section>
  );
}

function Items({ items }: { items: GradedItem[] }) {
  return (
    <section className="panel" aria-labelledby="items-title">
      <div className="panel-head"><h2 id="items-title">Graded work</h2></div>
      {items.length === 0 ? (
        <div className="panel-body">
          <EmptyState title="Nothing graded yet" body="Marks and feedback appear here as soon as your teacher grades an assignment or a graded test." />
        </div>
      ) : (
        <ul className="pg-items">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="pg-item">
              <div className="pg-item-head">
                <span>
                  <span className="pg-item-title">{item.title}</span>
                  <span className="st-due-meta">{item.category}{item.gradedAt ? ` · graded ${new Date(item.gradedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}</span>
                </span>
                {item.feedbackReady && <span className="pg-new"><ChatCenteredText size={13} aria-hidden="true" /> New feedback</span>}
                <span className="pg-item-score tnum">{trim(item.score)} / {trim(item.max)}</span>
              </div>
              {item.feedback && (
                <div className="pg-item-feedback">
                  <span className="pg-label">Feedback</span>
                  <Prose text={item.feedback} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
