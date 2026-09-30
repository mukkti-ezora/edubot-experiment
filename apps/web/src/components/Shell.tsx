import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: "▦", perm: "dashboard.read" },
  { to: "/institutions", label: "Institutions", icon: "⌂", perm: "institution.read" },
  { to: "/users", label: "Users", icon: "◍", perm: "user.read" },
  { to: "/administrators", label: "Administrators", icon: "⚿", perm: "admin.read" },
  { to: "/roles", label: "Roles & permissions", icon: "☰", perm: "role.read" },
  { to: "/activity", label: "Activity", icon: "≣", perm: "audit.read" },
  { to: "/settings", label: "Settings", icon: "⚙", perm: "settings.read" },
];

const TITLES: [RegExp, string][] = [
  [/^\/dashboard/, "Dashboard"],
  [/^\/institutions\/[^/]+/, "Institution"],
  [/^\/institutions/, "Institutions"],
  [/^\/users\/[^/]+/, "User"],
  [/^\/users/, "Users"],
  [/^\/administrators/, "Administrators"],
  [/^\/roles\/[^/]+/, "Role"],
  [/^\/roles/, "Roles & permissions"],
  [/^\/activity/, "Activity"],
  [/^\/settings/, "Settings"],
  [/^\/profile/, "Profile"],
];

export function Shell() {
  const { me, signOut, can } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const title = TITLES.find(([re]) => re.test(location.pathname))?.[1] ?? "EduBot";
  const menuRef = useRef<HTMLDivElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="shell">
      <aside className={`sidebar${menuOpen ? " open" : ""}`} aria-label="Primary">
        <div className="brand">
          <span className="wordmark">EduBot</span>
          <span className="tag">PLATFORM</span>
        </div>
        <nav aria-label="Sections">
          {NAV.filter((item) => can(item.perm)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            >
              <span aria-hidden="true" style={{ width: 15, textAlign: "center", fontSize: 13 }}>{item.icon}</span>
              <span className="label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="foot">
          <div className="acct" style={{ padding: "8px 10px" }}>
            <div style={{ fontWeight: 650, fontSize: 13 }}>{me?.admin.name}</div>
            <div className="meta" style={{ fontSize: 12 }}>{me?.roles.map((r) => r.name).join(", ")}</div>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            className="btn btn-quiet btn-sm menu-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
          >
            ☰
          </button>
          <div className="crumb">{title}</div>
          <div className="scope">
            <span className="mono" style={{ fontSize: 11.5 }}>Platform scope</span>
            <span className="dot" aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--ok-600)", display: "inline-block" }} />
            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                className="btn btn-quiet btn-sm"
                onClick={() => setAccountOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
              >
                {me?.admin.name ?? "Account"} ▾
              </button>
              {accountOpen && (
                <div
                  role="menu"
                  style={{
                    position: "absolute", right: 0, top: "110%", minWidth: 180, zIndex: 60,
                    background: "var(--surface)", border: "1px solid var(--line)",
                    borderRadius: "var(--r2)", boxShadow: "var(--shadow-overlay)", padding: 6,
                  }}
                >
                  <Link role="menuitem" className="nav-item" to="/profile">Profile</Link>
                  <button
                    role="menuitem"
                    className="nav-item"
                    style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                    onClick={async () => {
                      await signOut();
                      navigate("/login");
                    }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
