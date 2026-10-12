import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudentFees, StudentAssignments } from "./StudentPages";
import { TeacherGrading } from "./TeacherPages";

let dashboardData: unknown;

vi.mock("@/lib/roleDashboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/roleDashboard")>();
  return {
    ...actual,
    useRoleDashboard: () => ({ data: dashboardData, isError: false, refetch: vi.fn() }),
  };
});

const studentData = {
  profile: { name: "Ingrid Abiodun", institution: "Ashford", id: "s1", email: "i@a.edu" },
  stats: {},
  timetable: [],
  subjects: [],
  exams: [],
  assignments: [
    { title: "Algebra 4", subject: "Mathematics", due: "Tomorrow", status: "pending" },
    { title: "Plant Life Cycle", subject: "Science", due: "Done", status: "graded", score: "88%" },
  ],
  fees: { total: 9000, paid: 6750, balance: 2250, nextDue: "2026-12-25" },
};

function renderPage(page: JSX.Element) {
  return render(<MemoryRouter>{page}</MemoryRouter>);
}

describe("role sub-pages", () => {
  beforeEach(() => {
    dashboardData = undefined;
  });

  it("groups assignments by status and skips empty groups", () => {
    dashboardData = studentData;
    renderPage(<StudentAssignments />);

    expect(screen.getByRole("heading", { name: "To do" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Graded" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Overdue" })).toBeNull();
  });

  it("reports the share of fees paid", () => {
    dashboardData = studentData;
    renderPage(<StudentFees />);

    expect(screen.getByRole("meter", { name: "Share of fees paid" })).toHaveAttribute("aria-valuenow", "75");
  });

  it("shows submission progress for work to grade", () => {
    dashboardData = {
      ...studentData,
      pendingAssignments: [{ title: "Lab report", class: "IV-B", due: "Today", submitted: "30/40" }],
    };
    renderPage(<TeacherGrading />);

    const row = screen.getByText("Lab report").closest(".rd-list-item") as HTMLElement;
    expect(within(row).getByLabelText("30 of 40 submitted")).toHaveTextContent("75%");
  });

  it("shows an empty state when nothing needs grading", () => {
    dashboardData = { ...studentData, pendingAssignments: [] };
    renderPage(<TeacherGrading />);

    expect(screen.getByText("All caught up")).toBeInTheDocument();
  });
});
