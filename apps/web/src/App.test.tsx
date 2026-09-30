import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useTableState } from "@/lib/useTableState";
import { ConfirmDialog } from "@/components/ui";
import { useState } from "react";

// ---- useTableState: filters/sort/pagination live in the URL ----

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="loc">{location.search || "(none)"}</output>;
}

function Probe() {
  const table = useTableState();
  return (
    <div>
      <output data-testid="query">{table.get("query") || "(empty)"}</output>
      <output data-testid="sort">{table.sort ?? "(none)"}</output>
      <output data-testid="page">{table.pageIndex}</output>
      <LocationProbe />
      <button onClick={() => table.set({ query: "ashford" })}>set-query</button>
      <button onClick={() => table.onSort("name")}>sort-name</button>
      <button onClick={() => table.onNext("CURSOR_B")}>next</button>
      <button onClick={table.onPrev}>prev</button>
    </div>
  );
}

function renderProbe(initial: string = "/users") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/users" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("useTableState (URL-persisted list state)", () => {
  it("writes filters to the URL and reads them back", async () => {
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByText("set-query"));
    expect(await screen.findByTestId("query")).toHaveTextContent("ashford");
    expect(screen.getByTestId("loc")).toHaveTextContent("query=ashford");
  });

  it("cycles sort asc → desc → cleared for a column", async () => {
    const user = userEvent.setup();
    renderProbe("/users?query=kept");
    await user.click(screen.getByText("sort-name"));
    expect(await screen.findByTestId("sort")).toHaveTextContent("name");
    expect(screen.getByTestId("query")).toHaveTextContent("kept");
    await user.click(screen.getByText("sort-name"));
    expect(await screen.findByTestId("sort")).toHaveTextContent("-name");
    await user.click(screen.getByText("sort-name"));
    expect(await screen.findByTestId("sort")).toHaveTextContent("(none)");
  });

  it("paginates with cursor stacks and returns to the first page", async () => {
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByText("next"));
    expect(await screen.findByTestId("page")).toHaveTextContent("1");
    await user.click(screen.getByText("prev"));
    expect(await screen.findByTestId("page")).toHaveTextContent("0");
  });
});

// ---- ConfirmDialog: destructive pattern ----

function DialogProbe() {
  const [open, setOpen] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div>
      {confirmed && <span>confirmed-yes</span>}
      {open && (
        <ConfirmDialog
          title="Deactivate Priya Nair?"
          body="Priya Nair will lose access immediately."
          confirmLabel="Deactivate user"
          onConfirm={() => setConfirmed(true)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

describe("ConfirmDialog", () => {
  it("names the target and consequence, and cancels safely", async () => {
    const user = userEvent.setup();
    render(<DialogProbe />);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(/Priya Nair will lose access immediately/)).toBeInTheDocument();
    await user.click(screen.getByText("Cancel"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.queryByText("confirmed-yes")).not.toBeInTheDocument();
  });

  it("confirms with the named action verb", async () => {
    const user = userEvent.setup();
    render(<DialogProbe />);
    await user.click(screen.getByRole("button", { name: "Deactivate user" }));
    await waitFor(() => expect(screen.getByText("confirmed-yes")).toBeInTheDocument());
  });

  it("Escape closes the dialog", async () => {
    const user = userEvent.setup();
    render(<DialogProbe />);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
