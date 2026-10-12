import { useId, useState, type FormEvent } from "react";
import "@/styles/tutor.css";
import { ArrowUp, Sparkle } from "@phosphor-icons/react";
import { useTutor, type TutorLessonContext } from "@/lib/tutor";

/** The Ask EduBot bar at the top of the student dashboard: ask anything, or start from a suggestion. */
export function AskBar({ suggestions = [], lesson = null }: { suggestions?: string[]; lesson?: TutorLessonContext | null }) {
  const { ask, status } = useTutor();
  const [text, setText] = useState("");
  const inputId = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ask(text, lesson)) setText("");
  };

  return (
    <section className="askbar" aria-labelledby={`${inputId}-label`}>
      <form className="askbar-form" onSubmit={submit}>
        <Sparkle size={20} weight="fill" className="askbar-icon" aria-hidden="true" />
        <label id={`${inputId}-label`} htmlFor={inputId} className="sr-only">Ask EduBot</label>
        <input
          id={inputId}
          className="askbar-input"
          placeholder={lesson ? `Ask about "${lesson.title}"` : "Ask EduBot about any lesson, concept or problem"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          maxLength={4000}
        />
        <button type="submit" className="askbar-send" disabled={!text.trim() || status === "streaming"} aria-label="Ask">
          <ArrowUp size={18} weight="bold" aria-hidden="true" />
        </button>
      </form>
      {suggestions.length > 0 && (
        <div className="askbar-suggestions" aria-label="Suggested questions">
          {suggestions.map((s) => (
            <button key={s} type="button" className="askbar-chip" onClick={() => ask(s, lesson)} disabled={status === "streaming"}>{s}</button>
          ))}
        </div>
      )}
    </section>
  );
}
