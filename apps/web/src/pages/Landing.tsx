import { Fragment, useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  IconActivity,
  IconBuilding,
  IconCheckCircle,
  IconKey,
  IconShieldCheck,
  IconUserPlus,
  IconUsers,
} from "@/components/icons";
import "@/styles/pages/landing.css";

/* Hero panel: an honest miniature of the console's Institutions table.
   Synthetic demo rows — the same seed names the old page used. */
const MOCK_ROWS = [
  { name: "Ashford Institute of Technology", code: "ASHF-0041", type: "Institute of Technology", place: "Portland, OR", status: "active", tone: "ok", initials: "AT" },
  { name: "Clearwater College", code: "CLWT-0118", type: "College", place: "Madison, WI", status: "active", tone: "ok", initials: "CC" },
  { name: "Meredian University", code: "MRDN-0002", type: "University", place: "Albany, NY", status: "pending", tone: "warn", initials: "MU" },
  { name: "Hillview Community College", code: "HILV-0076", type: "Community College", place: "Fresno, CA", status: "active", tone: "ok", initials: "HC" },
  { name: "Southshore Regional Academy", code: "SORM-0059", type: "Academy", place: "Mobile, AL", status: "suspended", tone: "danger", initials: "SA" },
] as const;

const TRUST = [
  "Multi-tenant by construction",
  "Audit-logged by default",
  "RBAC as policy",
];

const CAPABILITIES = [
  {
    icon: IconBuilding,
    title: "Tenant isolation as architecture",
    body: "Every institution's data is scoped on the server through a shared tenancy layer — isolation is structural, never a filter in the browser.",
  },
  {
    icon: IconUsers,
    title: "Directory of institutions and people",
    body: "A searchable, filterable registry of institutions and every student, teacher, parent, and administrator attached to them.",
  },
  {
    icon: IconUserPlus,
    title: "Administrator invitations and role assignment",
    body: "Invite administrators by email and assign roles at institution or platform scope, with a visible lifecycle from invitation to deactivation.",
  },
  {
    icon: IconKey,
    title: "Roles as composable permission sets",
    body: "Roles are built from fine-grained capability permissions — composed, inspected, and revised without code changes.",
  },
  {
    icon: IconActivity,
    title: "Immutable audit trail, including denied attempts",
    body: "Every administrative action is recorded — actor, target, timestamp, result. Denied privileged attempts are logged too. The log is append-only.",
  },
  {
    icon: IconShieldCheck,
    title: "Policy checks on every operation",
    body: "Authorization is a policy decision evaluated per request on the server, not a role name compared in the UI.",
  },
];

const ROADMAP = [
  {
    title: "Institution portals",
    body: "Dedicated surfaces for managers, teachers, students, and parents — each scoped to their own institution.",
  },
  {
    title: "Learning surfaces",
    body: "Courses, content, and assignments built on the same tenancy and audit core as the console.",
  },
  {
    title: "AI-assisted operations",
    body: "Assistance for administration and learning, grounded in institutional data and subject to the same permission model.",
  },
  {
    title: "SSO/OIDC + MFA",
    body: "Federated sign-in against institution-managed identity providers, with multi-factor authentication.",
  },
  {
    title: "Notification & email infrastructure",
    body: "Managed delivery of invitations and operational notices by email and in-product notifications.",
  },
];

function stagger(i: number): CSSProperties {
  return { "--i": i } as CSSProperties;
}

export function Landing() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className={`page-landing${mounted ? " is-mounted" : ""}`}>
      <nav className="pl-nav" aria-label="Site">
        <div className="pl-nav-inner">
          <Link to="/" className="pl-brand">
            <span className="pl-mark" aria-hidden="true">E</span>
            <span className="pl-word">EduBot</span>
          </Link>
          <div className="pl-links">
            <a href="#platform">Platform</a>
            <a href="#capabilities">Capabilities</a>
            <a href="#roadmap">Roadmap</a>
          </div>
          <div className="pl-nav-actions">
            <Link to="/login" className="btn btn-secondary btn-sm">Sign in</Link>
            <Link to="/login" className="btn btn-primary btn-sm">Open console</Link>
          </div>
        </div>
      </nav>

      <header className="pl-hero" id="platform">
        <div className="pl-hero-copy">
          <h1 className="rise" style={stagger(0)}>
            One platform for institutional management and learning.
          </h1>
          <p className="pl-lede rise" style={stagger(1)}>
            EduBot unifies institutions, people, governance, and audit behind one operating
            model — tenant-isolated by architecture, audited by default.
          </p>
          <div className="pl-cta rise" style={stagger(2)}>
            <Link to="/login" className="btn btn-primary">Open console</Link>
            <a href="#capabilities" className="btn btn-secondary">See what's available today</a>
          </div>
          <p className="pl-trust rise" style={stagger(3)}>
            {TRUST.map((item, i) => (
              <Fragment key={item}>
                {i > 0 && <span className="pl-trust-sep" aria-hidden="true">·</span>}
                <span className="pl-trust-item">
                  <IconCheckCircle width={14} height={14} />
                  {item}
                </span>
              </Fragment>
            ))}
          </p>
        </div>

        <div className="pl-artifact rise" style={stagger(4)}>
          <div
            className="console-mock"
            role="img"
            aria-label="Preview of the EduBot console: the institutions table with record codes and status pills."
          >
            <div aria-hidden="true">
              <div className="cm-head">
                <span className="cm-title">Institutions</span>
                <kbd>⌘K</kbd>
              </div>
              <div className="cm-mix">
                <div className="distbar">
                  <span style={{ width: "60%", background: "var(--ok-600)" }} />
                  <span style={{ width: "20%", background: "var(--warn-700)" }} />
                  <span style={{ width: "20%", background: "var(--danger-600)" }} />
                </div>
                <span className="cm-mixnote">3 active · 1 pending · 1 suspended</span>
              </div>
              <div>
                {MOCK_ROWS.map((row) => (
                  <div className="cm-row" key={row.code}>
                    <span className="avatar">{row.initials}</span>
                    <span className="cm-id">
                      <span className="cm-name">{row.name}</span>
                      <span className="cm-code">{row.code}</span>
                    </span>
                    <span className="cm-cell cm-type">{row.type}</span>
                    <span className="cm-cell cm-loc">{row.place}</span>
                    <span className={`badge badge-${row.tone}`}>
                      <span className="dot" />
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="cm-caption">Console preview — synthetic demo data</p>
        </div>
      </header>

      <section className="pl-section" id="capabilities">
        <div className="pl-section-inner">
          <h2 className="pl-h2">Available today</h2>
          <p className="pl-sub">
            The operational core is live — the registry, the people, the governance, and the
            record of everything that happened.
          </p>
          <div className="pl-caps">
            {CAPABILITIES.map((cap) => (
              <div className="pl-cap" key={cap.title}>
                <span className="cap-icon">
                  <cap.icon width={16} height={16} />
                </span>
                <div>
                  <h3 className="cap-title">{cap.title}</h3>
                  <p className="cap-desc">{cap.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pl-section" id="roadmap">
        <div className="pl-section-inner">
          <h2 className="pl-h2">Where EduBot is going</h2>
          <p className="pl-sub">
            The roadmap. None of this is presented as shipped — it's what the platform core is
            built to carry.
          </p>
          <div className="pl-road">
            {ROADMAP.map((item) => (
              <div className="pl-road-row" key={item.title}>
                <span className="badge badge-outline">
                  <span className="dot" aria-hidden="true" />
                  Planned
                </span>
                <div className="road-text">
                  <h3 className="road-title">{item.title}</h3>
                  <p className="road-desc">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pl-section" id="access">
        <div className="pl-section-inner pl-access-inner">
          <div>
            <h2 className="pl-h2">How administrators enter</h2>
            <ol className="pl-steps">
              <li>Receive an invitation from your platform administrator.</li>
              <li>Sign in with your issued credentials.</li>
              <li>Operate at platform scope — every action is audited.</li>
            </ol>
          </div>
          <div className="pl-mini" aria-hidden="true">
            <div className="mini-card">
              <div className="mini-brand">
                <span className="mini-mark">E</span>
              </div>
              <div className="mini-title">Sign in</div>
              <div className="mini-field">
                <span className="mini-label">Email</span>
                <input className="input" type="email" disabled placeholder="name@institution.edu" tabIndex={-1} />
              </div>
              <div className="mini-field">
                <span className="mini-label">Password</span>
                <input className="input" type="password" disabled placeholder="••••••••" tabIndex={-1} />
              </div>
              <button type="button" className="btn btn-primary w-full" disabled tabIndex={-1}>
                Sign in
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="pl-foot">
        <div className="pl-foot-inner">
          <span className="pl-foot-brand">
            <span className="pl-mark pl-mark-sm" aria-hidden="true">E</span>
            <span className="pl-word-sm">EduBot</span>
          </span>
          <span className="pl-foot-links">
            <Link to="/login">Sign in</Link>
            <span className="pl-foot-plain">Support</span>
          </span>
          <span className="pl-foot-note">EduBot demo environment — synthetic data, deterministic seed.</span>
        </div>
      </footer>
    </div>
  );
}
