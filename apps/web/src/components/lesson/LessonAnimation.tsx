import { z } from "zod";
import type { Animation } from "@/lib/student";
import "@/styles/lesson-anim.css";
import { DerivativeExplorer } from "./DerivativeExplorer";
import { LoopStepper } from "./LoopStepper";
import { ProjectileSim } from "./ProjectileSim";

const projectile = z.object({ speed: z.number().positive().optional(), angle: z.number().gt(0).lt(90).optional(), gravity: z.number().positive().optional() });
const derivative = z.object({ x: z.number().optional() });
const loop = z.object({
  code: z.array(z.string()).min(1),
  steps: z.array(z.object({ line: z.number().int().nonnegative(), vars: z.record(z.union([z.string(), z.number()])), output: z.string().optional() })).min(1),
});

function renderAnimation({ kind, params }: Animation) {
  if (kind === "projectile") {
    const p = projectile.safeParse(params);
    return p.success ? <ProjectileSim {...p.data} /> : null;
  }
  if (kind === "derivative") {
    const p = derivative.safeParse(params);
    return p.success ? <DerivativeExplorer {...p.data} /> : null;
  }
  if (kind === "loop") {
    const p = loop.safeParse(params);
    return p.success ? <LoopStepper {...p.data} /> : null;
  }
  return null;
}

/** Renders a lesson's interactive animation with its caption and full text description; falls back to the text if the data is invalid. */
export function LessonAnimation({ animation }: { animation: Animation }) {
  const interactive = renderAnimation(animation);
  return (
    <figure className="lesson-anim">
      {interactive ?? <p className="anim-fallback">This animation couldn't load. Here is what it shows:</p>}
      <figcaption>
        <span>{animation.caption}</span>
        {interactive ? (
          <details>
            <summary>Text description</summary>
            <p>{animation.alt}</p>
          </details>
        ) : <p>{animation.alt}</p>}
      </figcaption>
    </figure>
  );
}
