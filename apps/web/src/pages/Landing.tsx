import { Link } from "react-router-dom";

const REGISTRY_ROWS: [string, string, string, string][] = [
  ["ASHF-0041", "Ashford Institute of Technology", "ACTIVE", "st-a"],
  ["CLWT-0118", "Clearwater College", "ACTIVE", "st-a"],
  ["MRDN-0002", "Meredian University", "PENDING", "st-p"],
  ["HILV-0076", "Hillview Community College", "ACTIVE", "st-a"],
  ["SORM-0059", "Southshore Regional Academy", "SUSPENDED", "st-s"],
  ["KRPT-0207", "Kestrel Ridge Polytechnic", "ACTIVE", "st-a"],
];

export function Landing() {
  return (
    <div className="landing">
      <nav aria-label="Site">
        <span className="wordmark">EduBot</span>
        <div className="links">
          <a href="#platform">Platform</a>
          <a href="#vision">Vision</a>
          <Link to="/login" className="btn btn-primary btn-sm" style={{ color: "#fff" }}>
            Admin login
          </Link>
        </div>
      </nav>

      <header className="hero">
        <div>
          <h1>One platform for institutional management and learning.</h1>
          <p className="lede">
            EduBot gives educational institutions a single system of record — administration,
            access control, and auditability today; learning and AI assistance tomorrow.
          </p>
          <div className="cta-row">
            <Link to="/login" className="btn btn-primary" style={{ color: "#fff" }}>
              Admin login
            </Link>
            <a href="#platform" className="btn btn-secondary">
              What the platform does
            </a>
          </div>
        </div>
        <div className="registry" aria-label="Illustration: the EduBot institution registry">
          <div className="r-head">
            <span>INSTITUTION REGISTRY</span>
            <span>PAGE 1</span>
          </div>
          {REGISTRY_ROWS.map(([code, name, status, cls]) => (
            <div className="r-row" key={code}>
              <span>{code}</span>
              <span>{name}</span>
              <span className={cls}>{status}</span>
              <span>›</span>
            </div>
          ))}
        </div>
      </header>

      <section className="block" id="platform">
        <div className="block-inner">
          <h2 className="sect">The platform today</h2>
          <p className="sect-sub">
            What's live right now — the operational core every institution depends on.
          </p>
          <div className="split">
            <div className="panel">
              <h3>Platform administration</h3>
              <ul>
                <li><span><b>Multi-institution registry.</b> Onboard, inspect, suspend, and reactivate institutions with complete status history.</span></li>
                <li><span><b>Platform-wide user registry.</b> Every student, teacher, parent, and administrator — searchable and filterable across tenants.</span></li>
                <li><span><b>Role-based access control.</b> Composable roles from capability permissions, assigned to administrators with review.</span></li>
              </ul>
            </div>
            <div className="panel">
              <h3>Trust operations</h3>
              <ul>
                <li><span><b>Complete audit trail.</b> Every administrative action recorded: who, what, which record, when, result.</span></li>
                <li><span><b>Tenant isolation by construction.</b> Institution data is siloed on the server — never filtered in the browser.</span></li>
                <li><span><b>Attention queue.</b> Pending institutions and anomalous sign-in activity surface before they become incidents.</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="block" id="vision">
        <div className="block-inner">
          <h2 className="sect">Where EduBot is going</h2>
          <p className="sect-sub">
            The roadmap. None of this is presented as shipped — it's what the platform core is built to carry.
          </p>
          <div className="split">
            <div className="panel future">
              <h3>Learning operations</h3>
              <ul>
                <li><span>Courses, content, assignments, assessment, and grading in one LMS.</span></li>
                <li><span>Portals for students, parents, and instructors — each scoped to their institution.</span></li>
                <li><span>Academic analytics and progress tracking.</span></li>
              </ul>
            </div>
            <div className="panel future">
              <h3>AI-assisted learning</h3>
              <ul>
                <li><span>AI tutor with explanations, diagrams, and study plans.</span></li>
                <li><span>Teacher assistance for content and feedback.</span></li>
                <li><span>Personalized learning paths grounded in institutional data.</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <footer className="page">
        <span className="wordmark" style={{ fontSize: 15 }}>EduBot</span>
        <span>© {new Date().getFullYear()} EduBot. All activity is logged.</span>
        <span style={{ marginLeft: "auto" }}>
          <Link to="/login">Admin login →</Link>
        </span>
      </footer>
    </div>
  );
}
