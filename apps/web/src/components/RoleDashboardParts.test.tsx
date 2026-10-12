import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { greetingFor, workTone } from "@/lib/roleDashboard";
import { ChildSwitcher } from "./ChildSwitcher";
import { SubjectBars, scoreTone } from "./SubjectBars";

describe("scoreTone", () => {
  it.each([
    [100, "success"],
    [80, "success"],
    [79, "warning"],
    [65, "warning"],
    [64, "danger"],
    [0, "danger"],
  ])("scores %i as %s", (score, tone) => {
    expect(scoreTone(score)).toBe(tone);
  });
});

describe("SubjectBars", () => {
  it("exposes each score as a meter clamped to 0-100 visually", () => {
    render(<SubjectBars subjects={[{ name: "Physics", score: 120, grade: "A+", trend: "down" }]} />);

    const meter = screen.getByRole("meter", { name: "Physics score" });
    expect(meter).toHaveAttribute("aria-valuenow", "120");
    expect(meter.firstElementChild).toHaveStyle({ "--sb-fill-w": "100%" });
    expect(screen.getByRole("img", { name: "Declining" })).toBeInTheDocument();
  });

  it("shows an empty state without subjects", () => {
    render(<SubjectBars subjects={[]} />);
    expect(screen.getByText("No subject data")).toBeInTheDocument();
  });
});

describe("ChildSwitcher", () => {
  const options = [
    { id: "c1", name: "Emma", class: "IV-A" },
    { id: "c2", name: "Liam", class: "VI-B" },
  ];

  it("reports the chosen child's id and marks the active one", async () => {
    const onChange = vi.fn();
    render(<ChildSwitcher options={options} activeId="c1" onChange={onChange} />);

    expect(screen.getByRole("button", { name: /Emma/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /Liam/ }));
    expect(onChange).toHaveBeenCalledWith("c2");
  });

  it("renders nothing for a single child", () => {
    const { container } = render(<ChildSwitcher options={options.slice(0, 1)} activeId="c1" onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("workTone", () => {
  it.each([
    ["graded", "ok"],
    ["submitted", "info"],
    ["pending", "warn"],
    ["overdue", "danger"],
  ] as const)("gives %s the %s tone", (status, tone) => {
    expect(workTone(status)).toBe(tone);
  });
});

describe("greetingFor", () => {
  it.each([
    [0, "Good morning"],
    [11, "Good morning"],
    [12, "Good afternoon"],
    [16, "Good afternoon"],
    [17, "Good evening"],
  ])("greets hour %i with %s", (hour, greeting) => {
    expect(greetingFor(hour)).toBe(greeting);
  });
});
