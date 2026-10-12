import { useEffect, useId, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Play } from "@phosphor-icons/react";

const W = 640;
const H = 320;
const MAX_SPEED = 30;
const PAD = 28;

interface Props {
  speed?: number;
  angle?: number;
  gravity?: number;
}

/** Launch simulator: horizontal and vertical motion joined only by time. */
export function ProjectileSim({ speed: initialSpeed = 20, angle: initialAngle = 45, gravity = 9.8 }: Props) {
  const [speed, setSpeed] = useState(initialSpeed);
  const [angle, setAngle] = useState(initialAngle);
  const [progress, setProgress] = useState(1);
  const reduceMotion = useReducedMotion();
  const frame = useRef<number>();
  const ids = { speed: useId(), angle: useId() };

  const rad = (angle * Math.PI) / 180;
  const vx = speed * Math.cos(rad);
  const vy = speed * Math.sin(rad);
  const flight = (2 * vy) / gravity;
  const range = vx * flight;
  const peak = (vy * vy) / (2 * gravity);
  // Fixed scale (sized for the fastest launch) so changes stay comparable between runs.
  const maxRange = (MAX_SPEED * MAX_SPEED) / gravity;
  const maxPeak = (MAX_SPEED * MAX_SPEED * Math.sin((85 * Math.PI) / 180) ** 2) / (2 * gravity);
  const scale = Math.min((W - 2 * PAD) / maxRange, (H - 2 * PAD) / maxPeak);

  const point = (t: number) => ({
    x: PAD + vx * t * scale,
    y: H - PAD - (vy * t - 0.5 * gravity * t * t) * scale,
  });
  const samples = Array.from({ length: 61 }, (_, i) => point((flight * i) / 60));
  const path = samples.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const ball = point(flight * progress);

  const settle = () => {
    cancelAnimationFrame(frame.current ?? 0);
    setProgress(1);
  };
  const launch = () => {
    cancelAnimationFrame(frame.current ?? 0);
    const started = performance.now();
    const duration = 1400;
    const tick = (now: number) => {
      const p = Math.min(1, (now - started) / duration);
      setProgress(p);
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };
    setProgress(0);
    frame.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(frame.current ?? 0), []);

  return (
    <div className="anim">
      <svg className="anim-stage" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Projectile at ${speed} metres per second and ${angle} degrees`}>
        <line className="anim-ground" x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} />
        <path className="anim-path" d={path} pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1 - progress }} />
        <line className="anim-guide" x1={PAD} y1={H - PAD - peak * scale} x2={PAD + (range / 2) * scale} y2={H - PAD - peak * scale} />
        <circle className="anim-ball" cx={ball.x} cy={ball.y} r={7} />
      </svg>
      <div className="anim-controls">
        <label htmlFor={ids.speed}>Speed <output>{speed} m/s</output></label>
        <input id={ids.speed} type="range" min={5} max={MAX_SPEED} value={speed} onChange={(e) => { setSpeed(+e.target.value); settle(); }} />
        <label htmlFor={ids.angle}>Angle <output>{angle}°</output></label>
        <input id={ids.angle} type="range" min={5} max={85} value={angle} onChange={(e) => { setAngle(+e.target.value); settle(); }} />
        {!reduceMotion && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={launch}><Play size={14} weight="fill" aria-hidden="true" /> Launch</button>
        )}
      </div>
      <p className="anim-readout">
        Flight time <strong>{flight.toFixed(2)} s</strong>, peak height <strong>{peak.toFixed(1)} m</strong>, range <strong>{range.toFixed(1)} m</strong>
      </p>
    </div>
  );
}
