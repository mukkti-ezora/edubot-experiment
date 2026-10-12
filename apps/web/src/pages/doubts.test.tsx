import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { relativeTime, type ClassDoubtDetail, type DoubtDetail, type DoubtSummary, type Inbox, type MyDoubts, type TopicDetail } from "@/lib/doubts";
import { AskTeacher } from "@/components/doubts/AskTeacher";
import { TutorPanel } from "@/components/tutor/TutorPanel";
import { Doubts } from "@/pages/student/Doubts";
import { DoubtView } from "@/pages/student/DoubtView";
import { TopicView } from "@/pages/student/TopicView";
import { DoubtsInbox } from "@/pages/teacher/DoubtsInbox";
import { ReplyComposer } from "@/pages/teacher/ClassDoubtView";
import { TutorProvider, useTutor } from "@/lib/tutor";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));
const mockApi = vi.mocked(api);

function renderAt(ui: ReactNode, path = "/", routePath = "*") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TutorProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={routePath} element={<>{ui}<Where /></>} />
          </Routes>
        </MemoryRouter>
      </TutorProvider>
    </QueryClientProvider>,
  );
}

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

/** Answers api() calls by method and path; a thrown error becomes a rejected request. */
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

const posts = () => mockApi.mock.calls.filter(([, init]) => init?.method === "POST");

const summary: DoubtSummary = {
  id: "d1", title: "Why is velocity a vector?", status: "open", overdue: false,
  courseId: "c1", courseCode: "PHY101", courseTitle: "Physics 101", subject: "physics",
  topic: { id: "tp1", title: "Kinematics" }, lesson: { id: "l1", title: "Velocity" },
  createdAt: "2026-10-10T10:00:00Z", updatedAt: "2026-10-10T10:00:00Z", replyDueAt: "2026-10-12T10:00:00Z",
  resolvedAt: null, messageCount: 1, lastMessage: { authorRole: "student", preview: "Direction?" },
};

beforeEach(() => {
  mockApi.mockReset();
});

afterEach(() => vi.unstubAllGlobals());

const myDoubts = (items: DoubtSummary[], extra: Partial<MyDoubts> = {}): MyDoubts =>
  ({ items, counts: { open: 1, answered: 2, resolved: 0 }, replyTargetHours: 48, ...extra });
const detail = (overrides: Partial<DoubtDetail> = {}): DoubtDetail =>
  ({ ...summary, messages: [], videoSeconds: null, conversationId: null, ...overrides });

describe("AskTeacher", () => {
  const anchor = { lesson: { id: "l1", title: "Velocity" }, course: { id: "c1", code: "PHY101", title: "Physics 101" }, conversationId: "conv1" };

  it("asks for a title and a question before sending, and focuses the first gap", async () => {
    serve(() => myDoubts([]));
    renderAt(<AskTeacher anchor={anchor} onClose={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: "Send to teacher" }));

    expect(screen.getByText("Give your doubt a short title.")).toBeInTheDocument();
    expect(screen.getByText("Describe what you're stuck on.")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveFocus();
    expect(screen.getByLabelText("Title")).toHaveAccessibleDescription("Give your doubt a short title.");
    expect(posts()).toHaveLength(0);
  });

  it("sends the lesson and the EduBot chat it came from", async () => {
    serve((_path, method) => (method === "POST" ? detail({ conversationId: "conv1" }) : myDoubts([])));
    renderAt(<AskTeacher anchor={anchor} onClose={() => {}} />);
    expect(screen.getByText("Includes your EduBot chat")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Title"), "Why a vector?");
    await userEvent.type(screen.getByLabelText("Your question"), "Speed has no direction.");
    await userEvent.click(screen.getByRole("button", { name: "Send to teacher" }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    const [path, init] = posts()[0];
    expect(path).toBe("/api/v1/student/doubts");
    expect(JSON.parse(init!.body as string)).toEqual({
      lessonId: "l1", title: "Why a vector?", body: "Speed has no direction.", conversationId: "conv1", attachmentIds: [],
    });
    expect(await screen.findByTestId("where")).toHaveTextContent("/s/doubts/d1");
  });

  it("promises the reply time the server is configured with", async () => {
    serve(() => myDoubts([], { replyTargetHours: 24 }));
    renderAt(<AskTeacher anchor={anchor} onClose={() => {}} />);

    expect(await screen.findByText("Teachers aim to reply within 24 hours.")).toBeInTheDocument();
  });

  it("makes no time promise before the target is known", () => {
    mockApi.mockReturnValue(new Promise(() => {}));
    renderAt(<AskTeacher anchor={anchor} onClose={() => {}} />);

    expect(screen.getByText("Your teacher's reply will appear in Doubts.")).toBeInTheDocument();
  });

  it("can't be cancelled while the doubt is being sent", async () => {
    const onClose = vi.fn();
    serve((_path, method) => (method === "POST" ? new Promise(() => {}) : myDoubts([])));
    renderAt(<AskTeacher anchor={anchor} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText("Title"), "Q");
    await userEvent.type(screen.getByLabelText("Your question"), "Stuck");

    await userEvent.click(screen.getByRole("button", { name: "Send to teacher" }));
    await userEvent.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the daily limit message from the server", async () => {
    serve((_path, method) => {
      if (method === "POST") throw new ApiError({ status: 429, code: "RATE_LIMITED", message: "You can ask 10 new doubts a day." });
      return myDoubts([]);
    });
    renderAt(<AskTeacher anchor={anchor} onClose={() => {}} />);

    await userEvent.type(screen.getByLabelText("Title"), "Q");
    await userEvent.type(screen.getByLabelText("Your question"), "Stuck");
    await userEvent.click(screen.getByRole("button", { name: "Send to teacher" }));

    expect(await screen.findByText("You can ask 10 new doubts a day.")).toBeInTheDocument();
  });

  it("asks for a course when it isn't asked from a lesson, and still says the chat is attached", async () => {
    serve((path) => (path.includes("courses") ? { courses: [{ id: "c1", code: "PHY101", title: "Physics 101" }] } : myDoubts([])));
    renderAt(<AskTeacher anchor={{ conversationId: "conv1" }} onClose={() => {}} />);
    expect(screen.getByText("Includes your EduBot chat")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Title"), "Q");
    await userEvent.type(screen.getByLabelText("Your question"), "Stuck");
    await userEvent.click(screen.getByRole("button", { name: "Send to teacher" }));

    expect(screen.getByText("Choose the course this is about.")).toBeInTheDocument();
    expect(screen.getByLabelText("Course")).toHaveFocus();
  });
});

describe("Doubts list", () => {
  it("shows counts per state and keeps the filter in the URL", async () => {
    serve((path) => (path.includes("status=answered")
      ? myDoubts([{ ...summary, id: "d2", title: "Answered one", status: "answered" }])
      : myDoubts([summary])));
    renderAt(<Doubts />, "/s/doubts");

    expect(await screen.findByText("Why is velocity a vector?")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Answered\s*2/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /Answered/ }));

    expect(await screen.findByText("Answered one")).toBeInTheDocument();
    expect(mockApi).toHaveBeenLastCalledWith("/api/v1/student/doubts?status=answered");
    expect(screen.getByTestId("where")).toHaveTextContent("/s/doubts?status=answered");
  });

  it("opens on the filter named in the URL and ignores unknown ones", async () => {
    serve(() => myDoubts([]));
    renderAt(<Doubts />, "/s/doubts?status=resolved");
    expect(await screen.findByRole("radio", { name: /Resolved/ })).toBeChecked();
  });

  it("tells a student plainly when a reply is late", async () => {
    serve(() => myDoubts([{ ...summary, overdue: true, replyDueAt: "2020-01-01T00:00:00Z" }]));
    renderAt(<Doubts />, "/s/doubts");

    expect(await screen.findByText("Taking longer than usual")).toBeInTheDocument();
    expect(screen.queryByText(/expected .* ago/)).not.toBeInTheDocument();
  });
});

describe("Doubt thread", () => {
  it("explains a late reply without a past-tense promise", async () => {
    serve(() => detail({ overdue: true, replyDueAt: "2020-01-01T00:00:00Z" }));
    renderAt(<DoubtView />, "/s/doubts/d1", "/s/doubts/:doubtId");

    expect(await screen.findByText("Your teacher hasn't replied yet. It's taking longer than usual.")).toBeInTheDocument();
  });

  it("sends a follow-up and clears the box", async () => {
    serve((_path, method, body) => (method === "POST"
      ? detail({ messages: [{ id: "m1", authorRole: "student", authorName: null, body: (body as { body: string }).body, createdAt: summary.createdAt }] })
      : detail()));
    renderAt(<DoubtView />, "/s/doubts/d1", "/s/doubts/:doubtId");
    const box = await screen.findByLabelText("Add to your question");

    await userEvent.type(box, "Still confused");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(box).toHaveValue(""));
    expect(posts()[0][0]).toBe("/api/v1/student/doubts/d1/messages");
  });

  it("marks a doubt resolved", async () => {
    let current = detail();
    serve((_path, method) => {
      if (method === "POST") current = detail({ status: "resolved", resolvedAt: summary.createdAt });
      return current;
    });
    renderAt(<DoubtView />, "/s/doubts/d1", "/s/doubts/:doubtId");

    await userEvent.click(await screen.findByRole("button", { name: /Mark as resolved/ }));

    await waitFor(() => expect(posts()[0][0]).toBe("/api/v1/student/doubts/d1/resolve"));
    expect(await screen.findByText("You marked this resolved. Sending a follow-up reopens it.")).toBeInTheDocument();
  });
});

describe("Teacher inbox", () => {
  const inbox: Inbox = {
    items: [{ ...summary, overdue: true, student: { id: "s1", name: "Sana Okafor" } }],
    counts: { open: 1, answered: 0, resolved: 0, overdue: 1 },
    insights: { avgFirstResponseHours: 6.5, topTopics: [{ id: "tp1", title: "Kinematics", count: 2 }], windowDays: 30 },
  };

  it("summarises the queue and reads its filter from the URL", async () => {
    serve(() => inbox);
    renderAt(<DoubtsInbox />, "/t/doubts?status=overdue");

    expect(await screen.findByText("Sana Okafor · PHY101 · Kinematics")).toBeInTheDocument();
    expect(screen.getByText("6.5 h")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Overdue/ })).toBeChecked();
    expect(mockApi).toHaveBeenCalledWith("/api/v1/teacher/doubts?status=overdue");
  });
});

describe("Teacher reply", () => {
  const doubt = {
    ...summary, messages: [], videoSeconds: null, conversationId: null,
    student: { id: "s1", name: "Sana Okafor" }, tutorTranscript: [],
  } satisfies ClassDoubtDetail;

  it("fills an empty reply with an AI draft and labels it", async () => {
    mockApi.mockResolvedValue({ draft: "Think about which way the car is going." });
    renderAt(<ReplyComposer doubt={doubt} />);

    await userEvent.click(screen.getByRole("button", { name: "Draft with AI" }));

    expect(await screen.findByDisplayValue("Think about which way the car is going.")).toBeInTheDocument();
    expect(screen.getByText("AI draft. Review before sending.")).toBeInTheDocument();
  });

  it("asks before a draft replaces what the teacher typed", async () => {
    mockApi.mockResolvedValue({ draft: "AI text" });
    renderAt(<ReplyComposer doubt={doubt} />);
    const box = screen.getByLabelText("Your reply");
    await userEvent.type(box, "My own words");

    await userEvent.click(screen.getByRole("button", { name: "Draft with AI" }));
    await userEvent.click(await screen.findByRole("button", { name: "Keep mine" }));
    expect(box).toHaveValue("My own words");

    await userEvent.click(screen.getByRole("button", { name: "Draft with AI" }));
    await userEvent.click(await screen.findByRole("button", { name: "Replace" }));
    expect(box).toHaveValue("AI text");
  });

  it("sends the reply and clears the draft label", async () => {
    serve((path) => (path.endsWith("/draft") ? { draft: "Drafted" } : { ...doubt, status: "answered" }));
    renderAt(<ReplyComposer doubt={doubt} />);
    await userEvent.click(screen.getByRole("button", { name: "Draft with AI" }));
    await screen.findByDisplayValue("Drafted");

    await userEvent.click(screen.getByRole("button", { name: "Send reply" }));

    await waitFor(() => expect(screen.getByLabelText("Your reply")).toHaveValue(""));
    expect(posts().at(-1)?.[0]).toBe("/api/v1/teacher/doubts/d1/messages");
    expect(screen.queryByText("AI draft. Review before sending.")).not.toBeInTheDocument();
  });

  it("says when AI drafts are unavailable", async () => {
    mockApi.mockRejectedValue(new ApiError({ status: 503, code: "AI_UNAVAILABLE", message: "x" }));
    renderAt(<ReplyComposer doubt={doubt} />);

    await userEvent.click(screen.getByRole("button", { name: "Draft with AI" }));

    expect(await screen.findByText("AI drafts aren't available right now. Write your reply directly.")).toBeInTheDocument();
  });
});

describe("Topic page", () => {
  it("shows progress through the topic's lessons", async () => {
    const topic: TopicDetail = {
      id: "tp1", title: "Kinematics", summary: "Describing motion.",
      course: { id: "c1", code: "PHY101", title: "Physics 101", subject: "physics" },
      lessons: [
        { id: "l1", title: "Velocity", summary: "", minutes: 8, status: "completed", formats: ["read"] },
        { id: "l2", title: "Acceleration", summary: "", minutes: 9, status: "not_started", formats: ["read"] },
      ],
      progress: { completed: 1, total: 2 },
      doubts: [],
    };
    mockApi.mockResolvedValue(topic);
    renderAt(<TopicView />, "/s/topics/tp1", "/s/topics/:topicId");

    expect(await screen.findByText("1 of 2 lessons complete")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Kinematics progress" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText("No doubts on this topic")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Velocity\s*, Completed/ })).toBeInTheDocument();
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-10-11T12:00:00Z");
  it.each([
    ["2026-10-13T00:00:00Z", "tomorrow"],  // 36 hours is one whole day, not rounded up to two
    ["2026-10-14T00:00:00Z", "in 2 days"],
    ["2026-10-10T00:00:00Z", "yesterday"],
    ["2026-10-11T13:30:00Z", "in 1 hour"],
  ])("%s reads %s", (iso, label) => {
    expect(relativeTime(iso, now)).toBe(label);
  });
});

describe("Tutor escalation", () => {
  function sse(frames: object[]) {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        frames.forEach((f) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(f)}\n\n`)));
        controller.close();
      },
    }), { status: 200, headers: { "content-type": "text/event-stream" } });
  }

  function AskButton() {
    const { ask } = useTutor();
    return <button type="button" onClick={() => void ask("Is speed a vector?")}>Start chat</button>;
  }

  it("hands the last question and the chat over to the teacher", async () => {
    Element.prototype.scrollTo = () => {};
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(sse([
      { type: "delta", text: "What do you think?" }, { type: "done", conversationId: "conv9" },
    ]))));
    serve((path, method) => {
      if (method === "POST") return detail({ conversationId: "conv9" });
      return path.includes("courses") ? { courses: [{ id: "c1", code: "PHY101", title: "Physics 101" }] } : myDoubts([]);
    });
    renderAt(<><AskButton /><TutorPanel /></>);

    await userEvent.click(screen.getByRole("button", { name: "Start chat" }));
    await userEvent.click(await screen.findByRole("button", { name: /Still stuck\? Ask your teacher/ }));
    expect(screen.getByLabelText("Your question")).toHaveValue("Is speed a vector?");
    await userEvent.selectOptions(await screen.findByLabelText("Course"), await screen.findByRole("option", { name: /PHY101/ }));
    await userEvent.click(screen.getByRole("button", { name: "Send to teacher" }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse(posts()[0][1]!.body as string)).toMatchObject({ body: "Is speed a vector?", conversationId: "conv9" });
  });
});
