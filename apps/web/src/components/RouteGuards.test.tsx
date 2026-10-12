import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeResponse } from "@/lib/types";
import { HomeRedirect, RequireAuth, RequireUserType } from "./RouteGuards";

let currentMe: MeResponse | null = null;

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ me: currentMe, loading: false, signOut: vi.fn(), can: () => false, refresh: vi.fn() }),
}));

function meOfType(type: string): MeResponse {
  return {
    admin: { id: "p1", name: "Ada Okafor", email: "ada@example.edu", type, status: "active", institutionId: null },
    roles: [],
    permissions: [],
    scope: type,
  };
}

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<Where />} />
        <Route element={<RequireAuth />}>
          <Route path="/home" element={<HomeRedirect />} />
          <Route element={<RequireUserType type="administrator" />}>
            <Route path="/dashboard" element={<Where />} />
            <Route path="/students" element={<Where />} />
            <Route path="/settings" element={<Where />} />
          </Route>
          <Route element={<RequireUserType type="student" />}>
            <Route path="/s" element={<Where />} />
          </Route>
          <Route element={<RequireUserType type="teacher" />}>
            <Route path="/t" element={<Where />} />
          </Route>
          <Route element={<RequireUserType type="parent" />}>
            <Route path="/p" element={<Where />} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const landedOn = () => screen.getByTestId("where").textContent;

describe("route guards", () => {
  beforeEach(() => {
    currentMe = null;
  });

  it("sends signed-out visitors to login", () => {
    renderAt("/s");
    expect(landedOn()).toBe("/login");
  });

  it.each([
    ["administrator", "/dashboard"],
    ["student", "/s"],
    ["teacher", "/t"],
    ["parent", "/p"],
  ])("/home resolves a %s to %s", (type, home) => {
    currentMe = meOfType(type);
    renderAt("/home");
    expect(landedOn()).toBe(home);
  });

  it.each(["/students", "/settings"])("keeps an administrator on %s (no /s or /p prefix clash)", (path) => {
    currentMe = meOfType("administrator");
    renderAt(path);
    expect(landedOn()).toBe(path);
  });

  it.each(["/dashboard", "/students", "/t", "/p"])("sends a student away from %s to their home", (path) => {
    currentMe = meOfType("student");
    renderAt(path);
    expect(landedOn()).toBe("/s");
  });

  it("sends an administrator away from a role dashboard", () => {
    currentMe = meOfType("administrator");
    renderAt("/s");
    expect(landedOn()).toBe("/dashboard");
  });

  it("fails closed for an unknown account type", () => {
    currentMe = meOfType("manager");
    renderAt("/dashboard");
    expect(screen.queryByTestId("where")).toBeNull();
    expect(screen.getByText(/isn't supported/i)).toBeInTheDocument();
  });
});
