import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CloudCheck, CloudWarning, Flag, LockSimple, Timer, X } from "@phosphor-icons/react";
import {
  crossedWarning,
  formatClock,
  isInProgress,
  markingLabel,
  paletteCounts,
  paletteState,
  timerLevel,
  useAttempt,
  useSubmitAttempt,
  type AnswerResponse,
  type AttemptInProgress,
  type PlayerQuestion,
} from "@/lib/practice";
import { Palette, type PaletteEntry } from "@/components/practice/Palette";
import { SYNC_LABELS, useAnswerSync } from "@/components/practice/useAnswerSync";
import { Prose } from "@/components/Prose";
import { Alert, ConfirmDialog, ErrorState, SkeletonRows } from "@/components/ui";
import "@/styles/pages/student.css";
import "@/styles/pages/practice.css";

const TICK_MS = 1000;
const OPTION_LETTERS = "ABCDEFGH";
const TUTOR_OFF_CLASS = "pr-tutor-off";

/** Loads the attempt; a finished attempt goes to its result instead. */
export function TestPlayer() {
  const { attemptId = "" } = useParams();
  const { data, isLoading, isError, refetch } = useAttempt(attemptId);
  if (isError) return <div className="st-page"><ErrorState title="This test couldn't load" onRetry={() => void refetch()} /></div>;
  if (isLoading || !data) return <div className="st-page"><SkeletonRows rows={8} /></div>;
  if (!isInProgress(data)) return <Navigate to={`/s/attempts/${attemptId}`} replace />;
  return <Player key={data.id} attempt={data} />;
}

type FlatQuestion = PlayerQuestion & { section: string };

interface AnswerState {
  response: AnswerResponse | null;
  markedForReview: boolean;
}

function useCountdown(attempt: AttemptInProgress, onWarning: (message: string) => void) {
  const offset = useMemo(() => Date.parse(attempt.serverNow) - Date.now(), [attempt.serverNow]);
  const deadline = attempt.deadlineAt ? Date.parse(attempt.deadlineAt) : null;
  const remaining = useCallback(() => (deadline === null ? null : (deadline - (Date.now() + offset)) / 1000), [deadline, offset]);
  const [secondsLeft, setSecondsLeft] = useState(remaining);
  const previous = useRef(secondsLeft);
  useEffect(() => {
    if (deadline === null) return;
    const id = window.setInterval(() => {
      const next = remaining();
      if (next === null) return;
      const warning = previous.current === null ? null : crossedWarning(previous.current, next);
      if (warning) onWarning(warning);
      previous.current = next;
      setSecondsLeft(next);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [deadline, remaining, onWarning]);
  return secondsLeft;
}

function Player({ attempt }: { attempt: AttemptInProgress }) {
  const navigate = useNavigate();
  const questions = useMemo<FlatQuestion[]>(
    () => attempt.sections.flatMap((section) => section.questions.map((q) => ({ ...q, section: section.title }))),
    [attempt.sections],
  );
  const [current, setCurrent] = useState(0);
  // The ref is the source of truth for saving (handlers in the same tick must see the latest answer);
  // the state mirrors it for rendering.
  const answersRef = useRef<Record<string, AnswerState>>(
    Object.fromEntries(questions.map((q) => [q.id, { response: q.response, markedForReview: q.markedForReview }])));
  const [answers, setAnswers] = useState(answersRef.current);
  const times = useRef<Record<string, number>>(Object.fromEntries(questions.map((q) => [q.id, q.timeSeconds])));
  const [visited, setVisited] = useState<Set<string>>(
    () => new Set([questions[0]?.id, ...questions.filter((q) => q.response !== null || q.timeSeconds > 0).map((q) => q.id)]));
  const enteredAt = useRef(Date.now());
  const [announcement, setAnnouncement] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [draftProblem, setDraftProblem] = useState(false);
  const draftValid = useRef(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const sync = useAnswerSync(attempt.id);
  const submit = useSubmitAttempt(attempt.id);
  const submitted = useRef(false);

  const question = questions[current];
  const answer = answers[question.id];

  /** Adds the time spent on the current question to its running total and returns that total. */
  const takeTime = useCallback((questionId: string) => {
    const now = Date.now();
    times.current[questionId] = (times.current[questionId] ?? 0) + Math.round((now - enteredAt.current) / 1000);
    enteredAt.current = now;
    return times.current[questionId];
  }, []);

  const persist = useCallback((questionId: string, state: AnswerState) => {
    sync.queue(questionId, { ...state, timeSeconds: takeTime(questionId) });
  }, [sync, takeTime]);

  const update = (state: AnswerState) => {
    answersRef.current = { ...answersRef.current, [question.id]: state };
    setAnswers(answersRef.current);
    persist(question.id, state);
  };

  const goTo = (index: number) => {
    if (index === current || index < 0 || index >= questions.length) return;
    if (!draftValid.current) {
      // The typed answer isn't a number yet, so it hasn't been saved; say so rather than lose it silently.
      setDraftProblem(true);
      setAnnouncement("This answer isn't a number yet, so it isn't saved. Fix it or clear it before moving on.");
      return;
    }
    setDraftProblem(false);
    persist(question.id, answersRef.current[question.id]);
    setVisited((prev) => new Set(prev).add(questions[index].id));
    setCurrent(index);
  };

  // Moving between questions puts focus on the new question and says where you are.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus();
    setAnnouncement(`Question ${current + 1} of ${questions.length}`);
  }, [current, questions.length]);

  /** Submit only after every answer, including the one just given, is saved. A failed save stops the submit. */
  const finish = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setSaveFailed(false);
    setFinishing(true);
    persist(question.id, answersRef.current[question.id]);
    const saved = await sync.flush();
    if (!saved) {
      submitted.current = false;
      setFinishing(false);
      setSaveFailed(true);
      return;
    }
    submit.mutate(undefined, {
      onSuccess: () => navigate(`/s/attempts/${attempt.id}`, { replace: true }),
      onError: () => { submitted.current = false; },
      onSettled: () => setFinishing(false),
    });
  }, [attempt.id, navigate, persist, question.id, submit, sync]);

  const busy = finishing || submit.isPending;

  const secondsLeft = useCountdown(attempt, setAnnouncement);

  useEffect(() => {
    if (secondsLeft !== null && secondsLeft <= 0) void finish();
  }, [secondsLeft, finish]);

  useEffect(() => {
    if (sync.status === "closed") navigate(`/s/attempts/${attempt.id}`, { replace: true });
  }, [sync.status, attempt.id, navigate]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (submitted.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);

  useEffect(() => {
    if (attempt.tutorAllowed) return;
    document.body.classList.add(TUTOR_OFF_CLASS);
    return () => document.body.classList.remove(TUTOR_OFF_CLASS);
  }, [attempt.tutorAllowed]);

  const entries: PaletteEntry[] = questions.map((q, index) => ({
    id: q.id, number: index + 1, section: q.section, state: paletteState(answers[q.id], visited.has(q.id)),
  }));
  const counts = paletteCounts(entries.map((e) => e.state));
  const sections = attempt.sections.map((section) => ({
    title: section.title, first: questions.findIndex((q) => q.section === section.title),
  }));
  const level = secondsLeft === null ? "calm" : timerLevel(secondsLeft);
  const last = current === questions.length - 1;

  return (
    <div className="pr-player">
      <header className="pr-player-head">
        <div className="pr-player-title">
          <Link to="/s/practice" className="pr-back" aria-label="Leave the test (your answers are saved)"><ArrowLeft size={16} aria-hidden="true" /></Link>
          <div>
            <h1>{attempt.title}</h1>
            <p className="pr-player-meta">{markingLabel(attempt.marking)} · Attempt {attempt.number}</p>
          </div>
        </div>
        <div className="pr-player-status">
          <span className={`pr-sync is-${sync.status}`}>
            {sync.status === "retrying" || sync.status === "failed" ? <CloudWarning size={14} aria-hidden="true" /> : <CloudCheck size={14} aria-hidden="true" />}
            {SYNC_LABELS[sync.status]}
          </span>
          {secondsLeft !== null && (
            <span className={`pr-timer is-${level}`} role="timer" aria-label={`Time left ${formatClock(secondsLeft)}`}>
              <Timer size={16} weight="bold" aria-hidden="true" />
              <span className="tnum">{formatClock(secondsLeft)}</span>
            </span>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setConfirming(true)} disabled={busy}>
            {busy ? "Submitting…" : "Submit test"}
          </button>
        </div>
      </header>
      <p className="sr-only" aria-live="polite">{announcement}</p>

      {!attempt.tutorAllowed && (
        <p className="pr-tutor-note"><LockSimple size={14} weight="bold" aria-hidden="true" /> EduBot is off during this test. It comes back when you submit.</p>
      )}
      {submit.isError && <Alert tone="danger" title="Your test wasn't submitted">Check your connection and press Submit test again. Your answers are saved.</Alert>}
      {saveFailed && (
        <Alert tone="danger" title="Couldn't save your last answer">
          Your test hasn't been submitted.{" "}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void finish()}>Retry submit?</button>
        </Alert>
      )}

      {sections.length > 1 && (
        <nav className="pr-sections" aria-label="Sections">
          {sections.map((section) => (
            <button key={section.title} type="button" className="pr-section-tab"
              aria-current={question.section === section.title ? "true" : undefined}
              onClick={() => goTo(section.first)}>
              {section.title || "All questions"}
            </button>
          ))}
        </nav>
      )}

      <div className="pr-player-body">
        <section className="pr-question" aria-labelledby="pr-question-title">
          <div className="pr-question-head">
            <h2 id="pr-question-title" className="tnum" ref={headingRef} tabIndex={-1}>Question {current + 1} of {questions.length}</h2>
            {question.sourceLabel && <span className="pr-source">{question.sourceLabel}</span>}
          </div>
          <Prose text={question.stem} />
          <AnswerInput key={question.id} question={question} response={answer.response}
            onChange={(response) => update({ ...answer, response })}
            onValidityChange={(valid) => { draftValid.current = valid; if (valid) setDraftProblem(false); }} />
          {draftProblem && (
            <p className="pr-inline-error" role="alert">This answer isn't a number yet, so it isn't saved. Fix it or clear it before moving on.</p>
          )}
          <div className="pr-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => goTo(current - 1)} disabled={current === 0}>
              <ArrowLeft size={14} aria-hidden="true" /> Previous
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ ...answer, response: null })} disabled={answer.response === null}>
              <X size={14} aria-hidden="true" /> Clear response
            </button>
            <span className="pr-actions-spacer" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
              update({ ...answer, markedForReview: !answer.markedForReview });
              if (!answer.markedForReview && !last) goTo(current + 1);
            }}>
              <Flag size={14} weight={answer.markedForReview ? "fill" : "regular"} aria-hidden="true" />
              {answer.markedForReview ? "Unmark" : last ? "Mark for review" : "Mark for review and next"}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => (last ? setConfirming(true) : goTo(current + 1))}>
              {last ? "Save and finish" : "Save and next"} {!last && <ArrowRight size={14} aria-hidden="true" />}
            </button>
          </div>
        </section>

        <aside className="pr-player-side" aria-label="Question palette">
          <Palette entries={entries} current={current} onSelect={goTo} />
        </aside>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Submit your test?"
          danger={false}
          busy={busy}
          confirmLabel="Submit test"
          onClose={() => setConfirming(false)}
          onConfirm={() => void finish()}
          body={
            <div className="pr-confirm">
              <dl className="pr-facts">
                <div><dt>Answered</dt><dd className="tnum">{counts.answered}</dd></div>
                <div><dt>Marked for review</dt><dd className="tnum">{counts.marked}</dd></div>
                <div><dt>Not answered</dt><dd className="tnum">{counts.notAnswered}</dd></div>
              </dl>
              <p>You can't change answers after submitting.</p>
            </div>
          }
        />
      )}
    </div>
  );
}

const NUMBER = /^-?\d+(\.\d+)?$/;

/** Choices are real radios and checkboxes; numeric answers are typed and checked before they save. */
function numericText(response: AnswerResponse | null): string {
  return response && "value" in response ? String(response.value) : "";
}

function AnswerInput({ question, response, onChange, onValidityChange }: {
  question: FlatQuestion;
  response: AnswerResponse | null;
  onChange: (response: AnswerResponse | null) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const saved = numericText(response);
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState<string | null>(null);

  // Follow the saved answer when it changes from outside the input (for example "Clear response").
  useEffect(() => {
    setDraft(saved);
    setError(null);
    onValidityChange(true);
  }, [saved]); // onValidityChange is a fresh closure each render; only a new saved answer should reset the input

  if (question.kind === "numeric") {
    const commit = () => {
      const text = draft.trim();
      if (text === "") { setError(null); onValidityChange(true); onChange(null); return; }
      if (!NUMBER.test(text)) { setError("Enter a number, for example 9.8"); onValidityChange(false); return; }
      setError(null);
      onValidityChange(true);
      onChange({ value: Number(text) });
    };
    return (
      <div className="pr-numeric">
        <label htmlFor={`num-${question.id}`}>Your answer</label>
        <input id={`num-${question.id}`} className="input tnum" inputMode="decimal" autoComplete="off" value={draft}
          aria-invalid={error ? true : undefined} aria-describedby={error ? `num-${question.id}-error` : undefined}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); }} />
        {error && <p id={`num-${question.id}-error`} className="pr-inline-error" role="alert">{error}</p>}
      </div>
    );
  }

  const multiple = question.kind === "multiple";
  const chosen = response && "options" in response ? response.options : [];
  const toggle = (optionId: string) => {
    if (!multiple) { onChange({ options: [optionId] }); return; }
    const next = chosen.includes(optionId) ? chosen.filter((id) => id !== optionId) : [...chosen, optionId];
    onChange(next.length ? { options: next } : null);
  };

  return (
    <fieldset className="pr-options">
      <legend>{multiple ? "Choose all that apply" : "Choose one answer"}</legend>
      {question.options.map((option, index) => {
        const id = `opt-${question.id}-${option.id}`;
        return (
          <label key={option.id} htmlFor={id} className={`pr-option${chosen.includes(option.id) ? " is-chosen" : ""}`}>
            <input id={id} type={multiple ? "checkbox" : "radio"} name={`q-${question.id}`} value={option.id}
              checked={chosen.includes(option.id)} onChange={() => toggle(option.id)} />
            <span className="pr-option-letter" aria-hidden="true">{OPTION_LETTERS[index]}</span>
            <span className="pr-option-text">{option.text}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
