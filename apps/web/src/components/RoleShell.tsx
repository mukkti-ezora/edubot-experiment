import { useCallback, useEffect, useId, useRef, useState, type ComponentType, type SVGProps } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import {
  IconBookOpen,
  IconCalendar,
  IconChartLine,
  IconChats,
  IconDashboard,
  IconDollar,
  IconExam,
  IconFileText,
  IconGraduationCap,
  IconHome,
  IconInbox,
  IconListChecks,
  IconLogout,
  IconMenu,
  IconMessage,
  IconTarget,
  IconUsers,
  IconWifiOff,
} from "./icons";
import { Avatar } from "./ui";
import { useWaitingCount } from "@/lib/doubts";
import { useOnline } from "@/lib/offline";
import { TutorLauncher } from "./tutor/TutorLauncher";
import { TutorPanel } from "./tutor/TutorPanel";
import { TutorProvider } from "@/lib/tutor";
import "@/styles/role-shell.css";

type Role = "student" | "teacher" | "parent";

interface RoleNavItem {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Route for implemented pages; items without one render as "Soon". */
  to?: string;
  /** Other route prefixes that belong to this item, so it stays highlighted on its detail pages. */
  owns?: string[];
  /** Shows how many students are waiting on the teacher. */
  waitingBadge?: boolean;
}

interface NavGroup {
  /** Shown as a small heading; omit for a role with a single list. */
  label?: string;
  items: RoleNavItem[];
}

const NAV_MAP: Record<Role, NavGroup[]> = {
  student: [
    {
      label: "Study",
      items: [
        { label: "Today", icon: IconHome, to: "/s" },
        { label: "Learn", icon: IconBookOpen, to: "/s/learn", owns: ["/s/lessons", "/s/topics", "/s/offline"] },
        { label: "Practice", icon: IconTarget, to: "/s/practice", owns: ["/s/assignments", "/s/attempts", "/s/review"] },
        { label: "Doubts", icon: IconChats, to: "/s/doubts" },
        { label: "Progress", icon: IconChartLine, to: "/s/progress" },
      ],
    },
    {
      label: "Campus",
      items: [
        { label: "Schedule", icon: IconCalendar, to: "/s/schedule" },
        { label: "Fees", icon: IconDollar, to: "/s/fees" },
      ],
    },
  ],
  teacher: [
    {
      items: [
        { label: "Dashboard", icon: IconDashboard, to: "/t" },
        { label: "Doubts", icon: IconChats, to: "/t/doubts", waitingBadge: true },
        { label: "Grading", icon: IconFileText, to: "/t/grading" },
        { label: "Attendance", icon: IconListChecks, to: "/t/attendance" },
        { label: "Requests", icon: IconInbox, to: "/t/requests" },
        { label: "Tests", icon: IconExam, to: "/t/tests" },
        { label: "My Classes", icon: IconBookOpen, to: "/t/classes" },
        { label: "Messages", icon: IconMessage, to: "/t/messages" },
      ],
    },
  ],
  parent: [
    {
      items: [
        { label: "Dashboard", icon: IconDashboard, to: "/p" },
        { label: "Children", icon: IconUsers, to: "/p/children" },
        { label: "Academics", icon: IconGraduationCap, to: "/p/academics" },
        { label: "Fees", icon: IconDollar, to: "/p/fees" },
        { label: "Messages", icon: IconMessage, to: "/p/messages" },
      ],
    },
  ],
};

const ROLE_LABELS: Record<Role, string> = {
  student: "Student",
  teacher: "Teacher",
  parent: "Parent",
};

export function RoleShell({ role }: { role: Role }) {
  const { me, signOut } = useAuth();
  const { resolved, setTheme, theme } = useTheme();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const cycleTheme = () => {
    const order: Array<"light" | "dark" | "system"> = ["light", "dark", "system"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
  };

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const sidebarId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    menuButton.current?.focus();
  }, []);
  // On small screens the navigation is a drawer: Escape closes it and returns to the menu button.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", onKey);
    document.getElementById(sidebarId)?.querySelector<HTMLElement>(".nav-item")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen, closeMenu, sidebarId]);

  const online = useOnline();
  const userName = me?.admin.name ?? ROLE_LABELS[role];

  const shell = (
    <div className="role-shell" data-role={role}>
      {menuOpen && (
        <button
          className="rs-backdrop"
          aria-hidden="true"
          tabIndex={-1}
          onClick={closeMenu}
        />
      )}

      <div id={sidebarId} className={`rs-sidebar${menuOpen ? " open" : ""}`}>
        <div className="rs-brand">
          <span className="rs-mark" aria-hidden="true">E</span>
          <span className="rs-wordmark">EduBot</span>
          <span className="rs-scope-tag">{ROLE_LABELS[role]}</span>
        </div>

        <nav className="rs-nav" aria-label={`${ROLE_LABELS[role]} navigation`}>
          {NAV_MAP[role].map((group, index) => (
            <NavSection key={group.label ?? index} group={group} pathname={location.pathname} />
          ))}
        </nav>

        <div className="rs-foot">
          <div className="rs-account">
            <Avatar name={userName} size="sm" category={role} />
            <span className="rs-acct-text">
              <span className="rs-acct-name truncate">{userName}</span>
              <span className="rs-acct-role truncate">{ROLE_LABELS[role]}</span>
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm rs-signout"
              onClick={() => void signOut()}
              aria-label="Sign out"
              title="Sign out"
            >
              <IconLogout />
            </button>
          </div>
        </div>
      </div>

      <div className="rs-main">
        <header className="rs-topbar">
          <button
            ref={menuButton}
            className="btn btn-ghost btn-icon btn-sm rs-menu-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
            aria-controls={sidebarId}
          >
            <IconMenu width={18} height={18} />
          </button>

          <span className="rs-topbar-title">{ROLE_LABELS[role]} Portal</span>

          <div className="spacer">
            <button
              className="theme-toggle"
              onClick={cycleTheme}
              aria-label={`Theme: ${theme}. Click to change.`}
              title={`Theme: ${theme}`}
            >
              {resolved === "dark" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              )}
            </button>
          </div>
        </header>

        {/* Always mounted, so screen readers announce the change when the connection drops. */}
        <div className={online ? undefined : "rs-offline"} role="status">
          {!online && (
            <>
              <IconWifiOff width={16} height={16} />
              <span>You're offline. Saved lessons still open; everything else needs a connection.</span>
            </>
          )}
        </div>

        <main className="rs-content">
          <Outlet />
        </main>
      </div>
      {role === "student" && (
        <>
          <TutorLauncher />
          <TutorPanel />
        </>
      )}
    </div>
  );

  return role === "student" ? <TutorProvider>{shell}</TutorProvider> : shell;
}

function NavSection({ group, pathname }: { group: NavGroup; pathname: string }) {
  const headingId = useId();
  const items = group.items.map((item) => <NavEntry key={item.label} item={item} pathname={pathname} />);
  if (!group.label) return <div className="rs-nav-group">{items}</div>;
  return (
    <div className="rs-nav-group" role="group" aria-labelledby={headingId}>
      <span className="rs-nav-heading" id={headingId}>{group.label}</span>
      {items}
    </div>
  );
}

function NavEntry({ item, pathname }: { item: RoleNavItem; pathname: string }) {
  const { label, icon: Icon, to, owns = [], waitingBadge } = item;
  if (!to) {
    return (
      <span className="nav-item disabled" aria-disabled="true">
        <Icon width={18} height={18} />
        <span className="label">{label}</span>
        <span className="rs-soon">Soon</span>
      </span>
    );
  }
  const ownsCurrent = owns.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return (
    <NavLink
      to={to}
      end={to.split("/").length <= 2}
      className={({ isActive }) => `nav-item${isActive || ownsCurrent ? " active" : ""}`}
      aria-current={ownsCurrent ? "page" : undefined}
    >
      <Icon width={18} height={18} />
      <span className="label">{label}</span>
      {waitingBadge && <WaitingBadge />}
    </NavLink>
  );
}

function WaitingBadge() {
  const { data: waiting = 0 } = useWaitingCount();
  if (!waiting) return null;
  return (
    <span className="rs-badge tnum">
      {waiting}<span className="sr-only"> waiting</span>
    </span>
  );
}
