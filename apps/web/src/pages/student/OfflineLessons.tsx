import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { IconCloudDownload, IconTrash } from "@/components/icons";
import { EmptyState, ErrorState, PageHead, SkeletonRows } from "@/components/ui";
import { listSavedLessons, offlineSupported, removeLessonOffline, useOnline, type SavedLesson } from "@/lib/offline";
import "@/styles/pages/student.css";
import "@/styles/offline.css";

type Load = { state: "loading" } | { state: "ready"; lessons: SavedLesson[] } | { state: "error" };

export function OfflineLessons() {
  const online = useOnline();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [focusAfterRemove, setFocusAfterRemove] = useState<string | null>(null);
  const links = useRef(new Map<string, HTMLAnchorElement>());

  const refresh = () => {
    listSavedLessons()
      .then((lessons) => setLoad({ state: "ready", lessons }))
      .catch(() => setLoad({ state: "error" }));
  };
  useEffect(refresh, []);

  // After a removal, keep the keyboard where the student was: on the next lesson, or the list's heading.
  useEffect(() => {
    if (load.state !== "ready" || focusAfterRemove === null) return;
    const heading = document.querySelector<HTMLElement>(".page-head h1");
    heading?.setAttribute("tabindex", "-1");
    (links.current.get(focusAfterRemove) ?? heading)?.focus();
    setFocusAfterRemove(null);
  }, [load, focusAfterRemove]);

  const remove = async (id: string) => {
    if (load.state !== "ready") return;
    const index = load.lessons.findIndex((lesson) => lesson.id === id);
    const neighbour = load.lessons[index + 1] ?? load.lessons[index - 1];
    await removeLessonOffline(id);
    setFocusAfterRemove(neighbour?.id ?? "");
    refresh();
  };

  return (
    <div className="st-page">
      <PageHead
        title="Saved lessons"
        sub={online
          ? "Lessons you saved open here without a connection. Videos need the internet."
          : "You're offline. These lessons open without a connection; videos will play when you're back online."}
      />
      {!offlineSupported() ? (
        <EmptyState title="This browser can't save lessons" body="Use a current version of Chrome, Edge, Firefox or Safari to read lessons offline." />
      ) : load.state === "loading" ? (
        <SkeletonRows rows={3} />
      ) : load.state === "error" ? (
        <ErrorState title="Saved lessons couldn't load" onRetry={refresh} />
      ) : load.lessons.length === 0 ? (
        <EmptyState
          icon={<IconCloudDownload />}
          title="No saved lessons yet"
          body="Open any lesson and choose Save for offline. It will be here for your commute or a patchy connection."
          action={<Link to="/s/learn" className="btn btn-secondary btn-sm">Browse courses</Link>}
        />
      ) : (
        <ul className="offline-list panel">
          {load.lessons.map((lesson) => (
            <li key={lesson.id} className="offline-row">
              <Link to={`/s/lessons/${lesson.id}`} className="offline-row-main"
                ref={(node) => { if (node) links.current.set(lesson.id, node); else links.current.delete(lesson.id); }}>
                <span className="offline-row-title">{lesson.title}</span>
                <span className="st-due-meta tnum">{lesson.courseCode} · {lesson.courseTitle} · {lesson.minutes} min</span>
              </Link>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void remove(lesson.id)}
                aria-label={`Remove ${lesson.title} from saved lessons`}>
                <IconTrash width={16} height={16} /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
