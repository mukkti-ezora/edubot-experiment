import { useEffect, useRef } from "react";

export function Badge({ tone, children }: { tone: "ok" | "warn" | "danger" | "info" | "neutral"; children: React.ReactNode }) {
  return (
    <span className={`badge badge-${tone}`}>
      <span className="dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export function statusTone(status: string): "ok" | "warn" | "danger" | "info" | "neutral" {
  switch (status) {
    case "active":
      return "ok";
    case "pending":
    case "invited":
      return "warn";
    case "suspended":
    case "deactivated":
      return "danger";
    default:
      return "neutral";
  }
}

export function SkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel-row" style={{ opacity: 1 - i * 0.07 }}>
          <div className="skeleton" style={{ height: 14, width: `${72 - i * 5}%`, marginTop: 13 }} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "This section couldn't load",
  body = "Something went wrong while loading. Retry to try again.",
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="errorbox" role="alert">
      <h3>{title}</h3>
      <p>{body}</p>
      {onRetry && (
        <button className="btn btn-secondary btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger = true,
  busy = false,
  onConfirm,
  onClose,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div className="body">{body}</div>
        <footer>
          <button ref={cancelRef} className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <span className="btn-spinner" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" aria-label={label} className="btn-spinner" style={{ borderColor: "var(--line-strong)", borderTopColor: "var(--ink-600)" }} />
  );
}
