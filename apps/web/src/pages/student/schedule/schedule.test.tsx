import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import {
  addDayKeys, attendanceAdvice, dayKey, daysBetween, leaveRangeProblem, minutesInDay, todayKey, weekStartKey,
  type CourseAttendance, type RosterEntry, type ScheduleRange,
} from "@/lib/schedule";
import { decisionBody, withDecision, type LeaveItem } from "@/lib/requests";
import { CalendarSync, Schedule, slotMinutes, ViewToggle } from "./Schedule";
import { markAllPresent } from "@/pages/teacher/AttendanceMarking";
import { CheckinForm } from "./Attendance";
import { TeacherRequests } from "@/pages/teacher/Requests";

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: vi.fn() }));
const mockApi = vi.mocked(api);

function renderPage(ui: ReactNode, path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
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

beforeEach(() => {
  mockApi.mockReset();
});

const course: CourseAttendance = {
  courseId: "c1", courseCode: "CS110", courseTitle: "Intro to Programming", subject: "computing",
  held: 20, attended: 16, excused: 0, absent: 4, percentage: 80, remaining: 10,
  belowThreshold: false, canMiss: 2, mustAttend: 0, reachable: true,
};

describe("attendanceAdvice", () => {
  it("frames how many classes a student can miss as a projection to the end of term", () => {
    expect(attendanceAdvice(course, 75)).toBe("By the end of term you can miss up to 2 classes and still finish at 75%.");
  });

  it("uses the singular for one class", () => {
    expect(attendanceAdvice({ ...course, canMiss: 1 }, 75)).toBe("By the end of term you can miss up to 1 class and still finish at 75%.");
  });

  it("warns when every remaining class is needed", () => {
    expect(attendanceAdvice({ ...course, canMiss: 0 }, 75)).toBe("Attend every remaining class to finish the term at 75% or above.");
  });

  it("doesn't ask for attendance when no classes are left", () => {
    expect(attendanceAdvice({ ...course, remaining: 0, canMiss: 0 }, 75)).toBe("No classes are left this term. You finish at 80%.");
  });

  it("tells a student below the minimum how many classes in a row bring them back", () => {
    expect(attendanceAdvice({ ...course, belowThreshold: true, canMiss: 0, mustAttend: 6 }, 75))
      .toBe("Attend the next 6 classes to get back to 75%.");
  });

  it("is honest when the minimum can no longer be reached", () => {
    expect(attendanceAdvice({ ...course, belowThreshold: true, canMiss: 0, mustAttend: 12, reachable: false }, 75))
      .toMatch(/can't reach 75%/);
  });

  it("says when no classes have been held", () => {
    expect(attendanceAdvice({ ...course, percentage: null }, 75)).toBe("No classes have been held yet.");
  });
});

describe("leave dates", () => {
  it("counts both the first and last day", () => {
    expect(daysBetween("2026-10-12", "2026-10-12")).toBe(1);
    expect(daysBetween("2026-10-12", "2026-10-14")).toBe(3);
  });

  it("accepts exactly 30 days", () => {
    expect(leaveRangeProblem("2026-10-01", "2026-10-30")).toBeNull();
  });

  it("refuses 31 days", () => {
    expect(leaveRangeProblem("2026-10-01", "2026-10-31")).toMatch(/up to 30 days/);
  });

  it("refuses an end before the start", () => {
    expect(leaveRangeProblem("2026-10-14", "2026-10-12")).toMatch(/can't be before/);
  });

  it("needs both days", () => {
    expect(leaveRangeProblem("", "2026-10-12")).toMatch(/Choose/);
  });
});

describe("CheckinForm", () => {
  it("refuses a code that isn't six digits without calling the server", async () => {
    renderPage(<CheckinForm />);
    await userEvent.type(screen.getByLabelText("Check-in code"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Check in" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter the 6-digit code");
    expect(mockApi).not.toHaveBeenCalled();
  });

  it("drops anything that isn't a digit as it's typed", async () => {
    renderPage(<CheckinForm />);
    const input = screen.getByLabelText("Check-in code");
    await userEvent.type(input, "12a-34 56");

    expect(input).toHaveValue("123456");
  });

  it("sends a valid code and confirms the check-in", async () => {
    serve(() => ({ sessionId: "s1", status: "present", source: "checkin" }));
    renderPage(<CheckinForm />);
    await userEvent.type(screen.getByLabelText("Check-in code"), "482913");
    await userEvent.click(screen.getByRole("button", { name: "Check in" }));

    expect(await screen.findByText(/You're checked in\. Marked present\./)).toBeInTheDocument();
    expect(JSON.parse(mockApi.mock.calls[0][1]!.body as string)).toEqual({ code: "482913" });
  });

  it("shows the server's message when there are too many attempts", async () => {
    mockApi.mockRejectedValue(new ApiError({ status: 429, code: "RATE_LIMITED", message: "Too many check-in attempts. Wait a few minutes." }));
    renderPage(<CheckinForm />);
    await userEvent.type(screen.getByLabelText("Check-in code"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Check in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many check-in attempts");
  });
});

describe("the institution's calendar (IST)", () => {
  it("puts 00:30 IST on its IST day, though it is still the previous day in UTC", () => {
    const halfPastMidnight = "2026-10-11T19:00:00Z"; // 00:30 IST on Monday 12 October
    expect(dayKey(halfPastMidnight)).toBe("2026-10-12");
    expect(minutesInDay(halfPastMidnight)).toBe(30);
  });

  it("counts weeks from Monday on the institution's days", () => {
    expect(weekStartKey("2026-10-18")).toBe("2026-10-12"); // a Sunday belongs to the week before
    expect(weekStartKey("2026-10-12")).toBe("2026-10-12");
    expect(addDayKeys("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("draws a class that runs past midnight to the end of its first day", () => {
    expect(slotMinutes({ startsAt: "2026-10-12T17:30:00Z", endsAt: "2026-10-12T19:30:00Z" })) // 23:00 to 01:00 IST
      .toEqual({ start: 23 * 60, end: 24 * 60 });
  });
});

describe("Schedule week view", () => {
  it("shows this week's classes and deadlines as readable events", async () => {
    const monday = weekStartKey(todayKey());
    const at = (day: number, hour: number) => `${addDayKeys(monday, day)}T${String(hour).padStart(2, "0")}:00:00+05:30`;
    const range: ScheduleRange = {
      from: monday, to: addDayKeys(monday, 6),
      events: [
        { id: "s1", type: "class", title: "PHY101 lecture", courseId: "c1", courseCode: "PHY101", courseTitle: "Physics 101",
          subject: "physics", startsAt: at(1, 9), endsAt: at(1, 10), kind: "lecture", room: "LH-2", status: "scheduled", attendance: null },
        { id: "a1", type: "due", title: "Problem set 2", courseId: "c1", courseCode: "PHY101", courseTitle: "Physics 101",
          subject: "physics", startsAt: at(2, 23), endsAt: null, kind: "assignment" },
      ],
    };
    serve((path) => {
      expect(path).toContain(`from=${monday}`);
      return range;
    });
    renderPage(<Schedule />);

    const week = await screen.findByRole("region", { name: "Week view" });
    expect(within(week).getByRole("link", { name: /Lecture, PHY101, .* room LH-2/ })).toHaveAttribute("href", "/s/learn/c1");
    expect(within(week).getByRole("link", { name: /Deadline, PHY101, Problem set 2, due/ })).toHaveAttribute("href", "/s/assignments/a1");
  });

  it("moves to the next week and asks for that range", async () => {
    serve(() => ({ from: "", to: "", events: [] }));
    renderPage(<Schedule />);
    await screen.findByText("Nothing scheduled this week");
    await userEvent.click(screen.getByRole("button", { name: "Next week" }));

    const nextMonday = addDayKeys(weekStartKey(todayKey()), 7);
    await waitFor(() => expect(mockApi.mock.calls.some(([path]) => String(path).includes(`from=${nextMonday}`))).toBe(true));
  });
});

describe("teacher requests", () => {
  it("only sends a note when the teacher wrote one", () => {
    expect(decisionBody({ approve: true, note: "  " })).toEqual({ approve: true });
    expect(decisionBody({ approve: false, note: " Please attach a certificate. " }))
      .toEqual({ approve: false, note: "Please attach a certificate." });
  });

  it("approves a leave request with the teacher's note", async () => {
    const leave: LeaveItem = {
      id: "lv1", kind: "medical", fromDate: "2026-10-13", toDate: "2026-10-14", days: 2, reason: "Fever",
      status: "pending", decisionNote: null, decidedAt: null, createdAt: "2026-10-12T08:00:00Z", attachments: [],
      student: { id: "p1", name: "Ingrid Abiodun" },
    };
    serve((path, method) => {
      if (method === "POST") return { ...leave, status: "approved" };
      if (path.endsWith("/leave")) return { items: [leave] };
      return { items: [], pending: 0 };
    });
    renderPage(<TeacherRequests />);
    await screen.findByText("Ingrid Abiodun");
    await userEvent.click(screen.getByRole("button", { name: "Add a note" }));
    await userEvent.type(screen.getByLabelText(/Note to Ingrid Abiodun/), "Get well soon");
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      const post = mockApi.mock.calls.find(([, init]) => init?.method === "POST");
      expect(post?.[0]).toBe("/api/v1/teacher/requests/leave/lv1/decide");
      expect(JSON.parse(post?.[1]?.body as string)).toEqual({ approve: true, note: "Get well soon" });
    });
  });

  it("asks before declining", async () => {
    const leave: LeaveItem = {
      id: "lv2", kind: "leave", fromDate: "2026-10-13", toDate: "2026-10-13", days: 1, reason: "Family event",
      status: "pending", decisionNote: null, decidedAt: null, createdAt: "2026-10-12T08:00:00Z", attachments: [],
      student: { id: "p2", name: "Kwame Abiodun" },
    };
    serve((path, method) => (method === "POST" ? { ...leave, status: "declined" } : path.endsWith("/leave") ? { items: [leave] } : { items: [], pending: 0 }));
    renderPage(<TeacherRequests />);
    await screen.findByText("Kwame Abiodun");
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));

    const dialog = screen.getByRole("alertdialog", { name: "Decline this request?" });
    expect(mockApi.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(mockApi.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
  });
});

describe("deciding a request that fails", () => {
  it("keeps the request, the teacher's note and the server's reason on screen", async () => {
    const leave: LeaveItem = {
      id: "lv3", kind: "medical", fromDate: "2026-10-13", toDate: "2026-10-14", days: 2, reason: "Fever",
      status: "pending", decisionNote: null, decidedAt: null, createdAt: "2026-10-12T08:00:00Z", attachments: [],
      student: { id: "p3", name: "Sana Okafor" },
    };
    mockApi.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.reject(new ApiError({ status: 409, code: "CONFLICT", message: "Couldn't find this student's classes; try again." }));
      }
      return Promise.resolve(path.endsWith("/leave") ? { items: [leave] } : { items: [], pending: 0 });
    });
    renderPage(<TeacherRequests />);
    await screen.findByText("Sana Okafor");
    await userEvent.click(screen.getByRole("button", { name: "Add a note" }));
    await userEvent.type(screen.getByLabelText(/Note to Sana Okafor/), "Get well soon");
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't find this student's classes; try again.");
    expect(screen.getByLabelText(/Note to Sana Okafor/)).toHaveValue("Get well soon");
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });

  it("drops the credits pending count once a decision is saved", () => {
    const list = { items: [{ id: "c1", status: "pending" as const }], pending: 1 };
    expect(withDecision(list, "c1", true)).toEqual({ items: [{ id: "c1", status: "approved" }], pending: 0 });
  });
});

describe("calendar link", () => {
  it("warns before creating a link, since a new one replaces any old subscription", async () => {
    serve(() => ({ url: "/api/v1/calendar-feed/abc.ics", days: 60 }));
    renderPage(<CalendarSync onClose={() => undefined} />);

    await userEvent.click(screen.getByRole("button", { name: "Create my calendar link" }));

    expect(screen.getByRole("alertdialog", { name: "Replace your calendar link?" })).toBeInTheDocument();
    expect(mockApi).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Create a new link" }));
    expect(await screen.findByLabelText("Your calendar link")).toHaveValue(`${window.location.origin}/api/v1/calendar-feed/abc.ics`);
  });

  it("says so when copying isn't allowed", async () => {
    serve(() => ({ url: "/api/v1/calendar-feed/abc.ics", days: 60 }));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } });
    renderPage(<CalendarSync onClose={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: "Create my calendar link" }));
    await userEvent.click(screen.getByRole("button", { name: "Create a new link" }));
    await userEvent.click(await screen.findByRole("button", { name: /Copy/ }));

    expect(await screen.findByText(/Copying didn't work here/)).toBeInTheDocument();
  });
});

describe("check-in code", () => {
  it("accepts a pasted code with a space in it", async () => {
    renderPage(<CheckinForm />);
    const input = screen.getByLabelText("Check-in code");
    await userEvent.click(input);
    await userEvent.paste("123 456");

    expect(input).toHaveValue("123456");
  });
});

describe("layout toggle", () => {
  it("moves between Week and Agenda with the arrow keys", async () => {
    let view: "week" | "agenda" = "week";
    const { rerender } = render(<ViewToggle value={view} onChange={(next) => { view = next; }} />);
    screen.getByRole("radio", { name: "Week" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    rerender(<ViewToggle value={view} onChange={(next) => { view = next; }} />);

    expect(view).toBe("agenda");
    expect(screen.getByRole("radio", { name: "Agenda" })).toHaveAttribute("tabindex", "0");
  });
});

describe("mark all present", () => {
  it("keeps approved leave and students' own check-ins", () => {
    const roster: RosterEntry[] = [
      { personId: "a", name: "A", status: null, source: null },
      { personId: "b", name: "B", status: "excused", source: "leave" },
      { personId: "c", name: "C", status: "late", source: "checkin" },
      { personId: "d", name: "D", status: "absent", source: "teacher" },
    ];
    expect(markAllPresent(roster, { a: null, b: "excused", c: "late", d: "absent" }))
      .toEqual({ a: "present", b: "excused", c: "late", d: "present" });
  });
});
