import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { saveAnswer, type AnswerPayload } from "@/lib/practice";

export type SyncStatus = "idle" | "saving" | "saved" | "retrying" | "failed" | "closed";

const DEBOUNCE_MS = 600;
const RETRY_DELAYS_MS = [2000, 5000, 10000];
const CLOSED_STATUS = 409;
const CLIENT_ERROR_MIN = 400;
const SERVER_ERROR_MIN = 500;

type PassResult = "saved" | "retryable" | "rejected" | "closed";

/** Network failures and 5xx are worth retrying; any other 4xx will fail the same way again. */
function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.status >= SERVER_ERROR_MIN || error.status < CLIENT_ERROR_MIN;
}

/**
 * Saves answers in the background. Each question keeps only its latest payload, so a burst of clicks becomes one
 * request; retryable failures stay queued and retry with backoff. A 409 means the server has closed the attempt.
 * `flush()` resolves true only once every queued answer, including ones queued while it ran, is saved.
 */
export function useAnswerSync(attemptId: string) {
  const pending = useRef(new Map<string, AnswerPayload>());
  const timer = useRef<number | undefined>(undefined);
  const failures = useRef(0);
  const inFlight = useRef<Promise<PassResult> | null>(null);
  const [status, setStatus] = useState<SyncStatus>("idle");

  /** One pass over what is queued now. Answers queued during the pass are left for the next one. */
  const runPass = useCallback((): Promise<PassResult> => {
    if (inFlight.current) return inFlight.current;
    const pass = (async (): Promise<PassResult> => {
      for (const [questionId, payload] of [...pending.current]) {
        try {
          await saveAnswer(attemptId, questionId, payload);
          if (pending.current.get(questionId) === payload) pending.current.delete(questionId);
        } catch (error) {
          if (error instanceof ApiError && error.status === CLOSED_STATUS) {
            pending.current.clear();
            return "closed";
          }
          return isRetryable(error) ? "retryable" : "rejected";
        }
      }
      return "saved";
    })();
    inFlight.current = pass;
    void pass.finally(() => { inFlight.current = null; });
    return pass;
  }, [attemptId]);

  const settle = useCallback((result: PassResult) => {
    if (result === "closed") setStatus("closed");
    else if (result === "rejected") setStatus("failed");
    else if (result === "retryable") setStatus("retrying");
    else setStatus(pending.current.size === 0 ? "saved" : "saving");
  }, []);

  /** Save everything queued, waiting for any pass already in flight. True when nothing is left unsaved. */
  const flush = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    while (pending.current.size > 0) {
      setStatus("saving");
      const result = await runPass();
      settle(result);
      if (result !== "saved") return false;
    }
    failures.current = 0;
    setStatus((current) => (current === "closed" ? current : "saved"));
    return true;
  }, [runPass, settle]);

  /** Background saving: on a retryable failure, try again with backoff; on a rejection, stop and say so. */
  const backgroundSave = useCallback(async () => {
    if (pending.current.size === 0) return;
    setStatus("saving");
    const result = await runPass();
    settle(result);
    if (result === "retryable") {
      const delay = RETRY_DELAYS_MS[Math.min(failures.current, RETRY_DELAYS_MS.length - 1)];
      failures.current += 1;
      timer.current = window.setTimeout(() => void backgroundSave(), delay);
    } else if (result === "saved") {
      failures.current = 0;
      if (pending.current.size > 0) timer.current = window.setTimeout(() => void backgroundSave(), DEBOUNCE_MS);
    }
  }, [runPass, settle]);

  const queue = useCallback((questionId: string, payload: AnswerPayload) => {
    pending.current.set(questionId, payload);
    if (failures.current > 0) return; // a retry is already scheduled; it will include this answer
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void backgroundSave(), DEBOUNCE_MS);
  }, [backgroundSave]);

  // Leaving the page early still sends what is queued (best effort; the server keeps every saved answer).
  useEffect(() => () => {
    window.clearTimeout(timer.current);
    if (pending.current.size > 0) void runPass();
  }, [runPass]);

  return { queue, flush, status, hasPending: () => pending.current.size > 0 };
}

export const SYNC_LABELS: Record<SyncStatus, string> = {
  idle: "Answers save as you go",
  saving: "Saving…",
  saved: "All answers saved",
  retrying: "Couldn't save, retrying",
  failed: "Couldn't save an answer",
  closed: "Time is up",
};
