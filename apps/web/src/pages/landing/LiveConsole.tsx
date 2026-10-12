import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Buildings,
  CalendarBlank,
  CheckCircle,
  Clock,
  Prohibit,
  ChalkboardTeacher,
  ClockCounterClockwise,
  GraduationCap,
  HouseLine,
  ShieldCheck,
  SquaresFour,
  UsersThree,
  type Icon,
} from "@phosphor-icons/react";
import { MetricStrip } from "@/components/RoleDashboard";
import { Timetable } from "@/components/Timetable";
import { SubjectBars } from "@/components/SubjectBars";
import { ChildSwitcher } from "@/components/ChildSwitcher";
import {
  ADMIN_STATS,
  CHILD_SUBJECTS,
  DEMO_CHILDREN,
  DEMO_INSTITUTIONS,
  STUDENT_DAY,
  STUDENT_STATS,
  TEACHER_DAY,
  TEACHER_STATS,
  type InstitutionStatus,
} from "@/lib/landingDemo";

type View = "administrator" | "student" | "teacher" | "parent";

interface ViewSpec {
  id: View;
  label: string;
  person: { name: string; role: string };
  nav: { label: string; icon: Icon }[];
}

const VIEWS: ViewSpec[] = [
  {
    id: "administrator",
    label: "Admin",
    person: { name: "Marisol Vance", role: "Platform Owner" },
    nav: [
      { label: "Dashboard", icon: SquaresFour },
      { label: "Institutions", icon: Buildings },
      { label: "People", icon: UsersThree },
      { label: "Roles", icon: ShieldCheck },
      { label: "Activity", icon: ClockCounterClockwise },
    ],
  },
  {
    id: "student",
    label: "Student",
    person: { name: "Ingrid Abiodun", role: "Student, Ashford Institute" },
    nav: [
      { label: "Dashboard", icon: SquaresFour },
      { label: "Schedule", icon: CalendarBlank },
      { label: "Grades", icon: GraduationCap },
    ],
  },
  {
    id: "teacher",
    label: "Teacher",
    person: { name: "Leila Abiodun", role: "Teacher, Science" },
    nav: [
      { label: "Dashboard", icon: SquaresFour },
      { label: "My classes", icon: ChalkboardTeacher },
      { label: "Attendance", icon: UsersThree },
    ],
  },
  {
    id: "parent",
    label: "Parent",
    person: { name: "Adaeze Abiodun", role: "Parent of 2" },
    nav: [
      { label: "Dashboard", icon: SquaresFour },
      { label: "Children", icon: HouseLine },
      { label: "Academics", icon: GraduationCap },
    ],
  },
];

const ROTATE_MS = 6500;
const STATUS_LABEL: Record<InstitutionStatus, string> = { active: "Active", pending: "Pending review", suspended: "Suspended" };
const STATUS_TONE: Record<InstitutionStatus, string> = { active: "ok", pending: "warn", suspended: "danger" };
const STATUS_ICON: Record<InstitutionStatus, Icon> = { active: CheckCircle, pending: Clock, suspended: Prohibit };

/**
 * The hero: EduBot's own dashboard components rendered with labelled demo data.
 * Cycles through the four portals until the visitor picks one; never under reduced motion.
 */
export function LiveConsole() {
  const reduceMotion = useReducedMotion();
  const [view, setView] = useState<View>("administrator");
  const [autoplay, setAutoplay] = useState(!reduceMotion);
  const [paused, setPaused] = useState(false);
  const tabsId = useId();

  useEffect(() => {
    if (!autoplay || paused) return;
    const timer = window.setTimeout(() => {
      const next = VIEWS[(VIEWS.findIndex((v) => v.id === view) + 1) % VIEWS.length];
      setView(next.id);
    }, ROTATE_MS);
    return () => window.clearTimeout(timer);
  }, [view, autoplay, paused]);

  const choose = (id: View) => {
    setAutoplay(false);
    setView(id);
  };

  const spec = VIEWS.find((v) => v.id === view)!;

  return (
    <div
      className="lp-app"
      data-role={view === "administrator" ? undefined : view}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="lp-app-bar">
        <span className="lp-app-brand">
          <span className="lp-mark" aria-hidden="true">E</span>
          EduBot
        </span>
        <div className="lp-app-tabs" role="tablist" aria-label="Portal shown in the demo">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              id={`${tabsId}-${v.id}`}
              aria-selected={v.id === view}
              aria-controls={`${tabsId}-panel`}
              className="lp-app-tab"
              onClick={() => choose(v.id)}
            >
              {v.id === view && (
                <motion.span layoutId={`${tabsId}-pill`} className="lp-app-tab-pill" transition={{ type: "spring", stiffness: 420, damping: 36 }} />
              )}
              <span className="lp-app-tab-label">{v.label}</span>
            </button>
          ))}
        </div>
        <span className="lp-demo-tag">Demo data</span>
      </div>

      <div className="lp-app-body">
        <nav className="lp-app-nav" aria-label={`${spec.label} navigation (demo)`}>
          {spec.nav.map(({ label, icon: NavIcon }, i) => (
            <span key={label} className={`lp-app-nav-item${i === 0 ? " is-active" : ""}`}>
              <NavIcon size={16} weight={i === 0 ? "fill" : "regular"} aria-hidden="true" />
              {label}
            </span>
          ))}
          <span className="lp-app-person">
            <strong>{spec.person.name}</strong>
            {spec.person.role}
          </span>
        </nav>

        <div
          className="lp-app-main"
          role="tabpanel"
          id={`${tabsId}-panel`}
          aria-labelledby={`${tabsId}-${view}`}
          aria-live="polite"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view}
              initial={reduceMotion ? false : { opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6, filter: "blur(4px)" }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            >
              <PortalView view={view} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {autoplay && !reduceMotion && (
        <div className="lp-app-progress" aria-hidden="true">
          <span key={view} className={`lp-app-progress-fill${paused ? " is-paused" : ""}`} style={{ animationDuration: `${ROTATE_MS}ms` }} />
        </div>
      )}
    </div>
  );
}

function StatusGlyph({ status }: { status: InstitutionStatus }) {
  const Glyph = STATUS_ICON[status];
  return <Glyph size={14} weight="fill" aria-hidden="true" />;
}

function PortalView({ view }: { view: View }) {
  const [child, setChild] = useState(DEMO_CHILDREN[0].id);

  switch (view) {
    case "administrator":
      return (
        <>
          <h3 className="lp-app-title">Good morning, Marisol</h3>
          <MetricStrip stats={ADMIN_STATS} />
          <table className="lp-app-table">
            <caption className="lp-sr">Institutions (demo data)</caption>
            <thead>
              <tr>
                <th scope="col">Institution</th>
                <th scope="col" className="lp-num">Students</th>
                <th scope="col" className="lp-num">Teachers</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_INSTITUTIONS.map((inst) => (
                <tr key={inst.code}>
                  <td>
                    <span className="lp-inst-name">{inst.name}</span>
                    <span className="lp-inst-meta">
                      <code>{inst.code}</code> <span className="lp-inst-city">{inst.city}</span>
                    </span>
                  </td>
                  <td className="lp-num">{inst.students}</td>
                  <td className="lp-num">{inst.teachers}</td>
                  <td>
                    <span className={`badge badge-${STATUS_TONE[inst.status]}`}>
                      <StatusGlyph status={inst.status} />
                      <span className="lp-status-label">{STATUS_LABEL[inst.status]}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      );
    case "student":
      return (
        <>
          <h3 className="lp-app-title">Ingrid's Thursday</h3>
          <MetricStrip stats={STUDENT_STATS} />
          <Timetable entries={STUDENT_DAY} showTeacher />
        </>
      );
    case "teacher":
      return (
        <>
          <h3 className="lp-app-title">Good morning, Leila</h3>
          <MetricStrip stats={TEACHER_STATS} />
          <Timetable entries={TEACHER_DAY} showTeacher={false} />
        </>
      );
    case "parent":
      return (
        <>
          <h3 className="lp-app-title">Academic health</h3>
          <ChildSwitcher options={DEMO_CHILDREN} activeId={child} onChange={setChild} />
          <SubjectBars subjects={CHILD_SUBJECTS[child]} />
        </>
      );
  }
}
