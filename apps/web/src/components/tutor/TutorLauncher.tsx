import { Sparkle } from "@phosphor-icons/react";
import "@/styles/tutor.css";
import { useTutor } from "@/lib/tutor";

export const TUTOR_LAUNCHER_ID = "tutor-launcher";

/** Floating entry point to the tutor, present on every student page. */
export function TutorLauncher() {
  const { open, openPanel, status } = useTutor();
  if (open) return null;
  return (
    <button type="button" id={TUTOR_LAUNCHER_ID} className={`tutor-launcher${status === "streaming" ? " is-busy" : ""}`} onClick={() => openPanel()} aria-label="Open EduBot Tutor">
      <Sparkle size={20} weight="fill" aria-hidden="true" />
      <span>Ask EduBot</span>
    </button>
  );
}
