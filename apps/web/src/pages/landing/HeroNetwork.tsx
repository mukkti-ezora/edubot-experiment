import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { DEMO_NETWORK, NETWORK_EVENTS, type InstitutionStatus } from "@/lib/landingDemo";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const SIZE = 520;
const CENTER = SIZE / 2;
const INNER = { radius: 118, count: 6 };
const OUTER = { radius: 214, count: 12 };
const PULSE_EVERY_S = 1.5;

interface Node {
  code: string;
  short: string;
  status: InstitutionStatus;
  x: number;
  y: number;
  ring: "inner" | "outer";
}

function place(): Node[] {
  const ring = (start: number, { radius, count }: typeof INNER, name: Node["ring"], offset: number) =>
    DEMO_NETWORK.slice(start, start + count).map((inst, i) => {
      const angle = offset + (i / count) * Math.PI * 2;
      return { ...inst, ring: name, x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
    });
  return [...ring(0, INNER, "inner", -Math.PI / 2), ...ring(INNER.count, OUTER, "outer", -Math.PI / 2 + Math.PI / 12)];
}

const NODES = place();

/**
 * The hero's right-hand visual: all 18 demo institutions orbiting the EduBot hub, coloured by
 * their real status, with audited actions travelling to the platform. Static under reduced motion.
 */
export function HeroNetwork() {
  const root = useRef<HTMLDivElement>(null);
  const [caption, setCaption] = useState({ code: "ASHF", short: "Ashford", event: NETWORK_EVENTS[0] });

  useGSAP(
    (_, contextSafe) => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const intro = gsap.timeline({ defaults: { ease: "expo.out" } });
        intro
          .from(".hn-ring", { scale: 0.6, opacity: 0, transformOrigin: "50% 50%", duration: 1.4, stagger: 0.12 })
          .from(".hn-spoke", { opacity: 0, duration: 0.8, stagger: 0.02 }, 0.3)
          .from(".hn-node", { scale: 0, transformOrigin: "50% 50%", duration: 0.9, stagger: { each: 0.035, from: "random" } }, 0.35)
          .from(".hn-hub", { scale: 0.4, opacity: 0, transformOrigin: "50% 50%", duration: 1.1, ease: "back.out(1.6)" }, 0.2);

        const drift = gsap.to(".hn-orbit-outer", { rotation: 360, svgOrigin: `${CENTER} ${CENTER}`, duration: 160, ease: "none", repeat: -1 });
        const driftInner = gsap.to(".hn-orbit-inner", { rotation: -360, svgOrigin: `${CENTER} ${CENTER}`, duration: 110, ease: "none", repeat: -1 });
        // Labels counter-rotate against their orbit so codes stay readable.
        const counter = (sel: string, turn: string, duration: number) =>
          gsap.to(sel, { rotation: turn, transformOrigin: "50% 50%", duration, ease: "none", repeat: -1 });
        const keepUpright = [counter(".hn-orbit-outer .hn-label", "-=360", 160), counter(".hn-orbit-inner .hn-label", "+=360", 110)];

        const pulse = contextSafe!(() => {
          const node = NODES[Math.floor(Math.random() * NODES.length)];
          const event = NETWORK_EVENTS[Math.floor(Math.random() * NETWORK_EVENTS.length)];
          const svg = root.current?.querySelector("svg");
          const dot = root.current?.querySelector<SVGCircleElement>(".hn-pulse");
          const nodeEl = root.current?.querySelector<SVGGElement>(`[data-code="${node.code}"] .hn-node`);
          if (!svg || !dot || !nodeEl) return;
          const box = nodeEl.getBBox();
          const matrix = nodeEl.getCTM();
          const svgMatrix = svg.getCTM();
          if (!matrix || !svgMatrix) return;
          const point = svg.createSVGPoint();
          point.x = box.x + box.width / 2;
          point.y = box.y + box.height / 2;
          const at = point.matrixTransform(svgMatrix.inverse().multiply(matrix));

          setCaption({ code: node.code, short: node.short, event });
          gsap.timeline()
            .set(dot, { attr: { cx: at.x, cy: at.y }, opacity: 1, scale: 1 })
            .fromTo(nodeEl, { scale: 1 }, { scale: 1.6, duration: 0.25, yoyo: true, repeat: 1, transformOrigin: "50% 50%", ease: "power2.out" }, 0)
            .to(dot, { attr: { cx: CENTER, cy: CENTER }, duration: 0.9, ease: "power2.inOut" }, 0.1)
            .to(dot, { opacity: 0, duration: 0.2 }, 0.9)
            .fromTo(".hn-hub-ring", { scale: 1, opacity: 0.6 }, { scale: 1.5, opacity: 0, transformOrigin: "50% 50%", duration: 0.8, ease: "expo.out" }, 0.95);
        });

        const loop = gsap.timeline({ repeat: -1, delay: 1.4 }).call(pulse).to({}, { duration: PULSE_EVERY_S });

        ScrollTrigger.create({
          trigger: root.current,
          start: "top bottom",
          end: "bottom top",
          onToggle: ({ isActive }) => [loop, drift, driftInner, ...keepUpright].forEach((t) => (isActive ? t.resume() : t.pause())),
        });
      });
    },
    { scope: root },
  );

  return (
    <div className="hn" ref={root}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`EduBot connects ${DEMO_NETWORK.length} demo institutions: active, pending review and suspended.`}
      >
        <circle className="hn-ring" cx={CENTER} cy={CENTER} r={INNER.radius} />
        <circle className="hn-ring" cx={CENTER} cy={CENTER} r={OUTER.radius} />

        {(["inner", "outer"] as const).map((ring) => (
          <g key={ring} className={`hn-orbit-${ring}`}>
            {NODES.filter((n) => n.ring === ring).map((n) => (
              <g key={n.code} data-code={n.code}>
                <line className="hn-spoke" x1={CENTER} y1={CENTER} x2={n.x} y2={n.y} />
                <circle className={`hn-node is-${n.status}`} cx={n.x} cy={n.y} r={ring === "inner" ? 7 : 6} />
                <text className="hn-label" x={n.x} y={n.y + 20} textAnchor="middle">
                  {n.code}
                </text>
              </g>
            ))}
          </g>
        ))}

        <circle className="hn-pulse" r={4} cx={CENTER} cy={CENTER} opacity={0} />
        <g className="hn-hub">
          <circle className="hn-hub-ring" cx={CENTER} cy={CENTER} r={38} />
          <rect className="hn-hub-core" x={CENTER - 30} y={CENTER - 30} width={60} height={60} rx={14} />
          <text className="hn-hub-mark" x={CENTER} y={CENTER + 10} textAnchor="middle">E</text>
        </g>
      </svg>

      <div className="hn-caption" aria-hidden="true">
        <code>{caption.code}</code>
        <span>{caption.short}</span>
        <span className="hn-caption-event">{caption.event}</span>
      </div>

      <ul className="hn-legend">
        <li><span className="hn-key is-active" aria-hidden="true" /> Active</li>
        <li><span className="hn-key is-pending" aria-hidden="true" /> Pending review</li>
        <li><span className="hn-key is-suspended" aria-hidden="true" /> Suspended</li>
        <li className="hn-legend-demo">Demo data</li>
      </ul>
    </div>
  );
}
