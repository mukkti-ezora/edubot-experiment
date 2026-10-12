import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { AttendanceAlert, TodayClass } from "@/lib/student";
import { AttendanceAlerts, TodaysClasses } from "./Today";

const alert = (overrides: Partial<AttendanceAlert>): AttendanceAlert => ({
  courseId: "c1", courseCode: "CS110", courseTitle: "Programming", level: "below", percentage: 68.2,
  mustAttend: 6, reachable: true, ...overrides,
});

const lecture = (overrides: Partial<TodayClass>): TodayClass => ({
  id: "s1", courseId: "c1", courseCode: "PHY101", courseTitle: "Physics", subject: "physics",
  startsAt: "2026-10-12T04:30:00Z", endsAt: "2026-10-12T05:30:00Z", room: "L-101", kind: "lecture",
  status: "scheduled", attendance: null, ...overrides,
});

describe("attendance warnings", () => {
  it.each([
    [alert({}), "Attend the next 6 classes to get back above the minimum."],
    [alert({ reachable: false }), "You can't reach the minimum this term. Talk to your teacher."],
    [alert({ level: "at_risk", percentage: 76 }), "One more absence takes you below the minimum."],
  ])("explains what to do", (value, advice) => {
    render(<MemoryRouter><AttendanceAlerts alerts={[value]} /></MemoryRouter>);

    expect(screen.getByRole("link")).toHaveTextContent(advice);
  });
});

describe("today's classes", () => {
  it("shows the room, or that a class is cancelled", () => {
    render(
      <MemoryRouter>
        <TodaysClasses loading={false} classes={[lecture({}), lecture({ id: "s2", status: "cancelled" })]} />
      </MemoryRouter>,
    );

    expect(screen.getByText("L-101")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("says so when there are no classes", () => {
    render(<MemoryRouter><TodaysClasses loading={false} classes={[]} /></MemoryRouter>);

    expect(screen.getByText("No classes today.")).toBeInTheDocument();
  });
});
