import { useEffect, useState } from "react";
import { IconCheck, IconCloudDownload } from "@/components/icons";
import { isLessonSaved, offlineSupported, removeLessonOffline, saveLessonOffline } from "@/lib/offline";
import type { LessonDetail } from "@/lib/student";
import "@/styles/offline.css";

type SaveState = "unknown" | "saved" | "not_saved" | "working" | "failed";

/** Keeps this lesson's text, animation and practice prompts readable without a connection. */
export function SaveOffline({ lesson }: { lesson: LessonDetail }) {
  const [state, setState] = useState<SaveState>("unknown");

  useEffect(() => {
    let live = true;
    isLessonSaved(lesson.id).then(
      (saved) => live && setState(saved ? "saved" : "not_saved"),
      () => live && setState("not_saved"),
    );
    return () => { live = false; };
  }, [lesson.id]);

  if (!offlineSupported() || state === "unknown") return null;

  const saved = state === "saved";
  const toggle = async () => {
    setState("working");
    try {
      if (saved) await removeLessonOffline(lesson.id);
      else await saveLessonOffline(lesson);
      setState(saved ? "not_saved" : "saved");
    } catch {
      setState("failed");
    }
  };

  return (
    <span className="offline-save">
      <button type="button" className="btn btn-ghost btn-sm" aria-pressed={saved} disabled={state === "working"}
        onClick={() => void toggle()}>
        {saved ? <IconCheck width={14} height={14} /> : <IconCloudDownload width={14} height={14} />}
        Save for offline
      </button>
      <span className="offline-save-note" role="status">
        {state === "failed"
          ? "Couldn't save. Your device may be out of space."
          : saved ? "Saved on this device. Videos still need a connection." : ""}
      </span>
    </span>
  );
}
