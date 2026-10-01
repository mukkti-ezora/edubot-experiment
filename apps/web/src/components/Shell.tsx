import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { CommandPalette, useCommandState } from "./CommandPalette";
import {
  IconActivity,
  IconBuilding,
  IconChevronUpDown,
  IconDashboard,
  IconKey,
  IconLogout,
  IconMenu,
  IconSearch,
  IconSettings,
  IconShieldCheck,
  IconUser,
  IconUsers,
} from "./icons";
import { Avatar, Menu, MenuItem, MenuLabel, MenuSep } from "./ui";

const NAV: {
  group: string;
  items: { to: string; label: string; icon: React.ReactNode; perm: string }[];
}[] = [
  {
    group: "Overview",
    items: [{ to: "/dashboard", label: "Dashboard", icon: <IconDashboard />, perm: "dashboard.read" }],
  },
  {
    group: "Directory",
    items: [
      { to: "/institutions", label: "Institutions", icon: <IconBuilding />, perm: "institution.read" },
      { to: "/users", label: "Users", icon: <IconUsers />, perm: "user.read" },
      { to: "/administrators", label: "Administrators", icon: <IconShieldCheck />, perm: "admin.read" },
    ],
  },
  {
    group: "Governance",
    items: [
      { to: "/roles", label: "Roles & permissions", icon: <IconKey />, perm: "role.read" },
      { to: "/activity", label: "Activity", icon: <IconActivity />, perm: "audit.read" },
    ],
  },
  {
    group: "System",
    items: [{ to: "/settings", label: "Settings", icon: <IconSettings />, perm: "settings.read" }],
  },
];

const CRUMBS: [RegExp, string, string][] = [
  [/^\/dashboard/, "Overview", "Dashboard"],
  [/^\/institutions\/[^/]+/, "Institutions", "Institution details"],
  [/^\/institutions/, "Institutions", "All institutions"],
  [/^\/users\/[^/]+/, "Users", "User details"],
  [/^\/users/, "Users", "All users"],
  [/^\/administrators\/[^/]+/, "Administrators", "Administrator details"],
  [/^\/administrators/, "Administrators", "All administrators"],
  [/^\/roles\/[^/]+/, "Roles & permissions", "Role details"],
  [/^\/roles/, "Roles & permissions", "All roles"],
  [/^\/activity/, "Activity", "Audit trail"],
  [/^\/settings/, "Settings", "Platform settings"],
  [/^\/profile/, "Profile", "Your profile"],
];

export function Shell() {
  const { me, signOut, can } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const cmdk = useCommandState();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const crumb = CRUMBS.find(([re]) => re.test(location.pathname));
  const sectionTo = crumb ? `/${crumb[1].split(" ")[0].toLowerCase().replace("&", "")}` : "/dashboard";
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

        {NAV.map((section) => {
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
                  >
                    {item.icon}
                    <span className="label">{item.label}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          );
        })}

        <div className="side-foot">
          <Menu
            align="left"
            width={230}
            trigger={
              <button className="side-account" aria-haspopup="menu">
                <Avatar name={me?.admin.name ?? "?"} size="sm" dark />
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
            <MenuItem icon={<IconUser />} onSelect={() => navigate("/profile")}>
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
