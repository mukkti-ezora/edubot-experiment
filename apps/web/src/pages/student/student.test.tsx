import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { drainSse, TutorProvider } from "@/lib/tutor";
import { dueLabel, safeEmbedUrl, type LessonDetail } from "@/lib/student";
import { Prose } from "@/components/Prose";
import { LoopStepper } from "@/components/lesson/LoopStepper";
import { LessonView } from "./LessonView";

describe("drainSse", () => {
  it("returns complete events and keeps a partial one for the next chunk", () => {
    const first = drainSse('data: {"type":"delta","text":"Hel"}\n\ndata: {"type":"delta","te');
    expect(first.events).toEqual([{ type: "delta", text: "Hel" }]);

    const second = drainSse(first.rest + 'xt":"lo"}\n\ndata: {"type":"done","conversationId":"c1"}\n\n');
    expect(second.events).toEqual([{ type: "delta", text: "lo" }, { type: "done", conversationId: "c1" }]);
    expect(second.rest).toBe("");
  });
});

describe("Prose", () => {
  it("renders the lesson Markdown subset", () => {
    render(<Prose text={"## Velocity\n\nUse `v = d / t`.\n\n- one\n- two\n\n```\nprint(1)\n```"} />);
    expect(screen.getByRole("heading", { name: "Velocity" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("print(1)").tagName).toBe("CODE");
  });

  it("never turns model text into live HTML", () => {
    const { container } = render(<Prose text={'<img src=x onerror="alert(1)"> **bold**'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  });
});

describe("dueLabel", () => {
  const now = new Date("2026-10-08T10:00:00");
  it.each([
    ["2026-10-08T23:00:00", "Due today"],
    ["2026-10-09T09:00:00", "Due tomorrow"],
    ["2026-10-11T09:00:00", "Due in 3 days"],
    ["2026-10-07T09:00:00", "1 day overdue"],
    ["2026-10-05T09:00:00", "3 days overdue"],
  ])("%s reads %s", (iso, label) => {
    expect(dueLabel(iso, now)).toBe(label);
  });
});

describe("LoopStepper", () => {
  it("steps through the program and shows output at the end", async () => {
    render(
      <LoopStepper
        code={["x = 1", "print(x)"]}
        steps={[{ line: 0, vars: { x: 1 } }, { line: 1, vars: { x: 1 }, output: "1" }]}
      />,
    );
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /next line/i }));
    expect(screen.getByText("Step 2 of 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Output")).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /next line/i })).toBeDisabled();
  });
});

const lesson: LessonDetail = {
  id: "l1", title: "Projectile motion", summary: "", minutes: 12, body: "## Two motions\n\nBody text.",
  video: { url: "javascript:alert(1)", title: "Vectors", source: "CrashCourse" },
  animation: { kind: "derivative", params: { x: 1 }, caption: "Tangent", alt: "A tangent line" },
  status: "started", lastFormat: "read",
  module: { id: "m1", title: "Motion" }, topic: { id: "tp1", title: "Projectiles" },
  course: { id: "c1", code: "PHY101", title: "Physics", subject: "physics" },
  position: 3, count: 7, previous: null, next: null,
};

vi.mock("@/lib/api", () => ({
  api: vi.fn((path: string) => (path.endsWith("/l1") ? Promise.resolve(lesson) : Promise.resolve({}))),
}));

function renderLesson() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TutorProvider>
        <MemoryRouter initialEntries={["/s/lessons/l1"]}>
          <Routes><Route path="/s/lessons/:lessonId" element={<LessonView />} /></Routes>
        </MemoryRouter>
      </TutorProvider>
    </QueryClientProvider>,
  );
}

describe("LessonView", () => {
  it("moves between format tabs with the arrow keys", async () => {
    renderLesson();
    const read = await screen.findByRole("tab", { name: /read/i });
    expect(read).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /watch/i })).toHaveAttribute("tabindex", "-1");
    read.focus();
    await userEvent.keyboard("{ArrowRight}");
    const watch = screen.getByRole("tab", { name: /watch/i });
    expect(watch).toHaveFocus();
    expect(watch).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: /animate/i })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(read).toHaveFocus();
  });

  it("never embeds a video URL that isn't a YouTube embed", async () => {
    renderLesson();
    await userEvent.click(await screen.findByRole("tab", { name: /watch/i }));
    expect(screen.getByText("Video unavailable")).toBeInTheDocument();
    expect(document.querySelector("iframe")).toBeNull();
  });
});

describe("safeEmbedUrl", () => {
  it.each([
    ["https://www.youtube-nocookie.com/embed/abc", true],
    ["https://www.youtube.com/embed/abc?start=4", true],
    ["http://www.youtube-nocookie.com/embed/abc", false],
    ["https://evil.example/embed/abc", false],
    ["https://www.youtube.com/watch?v=abc", false],
    ["javascript:alert(1)", false],
  ])("%s allowed: %s", (url, ok) => {
    expect(safeEmbedUrl(url) !== null).toBe(ok);
  });
});
