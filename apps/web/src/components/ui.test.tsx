import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button, ConfirmDialog, Drawer, Field } from "./ui";

describe("Button", () => {
  it("stays disabled while loading even when the caller passes disabled={false}", () => {
    render(<Button loading disabled={false}>Send</Button>);

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});

describe("Field", () => {
  it("links the control to its error and marks it invalid", () => {
    render(<Field label="Title" htmlFor="t" error="Give it a title."><input id="t" /></Field>);

    const input = screen.getByLabelText("Title");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Give it a title.");
  });
});

function Harness({ dismissible = true, onClose = () => {} }: { dismissible?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      {open && (
        <Drawer title="Panel" dismissible={dismissible} onClose={() => { onClose(); setOpen(false); }}>
          <input aria-label="First" data-autofocus />
          <button type="button">Last</button>
        </Drawer>
      )}
    </>
  );
}

describe("Drawer", () => {
  it("keeps Tab inside and returns focus to the opener on close", async () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await userEvent.click(opener);
    expect(screen.getByLabelText("First")).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Close panel" })).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(opener).toHaveFocus();
  });

  it("ignores Escape while it can't be dismissed", async () => {
    const onClose = vi.fn();
    render(<Harness dismissible={false} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));

    await userEvent.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Panel" })).toBeInTheDocument();
  });
});

describe("ConfirmDialog", () => {
  it("keeps focus where the user put it while the parent re-renders", async () => {
    function Ticking() {
      const [tick, setTick] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setTick(tick + 1)}>Tick {tick}</button>
          <ConfirmDialog title="Submit?" body="Sure?" confirmLabel="Submit" danger={false}
            onConfirm={() => {}} onClose={() => {}} />
        </>
      );
    }
    render(<Ticking />);
    const submit = screen.getByRole("button", { name: "Submit" });
    submit.focus();

    await userEvent.click(screen.getByRole("button", { name: /Tick/ }));
    submit.focus();
    await userEvent.click(screen.getByRole("button", { name: /Tick/ }));

    expect(screen.getByRole("button", { name: "Tick 2" })).toBeInTheDocument();
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Cancel" }));
  });

  it("keeps Tab inside the dialog and restores focus when it closes", async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open</button>
          {open && <ConfirmDialog title="Sure?" body="Really?" confirmLabel="Yes" onConfirm={() => {}} onClose={() => setOpen(false)} />}
        </>
      );
    }
    render(<Host />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));

    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole("alertdialog").contains(document.activeElement)).toBe(true);

    await userEvent.keyboard("{Escape}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open" }));
  });
});
