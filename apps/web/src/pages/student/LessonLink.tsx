import { Link } from "react-router-dom";
import { CheckCircle, Circle, CircleHalf, FilmStrip, Shapes, type Icon } from "@phosphor-icons/react";
import type { LessonRow, LessonStatus } from "@/lib/student";

const STATUS: Record<LessonStatus, { icon: Icon; label: string }> = {
  completed: { icon: CheckCircle, label: "Completed" },
  started: { icon: CircleHalf, label: "In progress" },
  not_started: { icon: Circle, label: "Not started" },
};

/** One lesson in a course or topic list: progress, title, extra formats and length. */
export function LessonLink({ lesson }: { lesson: LessonRow }) {
  const status = STATUS[lesson.status];
  return (
    <Link to={`/s/lessons/${lesson.id}`} className={`st-lesson is-${lesson.status}`}>
      <status.icon size={18} weight={lesson.status === "not_started" ? "regular" : "fill"} className="st-lesson-status" aria-hidden="true" />
      <span className="st-lesson-title">{lesson.title}<span className="sr-only">, {status.label}</span></span>
      <span className="st-lesson-formats" aria-label={`Formats: ${lesson.formats.join(", ")}`}>
        {lesson.formats.includes("watch") && <FilmStrip size={15} aria-hidden="true" />}
        {lesson.formats.includes("animate") && <Shapes size={15} aria-hidden="true" />}
      </span>
      <span className="st-due-meta tnum">{lesson.minutes} min</span>
    </Link>
  );
}
