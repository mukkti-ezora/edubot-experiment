import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import "@/styles/tutor.css";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp, BookOpen, ChalkboardTeacher, NotePencil, Sparkle, Stop, WarningCircle, X } from "@phosphor-icons/react";
import { Prose } from "@/components/Prose";
import { useTutor } from "@/lib/tutor";
import { AskTeacher } from "@/components/doubts/AskTeacher";
import { TUTOR_LAUNCHER_ID } from "./TutorLauncher";
import { TutorLanguageNote, TutorLanguagePicker } from "./TutorLanguage";

/** Side panel conversation with EduBot Tutor. Hint-first, lesson-aware, visible to teachers. */
export function TutorPanel() {
  const { open, closePanel, turns, status, notice, lesson, conversationId, ask, stop, reset } = useTutor();
  const [escalating, setEscalating] = useState(false);
  const reduceMotion = useReducedMotion();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }, [turns, reduceMotion]);
  useEffect(() => {
    if (open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      inputRef.current?.focus();
      return;
    }
    if (!opener.current) return;
    const target = opener.current;
    opener.current = null;
    // The launcher re-mounts after the panel closes, so wait a frame before restoring focus.
    requestAnimationFrame(() => (target.isConnected ? target : document.getElementById(TUTOR_LAUNCHER_ID))?.focus());
  }, [open]);

  const streaming = status === "streaming";
  const lastTurn = turns[turns.length - 1];
  const lastQuestion = [...turns].reverse().find((t) => t.role === "user")?.text ?? "";
  const answered = turns.some((t) => t.role === "assistant" && t.text);
  const canEscalate = !streaming && !!lastQuestion && (answered || status === "unavailable" || status === "error");
  const announcement = streaming ? "EduBot is writing" : notice ?? (lastTurn?.role === "assistant" && lastTurn.text ? "Reply ready" : "");

  const send = (event?: FormEvent) => {
    event?.preventDefault();
    if (ask(text)) setText("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) send(event);
  };
  const onPanelKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !escalating) closePanel();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          className="tutor-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          onKeyDown={onPanelKeyDown}
          initial={reduceMotion ? false : { x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={reduceMotion ? undefined : { x: 24, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <header className="tutor-head">
            <span className="tutor-mark" aria-hidden="true"><Sparkle size={16} weight="fill" /></span>
            <div className="tutor-title">
              <h2 id={titleId}>EduBot Tutor</h2>
              <span>{lesson ? <><BookOpen size={12} aria-hidden="true" /> {lesson.title}</> : "All your courses"}</span>
            </div>
            <TutorLanguagePicker enabled={open} />
            {turns.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={reset} aria-label="New conversation">
                <NotePencil size={16} aria-hidden="true" />
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={closePanel} aria-label="Close tutor">
              <X size={16} aria-hidden="true" />
            </button>
          </header>

          <p className="sr-only" role="status">{announcement}</p>
          <div className="tutor-body" ref={listRef} role="log" aria-live="off" aria-label="Conversation">
            <p className="tutor-notice">
              <ChalkboardTeacher size={16} aria-hidden="true" />
              EduBot gives hints before answers so you learn it yourself. Your teachers can review tutor chats.
            </p>
            <TutorLanguageNote enabled={open} />
            {turns.length === 0 && (
              <div className="tutor-empty">
                <p>Ask about anything you're studying. Try:</p>
                {["Explain this in simpler words", "Give me a practice question", "Where do I start on my assignment?"].map((s) => (
                  <button key={s} type="button" className="askbar-chip" onClick={() => ask(s)} disabled={streaming}>{s}</button>
                ))}
              </div>
            )}
            {turns.map((turn) => (
              <div key={turn.id} className={`tutor-turn is-${turn.role}`}>
                {turn.role === "assistant" ? (
                  turn.text ? <Prose text={turn.text} /> : <span className="tutor-typing"><span className="sr-only">EduBot is writing</span><i /><i /><i /></span>
                ) : (
                  <p>{turn.text}</p>
                )}
              </div>
            ))}
            {notice && (
              <p className={`tutor-alert${status === "unavailable" ? " is-unavailable" : ""}`}>
                <WarningCircle size={16} weight="fill" aria-hidden="true" /> {notice}
              </p>
            )}
            {canEscalate && (
              <button type="button" className="tutor-escalate" onClick={() => setEscalating(true)}>
                <ChalkboardTeacher size={16} aria-hidden="true" /> Still stuck? Ask your teacher
              </button>
            )}
          </div>

          <form className="tutor-compose" onSubmit={send}>
            <label htmlFor={`${titleId}-input`} className="sr-only">Message EduBot Tutor</label>
            <textarea
              id={`${titleId}-input`}
              ref={inputRef}
              rows={2}
              placeholder="Ask a question (Enter to send, Shift+Enter for a new line)"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={4000}
            />
            {streaming ? (
              <button type="button" className="tutor-send" onClick={stop} aria-label="Stop answering"><Stop size={16} weight="fill" aria-hidden="true" /></button>
            ) : (
              <button type="submit" className="tutor-send" disabled={!text.trim()} aria-label="Send"><ArrowUp size={16} weight="bold" aria-hidden="true" /></button>
            )}
          </form>
          {escalating && (
            <AskTeacher onClose={() => setEscalating(false)} initialTitle={lastQuestion} initialBody={lastQuestion}
              anchor={{ lesson, conversationId }} />
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
