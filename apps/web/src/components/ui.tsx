/**
 * UI primitives — category-aware component library for EduBot v2.
 * Visual grammar in styles/primitives.css; these own behavior.
 */
import {
  cloneElement,
  createContext,
  isValidElement,
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

/* ---------- Buttons ---------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost"
  | "student" | "teacher" | "parent" | "admin" | "institution";
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
      {...rest}
      className={`btn btn-${variant}${size !== "md" ? ` btn-${size}` : ""} ${className}`.trim()}
      disabled={rest.disabled || loading}
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

/* ---------- Badges / Status ---------- */

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral" | "student" | "teacher" | "parent" | "admin" | "institution" | "brand" | "violet";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`badge badge-${tone}`}>
      <span className="dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export function statusTone(status: string): "ok" | "warn" | "danger" | "info" | "neutral" {
  switch (status) {
    case "active": return "ok";
    case "pending": case "invited": return "warn";
    case "suspended": case "deactivated": return "danger";
    default: return "neutral";
  }
}

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return <Badge tone={statusTone(status)}>{label ?? status}</Badge>;
}

/* ---------- Avatar (category-aware) ---------- */

export type Category = "student" | "teacher" | "parent" | "admin" | "institution" | "brand";

export function Avatar({
  name,
  size = "md",
  category,
}: {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  category?: Category;
}) {
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")) || "·";
  const catClass = category ? `avatar-${category}` : "";
  return (
    <span
      className={`avatar${size !== "md" ? ` avatar-${size}` : ""} ${catClass}`.trim()}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function AvatarGroup({ avatars, max = 4 }: { avatars: { name: string; category?: Category }[]; max?: number }) {
  const visible = avatars.slice(0, max);
  const extra = avatars.length - max;
  return (
    <div className="avatar-group" aria-label={`${avatars.length} people`}>
      {visible.map((a, i) => (
        <Avatar key={i} name={a.name} size="sm" category={a.category} />
      ))}
      {extra > 0 && (
        <span
          className={`avatar avatar-sm ${extra > 0 ? '' : ''}`}
          style={{ background: "var(--neutral-200)", color: "var(--neutral-600)" }}
          aria-hidden="true"
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

export function Ident({
  name,
  sub,
  size = "md",
  category,
}: {
  name: React.ReactNode;
  sub?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  category?: Category;
}) {
  return (
    <div className="ident">
      {typeof name === "string" ? <Avatar name={name} size={size} category={category} /> : null}
      <div>
        <div className="ident-main truncate">{name}</div>
        {sub ? <div className="ident-sub truncate">{sub}</div> : null}
      </div>
    </div>
  );
}

/* ---------- Forms ---------- */

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
  const messageId = htmlFor && (error || help) ? `${htmlFor}-${error ? "error" : "help"}` : undefined;
  // The control announces its error or hint; callers keep passing a plain input as the child.
  const control = isValidElement<{ "aria-describedby"?: string; "aria-invalid"?: boolean }>(children)
    ? cloneElement(children, {
        "aria-describedby": [children.props["aria-describedby"], messageId].filter(Boolean).join(" ") || undefined,
        "aria-invalid": children.props["aria-invalid"] ?? (error ? true : undefined),
      })
    : children;
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {control}
      {error ? (
        <span className="error" role="alert" id={messageId}>
          <IconAlertCircle />
          {error}
        </span>
      ) : help ? (
        <span className="help" id={messageId}>{help}</span>
      ) : null}
    </div>
  );
}

/* ---------- Tabs ---------- */

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

/* ---------- Dropdown Menu ---------- */

interface MenuCtx { close: () => void; }
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
      if (e.key === "Escape") { close(); triggerRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open, close]);

  const triggerEl = (
    <span
      ref={(node) => { (triggerRef as React.MutableRefObject<HTMLElement | null>).current = node?.firstElementChild as HTMLElement | null; }}
      style={{ display: "inline-flex" }}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen((o) => !o); if (e.key === "ArrowDown" && !open) setOpen(true); }}
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
      onClick={() => { close(); onSelect?.(); }}
    >
      {icon}
      <span>{children}</span>
      {hint ? <kbd className="kbd-right">{hint}</kbd> : null}
    </button>
  );
}

export function MenuLink({ icon, children, to }: { icon?: React.ReactNode; children: React.ReactNode; to: string }) {
  const { close } = useContext(MenuContext);
  return (
    <a role="menuitem" className="menu-item" href={to} onClick={close}>
      {icon}
      <span>{children}</span>
    </a>
  );
}

export function MenuSep() { return <div className="menu-sep" role="separator" />; }

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="menu-label">{children}</div>;
}

/* ---------- Drawer ---------- */

export function Drawer({
  title,
  sub,
  children,
  footer,
  onClose,
  dismissible = true,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  /** False while work is in flight (for example a form submitting), so it can't be closed mid-save. */
  dismissible?: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  onCloseRef.current = onClose;
  dismissibleRef.current = dismissible;
  const close = () => { if (dismissibleRef.current) onCloseRef.current(); };
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ?? closeRef.current;
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissibleRef.current) onCloseRef.current();
      if (e.key === "Tab") trapFocus(e, panelRef.current);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <>
      <div className="drawer-overlay" onMouseDown={close} />
      <div ref={panelRef} className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <div className="min-w-0">
            <h2>{title}</h2>
            {sub ? <div className="sub">{sub}</div> : null}
          </div>
          <button ref={closeRef} className="btn btn-ghost btn-icon btn-sm right" onClick={close} aria-label="Close panel"
            aria-disabled={!dismissible || undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" width="16" height="16" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer ? <div className="drawer-foot">{footer}</div> : null}
      </div>
    </>
  );
}

/* ---------- Loading / Empty / Error ---------- */

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isReachable(element: HTMLElement): boolean {
  return !element.closest("[hidden], [inert], [aria-hidden='true']");
}

/** Keeps Tab and Shift+Tab cycling inside a modal surface, and pulls focus back in if it has escaped. */
export function trapFocus(event: KeyboardEvent, container: HTMLElement | null) {
  const items = container ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isReachable) : [];
  if (!container || items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (!container.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function SkeletonRows({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel-row" style={{ opacity: 1 - i * 0.06 }}>
          <div className="skeleton" style={{ height: 14, width: `${70 - i * 5}%` }} />
        </div>
      ))}
    </div>
  );
}

export function Skeleton({ w, h = 14 }: { w: number | string; h?: number }) {
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
      <div className="empty-icon"><IconAlertCircle /></div>
      <h3>{title}</h3>
      <p>{body}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

/* ---------- Alerts ---------- */

export function Alert({ tone = "info", title, children }: {
  tone?: "info" | "warn" | "danger" | "ok";
  title?: string;
  children: React.ReactNode;
}) {
  const icon = tone === "danger" ? <IconAlertCircle /> : tone === "ok" ? <IconCheckCircle /> : tone === "warn" ? <IconAlertCircle /> : <IconInfo />;
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

/* ---------- Confirm Dialog ---------- */

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
  const dialogRef = useRef<HTMLDivElement>(null);
  // Callers often pass an inline onClose; a ref keeps the effect from re-running (and stealing focus) every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "Tab") trapFocus(e, dialogRef.current);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCloseRef.current()}>
      <div ref={dialogRef} className="dialog" role="alertdialog" aria-modal="true" aria-label={title}>
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
    <span role="status" aria-label={label} className="btn-spinner" style={{ borderColor: "var(--border-default)", borderTopColor: "var(--neutral-600)" }} />
  );
}

/* ---------- Page Head / Section Head ---------- */

export function PageHead({ title, sub, actions, trailing }: {
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

export function SectionHead({ title, sub, action, category }: {
  title: string;
  sub?: React.ReactNode;
  action?: React.ReactNode;
  category?: Category;
}) {
  const catClass = category ? `section-head-accent cat-${category}` : "";
  const accentColor = category === "student" ? "var(--student-600)"
    : category === "teacher" ? "var(--teacher-600)"
    : category === "parent" ? "var(--parent-600)"
    : category === "admin" ? "var(--admin-600)"
    : category === "institution" ? "var(--institution-600)"
    : "var(--brand-600)";
  return (
    <div className="section-head" style={{ "--section-accent": accentColor } as React.CSSProperties}>
      <div>
        <h2>{title}</h2>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {action ? <div className="spacer">{action}</div> : null}
      <span className={catClass} style={{ background: accentColor }} aria-hidden="true" />
    </div>
  );
}

/* ---------- Metric Tile (dashboard) ---------- */

export function MetricTile({
  label,
  value,
  delta,
  category,
  icon,
}: {
  label: string;
  value: string | number;
  delta?: { value: string; trend: "up" | "down" | "flat" };
  category?: Category;
  icon?: React.ReactNode;
}) {
  const catClass = category ? `tile-cat cat-${category}` : "";
  const accentColor = category === "student" ? "var(--student-600)"
    : category === "teacher" ? "var(--teacher-600)"
    : category === "parent" ? "var(--parent-600)"
    : category === "admin" ? "var(--admin-600)"
    : category === "institution" ? "var(--institution-600)"
    : "var(--brand-600)";
  const iconBg = category ? `var(--gradient-${category})` : "var(--brand-100)";
  const iconColor = category ? "white" : "var(--brand-600)";
  const tileStyle = { "--tile-accent": accentColor } as React.CSSProperties;
  const iconStyle: React.CSSProperties = { background: iconBg, color: iconColor };

  const deltaContent = delta ? (
    <div className="tile-delta">
      <span className={delta.trend === "up" ? "up" : delta.trend === "down" ? "down" : "flat"}>
        {delta.trend === "up" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width="12" height="12"><path d="m18 15-6-6-6 6"/></svg>}
        {delta.trend === "down" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width="12" height="12"><path d="m6 9 6 6 6-6"/></svg>}
        {delta.trend === "flat" && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} width="12" height="12"><path d="M5 12h14"/></svg>}
        {delta.value}
      </span>
    </div>
  ) : null;

  return (
    <div className={`tile ${catClass}`} style={tileStyle}>
      <div className="flex items-center gap-3">
        <span className="tile-icon" style={iconStyle}>
          {icon}
        </span>
        <div>
          <div className="tile-label">{label}</div>
          <div className="tile-value tnum">{value}</div>
        </div>
      </div>
      {deltaContent}
    </div>
  );
}

/* ---------- Person Card ---------- */

export function PersonCard({
  name,
  email,
  institution,
  category,
  avatarSize = "md",
  actions,
}: {
  name: string;
  email?: string;
  institution?: string;
  category?: Category;
  avatarSize?: "sm" | "md" | "lg";
  actions?: React.ReactNode;
}) {
  return (
    <div className="person-card">
      <Avatar name={name} size={avatarSize} category={category} />
      <div>
        <div className="pc-name">{name}</div>
        <div className="pc-meta">
          {email && <span>{email}</span>}
          {email && institution && <span className="dot-sep" />}
          {institution && <span>{institution}</span>}
          {!email && !institution && <span>—</span>}
        </div>
      </div>
      <div className="pc-actions">{actions}</div>
    </div>
  );
}

/* ---------- Institution Card ---------- */

export function InstitutionCard({
  name,
  code,
  city,
  region,
  country,
  status,
  stats,
  actions,
}: {
  name: string;
  code: string;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  status: string;
  stats?: { label: string; value: string | number }[];
  actions?: React.ReactNode;
}) {
  return (
    <div className="inst-card">
      <div className="ic-logo">{name.charAt(0).toUpperCase()}</div>
      <div>
        <div className="ic-name">{name}</div>
        <div className="ic-meta">
          <span className="mono">{code}</span>
          {city && <span className="dot-sep" />} {city}
          {region && <span className="dot-sep" />} {region}
          {country && <span className="dot-sep" />} {country}
          <StatusPill status={status} />
        </div>
        {stats && (
          <div className="flex gap-4 mt-2">
            {stats.map((s, i) => (
              <div key={i}>
                <div className="text-xs text-neutral-500">{s.label}</div>
                <div className="tnum font-semibold">{s.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="ic-actions">{actions}</div>
    </div>
  );
}

/* re-exports for pages */
export { IconCheckCircle, IconAlertCircle };