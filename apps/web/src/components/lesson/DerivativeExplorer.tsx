import { useId, useState } from "react";

const W = 560;
const H = 280;
const X_MIN = -3;
const X_MAX = 3;
const Y_MIN = -1;
const Y_MAX = 9;

const toX = (x: number) => ((x - X_MIN) / (X_MAX - X_MIN)) * W;
const toY = (y: number) => H - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * H;
const f = (x: number) => x * x;
const fPrime = (x: number) => 2 * x;

/** f(x) = x²: move the point and read the tangent's slope, which is the derivative 2x. */
export function DerivativeExplorer({ x: initialX = 1 }: { x?: number }) {
  const [x, setX] = useState(initialX);
  const id = useId();
  const curve = Array.from({ length: 121 }, (_, i) => X_MIN + ((X_MAX - X_MIN) * i) / 120)
    .map((v, i) => `${i ? "L" : "M"}${toX(v).toFixed(1)},${toY(f(v)).toFixed(1)}`)
    .join(" ");
  const slope = fPrime(x);
  const span = 1.4;
  const tangent = [x - span, x + span].map((v) => ({ X: toX(v), Y: toY(f(x) + slope * (v - x)) }));

  return (
    <div className="anim">
      <svg className="anim-stage" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Tangent to y equals x squared at x = ${x.toFixed(1)}, slope ${slope.toFixed(1)}`}>
        <line className="anim-axis" x1={0} y1={toY(0)} x2={W} y2={toY(0)} />
        <line className="anim-axis" x1={toX(0)} y1={0} x2={toX(0)} y2={H} />
        <path className="anim-curve" d={curve} />
        <line className="anim-tangent" x1={tangent[0].X} y1={tangent[0].Y} x2={tangent[1].X} y2={tangent[1].Y} />
        <circle className="anim-ball" cx={toX(x)} cy={toY(f(x))} r={7} />
      </svg>
      <div className="anim-controls">
        <label htmlFor={id}>Point <output>x = {x.toFixed(1)}</output></label>
        <input id={id} type="range" min={-2.5} max={2.5} step={0.1} value={x} onChange={(e) => setX(+e.target.value)} />
      </div>
      <p className="anim-readout">
        f({x.toFixed(1)}) = <strong>{f(x).toFixed(2)}</strong>, slope of the tangent f′({x.toFixed(1)}) = <strong>{slope.toFixed(1)}</strong>
      </p>
    </div>
  );
}
