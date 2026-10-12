import type { CSSProperties } from "react";
import "@/styles/subject-bars.css";

export type Trend = "up" | "down" | "flat";

export interface SubjectBarEntry {
  name: string;
  score: number;
  grade: string;
  trend?: Trend;
}

/** Score bands for the bar fill; the grade and percentage carry the same meaning as text. */
const STRONG_SCORE = 80;
const PASSING_SCORE = 65;

export function scoreTone(score: number): "success" | "warning" | "danger" {
  if (score >= STRONG_SCORE) return "success";
  if (score >= PASSING_SCORE) return "warning";
  return "danger";
}

const TREND_LABEL: Record<Trend, string> = { up: "Improving", down: "Declining", flat: "Steady" };
const TREND_PATH: Record<Trend, string> = { up: "m18 15-6-6-6 6", down: "m6 9 6 6 6-6", flat: "M5 12h14" };

function TrendArrow({ trend }: { trend: Trend }) {
  return (
    <svg
      className={`sb-trend sb-trend-${trend}`}
      role="img"
      aria-label={TREND_LABEL[trend]}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      width="12"
      height="12"
    >
      <path d={TREND_PATH[trend]} />
    </svg>
  );
}

export function SubjectBars({ subjects }: { subjects: SubjectBarEntry[] }) {
  if (subjects.length === 0) {
    return (
      <div className="sb-empty">
        <span className="sb-empty-text">No subject data</span>
      </div>
    );
  }

  return (
    <div className="sb-list">
      {subjects.map((s) => {
        const fill: CSSProperties & Record<`--${string}`, string> = {
          "--sb-fill-w": `${Math.min(100, Math.max(0, s.score))}%`,
          "--sb-fill-color": `var(--${scoreTone(s.score)}-500)`,
        };
        return (
          <div key={s.name} className="sb-item">
            <div className="sb-row">
              <span className="sb-name">{s.name}</span>
              <span className="sb-grade-badge">{s.grade}</span>
              <span className="sb-score tnum">{s.score}%</span>
              {s.trend && <TrendArrow trend={s.trend} />}
            </div>
            <div
              className="sb-bar-track"
              role="meter"
              aria-label={`${s.name} score`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={s.score}
            >
              <div className="sb-bar-fill" style={fill} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
