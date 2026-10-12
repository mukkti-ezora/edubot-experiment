import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { drainSse, TutorProvider, useTutor } from "./tutor";

const wrapper = ({ children }: { children: ReactNode }) => <TutorProvider>{children}</TutorProvider>;

function sseResponse(frames: string[], { hang = false } = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      frames.forEach((f) => controller.enqueue(encoder.encode(f)));
      if (!hang) controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const frame = (event: object) => `data: ${JSON.stringify(event)}\n\n`;

function mockFetch(response: Response) {
  vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
    init?.signal?.addEventListener("abort", () => response.body?.cancel().catch(() => undefined));
    return Promise.resolve(response);
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("drainSse framing", () => {
  it("accepts CRLF-framed events", () => {
    const { events, rest } = drainSse('data: {"type":"delta","text":"a"}\r\n\r\ndata: {"type":"done","conversationId":"c"}\r\n\r\n');
    expect(events).toEqual([{ type: "delta", text: "a" }, { type: "done", conversationId: "c" }]);
    expect(rest).toBe("");
  });

  it("skips a malformed frame and keeps the rest", () => {
    const { events } = drainSse('data: {not json\n\ndata: {"type":"delta","text":"ok"}\n\n');
    expect(events).toEqual([{ type: "delta", text: "ok" }]);
  });
});

describe("TutorProvider streaming", () => {
  it("assembles a streamed reply and returns to idle", async () => {
    mockFetch(sseResponse([frame({ type: "delta", text: "Hi " }), frame({ type: "delta", text: "there" }), frame({ type: "done", conversationId: "c1" })]));
    const { result } = renderHook(() => useTutor(), { wrapper });
    act(() => void result.current.ask("hello"));
    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(result.current.turns.map((t) => [t.role, t.text])).toEqual([["user", "hello"], ["assistant", "Hi there"]]);
    expect(result.current.notice).toBeNull();
  });

  it("treats a stream that ends without done or error as cut off", async () => {
    mockFetch(sseResponse([frame({ type: "delta", text: "Partial" })]));
    const { result } = renderHook(() => useTutor(), { wrapper });
    act(() => void result.current.ask("hello"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.notice).toBe("The answer was cut off. Try again.");
    expect(result.current.turns.at(-1)?.text).toBe("Partial");
  });

  it("keeps the error when a done event follows it", async () => {
    mockFetch(sseResponse([
      frame({ type: "delta", text: "Some" }),
      frame({ type: "error", code: "TUTOR_UNAVAILABLE", message: "The tutor isn't available right now." }),
      frame({ type: "done", conversationId: "c1" }),
    ]));
    const { result } = renderHook(() => useTutor(), { wrapper });
    act(() => void result.current.ask("hello"));
    await waitFor(() => expect(result.current.notice).toBe("The tutor isn't available right now."));
    expect(result.current.status).toBe("unavailable");
  });

  it("shows the server's problem-details message for a rejected request", async () => {
    mockFetch(new Response(JSON.stringify({ code: "RATE_LIMITED", message: "Slow down a little." }), { status: 429 }));
    const { result } = renderHook(() => useTutor(), { wrapper });
    act(() => void result.current.ask("hello"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.notice).toBe("Slow down a little.");
    expect(result.current.turns.map((t) => t.role)).toEqual(["user"]);
  });

  it("refuses a second message while streaming and drops the empty reply on stop", async () => {
    mockFetch(sseResponse([], { hang: true }));
    const { result } = renderHook(() => useTutor(), { wrapper });
    act(() => void result.current.ask("first"));
    await waitFor(() => expect(result.current.status).toBe("streaming"));
    let sent = true;
    act(() => { sent = result.current.ask("second"); });
    expect(sent).toBe(false);
    act(() => result.current.stop());
    expect(result.current.status).toBe("idle");
    expect(result.current.turns.map((t) => t.role)).toEqual(["user"]);
  });
});
