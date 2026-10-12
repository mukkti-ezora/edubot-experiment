import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CommandPalette, useCommandState } from "./CommandPalette";
import {
  IconDashboard,
  IconGraduationCap,
  IconBookOpen,
  IconHeart,
  IconShieldCheck,
  IconBuilding,
  IconKey,
  IconActivity,
  IconClock,
  IconSettings,
  IconSearch,
  IconChevronUpDown,
  IconMenu,
  IconLogout,
} from "./icons";
import { Avatar, Menu, MenuItem, MenuLabel, MenuSep } from "./ui";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactElement;
  perm: string;
  type?: string;
}

const NAV_GROUPS: { group: string; cat: string; items: NavItem[] }[] = [
  {
    group: "Overview",
    cat: "overview",
    items: [{ to: "/dashboard", label: "Dashboard", icon: <IconDashboard />, perm: "dashboard.read" }],
  },
  {
    group: "People",
    cat: "people",
    items: [
      { to: "/students", label: "Students", icon: <IconGraduationCap />, perm: "user.read", type: "student" },
      { to: "/teachers", label: "Teachers", icon: <IconBookOpen />, perm: "user.read", type: "teacher" },
      { to: "/parents", label: "Parents", icon: <IconHeart />, perm: "user.read", type: "parent" },
    ],
  },
  {
    group: "Platform",
    cat: "platform",
    items: [
      { to: "/institutions", label: "Institutions", icon: <IconBuilding />, perm: "institution.read" },
      { to: "/administrators", label: "Administrators", icon: <IconShieldCheck />, perm: "admin.read" },
    ],
  },
  {
    group: "Control",
    cat: "control",
    items: [
      { to: "/roles", label: "Roles & Permissions", icon: <IconKey />, perm: "role.read" },
      { to: "/activity", label: "Activity", icon: <IconActivity />, perm: "audit.read" },
      { to: "/sessions", label: "Sessions", icon: <IconClock />, perm: "session.read" },
    ],
  },
  {
    group: "System",
    cat: "system",
    items: [{ to: "/settings", label: "Settings", icon: <IconSettings />, perm: "settings.read" }],
  },
];

const CRUMBS: [RegExp, string, string][] = [
  [/^\/dashboard/, "Overview", "Dashboard"],
  [/^\/students\/[^/]+/, "Students", "Student details"],
  [/^\/students/, "Students", "All students"],
  [/^\/teachers\/[^/]+/, "Teachers", "Teacher details"],
  [/^\/teachers/, "Teachers", "All teachers"],
  [/^\/parents\/[^/]+/, "Parents", "Parent details"],
  [/^\/parents/, "Parents", "All parents"],
  [/^\/institutions\/[^/]+/, "Institutions", "Institution details"],
  [/^\/institutions/, "Institutions", "All institutions"],
  [/^\/administrators\/[^/]+/, "Administrators", "Administrator details"],
  [/^\/administrators/, "Administrators", "All administrators"],
  [/^\/roles\/[^/]+/, "Roles & Permissions", "Role details"],
  [/^\/roles/, "Roles & Permissions", "All roles"],
  [/^\/activity/, "Activity", "Audit trail"],
  [/^\/sessions\/[^/]+/, "Sessions", "Session details"],
  [/^\/sessions/, "Sessions", "Sign-in sessions"],
  [/^\/settings/, "Settings", "Platform settings"],
  [/^\/profile/, "Profile", "Your profile"],
];

export function Shell() {
  const { me, signOut, can } = useAuth();
  const { resolved, setTheme, theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const cmdk = useCommandState();

  const cycleTheme = () => {
    const order: Array<"light" | "dark" | "system"> = ["light", "dark", "system"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
  };

  // Fetch summary for nav counts
  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => api<any>("/api/v1/dashboard/summary"),
    enabled: !!me,
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const crumb = CRUMBS.find(([re]) => re.test(location.pathname));
  const sectionTo = crumb ? `/${crumb[1].toLowerCase().split(" ")[0].replace("&", "")}` : "/dashboard";
  const isTopLevel = crumb ? crumb[2].startsWith("All") || /^\/(dashboard|activity|settings|profile)/.test(location.pathname) : true;

  return (
    <div className="shell">
      {menuOpen && <button className="side-backdrop" aria-hidden="true" tabIndex={-1} onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar${menuOpen ? " open" : ""}`} aria-label="Primary">
        <div className="side-brand">
          <span className="mark" aria-hidden="true">E</span>
          <span className="wordmark">EduBot</span>
          <span className="scope-tag">Platform</span>
        </div>

        {NAV_GROUPS.map((section) => {
          const items = section.items.filter((item) => can(item.perm));
          if (items.length === 0) return null;
          return (
            <div className="side-section" key={section.group}>
              <div className="side-group-label">{section.group}</div>
              <nav className="side-nav" aria-label={section.group}>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
                    data-cat={item.type ?? section.cat}
                  >
                    {item.icon}
                    <span className="label">{item.label}</span>
                    {item.type && summary && (
                      <span className="count-pill tnum">
                        {summary.users?.byType?.[item.type] ?? 0}
                      </span>
                    )}
                    {item.to === "/administrators" && summary && (
                      <span className="count-pill tnum">
                        {summary.users?.byType?.administrator ?? 0}
                      </span>
                    )}
                    {item.to === "/institutions" && summary && (
                      <span className="count-pill tnum">
                        {summary.institutions?.total ?? 0}
                      </span>
                    )}
                  </NavLink>
                ))}
              </nav>
            </div>
          );
        })}

        <div className="side-foot">
          <Menu
            align="left"
            width={240}
            trigger={
              <button className="side-account" aria-haspopup="menu">
                <Avatar name={me?.admin.name ?? "?"} size="sm" category="brand" />
                <span className="acct-text min-w-0">
                  <span className="acct-name truncate" style={{ display: "block" }}>{me?.admin.name}</span>
                  <span className="acct-role truncate" style={{ display: "block" }}>
                    {me?.roles.map((r) => r.name).join(", ") || "—"}
                  </span>
                </span>
                <IconChevronUpDown className="chev" />
              </button>
            }
          >
            <MenuLabel>Signed in as {me?.admin.email}</MenuLabel>
            <MenuItem icon={<IconKey />} onSelect={() => navigate("/profile")}>
              Profile
            </MenuItem>
            <MenuSep />
            <MenuItem
              icon={<IconLogout />}
              onSelect={async () => {
                await signOut();
                navigate("/login");
              }}
            >
              Sign out
            </MenuItem>
          </Menu>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            className="btn btn-ghost btn-icon btn-sm menu-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
          >
            <IconMenu />
          </button>

          <nav className="crumbs" aria-label="Breadcrumb">
            {crumb && !isTopLevel ? (
              <>
                <Link to={sectionTo}>{crumb[1]}</Link>
                <span className="sep" aria-hidden="true">/</span>
                <span className="current">{crumb[2]}</span>
              </>
            ) : (
              <span className="current">{crumb?.[1] ?? "EduBot"}</span>
            )}
          </nav>

          <div className="spacer">
            <button className="cmdk-trigger" onClick={() => cmdk.setOpen(true)} aria-keyshortcuts="meta+k ctrl+k">
              <IconSearch />
              <span className="cmdk-label">Search or jump to…</span>
              <kbd>⌘K</kbd>
            </button>
            <button
              className="theme-toggle"
              onClick={cycleTheme}
              aria-label={`Theme: ${theme}. Click to change.`}
              title={`Theme: ${theme}`}
            >
              {resolved === "dark" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              )}
            </button>
            <span className="scope-chip" title="You are operating at platform scope">
              <span className="dot" aria-hidden="true" />
              Platform
            </span>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={cmdk.open} onClose={() => cmdk.setOpen(false)} />
    </div>
  );
}