import { CheckCircle, Circle, ClockCountdown, PaperPlaneTilt, PencilSimpleLine, XCircle, type Icon } from "@phosphor-icons/react";
import type { AssignmentStatus } from "@/lib/coursework";
import { formatScore } from "@/lib/format";
import "@/styles/pages/coursework.css";

const STATUS: Record<AssignmentStatus, { icon: Icon; label: string; tone: string }> = {
  not_started: { icon: Circle, label: "Not started", tone: "neutral" },
  draft: { icon: PencilSimpleLine, label: "Draft saved", tone: "neutral" },
  submitted: { icon: PaperPlaneTilt, label: "Handed in", tone: "brand" },
  late: { icon: ClockCountdown, label: "Handed in late", tone: "warn" },
  graded: { icon: CheckCircle, label: "Graded", tone: "ok" },
  missing: { icon: XCircle, label: "Missing", tone: "danger" },
};

/** Where an assignment stands, as icon plus words; graded work also shows its score. */
export function AssignmentStatusChip({ status, score, points }: {
  status: AssignmentStatus;
  score?: number | null;
  points?: number;
}) {
  const meta = STATUS[status];
  const showScore = status === "graded" && score != null && points != null;
  return (
    <span className={`cw-status tone-${meta.tone}`}>
      <meta.icon size={14} weight={status === "not_started" ? "regular" : "fill"} aria-hidden="true" />
      {meta.label}
      {showScore && <span className="cw-status-score tnum">{formatScore(score)}/{points}</span>}
    </span>
  );
}

