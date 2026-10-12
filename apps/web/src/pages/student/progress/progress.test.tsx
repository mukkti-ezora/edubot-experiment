import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { uploadAttachment } from "@/lib/files";
import {
  GRADE_SCALE,
  formatPercent,
  gradeFor,
  gradeForShown,
  normaliseApaar,
  roundShown,
  whatIfPercent,
  type AbcRecord,
  type MoocCourse,
  type ProgressOverview,
} from "@/lib/progress";
import { Progress } from "./Progress";
import { WhatIf } from "./CourseGrades";
import { AbcCard, ClaimDrawer } from "./Credits";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));
vi.mock("@/lib/files", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/files")>()), uploadAttachment: vi.fn() }));
const mockApi = vi.mocked(api);
const mockUpload = vi.mocked(uploadAttachment);

function renderPage(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  mockApi.mockReset();
  mockUpload.mockReset();
});

describe("gradeFor (UGC 10-point scale)", () => {
  it.each([
    [100, "O", 10],
    [90, "O", 10],
    [89.99, "A+", 9],
    [80, "A+", 9],
    [79.9, "A", 8],
    [45, "C", 5],
    [40, "P", 4],
    [39.9, "F", 0],
    [0, "F", 0],
  ])("%s%% is %s (%s points)", (percent, grade, point) => {
    expect(gradeFor(percent)).toMatchObject({ grade, point });
  });
});

const marks = (weight: number, percent: number | null) => ({ weight, earned: percent ?? 0, max: percent === null ? 0 : 100 });

describe("whatIfPercent", () => {
  it("weights each counted category", () => {
    expect(whatIfPercent([marks(40, 80), marks(20, 50), marks(40, 100)])).toBeCloseTo(82);
  });

  it("re-normalises when a category doesn't count yet", () => {
    // Only Assignments (40) and Quizzes (20) count: (40*90 + 20*60) / 60 = 80, an A+.
    const percent = whatIfPercent([marks(40, 90), marks(20, 60), marks(40, null)]);
    expect(percent).toBeCloseTo(80);
    expect(gradeForShown(percent!).grade).toBe("A+");
  });

  it("ignores zero-weight categories and returns null when nothing counts", () => {
    expect(whatIfPercent([marks(0, 10), marks(40, 90)])).toBeCloseTo(90);
    expect(whatIfPercent([marks(40, null)])).toBeNull();
    expect(whatIfPercent([])).toBeNull();
  });
});

describe("shown percentages match the server (Python round to one decimal)", () => {
  it.each([
    [89.96, 90.0, "O"],
    [79.95, 80.0, "A+"],
    [89.25, 89.2, "A+"], // an exact tie goes to the even tenth, as in Python
    [89.75, 89.8, "A+"],
    [39.95, 40.0, "P"],
    [79.94999, 79.9, "A"],
  ])("%s shows as %s and grades %s", (percent, shown, grade) => {
    expect(roundShown(percent)).toBe(shown);
    expect(gradeForShown(percent).grade).toBe(grade);
  });

  it("formats the shown value, not the raw one", () => {
    expect(formatPercent(89.96)).toBe("90.0%");
  });
});

describe("what if", () => {
  it("starts from exactly the current standing, even at a boundary", () => {
    // Assignments 17.99/20 (89.95%) and Quizzes 9/10: the server shows 89.96... rounded to 90.0, an O.
    const categories = [
      { name: "Assignments", weight: 40, earned: 17.992, max: 20, percent: 90.0 },
      { name: "Quizzes", weight: 20, earned: 9, max: 10, percent: 90.0 },
      { name: "Mid-term", weight: 40, earned: 0, max: 0, percent: null },
    ];
    const serverPercent = (40 * 17.992 / 20 + 20 * 9 / 10) / 60 * 100;
    render(<WhatIf categories={categories} scale={[...GRADE_SCALE]} />);

    const result = screen.getByRole("status");
    expect(result).toHaveTextContent(formatPercent(serverPercent));
    expect(result).toHaveTextContent(`Grade ${gradeForShown(serverPercent).grade}`);
  });
});

describe("normaliseApaar", () => {
  it("accepts 12 digits with spaces or dashes", () => {
    expect(normaliseApaar("1234 5678-9012")).toEqual({ value: "123456789012", error: null });
  });

  it.each([
    ["", "Enter your APAAR ID."],
    ["12345678901", "exactly 12 digits. You entered 11"],
    ["1234567890123", "exactly 12 digits. You entered 13"],
    ["12345678901A", "digits only"],
  ])("rejects %j", (raw, message) => {
    expect(normaliseApaar(raw).error).toContain(message);
  });
});

const overview: ProgressOverview = {
  courses: [
    { id: "c1", code: "PHY101", title: "Physics 101", subject: "physics", credits: 4, category: "Core", term: "2026 Autumn",
      percent: 82.5, grade: "A+", gradePoint: 9, gradedItems: 3, feedbackReady: 1 },
    { id: "c2", code: "CS110", title: "Introduction to Programming", subject: "computing", credits: 3, category: "Skill", term: "2026 Autumn",
      percent: null, grade: null, gradePoint: null, gradedItems: 0, feedbackReady: 0 },
  ],
  feedbackReady: 1,
  record: {
    cgpa: 8.36, creditsEarned: 44,
    terms: [
      { term: "2025 Autumn", sgpa: 8.1, credits: 22, courses: [] },
      { term: "2026 Spring", sgpa: 8.62, credits: 22, courses: [] },
    ],
  },
  scale: [],
};

describe("Progress overview", () => {
  it("shows CGPA, each term's SGPA in an accessible table, and current standings", async () => {
    mockApi.mockResolvedValue(overview);
    renderPage(<Progress />);

    expect(await screen.findByText("8.36")).toBeInTheDocument();
    expect(screen.getByText("44 credits earned across 2 terms")).toBeInTheDocument();
    const sgpa = screen.getByRole("table", { name: "SGPA by term" });
    expect(within(sgpa).getByRole("row", { name: /2026 Spring 8\.62 22/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Physics 101/ })).toHaveAttribute("href", "/s/progress/courses/c1");
    expect(screen.getByText("82.5%")).toBeInTheDocument();
    expect(screen.getByText("Nothing graded yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /1 new feedback/ })).toBeInTheDocument();
  });

  it("offers a retry when it can't load", async () => {
    mockApi.mockRejectedValue(new Error("down"));
    renderPage(<Progress />);

    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("AbcCard", () => {
  const abc: AbcRecord = { apaarId: null, status: "not_linked", syncedAt: null, note: "Recorded in EduBot." };

  it("checks the APAAR ID before saving it", async () => {
    mockApi.mockResolvedValue({ ...abc, apaarId: "•••• •••• 9012", status: "pending" });
    renderPage(<AbcCard abc={abc} />);
    const input = screen.getByLabelText("APAAR ID");

    await userEvent.type(input, "12345");
    await userEvent.click(screen.getByRole("button", { name: "Save APAAR ID" }));
    expect(await screen.findByText(/You entered 5/)).toBeInTheDocument();
    expect(mockApi).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.type(input, "1234 5678 9012");
    await userEvent.click(screen.getByRole("button", { name: "Save APAAR ID" }));
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith("/api/v1/student/credits/apaar",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ apaarId: "123456789012" }) })));
  });
});

describe("ClaimDrawer", () => {
  const course: MoocCourse = { id: "m1", provider: "NPTEL", title: "Introduction to Machine Learning", weeks: 12,
    credits: 3, category: "Elective", url: "https://onlinecourses.nptel.ac.in/", nextRun: null };

  it("needs a passing score and a certificate, then sends the claim", async () => {
    mockUpload.mockResolvedValue({ id: "f1", filename: "certificate.pdf", contentType: "application/pdf", size: 1200 });
    mockApi.mockResolvedValue({});
    const onClose = vi.fn();
    renderPage(<ClaimDrawer course={course} passPercent={40} onClose={onClose} />);
    const score = screen.getByLabelText("Certificate score (%)");

    await userEvent.type(score, "35");
    await userEvent.click(screen.getByRole("button", { name: "Send to my advisor" }));
    expect(await screen.findByText(/40% or more/, { selector: ".alert *" })).toBeInTheDocument();

    await userEvent.clear(score);
    await userEvent.type(score, "72.5");
    await userEvent.click(screen.getByRole("button", { name: "Send to my advisor" }));
    expect(await screen.findByText(/Attach your certificate so your advisor/)).toBeInTheDocument();

    const file = new File(["%PDF-1.7"], "certificate.pdf", { type: "application/pdf" });
    await userEvent.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, file);
    await waitFor(() => expect(mockUpload).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Send to my advisor" }));

    await waitFor(() => expect(mockApi).toHaveBeenCalledWith("/api/v1/student/credits/transfers", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ moocCourseId: "m1", scorePercent: 72.5, certificateAttachmentId: "f1" }),
    })));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
