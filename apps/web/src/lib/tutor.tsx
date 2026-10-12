/**
 * EduBot Tutor client. One conversation per open panel, shared by the Ask bar, the floating
 * launcher and the panel itself. Replies stream in as server-sent events.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface TutorTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export type TutorStatus = "idle" | "streaming" | "unavailable" | "error";

export interface TutorLessonContext {
  id: string;
  title: string;
}

interface TutorState {
  open: boolean;
  turns: TutorTurn[];
  status: TutorStatus;
  notice: string | null;
  lesson: TutorLessonContext | null;
  /** Set once the server has stored a reply; lets a doubt carry this chat to the teacher. */
  conversationId: string | null;
  /** Opens the panel on `lesson`, or on the current page's lesson when omitted. */
  openPanel: (lesson?: TutorLessonContext | null) => void;
  closePanel: () => void;
  /** Sends a message; returns false when it was not sent (empty, or a reply is still streaming). */
  ask: (message: string, lesson?: TutorLessonContext | null) => boolean;
  stop: () => void;
  reset: () => void;
  setPageLesson: (lesson: TutorLessonContext | null) => void;
}

const TutorCtx = createContext<TutorState | null>(null);

type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; conversationId: string }
  | { type: "error"; code: string; message: string };

/** Parse complete `data:` lines out of an SSE buffer; returns the events and the unconsumed remainder. */
export function drainSse(buffer: string): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = [];
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        events.push(JSON.parse(line.slice(6)) as StreamEvent);
      } catch {
        // A malformed frame is skipped; the stream-level checks still catch a reply that never finishes.
      }
    }
  }
  return { events, rest };
}

const CUT_OFF = "The answer was cut off. Try again.";
const sameLesson = (a: TutorLessonContext | null, b: TutorLessonContext | null) => (a?.id ?? null) === (b?.id ?? null);

async function failureMessage(response: Response): Promise<string> {
  if (response.status === 401) return "Your session ended. Sign in again to keep chatting.";
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string" && body.message) return body.message;
  } catch {
    // Not a problem-details body; fall through to the generic message.
  }
  return response.status === 429 ? "You're asking quickly. Wait a moment and try again." : "The tutor couldn't answer. Try again.";
}

let turnCounter = 0;
const nextId = () => `t${++turnCounter}`;

export function TutorProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<TutorTurn[]>([]);
  const [status, setStatus] = useState<TutorStatus>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [lesson, setLessonState] = useState<TutorLessonContext | null>(null);
  const lessonRef = useRef<TutorLessonContext | null>(null);
  const pageLesson = useRef<TutorLessonContext | null>(null);
  const conversation = useRef<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const streaming = useRef(false);
  const replyId = useRef<string | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const setLesson = useCallback((next: TutorLessonContext | null) => {
    lessonRef.current = next;
    setLessonState(next);
  }, []);

  const dropEmptyReply = useCallback((id: string | null) => {
    if (id) setTurns((prev) => prev.filter((t) => t.id !== id || t.text));
  }, []);

  const abortStream = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    streaming.current = false;
    dropEmptyReply(replyId.current);
    replyId.current = null;
  }, [dropEmptyReply]);

  const reset = useCallback(() => {
    abortStream();
    conversation.current = null;
    setConversationId(null);
    setTurns([]);
    setStatus("idle");
    setNotice(null);
  }, [abortStream]);

  const switchLesson = useCallback((next: TutorLessonContext | null) => {
    if (sameLesson(next, lessonRef.current)) return;
    reset();
    setLesson(next);
  }, [reset, setLesson]);

  const openPanel = useCallback((next?: TutorLessonContext | null) => {
    switchLesson(next === undefined ? pageLesson.current : next);
    setOpen(true);
  }, [switchLesson]);

  const stop = useCallback(() => {
    abortStream();
    setStatus("idle");
  }, [abortStream]);

  const stream = useCallback(async (text: string, activeLesson: TutorLessonContext | null) => {
    const reply: TutorTurn = { id: nextId(), role: "assistant", text: "" };
    replyId.current = reply.id;
    streaming.current = true;
    setOpen(true);
    setNotice(null);
    setTurns((prev) => [...prev, { id: nextId(), role: "user", text }, reply]);
    setStatus("streaming");

    const abort = new AbortController();
    controller.current = abort;
    const fail = (next: TutorStatus, message: string) => {
      setStatus(next);
      setNotice(message);
      dropEmptyReply(reply.id);
    };
    let outcome: "done" | "error" | null = null;
    const handle = (event: StreamEvent) => {
      if (event.type === "delta") {
        setTurns((prev) => prev.map((t) => (t.id === reply.id ? { ...t, text: t.text + event.text } : t)));
      } else if (event.type === "done") {
        conversation.current = event.conversationId;
        setConversationId(event.conversationId);
        if (outcome !== "error") setStatus("idle");
        outcome ??= "done";
      } else {
        outcome = "error";
        fail(event.code === "TUTOR_UNAVAILABLE" ? "unavailable" : "error", event.message);
      }
    };

    try {
      const response = await fetch("/api/v1/student/tutor/messages", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "X-Requested-With": "fetch" },
        body: JSON.stringify({ message: text, conversationId: conversation.current, lessonId: activeLesson?.id ?? null }),
        signal: abort.signal,
      });
      if (!response.ok || !response.body) {
        fail("error", await failureMessage(response));
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = drainSse(buffer);
        buffer = rest;
        events.forEach(handle);
      }
      drainSse(buffer + decoder.decode() + "\n\n").events.forEach(handle);
      if (outcome === null && !abort.signal.aborted) fail("error", CUT_OFF);
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      fail("error", "The connection dropped. Try again.");
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        streaming.current = false;
        replyId.current = null;
      }
    }
  }, [dropEmptyReply]);

  const ask = useCallback((message: string, nextLesson?: TutorLessonContext | null) => {
    const text = message.trim();
    if (!text) return false;
    const target = nextLesson === undefined ? lessonRef.current : nextLesson;
    if (!sameLesson(target, lessonRef.current)) switchLesson(target);
    else if (streaming.current) return false;
    void stream(text, target);
    return true;
  }, [stream, switchLesson]);

  const setPageLesson = useCallback((next: TutorLessonContext | null) => {
    pageLesson.current = next;
  }, []);

  const closePanel = useCallback(() => setOpen(false), []);

  const value = useMemo<TutorState>(
    () => ({ open, turns, status, notice, lesson, conversationId, openPanel, closePanel, ask, stop, reset, setPageLesson }),
    [open, turns, status, notice, lesson, conversationId, openPanel, closePanel, ask, stop, reset, setPageLesson],
  );
  return <TutorCtx.Provider value={value}>{children}</TutorCtx.Provider>;
}

export function useTutor(): TutorState {
  const ctx = useContext(TutorCtx);
  if (!ctx) throw new Error("useTutor must be used inside TutorProvider");
  return ctx;
}

/** Registers the lesson a page is about, so the floating launcher opens on it; cleared when the page unmounts. */
export function useTutorLesson(lesson: TutorLessonContext | null) {
  const { setPageLesson } = useTutor();
  const id = lesson?.id ?? null;
  const title = lesson?.title ?? "";
  useEffect(() => {
    setPageLesson(id ? { id, title } : null);
    return () => setPageLesson(null);
  }, [id, title, setPageLesson]);
}
