import { useRef, useState, type KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpenText, ChalkboardTeacher, CheckCircle, FilmStrip, Hash, Shapes, Sparkle, WarningCircle, type Icon } from "@phosphor-icons/react";
import { safeEmbedUrl, useCompleteLesson, useLesson, useRecordFormat, type LessonDetail, type LessonFormat } from "@/lib/student";
import { useTutor, useTutorLesson } from "@/lib/tutor";
import { Prose } from "@/components/Prose";
import { AskTeacher } from "@/components/doubts/AskTeacher";
import { SaveOffline } from "@/components/SaveOffline";
import { MakeFlashcardsButton } from "@/components/practice/EntryPoints";
import { LessonAnimation } from "@/components/lesson/LessonAnimation";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui";
import { SubjectGlyph } from "./subject";
import "@/styles/pages/student.css";

const TABS: { id: LessonFormat; label: string; icon: Icon }[] = [
  { id: "read", label: "Read", icon: BookOpenText },
  { id: "watch", label: "Watch", icon: FilmStrip },
  { id: "animate", label: "Animate", icon: Shapes },
];

/** Keyed by lesson so tab, completion and mutation state never carry over to the next lesson. */
export function LessonView() {
  const { lessonId = "" } = useParams();
  return <LessonPage key={lessonId} lessonId={lessonId} />;
}

function LessonPage({ lessonId }: { lessonId: string }) {
  const { data, isLoading, isError, refetch } = useLesson(lessonId);
  useTutorLesson(data ? { id: data.id, title: data.title } : null);

  if (isError) return <div className="st-page"><ErrorState title="This lesson couldn't load" onRetry={() => void refetch()} /></div>;
  if (isLoading || !data) return <div className="st-page"><SkeletonRows rows={8} /></div>;
  return <Lesson data={data} />;
}

function Lesson({ data }: { data: LessonDetail }) {
  const recordFormat = useRecordFormat(data.id);
  const complete = useCompleteLesson(data.id);
  const { openPanel, ask, status } = useTutor();
  const [tab, setTab] = useState<LessonFormat>("read");
  const [asking, setAsking] = useState(false);
  const tabRefs = useRef(new Map<LessonFormat, HTMLButtonElement>());

  const available = TABS.filter((t) => t.id === "read" || (t.id === "watch" ? !!data.video : !!data.animation));
  const lessonCtx = { id: data.id, title: data.title };
  const completed = data.status === "completed" || complete.isSuccess;
  const busy = complete.isPending || completed;

  const choose = (id: LessonFormat) => {
    setTab(id);
    recordFormat.mutate(id);
  };
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = available.findIndex((t) => t.id === tab);
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: available.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = available[(moves[event.key] + available.length) % available.length].id;
    choose(next);
    tabRefs.current.get(next)?.focus();
  };

  return (
    <div className="st-page st-lesson-page">
      <nav className="st-crumbs" aria-label="Breadcrumb">
        <Link to="/s/learn">Learn</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/s/learn/${data.course.id}`}>{data.course.code}</Link>
        <span aria-hidden="true">/</span>
        <span>{data.module.title}</span>
      </nav>

      <header className="st-lesson-head">
        <SubjectGlyph subject={data.course.subject} size={24} />
        <div>
          <h1 className="st-title st-title-sm">{data.title}</h1>
          <p className="st-due-meta tnum">
            Lesson {data.position} of {data.count} · {data.minutes} min
            {data.topic && <> · <Link className="st-topic-link" to={`/s/topics/${data.topic.id}`}><Hash size={12} aria-hidden="true" />{data.topic.title}</Link></>}
          </p>
        </div>
        <div className="st-ask-lesson">
          <SaveOffline lesson={data} />
          <MakeFlashcardsButton lessonId={data.id} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsking(true)}>
            <ChalkboardTeacher size={14} aria-hidden="true" /> Ask your teacher
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openPanel(lessonCtx)}>
            <Sparkle size={14} weight="fill" aria-hidden="true" /> Ask about this lesson
          </button>
        </div>
      </header>

      <div className="st-tabs" role="tablist" aria-label="Lesson format" onKeyDown={onTabKeyDown}>
        {available.map((t) => {
          const selected = tab === t.id;
          return (
            <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={selected}
              aria-controls={selected ? `panel-${t.id}` : undefined} tabIndex={selected ? 0 : -1}
              ref={(el) => { if (el) tabRefs.current.set(t.id, el); else tabRefs.current.delete(t.id); }}
              className="st-tab" onClick={() => choose(t.id)}>
              <t.icon size={16} aria-hidden="true" /> {t.label}
            </button>
          );
        })}
      </div>

      <section className="panel st-lesson-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
        <div className="panel-body">
          {tab === "read" && <Prose text={data.body} className="st-lesson-prose" />}
          {tab === "watch" && data.video && <LessonVideo video={data.video} />}
          {tab === "animate" && data.animation && <LessonAnimation animation={data.animation} />}
        </div>
      </section>

      <div className="st-lesson-help">
        <span>Stuck on something?</span>
        {["Explain this more simply", "Give me a practice question", "What's a real-world example?"].map((q) => (
          <button key={q} type="button" className="askbar-chip" onClick={() => ask(q, lessonCtx)} disabled={status === "streaming"}>{q}</button>
        ))}
      </div>

      <footer className="st-lesson-foot">
        {data.previous ? (
          <Link to={`/s/lessons/${data.previous.id}`} className="btn btn-ghost btn-sm"><ArrowLeft size={14} aria-hidden="true" /> {data.previous.title}</Link>
        ) : <span />}
        <button type="button" className={`btn btn-sm ${completed ? "btn-secondary" : "btn-primary"}`} aria-disabled={busy}
          onClick={() => !busy && complete.mutate()}>
          <CheckCircle size={16} weight={completed ? "fill" : "regular"} aria-hidden="true" /> {completed ? "Completed" : "Mark as complete"}
        </button>
        {data.next ? (
          <Link to={`/s/lessons/${data.next.id}`} className="btn btn-ghost btn-sm">{data.next.title} <ArrowRight size={14} aria-hidden="true" /></Link>
        ) : <span />}
      </footer>
      {asking && (
        <AskTeacher onClose={() => setAsking(false)}
          anchor={{ lesson: lessonCtx, course: data.course, topic: data.topic }} />
      )}
      <p className="sr-only" role="status">{complete.isSuccess ? "Lesson marked complete" : ""}</p>
      {complete.isError && (
        <p className="st-inline-error" role="alert">
          <WarningCircle size={16} weight="fill" aria-hidden="true" /> Your progress wasn't saved.
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => complete.mutate()}>Try again</button>
        </p>
      )}
    </div>
  );
}

function LessonVideo({ video }: { video: NonNullable<LessonDetail["video"]> }) {
  const src = safeEmbedUrl(video.url);
  if (!src) return <EmptyState title="Video unavailable" body="This video can't be played here. The Read tab covers the same material." />;
  return (
    <figure className="st-video">
      <div className="st-video-frame">
        <iframe src={src} title={video.title} loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
      </div>
      <figcaption>{video.title} · {video.source}</figcaption>
    </figure>
  );
}
