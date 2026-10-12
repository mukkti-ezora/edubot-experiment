import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Link } from "react-router-dom";
import { ArrowRight, List, Moon, Sun, X } from "@phosphor-icons/react";
import { useTheme } from "@/lib/theme";
import { DEMO_SCALE } from "@/lib/landingDemo";
import { LiveConsole } from "./landing/LiveConsole";
import { HeroNetwork } from "./landing/HeroNetwork";
import { AuditSection, PermissionsSection, PortalsSection, TenancySection } from "./landing/Sections";
import "@/styles/pages/landing.css";

const NAV_LINKS = [
  { href: "#portals", label: "Portals" },
  { href: "#isolation", label: "Isolation" },
  { href: "#permissions", label: "Permissions" },
  { href: "#audit", label: "Audit" },
];

gsap.registerPlugin(ScrollTrigger);

const formatCount = (n: number) => n.toLocaleString("en-US");

const SCALE_SENTENCE = `The live demo runs ${DEMO_SCALE.institutions} institutions and ${formatCount(DEMO_SCALE.people)} people, from ${formatCount(DEMO_SCALE.students)} students to ${DEMO_SCALE.administrators} administrators, on synthetic data you can explore end to end.`;

/** Scroll-scrubbed motion only: everything is readable before and without it. */
function useScrollInteractions(root: React.RefObject<HTMLDivElement>) {
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          ".lp-hero-product .lp-app",
          { rotateX: 14, scale: 0.94, y: 24 },
          {
            rotateX: 0, scale: 1, y: 0, ease: "none",
            scrollTrigger: { trigger: ".lp-hero-product", start: "top 85%", end: "top 25%", scrub: 0.6 },
          },
        );

        gsap.fromTo(
          ".lp-scale-word",
          { color: "var(--lp-line-strong)" },
          {
            color: "var(--lp-ink)", ease: "none", stagger: 0.1,
            scrollTrigger: { trigger: ".lp-scale", start: "top 80%", end: "bottom 45%", scrub: true },
          },
        );

        gsap.utils.toArray<HTMLElement>(".lp-portal").forEach((row) => {
          ScrollTrigger.create({ trigger: row, start: "top 55%", end: "bottom 45%", toggleClass: "is-active" });
        });
      });
    }, root);
    return () => ctx.revert();
  }, [root]);
}

export function Landing() {
  const { resolved, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useScrollInteractions(root);

  useEffect(() => {
    const sentinel = document.getElementById("lp-top");
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => setTheme(resolved === "dark" ? "light" : "dark");

  return (
    <div className="lp" ref={root}>
      <a className="lp-skip" href="#main">Skip to content</a>
      <span id="lp-top" className="lp-top-sentinel" aria-hidden="true" />

      <header className={`lp-nav${scrolled ? " is-scrolled" : ""}`}>
        <div className="lp-nav-inner">
          <Link to="/" className="lp-brand" aria-label="EduBot home">
            <span className="lp-mark" aria-hidden="true">E</span>
            EduBot
          </Link>

          <nav className={`lp-nav-links${menuOpen ? " is-open" : ""}`} aria-label="Main">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>
                {l.label}
              </a>
            ))}
            <Link to="/login" className="lp-nav-signin-mobile">Sign in</Link>
          </nav>

          <div className="lp-nav-actions">
            <button
              type="button"
              className="lp-icon-btn"
              onClick={toggleTheme}
              aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {resolved === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            </button>
            <Link to="/login" className="lp-nav-signin">Sign in</Link>
            <Link to="/login" className="lp-btn lp-btn-primary lp-btn-sm">Explore the demo</Link>
            <button
              type="button"
              className="lp-icon-btn lp-menu-btn"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X size={20} aria-hidden="true" /> : <List size={20} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-hero-top">
          <div className="lp-hero-copy">
            <h1 id="hero-title" className="lp-h1">
              One platform for every institution you run.
            </h1>
            <p className="lp-hero-sub">
              Institutions, people, permissions and an audit trail in one console, with portals for students, teachers and parents.
            </p>
            <div className="lp-hero-actions">
              <Link to="/login" className="lp-btn lp-btn-primary">
                Explore the demo <ArrowRight size={18} weight="bold" aria-hidden="true" />
              </Link>
              <Link to="/login" className="lp-btn lp-btn-secondary">Sign in</Link>
            </div>
          </div>
          <div className="lp-hero-visual">
            <HeroNetwork />
          </div>
          </div>
          <div className="lp-hero-product">
            <LiveConsole />
          </div>
        </section>

        <p className="lp-scale" aria-label={SCALE_SENTENCE}>
          {SCALE_SENTENCE.split(" ").map((word, i) => (
            <span key={i} className="lp-scale-word" aria-hidden="true">{word} </span>
          ))}
        </p>

        <PortalsSection />
        <TenancySection />
        <PermissionsSection />
        <AuditSection />

        <section className="lp-close" aria-labelledby="close-title">
          <h2 id="close-title" className="lp-h2">See your institution in EduBot.</h2>
          <p className="lp-lead">
            Sign in to the demo as an administrator, student, teacher or parent. Nothing to install.
          </p>
          <div className="lp-hero-actions lp-center-row">
            <Link to="/login" className="lp-btn lp-btn-primary">
              Explore the demo <ArrowRight size={18} weight="bold" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <span className="lp-brand lp-brand-sm">
            <span className="lp-mark" aria-hidden="true">E</span>
            EduBot
          </span>
          <nav className="lp-footer-links" aria-label="Footer">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}>{l.label}</a>
            ))}
            <Link to="/login">Sign in</Link>
          </nav>
          <p className="lp-footer-note">Demo environment. All names and figures are synthetic.</p>
        </div>
      </footer>
    </div>
  );
}
