import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, qs } from "@/lib/api";
import type { AuditEvent, Institution, Page } from "@/lib/types";
import { actionLabel, formatDateTime, formatNumber, relativeFromNow } from "@/lib/format";
import { DataTable, type Column } from "@/components/DataTable";
import { Badge, EmptyState, ErrorState } from "@/components/ui";
import { useTableState } from "@/lib/useTableState";

export function Activity() {
  const table = useTableState();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<AuditEvent | null>(null);

  const query = table.get("query");
  const action = table.get("action");
  const result = table.get("result");
  const institutionId = table.get("institutionId");
  const actorId = table.get("actorId");

  const { data: institutions } = useQuery({
    queryKey: ["institutions", "options"],
    queryFn: () => api<Page<Institution>>("/api/v1/institutions?limit=100&sort=name"),
    staleTime: 120_000,
  });
  const { data: actions } = useQuery({
    queryKey: ["activity-actions"],
    queryFn: () => api<string[]>("/api/v1/activity/actions"),
    staleTime: 60_000,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["activity", query, action, result, institutionId, actorId, table.cursor],
    queryFn: () =>
      api<Page<AuditEvent>>(
        `/api/v1/activity${qs({
          query: query || undefined,
          action: action || undefined,
          result: result || undefined,
          institutionId: institutionId || undefined,
          actorId: actorId || undefined,
          cursor: table.cursor ?? undefined,
        })}`,
      ),
    placeholderData: (previous) => previous,
    refetchInterval: 45_000,
  });

  const columns: Column<AuditEvent>[] = [
    {
      key: "when",
      label: "When",
      width: "150px",
      render: (row) => <span className="meta nowrap" title={formatDateTime(row.occurredAt)}>{relativeFromNow(row.occurredAt)}</span>,
    },
    {
      key: "actor",
      label: "Actor",
      render: (row) => (
        <div>
          <div className="cell-main">{row.actorLabel ?? "System"}</div>
          <div className="cell-sub">{row.actorType}</div>
        </div>
      ),
    },
    {
      key: "action",
      label: "Action",
      render: (row) => (
        <div>
          <div className="cell-main">{actionLabel(row.action)}</div>
          <div className="cell-sub mono">{row.action}</div>
        </div>
      ),
    },
    {
      key: "target",
      label: "Target",
      render: (row) => <span>{row.targetLabel ?? "—"}</span>,
    },
    {
      key: "institution",
      label: "Institution",
      render: (row) => <span className="meta">{row.institutionLabel ?? "—"}</span>,
    },
    {
      key: "result",
      label: "Result",
      width: "110px",
      render: (row) => (
        <Badge tone={row.result === "success" ? "ok" : row.result === "denied" ? "warn" : "danger"}>
          {row.result}
        </Badge>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <p className="sub">The platform audit trail: who did what, to what, when, and how it ended. Records are permanent.</p>
        </div>
      </div>

      <div className="filters" role="search">
        <input
          className="input search"
          placeholder="Search actor, action, target…"
          defaultValue={query}
          aria-label="Search activity"
          onChange={(e) => table.set({ query: e.target.value || null })}
        />
        <select className="select" aria-label="Filter by action" value={action} onChange={(e) => table.set({ action: e.target.value || null })}>
          <option value="">All actions</option>
          {(actions ?? []).map((a) => (
            <option key={a} value={a}>{actionLabel(a)}</option>
          ))}
        </select>
        <select className="select" aria-label="Filter by institution" value={institutionId} onChange={(e) => table.set({ institutionId: e.target.value || null })}>
          <option value="">All institutions</option>
          {institutions?.items.map((inst) => (
            <option key={inst.id} value={inst.id}>{inst.name}</option>
          ))}
        </select>
        <select className="select" aria-label="Filter by result" value={result} onChange={(e) => table.set({ result: e.target.value || null })}>
          <option value="">All results</option>
          <option value="success">Success</option>
          <option value="denied">Denied</option>
          <option value="error">Error</option>
        </select>
        {actorId && (
          <span className="badge badge-info">
            One actor
            <button className="btn-quiet btn-sm" style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => table.set({ actorId: null })}>×</button>
          </span>
        )}
        {(query || action || result || institutionId) && (
          <button className="btn btn-quiet btn-sm" onClick={() => table.set({ query: null, action: null, result: null, institutionId: null })}>
            Clear filters
          </button>
        )}
      </div>

      {isError ? (
        <ErrorState title="The activity log couldn't load" onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          keyOf={(row) => row.id}
          loading={isLoading}
          error={false}
          onRetry={() => refetch()}
          sort={null}
          onSort={() => {}}
          onRowClick={(row) => setDetail(row)}
          empty={
            <EmptyState
              title="No events match"
              body="Activity accumulates as people use the platform. Denied actions are recorded too."
            />
          }
          nextCursor={data?.nextCursor ?? null}
          onNext={() => table.onNext(data?.nextCursor ?? null)}
          onPrev={table.onPrev}
          pageIndex={table.pageIndex}
          countLabel={data ? `${formatNumber(data.items.length)} shown this page` : ""}
        />
      )}

      {detail && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Event detail">
            <h2>{actionLabel(detail.action)}</h2>
            <div className="body">
              <dl className="kv" style={{ marginTop: 8 }}>
                <dt>When</dt><dd>{formatDateTime(detail.occurredAt)}</dd>
                <dt>Actor</dt><dd>{detail.actorLabel ?? "System"} ({detail.actorType})</dd>
                <dt>Action</dt><dd><code>{detail.action}</code></dd>
                <dt>Result</dt><dd><Badge tone={detail.result === "success" ? "ok" : detail.result === "denied" ? "warn" : "danger"}>{detail.result}</Badge></dd>
                <dt>Target</dt><dd>{detail.targetLabel ?? "—"}</dd>
                <dt>Institution</dt><dd>{detail.institutionLabel ?? "—"}</dd>
                <dt>Request</dt><dd className="mono" style={{ fontSize: 11.5 }}>{detail.requestId ?? "—"}</dd>
                <dt>Source</dt><dd className="meta">{detail.ip ?? "—"} · {detail.userAgent ? detail.userAgent.slice(0, 40) + "…" : "—"}</dd>
              </dl>
              {detail.diff && Object.keys(detail.diff).length > 0 && (
                <pre className="mono" style={{ marginTop: 14, padding: 12, background: "var(--surface-2)", borderRadius: 4, fontSize: 11.5, overflowX: "auto" }}>
                  {JSON.stringify(detail.diff, null, 2)}
                </pre>
              )}
            </div>
            <footer>
              <button className="btn btn-secondary" onClick={() => setDetail(null)}>Close</button>
              {detail.institutionId && (
                <button
                  className="btn btn-quiet"
                  onClick={() => {
                    setDetail(null);
                    navigate(`/institutions/${detail.institutionId}`);
                  }}
                >
                  Open institution →
                </button>
              )}
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
