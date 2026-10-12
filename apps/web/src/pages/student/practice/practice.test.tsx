import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { TutorProvider } from "@/lib/tutor";
import {
  crossedWarning,
  formatClock,
  markingLabel,
  ordinal,
  paletteCounts,
  paletteState,
  rankText,
  timerLevel,
  type AttemptInProgress,
  type AttemptResult as Result,
  type ReviewCard,
} from "@/lib/practice";
import { useAnswerSync } from "@/components/practice/useAnswerSync";
import { TestPlayer } from "./TestPlayer";
import { AttemptResult } from "./AttemptResult";
import { ReviewDeck, Session } from "./ReviewDeck";
import { PracticeHub } from "./PracticeHub";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));
const mockApi = vi.mocked(api);

afterEach(() => {
  mockApi.mockReset();
  vi.useRealTimers();
});

function renderAt(ui: ReactNode, path: string, routePath: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TutorProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes><Route path={routePath} element={ui} /></Routes>
        </MemoryRouter>
      </TutorProvider>
    </QueryClientProvider>,
  );
}

function serve(handler: (path: string, method: string, body: unknown) => unknown) {
  mockApi.mockImplementation((path: string, init?: RequestInit) => {
    try {
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      return Promise.resolve(handler(path, init?.method ?? "GET", body));
    } catch (error) {
      return Promise.reject(error);
    }
  });
}

describe("palette state", () => {
  it.each([
    [{ response: null, markedForReview: false }, false, "not_visited"],
    [{ response: null, markedForReview: false }, true, "not_answered"],
    [{ response: { options: ["a"] }, markedForReview: false }, true, "answered"],
    [{ response: null, markedForReview: true }, true, "marked"],
    [{ response: { value: 9.8 }, markedForReview: true }, true, "answered_marked"],
  ] as const)("%o visited=%s is %s", (question, visited, expected) => {
    expect(paletteState({ ...question, response: question.response as never }, visited)).toBe(expected);
  });

  it("counts answered-and-marked as answered, and marked-without-answer as not answered", () => {
    expect(paletteCounts(["answered", "answered_marked", "marked", "not_answered", "not_visited"]))
      .toEqual({ answered: 2, marked: 2, notAnswered: 3 });
  });
});

describe("timer", () => {
  it.each([[0, "00:00"], [59, "00:59"], [61, "01:01"], [3600, "1:00:00"], [3909, "1:05:09"], [-5, "00:00"]])(
    "%i seconds reads %s", (seconds, text) => expect(formatClock(seconds)).toBe(text));

  it.each([[301, "calm"], [300, "warn"], [61, "warn"], [60, "urgent"], [0, "urgent"]] as const)(
    "%i seconds left is %s", (seconds, level) => expect(timerLevel(seconds)).toBe(level));

  it("announces each threshold once, when it is crossed", () => {
    expect(crossedWarning(301, 300)).toBe("Five minutes left.");
    expect(crossedWarning(300, 299)).toBeNull();
    expect(crossedWarning(61, 60)).toBe("One minute left. Your answers are saved.");
    expect(crossedWarning(59, 58)).toBeNull();
  });
});

describe("labels", () => {
  it.each([[1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [11, "11th"], [12, "12th"], [13, "13th"], [21, "21st"], [112, "112th"]])(
    "%i is %s", (n, text) => expect(ordinal(n)).toBe(text));

  it("reads a rank as a sentence", () => {
    expect(rankText({ position: 12, of: 31, tiedWith: 0, percentile: 63.6 })).toBe("12th of 31, 64th percentile");
    expect(rankText({ position: 3, of: 6, tiedWith: 3, percentile: 30 }))
      .toBe("Joint 3rd of 6 (level with 3 others), 30th percentile");
  });

  it("states negative marking or its absence", () => {
    expect(markingLabel({ correct: 4, wrong: -1 })).toBe("+4 / −1");
    expect(markingLabel({ correct: 1, wrong: 0 })).toBe("+1 each, no negative marking");
  });
});

describe("answer autosave", () => {
  it("sends the latest payload once after a burst of changes", async () => {
    vi.useFakeTimers();
    mockApi.mockResolvedValue({ saved: true });
    const { result } = renderHook(() => useAnswerSync("a1"));

    act(() => {
      result.current.queue("q1", { response: { options: ["a"] }, markedForReview: false, timeSeconds: 4 });
      result.current.queue("q1", { response: { options: ["b"] }, markedForReview: true, timeSeconds: 6 });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });

    expect(mockApi).toHaveBeenCalledTimes(1);
    const [path, init] = mockApi.mock.calls[0];
    expect(path).toBe("/api/v1/student/attempts/a1/answers/q1");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(init?.body as string)).toEqual({ response: { options: ["b"] }, markedForReview: true, timeSeconds: 6 });
    expect(result.current.status).toBe("saved");
  });

  it("keeps an unsaved answer and retries after a network failure", async () => {
    vi.useFakeTimers();
    mockApi.mockRejectedValueOnce(new TypeError("offline")).mockResolvedValue({ saved: true });
    const { result } = renderHook(() => useAnswerSync("a1"));

    act(() => result.current.queue("q1", { response: null, markedForReview: false, timeSeconds: 1 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    expect(result.current.status).toBe("retrying");

    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(mockApi).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
  });

  it("stops when the server says time is up", async () => {
    vi.useFakeTimers();
    mockApi.mockRejectedValue(new ApiError({ status: 409, code: "CONFLICT", message: "Time is up" }));
    const { result } = renderHook(() => useAnswerSync("a1"));

    act(() => result.current.queue("q1", { response: null, markedForReview: false, timeSeconds: 1 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(700); });

    expect(result.current.status).toBe("closed");
  });
});

const attempt: AttemptInProgress = {
  id: "a1", assessmentId: "t1", title: "Kinematics mock", kind: "mock", status: "in_progress", number: 1,
  startedAt: "2026-10-12T10:00:00Z", deadlineAt: null, serverNow: "2026-10-12T10:00:00Z", tutorAllowed: false,
  marking: { correct: 4, wrong: -1 },
  sections: [{
    title: "Physics",
    questions: [
      { id: "q1", position: 1, kind: "single", stem: "Which is a vector?", sourceLabel: "University exam, Dec 2025",
        options: [{ id: "a", text: "Speed" }, { id: "b", text: "Velocity" }], response: null, markedForReview: false, timeSeconds: 0 },
      { id: "q2", position: 2, kind: "numeric", stem: "g in m/s²?", sourceLabel: null, options: [], response: null,
        markedForReview: false, timeSeconds: 0 },
    ],
  }],
};

describe("test player", () => {
  it("saves the chosen option for the question being answered", async () => {
    serve((_path, method) => (method === "GET" ? attempt : { saved: true }));
    renderAt(<TestPlayer />, "/s/attempts/a1/take", "/s/attempts/:attemptId/take");

    await userEvent.click(await screen.findByLabelText(/Velocity/));
    await userEvent.click(screen.getByRole("button", { name: /save and next/i }));

    await waitFor(() => {
      const put = mockApi.mock.calls.find(([path, init]) => init?.method === "PUT" && path.endsWith("/answers/q1"));
      expect(put && JSON.parse(put[1]?.body as string).response).toEqual({ options: ["b"] });
    }, { timeout: 2000 });
    expect(screen.getByRole("heading", { name: "Question 2 of 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Question 1, Physics: Answered" })).toBeInTheDocument();
  });

  it("says the tutor is off during an unassisted test", async () => {
    serve(() => attempt);
    renderAt(<TestPlayer />, "/s/attempts/a1/take", "/s/attempts/:attemptId/take");

    expect(await screen.findByText(/EduBot is off during this test/)).toBeInTheDocument();
  });

  it("rejects a non-number for a numeric answer", async () => {
    serve(() => attempt);
    renderAt(<TestPlayer />, "/s/attempts/a1/take", "/s/attempts/:attemptId/take");
    await userEvent.click(await screen.findByRole("button", { name: "Question 2, Physics: Not visited" }));

    await userEvent.type(screen.getByLabelText("Your answer"), "nine{Enter}");

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a number");
  });
});

const result: Result = {
  id: "a1", assessmentId: "t1", title: "Kinematics mock", kind: "mock", status: "submitted", number: 1,
  submittedAt: "2026-10-12T10:30:00Z", score: 6, maxScore: 8, correct: 2, wrong: 0, skipped: 0, accuracy: 100,
  timeSpentSeconds: 95, rank: null, sections: [], topics: [],
  speed: { medianSeconds: 40, quadrants: { fastRight: 1, slowRight: 1, fastWrong: 0, slowWrong: 0 } },
  behaviour: { answersChanged: 0, markedForReviewLeft: 0, secondsOnWrong: 0 },
  reviewAvailable: false, reviewAvailableAt: "2026-10-20T10:00:00Z", questions: [],
};

describe("attempt result", () => {
  it("explains a missing rank and when review opens", async () => {
    serve((path) => (path.includes("/attempts/") ? result : { courseId: "c1", courseCode: "PHY101" }));
    renderAt(<AttemptResult />, "/s/attempts/a1", "/s/attempts/:attemptId");

    expect(await screen.findByText(/rank appears once enough classmates/)).toBeInTheDocument();
    expect(screen.getByText(/Answers and explanations open on/)).toBeInTheDocument();
  });

  it("shows the class rank in words", async () => {
    serve((path) => (path.includes("/attempts/") ? { ...result, rank: { position: 2, of: 6, percentile: 80 } } : {}));
    renderAt(<AttemptResult />, "/s/attempts/a1", "/s/attempts/:attemptId");

    expect(await screen.findByText("2nd of 6, 80th percentile")).toBeInTheDocument();
  });
});

const cards: ReviewCard[] = [
  { id: "c1", front: "Unit of force?", back: "Newton", courseCode: "PHY101", subject: "physics", topic: null, isNew: true, dueAt: null, source: "teacher" },
  { id: "c2", front: "F = ?", back: "m a", courseCode: "PHY101", subject: "physics", topic: null, isNew: false, dueAt: null, source: "teacher" },
];

describe("review deck", () => {
  it("reveals with Space and rates with the number keys", async () => {
    serve(() => ({ cardId: "c1", dueAt: "2026-10-13T10:00:00Z", intervalDays: 1 }));
    renderAt(<Session cards={cards} />, "/s/review", "/s/review");

    await userEvent.keyboard(" ");
    expect(screen.getByText("Newton")).toBeInTheDocument();
    await userEvent.keyboard("3");

    await waitFor(() => expect(screen.getByText("Card 2 of 2")).toBeInTheDocument());
    const [path, init] = mockApi.mock.calls[0];
    expect(path).toBe("/api/v1/student/review/c1");
    expect(JSON.parse(init?.body as string)).toEqual({ rating: "good" });
    expect(screen.getAllByText(/comes back tomorrow/).length).toBeGreaterThan(0);
  });

  it("ignores rating keys before the answer is shown", async () => {
    serve(() => ({}));
    renderAt(<Session cards={cards} />, "/s/review", "/s/review");

    await userEvent.keyboard("4");

    expect(mockApi).not.toHaveBeenCalled();
  });
});

describe("saving before submit", () => {
  it("waits for an in-flight save, then saves an answer queued meanwhile", async () => {
    let release: (value: unknown) => void = () => {};
    mockApi.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; })).mockResolvedValue({ saved: true });
    const { result } = renderHook(() => useAnswerSync("a1"));

    let flushed: Promise<boolean> = Promise.resolve(false);
    act(() => {
      result.current.queue("q1", { response: { options: ["a"] }, markedForReview: false, timeSeconds: 1 });
      flushed = result.current.flush(); // first pass starts and hangs on q1
    });
    act(() => {
      result.current.queue("q2", { response: { value: 9.8 }, markedForReview: false, timeSeconds: 2 });
      flushed = result.current.flush(); // must not resolve before q2 is saved
    });
    await act(async () => { release({ saved: true }); });

    await expect(flushed).resolves.toBe(true);
    expect(mockApi.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/student/attempts/a1/answers/q1",
      "/api/v1/student/attempts/a1/answers/q2",
    ]);
  });

  it("does not submit when the last answer couldn't be saved", async () => {
    serve((_path, method) => {
      if (method === "GET") return attempt;
      if (method === "PUT") throw new ApiError({ status: 422, code: "VALIDATION_ERROR", message: "Bad answer" });
      return { id: "a1", status: "submitted" };
    });
    renderAt(<TestPlayer />, "/s/attempts/a1/take", "/s/attempts/:attemptId/take");

    await userEvent.click(await screen.findByLabelText(/Velocity/));
    await userEvent.click(screen.getByRole("button", { name: "Submit test" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Submit test" }));

    expect(await screen.findByText("Couldn't save your last answer")).toBeInTheDocument();
    expect(mockApi.mock.calls.some(([path, init]) => init?.method === "POST" && path.endsWith("/submit"))).toBe(false);
  });

  it("stops retrying a save the server rejects", async () => {
    vi.useFakeTimers();
    mockApi.mockRejectedValue(new ApiError({ status: 422, code: "VALIDATION_ERROR", message: "Bad answer" }));
    const { result } = renderHook(() => useAnswerSync("a9"));

    act(() => result.current.queue("q1", { response: null, markedForReview: false, timeSeconds: 1 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });

    expect(result.current.status).toBe("failed");
    expect(mockApi.mock.calls.filter(([path]) => path.includes("/attempts/a9/"))).toHaveLength(1);
  });
});

describe("review deck sessions", () => {
  it("starts again from the first card when new cards arrive", async () => {
    let batch = [cards[0]];
    serve((path) => (path.endsWith("/review/due") ? { cards: batch, dueToday: batch.length, total: 5 }
      : { cardId: "c1", dueAt: "2026-10-13T10:00:00Z", intervalDays: 1 }));
    renderAt(<ReviewDeck />, "/s/review", "/s/review");

    await userEvent.click(await screen.findByRole("button", { name: /show answer/i }));
    await userEvent.click(screen.getByRole("button", { name: /^Good/ }));
    batch = cards;
    await userEvent.click(await screen.findByRole("button", { name: "Check for more cards" }));

    expect(await screen.findByText("Card 1 of 2")).toBeInTheDocument();
  });

  it("leaves Enter on a focused link to the link", async () => {
    serve(() => ({}));
    render(
      <MemoryRouter>
        <Link to="/s/practice">Back</Link>
        <Session cards={cards} />
      </MemoryRouter>,
      { wrapper: ({ children }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider> },
    );
    screen.getByRole("link", { name: "Back" }).focus();

    await userEvent.keyboard("{Enter}");

    expect(screen.queryByText("Answer")).not.toBeInTheDocument();
  });
});

describe("practice by topic", () => {
  it("builds a 10-question set from the bank and opens it to start", async () => {
    serve((path, method) => {
      if (path === "/api/v1/student/practice") {
        return { assessments: [], improvementSets: [], review: { dueToday: 0, total: 0 },
          topics: [{ id: "t1", title: "Kinematics", courseId: "c1", courseCode: "PHY101", questionCount: 12, answered: 3, accuracy: 66 }] };
      }
      if (method === "POST" && path.endsWith("/topics/t1/bank-practice")) return { id: "set1", title: "Kinematics practice" };
      if (path === "/api/v1/student/assignments") return { items: [], counts: {} };
      return { id: "set1", title: "Kinematics practice", kind: "practice", sections: [], attempts: [], instructions: "",
        questionCount: 10, durationMinutes: null, marking: { correct: 1, wrong: 0 }, attemptsLeft: null, tutorAllowed: true };
    });
    renderAt(<PracticeHub />, "/s/practice", "/s/practice");

    await userEvent.click(await screen.findByRole("button", { name: "Practise 10 questions on Kinematics" }));

    await waitFor(() => expect(mockApi.mock.calls.some(([path, init]) =>
      init?.method === "POST" && path === "/api/v1/student/topics/t1/bank-practice")).toBe(true));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
