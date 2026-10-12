import { useState } from "react";
import { ArrowCounterClockwise, CaretLeft, CaretRight } from "@phosphor-icons/react";

interface Step {
  line: number;
  vars: Record<string, string | number>;
  output?: string;
}

/** Step through code one line at a time and watch each variable change. */
export function LoopStepper({ code, steps }: { code: string[]; steps: Step[] }) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  if (!step) return null;
  const output = steps.slice(0, index + 1).map((s) => s.output).filter(Boolean);

  return (
    <div className="anim anim-loop">
      <ol className="anim-code" aria-label="Program">
        {code.map((line, i) => (
          <li key={i} className={i === step.line ? "is-current" : undefined} aria-current={i === step.line ? "step" : undefined}>
            <code>{line}</code>
          </li>
        ))}
      </ol>
      <div className="anim-state">
        <table className="anim-vars" aria-label="Variables">
          <tbody>
            {Object.entries(step.vars).map(([name, value]) => (
              <tr key={name}><th scope="row"><code>{name}</code></th><td className="tnum">{value}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="anim-output" role="log" aria-label="Output">{output.length ? output.join("\n") : " "}</div>
      </div>
      <div className="anim-controls">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
          <CaretLeft size={14} aria-hidden="true" /> Back
        </button>
        <span className="anim-step tnum" aria-live="polite">Step {index + 1} of {steps.length}</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))} disabled={index === steps.length - 1}>
          Next line <CaretRight size={14} aria-hidden="true" />
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIndex(0)} aria-label="Start again">
          <ArrowCounterClockwise size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
