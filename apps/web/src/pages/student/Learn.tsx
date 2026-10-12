import { Link } from "react-router-dom";
import { useCourses } from "@/lib/student";
import { EmptyState, ErrorState, PageHead, SkeletonRows } from "@/components/ui";
import { IconCloudDownload } from "@/components/icons";
import { SubjectGlyph } from "./subject";
import "@/styles/pages/student.css";

export function Learn() {
  const { data, isLoading, isError, refetch } = useCourses();
  return (
    <div className="st-page">
      <PageHead title="Learn" sub="Your courses this term. Every lesson can be read, watched or explored."
        actions={<Link to="/s/offline" className="btn btn-ghost btn-sm"><IconCloudDownload width={14} height={14} /> Saved lessons</Link>} />
      {isError ? (
        <ErrorState title="Courses couldn't load" onRetry={() => void refetch()} />
      ) : isLoading ? (
        <SkeletonRows rows={4} />
      ) : data!.courses.length === 0 ? (
        <EmptyState title="No courses yet" body="When your institution adds you to a class, its course appears here." />
      ) : (
        <div className="st-course-grid">
          {data!.courses.map((c) => (
            <Link key={c.id} to={`/s/learn/${c.id}`} className="st-course st-course-lg">
              <SubjectGlyph subject={c.subject} size={26} />
              <span className="st-course-code">{c.code} · {c.term}</span>
              <span className="st-course-title">{c.title}</span>
              <span className="st-course-summary">{c.summary}</span>
              <span className="st-progress" role="meter" aria-label={`${c.title} progress`} aria-valuemin={0} aria-valuemax={c.lessonsTotal} aria-valuenow={c.lessonsCompleted}>
                <span style={{ ["--p" as string]: c.lessonsTotal ? c.lessonsCompleted / c.lessonsTotal : 0 }} />
              </span>
              <span className="st-due-meta tnum">{c.lessonsCompleted} of {c.lessonsTotal} lessons complete</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
