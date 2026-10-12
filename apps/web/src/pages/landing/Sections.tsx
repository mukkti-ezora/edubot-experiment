import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Check,
  ChalkboardTeacher,
  Minus,
  ShieldCheck,
  ShieldWarning,
  Student,
  UserCircleGear,
  UsersThree,
  type Icon,
} from "@phosphor-icons/react";
import { DEMO_AUDIT, PERMISSION_DOMAINS, SYSTEM_ROLES, type DemoAuditEvent } from "@/lib/landingDemo";

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* ── Four portals ─────────────────────────────────────── */

const PORTALS: { role: string; icon: Icon; sees: string; detail: string }[] = [
  {
    role: "Administrators",
    icon: UserCircleGear,
    sees: "Every institution, person, role and audit event on the platform.",
    detail: "Create and suspend institutions, compose roles from capabilities, review who did what.",
  },
  {
    role: "Students",
    icon: Student,
    sees: "Today's timetable, grades by subject, assignments and fees.",
    detail: "Only their own record. Nothing about classmates, ever.",
  },
  {
    role: "Teachers",
    icon: ChalkboardTeacher,
    sees: "Their classes, today's periods, attendance and work to grade.",
    detail: "Scoped to the classes they teach at their institution.",
  },
  {
    role: "Parents",
    icon: UsersThree,
    sees: "Each child's schedule, academic health, homework and fees.",
    detail: "One sign-in, every linked child, switched in a click.",
  },
];

export function PortalsSection() {
  return (
    <section className="lp-section lp-portals" id="portals" aria-labelledby="portals-title">
      <div className="lp-portals-intro">
        <h2 id="portals-title" className="lp-h2">A workspace for everyone in the institution.</h2>
        <p className="lp-lead">
          One record underneath, four portals on top. Each person signs in to exactly what their role allows.
        </p>
      </div>
      <ul className="lp-portal-list">
        {PORTALS.map(({ role, icon: PortalIcon, sees, detail }) => (
          <li key={role} className="lp-portal">
            <PortalIcon size={28} weight="duotone" className="lp-portal-icon" aria-hidden="true" />
            <div>
              <h3 className="lp-h3">{role}</h3>
              <p className="lp-portal-sees">{sees}</p>
              <p className="lp-portal-detail">{detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Tenancy ──────────────────────────────────────────── */

type Viewer = "platform" | "ashford" | "hillview";

const VIEWERS: { id: Viewer; label: string }[] = [
  { id: "platform", label: "Platform admin" },
  { id: "ashford", label: "Ashford staff" },
  { id: "hillview", label: "Hillview staff" },
];

const SCHOOLS: { id: Exclude<Viewer, "platform">; name: string; email: string }[] = [
  { id: "ashford", name: "Ashford Institute of Technology", email: "priya.nair@ashf.example.edu" },
  { id: "hillview", name: "Hillview Community College", email: "priya.nair@hilv.example.edu" },
];

export function TenancySection() {
  const [viewer, setViewer] = useState<Viewer>("ashford");
  const visible = (school: Exclude<Viewer, "platform">) => viewer === "platform" || viewer === school;
  const resultCount = SCHOOLS.filter((s) => visible(s.id)).length;

  return (
    <section className="lp-section lp-tenancy" id="isolation" aria-labelledby="tenancy-title">
      <h2 id="tenancy-title" className="lp-h2 lp-center">Same name. Two institutions. No crossover.</h2>
      <p className="lp-lead lp-center">
        The demo seeds the same student name at several institutions on purpose. Here are two of them. Search as each viewer and see what the platform lets them reach.
      </p>

      <div className="lp-segment" role="radiogroup" aria-label="Search as">
        {VIEWERS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={viewer === v.id}
            className="lp-segment-btn"
            onClick={() => setViewer(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="lp-search">
        <div className="lp-search-bar">
          <span className="lp-search-query">Search people: <strong>Priya Nair</strong></span>
          <span className="lp-search-count" aria-live="polite">
            {resultCount} {resultCount === 1 ? "result" : "results"}
          </span>
        </div>
        <div className="lp-search-results">
          {SCHOOLS.map((school) => {
            const shown = visible(school.id);
            return (
              <div key={school.id} className={`lp-record${shown ? "" : " is-hidden"}`} aria-hidden={!shown}>
                <span className="lp-record-avatar" aria-hidden="true">PN</span>
                <span className="lp-record-main">
                  <span className="lp-record-name">Priya Nair</span>
                  <span className="lp-record-meta">{school.name}</span>
                </span>
                <code className="lp-record-email">{school.email}</code>
                {!shown && (
                  <span className="lp-record-wall">
                    <ShieldCheck size={16} weight="fill" aria-hidden="true" /> Outside this institution
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="lp-footnote lp-center">
        Isolation is enforced where data is read, not by hiding rows in the interface. Demo data.
      </p>
    </section>
  );
}

/* ── Permissions ──────────────────────────────────────── */

export function PermissionsSection() {
  const [roleName, setRoleName] = useState(SYSTEM_ROLES[2].name);
  const role = SYSTEM_ROLES.find((r) => r.name === roleName)!;
  const total = PERMISSION_DOMAINS.reduce((n, d) => n + d.keys.length, 0);

  return (
    <section className="lp-section lp-perms" id="permissions" aria-labelledby="perms-title">
      <div className="lp-perms-head">
        <h2 id="perms-title" className="lp-h2">Permissions are capabilities, not job titles.</h2>
        <p className="lp-lead">
          Roles are built from {total} precise capabilities. Pick a role to see exactly what it can do.
        </p>
      </div>

      <div className="lp-perms-body">
        <div className="lp-role-list" role="radiogroup" aria-label="Role">
          {SYSTEM_ROLES.map((r) => (
            <button
              key={r.name}
              type="button"
              role="radio"
              aria-checked={r.name === roleName}
              className="lp-role"
              onClick={() => setRoleName(r.name)}
            >
              <span className="lp-role-name">{r.name}</span>
              <span className="lp-role-summary">{r.summary}</span>
              <span className="lp-role-count">
                {r.grants.length} of {total}
              </span>
            </button>
          ))}
        </div>

        <div className="lp-matrix" aria-live="polite">
          {PERMISSION_DOMAINS.map((domain) => (
            <div key={domain.domain} className="lp-matrix-row">
              <span className="lp-matrix-domain">{domain.domain}</span>
              <span className="lp-matrix-keys">
                {domain.keys.map((key) => {
                  const granted = role.grants.includes(key);
                  return (
                    <span key={key} className={`lp-cap${granted ? " is-granted" : ""}`}>
                      {granted ? (
                        <Check size={12} weight="bold" aria-hidden="true" />
                      ) : (
                        <Minus size={12} weight="bold" aria-hidden="true" />
                      )}
                      <code>{key}</code>
                      <span className="lp-sr">{granted ? "granted" : "not granted"}</span>
                    </span>
                  );
                })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Audit ────────────────────────────────────────────── */

const AUDIT_VISIBLE = 5;
const AUDIT_TICK_MS = 3200;

function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.2 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, inView] as const;
}

export function AuditSection() {
  const reduceMotion = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>();
  const [paused, setPaused] = useState(false);
  const [head, setHead] = useState(0);

  useEffect(() => {
    if (reduceMotion || !inView || paused) return;
    const timer = window.setInterval(() => setHead((h) => (h + 1) % DEMO_AUDIT.length), AUDIT_TICK_MS);
    return () => window.clearInterval(timer);
  }, [reduceMotion, inView, paused]);

  const events: DemoAuditEvent[] = Array.from(
    { length: AUDIT_VISIBLE },
    (_, i) => DEMO_AUDIT[(head - i + DEMO_AUDIT.length * 2) % DEMO_AUDIT.length],
  );

  return (
    <section className="lp-section lp-audit" id="audit" aria-labelledby="audit-title">
      <div className="lp-audit-copy">
        <h2 id="audit-title" className="lp-h2">Every action is on the record.</h2>
        <p className="lp-lead">
          Each change, and each attempt that policy refused, becomes a permanent audit event. There is no delete button, by design.
        </p>
        <dl className="lp-facts">
          <div>
            <dt>Who, what, where</dt>
            <dd>Actor, action, target, institution and result on every event.</dd>
          </div>
          <div>
            <dt>Denials included</dt>
            <dd>Refused attempts are recorded, so reviews see intent, not only outcomes.</dd>
          </div>
          <div>
            <dt>Append-only</dt>
            <dd>Events can be filtered and exported, never edited.</dd>
          </div>
        </dl>
      </div>

      <div
        ref={ref}
        className="lp-stream"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
      >
        <div className="lp-stream-head">
          <span>Activity</span>
          <span className="lp-demo-tag">Demo data</span>
        </div>
        <ol className="lp-stream-list">
          <AnimatePresence initial={false}>
            {events.map((event) => (
              <motion.li
                key={event.id}
                layout={!reduceMotion}
                initial={reduceMotion ? false : { opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0 }}
                transition={{ duration: 0.45, ease: EASE_OUT }}
                className="lp-event"
              >
                <span className={`lp-event-icon is-${event.result}`} aria-hidden="true">
                  {event.result === "denied" ? <ShieldWarning size={16} weight="fill" /> : <Check size={16} weight="bold" />}
                </span>
                <span className="lp-event-body">
                  <span className="lp-event-line">
                    <strong>{event.actor}</strong> {event.action.toLowerCase()} <em>{event.target}</em>
                  </span>
                  <span className="lp-event-meta">{event.scope}</span>
                </span>
                <span className={`lp-event-result is-${event.result}`}>
                  {event.result === "denied" ? "Denied" : "Success"}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </div>
    </section>
  );
}
