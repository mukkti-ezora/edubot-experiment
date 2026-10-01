/**
 * UI primitives — the contract every page builds from.
 * Visual grammar lives in styles/primitives.css; these components own behavior.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  IconAlertCircle,
  IconCheckCircle,
  IconInbox,
  IconInfo,
} from "./icons";

/* ---------- buttons ---------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
type ButtonSize = "md" | "sm" | "xs";

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className = "",
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      className={`btn btn-${variant}${size !== "md" ? ` btn-${size}` : ""} ${className}`.trim()}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: ButtonSize }) {
  return (
    <button
      className={`btn btn-ghost btn-icon${size !== "md" ? ` btn-${size}` : ""} ${className}`.trim()}
      aria-label={label}
      title={label}
      {...rest}
    />
  );
}

/* ---------- badges / status ---------- */

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral" | "violet";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`badge badge-${tone}`}>
      <span className="dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
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

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return <Badge tone={statusTone(status)}>{label ?? status}</Badge>;
}

/* ---------- avatar / identity ---------- */

export function Avatar({
  name,
  size = "md",
  dark = false,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  dark?: boolean;
}) {
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")) || "·";
  return (
    <span className={`avatar${size === "sm" ? " avatar-sm" : ""}${size === "lg" ? " avatar-lg" : ""}${dark ? " avatar-dark" : ""}`} aria-hidden="true">
      {initials}
    </span>
  );
}

export function Ident({
  name,
  sub,
  size = "md",
}: {
  name: React.ReactNode;
  sub?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className="ident">
      {typeof name === "string" ? <Avatar name={name} size={size} /> : null}
      <div>
        <div className="ident-main truncate">{name}</div>
        {sub ? <div className="ident-sub truncate">{sub}</div> : null}
      </div>
    </div>
  );
}

/* ---------- forms ---------- */

export function Field({
  label,
  htmlFor,
  help,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  help?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? (
        <span className="error" role="alert">
          <IconAlertCircle />
          {error}
        </span>
      ) : help ? (
        <span className="help">{help}</span>
      ) : null}
    </div>
  );
}

/* ---------- tabs ---------- */

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === active}
          className="tab"
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {typeof tab.count === "number" && <span className="count-pill">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- dropdown menu ---------- */

interface MenuCtx {
  close: () => void;
}
const MenuContext = createContext<MenuCtx>({ close: () => {} });

export function Menu({
  trigger,
  children,
  align = "right",
  width,
}: {
  trigger: React.ReactElement;
  children: React.ReactNode;
  align?: "left" | "right";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const triggerEl = (
    <span
      ref={(node) => {
        (triggerRef as React.MutableRefObject<HTMLElement | null>).current =
          node?.firstElementChild as HTMLElement | null;
      }}
      style={{ display: "inline-flex" }}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        if (e.key === "ArrowDown" && !open) setOpen(true);
      }}
    >
      {trigger}
    </span>
  );

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-flex" }}>
      {triggerEl}
      {open && (
        <div
          role="menu"
          className="menu"
          data-side={align}
          style={{ [align]: 0, top: "calc(100% + 6px)", minWidth: width } as React.CSSProperties}
        >
          <MenuContext.Provider value={{ close }}>{children}</MenuContext.Provider>
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onSelect,
  danger = false,
  hint,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  hint?: string;
}) {
  const { close } = useContext(MenuContext);
  return (
    <button
      role="menuitem"
      className={`menu-item${danger ? " danger" : ""}`}
      onClick={() => {
        close();
        onSelect?.();
      }}
    >
      {icon}
      <span>{children}</span>
      {hint ? <kbd className="kbd-right">{hint}</kbd> : null}
    </button>
  );
}

export function MenuLink({
  icon,
  children,
  to,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  to: string;
}) {
  const { close } = useContext(MenuContext);
  return (
    <a role="menuitem" className="menu-item" href={to} onClick={close}>
      {icon}
      <span>{children}</span>
    </a>
  );
}

export function MenuSep() {
  return <div className="menu-sep" role="separator" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="menu-label">{children}</div>;
}

/* ---------- drawer ---------- */

export function Drawer({
  title,
  sub,
  children,
  footer,
  onClose,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <>
      <div className="drawer-overlay" onMouseDown={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <div className="min-w-0">
            <h2>{title}</h2>
            {sub ? <div className="sub">{sub}</div> : null}
          </div>
          <button ref={closeRef} className="btn btn-ghost btn-icon btn-sm right" onClick={onClose} aria-label="Close panel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" width="16" height="16" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer ? <div className="drawer-foot">{footer}</div> : null}
      </div>
    </>
  );
}

/* ---------- loading / empty / error ---------- */

export function SkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel-row" style={{ opacity: 1 - i * 0.06 }}>
          <div className="skeleton" style={{ height: 13, width: `${70 - i * 5}%` }} />
        </div>
      ))}
    </div>
  );
}

export function Skeleton({ w, h = 13 }: { w: number | string; h?: number }) {
  return <div className="skeleton" style={{ width: w, height: h }} />;
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon ?? <IconInbox />}</div>
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
      <div className="empty-icon">
        <IconAlertCircle />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/* ---------- alerts ---------- */

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "danger" | "ok";
  title?: string;
  children: React.ReactNode;
}) {
  const icon =
    tone === "danger" ? <IconAlertCircle /> : tone === "ok" ? <IconCheckCircle /> : tone === "warn" ? <IconAlertCircle /> : <IconInfo />;
  return (
    <div className={`alert alert-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      {icon}
      <div>
        {title ? <div className="alert-title">{title}</div> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

/* ---------- confirm dialog (destructive pattern) ---------- */

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
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className="btn-spinner"
      style={{ borderColor: "var(--line-strong)", borderTopColor: "var(--ink-600)" }}
    />
  );
}

/* ---------- page head ---------- */

export function PageHead({
  title,
  sub,
  actions,
  trailing,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="head-main">
        <h1>{title}</h1>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {trailing}
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}
