import type { UseQueryResult } from "@tanstack/react-query";
import { formatNumber } from "@/lib/format";
import type { FeeSummaryData, StatCard } from "@/lib/roleDashboard";
import { ErrorState } from "./ui";
import "@/styles/role-dashboard.css";

/** Loading or failed state for a role dashboard page that has no data yet. */
export function DashboardPending({ query, className }: { query: UseQueryResult<unknown>; className: string }) {
  return (
    <div className={className}>
      {query.isError ? (
        <ErrorState title="Your dashboard couldn't load" onRetry={() => void query.refetch()} />
      ) : (
        <div className="rd-loading" aria-busy="true">
          <div className="skeleton rd-loading-skeleton" />
        </div>
      )}
    </div>
  );
}

export function MetricStrip({ stats }: { stats: Record<string, StatCard> }) {
  const cells = Object.values(stats);
  return (
    <div className={`rd-metric-grid rd-metric-${cells.length}`}>
      {cells.map((s) => (
        <div key={s.label} className="rd-metric-cell">
          <span className="rd-metric-value tnum">{s.value}{s.unit ?? ""}</span>
          <span className="rd-metric-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

export function FeeSummary({ fees }: { fees: FeeSummaryData }) {
  return (
    <div className="panel">
      <div className="panel-head"><h2>Fee Summary</h2></div>
      <div className="panel-body">
        <div className="rd-kv-list">
          <div className="rd-kv">
            <span className="rd-kv-label">Total</span>
            <span className="rd-kv-value tnum">${formatNumber(fees.total)}</span>
          </div>
          <div className="rd-kv">
            <span className="rd-kv-label">Paid</span>
            <span className="rd-kv-value tnum rd-kv-ok">${formatNumber(fees.paid)}</span>
          </div>
          <div className="rd-kv">
            <span className="rd-kv-label">Balance</span>
            <span className="rd-kv-value tnum rd-kv-warn">${formatNumber(fees.balance)}</span>
          </div>
          <div className="rd-kv">
            <span className="rd-kv-label">Next due</span>
            <span className="rd-kv-value">{fees.nextDue}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
