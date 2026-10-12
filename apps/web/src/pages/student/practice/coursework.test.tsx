import { act, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import {
  isValidLink, lateAdjusted, lateWarning, rubricTotal, useSaveDraft, type AssignmentDetail, type AssignmentSummary, type GradingDetail,
} from "@/lib/coursework";
import { AssignmentView } from "@/pages/student/practice/AssignmentView";
import { AssignmentList } from "@/components/coursework/AssignmentList";
import { GradingForm, nextUngradedAfter } from "@/pages/teacher/Grading";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));
const mockApi = vi.mocked(api);

function renderAt(ui: ReactNode, path = "/", routePath = "*") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={routePath} element={ui} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function serve(handler: (path: string, method: string, body: unknown) => unknown) {
  mockApi.mockImplementation((path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    return Promise.resolve(handler(path, init?.method ?? "GET", body));
  });
}

const calls = (method: string, fragment: string) =>
  mockApi.mock.calls.filter(([path, init]) => (init?.method ?? "GET") === method && String(path).includes(fragment));

const DAY_MS = 86_400_000;
const inDays = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

const summary: AssignmentSummary = {
  id: "a1", title: "Problem set 2: Kinematics", kind: "assignment", courseId: "c1", courseCode: "PHY101",
  courseTitle: "Physics 101", subject: "physics", points: 10, dueAt: inDays(2), effectiveDueAt: inDays(2),
  closesAt: inDays(5), status: "not_started", score: null, lateMinutes: 0, feedbackReady: false, extension: null,
};

const detail = (extra: Partial<AssignmentDetail> = {}): AssignmentDetail => ({
  ...summary, instructions: "Show your working.", submissionTypes: ["text", "link"],
  rubric: [{ criterion: "Method", description: "Equations chosen and applied", points: 6 }, { criterion: "Answer", points: 4 }],
  gradeCategory: "Assignments", latePenaltyPercentPerDay: 10, acceptsLateDays: 3, maxResubmissions: 2,
  resubmissionsLeft: 3, submission: null, extensions: [], ...extra,
});

beforeEach(() => {
  mockApi.mockReset();
});

describe("coursework rules", () => {
  const now = new Date("2026-10-12T12:00:00Z");

  it("warns how late and how large the penalty is, counting started days", () => {
    const due = new Date(now.getTime() - 2 * DAY_MS - 60_000).toISOString();
    expect(lateWarning(due, 10, now)).toBe("This will be 3 days late. A 30% penalty applies (10% per started day).");
  });

  it("does not warn when handing in exactly on time", () => {
    expect(lateWarning(now.toISOString(), 10, now)).toBeNull();
  });

  it.each([
    ["https://docs.example.com/x", true],
    ["http://github.com/me/repo", true],
    ["javascript:alert(1)", false],
    ["docs.example.com", false],
    ["ftp://files.example.com/a", false],
  ])("treats %s as a valid link: %s", (value, valid) => {
    expect(isValidLink(value)).toBe(valid);
  });

  it("scales rubric points to the assignment's points", () => {
    const rubric = [{ criterion: "A", points: 5 }, { criterion: "B", points: 5 }, { criterion: "C", points: 10 }];
    const scores = [{ criterion: "A", points: 4 }, { criterion: "B", points: 5 }, { criterion: "C", points: 8 }];
    expect(rubricTotal(rubric, scores, 10)).toBe(8.5);
  });

  it("applies the late penalty per started day and never below zero", () => {
    expect(lateAdjusted(8.5, 1500, 10)).toBe(6.8);
    expect(lateAdjusted(8.5, 20 * 1440, 10)).toBe(0);
  });
});

describe("AssignmentList", () => {
  it("shows status as words and filters by status", async () => {
    serve(() => ({
      items: [summary, { ...summary, id: "a2", title: "Lab 1", status: "graded", score: 8, points: 10 }],
      counts: { not_started: 1, graded: 1 },
    }));
    renderAt(<AssignmentList statuses={["graded"]} />);

    expect(await screen.findByText("Lab 1")).toBeInTheDocument();
    expect(screen.getByText("Graded")).toBeInTheDocument();
    expect(screen.getByText("8/10")).toBeInTheDocument();
    expect(screen.queryByText("Problem set 2: Kinematics")).not.toBeInTheDocument();
  });
});

describe("AssignmentView", () => {
  const open = () => renderAt(<AssignmentView />, "/s/assignments/a1", "/s/assignments/:assignmentId");

  it("hands in the student's text after confirming", async () => {
    serve((_path, method) => (method === "POST" ? detail({ status: "submitted" }) : detail()));
    open();
    await userEvent.type(await screen.findByLabelText("Answer"), "Velocity is displacement over time");
    await userEvent.click(screen.getByRole("button", { name: "Hand in" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/5 words of text/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Hand in" }));

    const [, init] = calls("POST", "/submit")[0];
    expect(JSON.parse(init!.body as string)).toEqual({ text: "Velocity is displacement over time", link: null, attachmentIds: [] });
  });

  it("refuses a link that isn't a web address before sending anything", async () => {
    serve(() => detail());
    open();
    await userEvent.type(await screen.findByLabelText("Link"), "my drive folder");
    await userEvent.click(screen.getByRole("button", { name: "Hand in" }));

    expect(await screen.findByText("Enter a full web address, starting with https://")).toBeInTheDocument();
    expect(calls("POST", "/submit")).toHaveLength(0);
  });

  it("warns about the late penalty when the deadline has passed", async () => {
    serve(() => detail({ dueAt: inDays(-1.5), effectiveDueAt: inDays(-1.5), closesAt: inDays(1) }));
    open();

    expect(await screen.findByText(/This will be 2 days late\. A 20% penalty applies/)).toBeInTheDocument();
  });

  it("sends an extension request with the chosen time and reason", async () => {
    serve(() => detail());
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Ask for more time" }));
    const until = screen.getByLabelText("New deadline");
    const wanted = new Date(Date.now() + 3 * DAY_MS);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${wanted.getFullYear()}-${pad(wanted.getMonth() + 1)}-${pad(wanted.getDate())}T18:00`;
    await userEvent.type(until, local);
    await userEvent.type(screen.getByLabelText("Reason"), "University sports trials");
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));

    const [, init] = calls("POST", "/extension")[0];
    expect(JSON.parse(init!.body as string)).toEqual({ until: new Date(local).toISOString(), reason: "University sports trials" });
  });

  it("shows the grade and feedback, and marks the feedback seen", async () => {
    const graded = detail({
      status: "graded", score: 8.5, feedbackReady: true,
      submission: {
        id: "s1", status: "graded", text: "My answer", link: null, attachments: [], revision: 1, lateMinutes: 0,
        submittedAt: inDays(-1), updatedAt: inDays(-1), score: 8.5, feedback: "Good method.",
        rubricScores: [{ criterion: "Method", points: 5 }, { criterion: "Answer", points: 3.5 }], gradedAt: inDays(0),
      },
    });
    serve(() => graded);
    open();

    expect(await screen.findByText("Good method.")).toBeInTheDocument();
    expect(screen.getByText("8.5")).toBeInTheDocument();
    expect(calls("POST", "/feedback-seen")).toHaveLength(1);
  });
});

describe("GradingForm", () => {
  const submission: GradingDetail = {
    id: "s1", status: "submitted", student: { id: "p1", name: "Ingrid Abiodun" },
    assignment: {
      id: "a1", title: "Problem set 2", points: 10, dueAt: inDays(-2), instructions: "",
      rubric: [{ criterion: "Method", points: 6 }, { criterion: "Answer", points: 4 }], latePenaltyPercentPerDay: 10,
    },
    courseCode: "PHY101", submittedAt: inDays(-1), lateMinutes: 1500, revision: 1, score: null,
    work: {
      id: "s1", status: "submitted", text: "My working", link: null, attachments: [], revision: 1, lateMinutes: 1500,
      submittedAt: inDays(-1), updatedAt: inDays(-1), score: null, feedback: null, rubricScores: [], gradedAt: null,
    },
  };

  it("previews the scaled total with the late penalty and saves rubric scores", async () => {
    serve(() => ({ ...submission, status: "graded" }));
    const onGraded = vi.fn();
    renderAt(<GradingForm detail={submission} onBack={() => {}} onGraded={onGraded} />);
    await userEvent.type(screen.getByLabelText(/Method/), "5");
    await userEvent.type(screen.getByLabelText(/Answer/), "3");

    expect(screen.getByText("8 / 10")).toBeInTheDocument();
    expect(screen.getByText("6.4 / 10")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Feedback"), "Check units.");
    await userEvent.click(screen.getByRole("button", { name: "Save grade" }));
    const [, init] = calls("POST", "/grade")[0];
    expect(JSON.parse(init!.body as string)).toEqual({
      rubricScores: [{ criterion: "Method", points: 5 }, { criterion: "Answer", points: 3 }], score: null, feedback: "Check units.",
    });
    expect(onGraded).toHaveBeenCalledWith("s1");
  });

  it("asks for every criterion before saving", async () => {
    renderAt(<GradingForm detail={submission} onBack={() => {}} onGraded={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Method/), "5");
    await userEvent.click(screen.getByRole("button", { name: "Save grade" }));

    expect(await screen.findByText('Score "Answer".')).toBeInTheDocument();
    expect(calls("POST", "/grade")).toHaveLength(0);
  });
});

describe("draft saves", () => {
  it("never replace work that's already handed in, even when the response arrives late", async () => {
    const handedIn = detail({
      status: "submitted",
      submission: {
        id: "s1", status: "submitted", text: "Final answer", link: null, attachments: [], revision: 1, lateMinutes: 0,
        submittedAt: inDays(0), updatedAt: inDays(0), score: null, feedback: null, rubricScores: [], gradedAt: null,
      },
    });
    const client = new QueryClient();
    client.setQueryData(["coursework", "assignment", handedIn.id], handedIn);
    mockApi.mockResolvedValue(detail({ status: "draft" }));
    const { result } = renderHook(() => useSaveDraft(handedIn.id), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });

    await act(async () => { await result.current.mutateAsync({ text: "older draft", link: null, attachmentIds: [] }); });

    expect(client.getQueryData<AssignmentDetail>(["coursework", "assignment", handedIn.id])?.submission?.text).toBe("Final answer");
  });
});

describe("grading queue", () => {
  const rows = [
    { id: "a", status: "submitted" }, { id: "b", status: "graded" }, { id: "c", status: "submitted" },
    { id: "d", status: "submitted" },
  ];

  it.each([
    ["c", "d"],
    ["d", "a"],
    ["a", "c"],
  ])("after grading %s, moves to %s (the next ungraded after it)", (current, next) => {
    expect(nextUngradedAfter(rows, current)).toBe(next);
  });

  it("returns nothing when no other work is waiting", () => {
    expect(nextUngradedAfter([{ id: "a", status: "submitted" }], "a")).toBeNull();
  });
});
