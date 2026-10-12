import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { formatDateTime, relativeFromNow } from "@/lib/format";
import { useTableState } from "@/lib/useTableState";
import { deviceLabel, maskIp, ROLE_LABEL, type SessionRow, type SessionStatus } from "@/lib/sessions";
import { DataTable, type Column } from "@/components/DataTable";
import { Badge, EmptyState, PageHead } from "@/components/ui";
import "@/styles/pages/sessions.css";

const ROLES = ["platform", "student", "teacher", "parent"] as const;
const STATUSES: SessionStatus[] = ["active", "ended", "expired"];
const STATUS_TONE: Record<SessionStatus, "ok" | "neutral" | "warn"> = { active: "ok", ended: "neutral", expired: "warn" };
const STATUS_LABEL: Record<SessionStatus, string> = { active: "Active", ended: "Ended", expired: "Expired" };

export function Sessions() {
  const table = useTableState();
  const navigate = useNavigate();
  const role = table.get("role");
  const status = table.get("status");

  const params = new URLSearchParams({ limit: "200" });
  if (role) params.set("role", role);
  if (status) params.set("status", status);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["sessions", role, status],
    queryFn: () => api<{ items: SessionRow[] }>(`/api/v1/sessions?${params}`),
    refetchInterval: 30_000,
  });
  const rows = data?.items ?? [];
  const activeCount = rows.filter((r) => r.status === "active").length;

  const columns: Column<SessionRow>[] = [
    {
      key: "person",
      label: "Person",
      render: (s) => (
        <span className="ss-person">
          <span className="ss-name">{s.name ?? s.email}</span>
          <span className="ss-sub">{s.email}</span>
        </span>
      ),
    },
    {
      key: "role",
      label: "Role",
      render: (s) => (
        <span className="ss-person">
          <span>{ROLE_LABEL[s.role] ?? s.role}</span>
          <span className="ss-sub">{s.institutionName ?? "Platform"}</span>
        </span>
      ),
    },
    { key: "device", label: "Device", render: (s) => <span className="ss-person"><span>{deviceLabel(s.userAgent)}</span><span className="ss-sub mono">{maskIp(s.ip)}</span></span> },
    { key: "started", label: "Started", render: (s) => <span title={formatDateTime(s.startedAt)}>{relativeFromNow(s.startedAt)}</span> },
    { key: "seen", label: "Last activity", render: (s) => <span title={formatDateTime(s.lastSeenAt)}>{relativeFromNow(s.endedAt ?? s.lastSeenAt)}</span> },
    { key: "status", label: "Status", render: (s) => <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge> },
  ];

  return (
    <div className="page-sessions">
      <PageHead
        title="Sessions"
        sub={data ? `${activeCount} active now. Every sign-in, for every role, with what happened in it.` : "Every sign-in, for every role."}
      />

      <div className="filterbar" role="search">
        <div className="ss-chips" role="group" aria-label="Filter by role">
          {ROLES.map((r) => (
            <button key={r} type="button" className="fchip" data-active={role === r} aria-pressed={role === r}
              onClick={() => table.set({ role: role === r ? null : r })}>
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        <span className="fb-div" aria-hidden="true" />
        <div className="ss-chips" role="group" aria-label="Filter by status">
          {STATUSES.map((st) => (
            <button key={st} type="button" className="fchip" data-active={status === st} aria-pressed={status === st}
              onClick={() => table.set({ status: status === st ? null : st })}>
              {STATUS_LABEL[st]}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        keyOf={(s) => s.id}
        loading={isLoading}
        error={isError}
        onRetry={() => void refetch()}
        sort={null}
        onSort={() => undefined}
        onRowClick={(s) => navigate(`/sessions/${s.id}`)}
        empty={<EmptyState title="No sessions match" body="Nobody has signed in with these filters yet. Clear a filter to see more." />}
        nextCursor={null}
        onNext={() => undefined}
        onPrev={() => undefined}
        pageIndex={0}
        countLabel={`${rows.length} sessions`}
      />
    </div>
  );
}
