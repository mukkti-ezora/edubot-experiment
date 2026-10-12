import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { actionLabel, formatDateTime } from "@/lib/format";
import { deviceLabel, durationLabel, END_REASON_LABEL, maskIp, ROLE_LABEL, type SessionRow } from "@/lib/sessions";
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, PageHead, SkeletonRows } from "@/components/ui";
import "@/styles/pages/sessions.css";

interface SessionEvent {
  id: string;
  occurredAt: string;
  action: string;
  result: "success" | "denied" | "error";
  targetLabel: string | null;
  institutionLabel: string | null;
}

const RESULT_TONE = { success: "ok", denied: "danger", error: "warn" } as const;

export function SessionDetail() {
  const { id = "" } = useParams();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [showIp, setShowIp] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["session", id],
    queryFn: () => api<SessionRow & { events: SessionEvent[] }>(`/api/v1/sessions/${id}`),
  });

  const revoke = useMutation({
    mutationFn: () => api<SessionRow>(`/api/v1/sessions/${id}/revoke`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ["session", id] });
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  if (isLoading) return <div className="page-sessions"><SkeletonRows rows={6} /></div>;
  if (isError || !data) {
    return <div className="page-sessions"><ErrorState title="This session couldn't load" onRetry={() => void refetch()} /></div>;
  }

  const person = data.name ?? data.email;
  const end = data.endedAt ?? data.lastSeenAt;

  return (
    <div className="page-sessions">
      <PageHead
        title={person}
        sub={<><Link to="/sessions">Sessions</Link> / {ROLE_LABEL[data.role] ?? data.role}, {data.institutionName ?? "Platform"}</>}
        actions={
          data.status === "active" && can("session.revoke") ? (
            <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>End session</Button>
          ) : undefined
        }
      />

      <div className="ss-grid">
        <section className="panel" aria-labelledby="session-facts">
          <div className="panel-head"><h2 id="session-facts">Session</h2></div>
          <div className="panel-body">
            <dl className="kv">
              <dt>Status</dt>
              <dd>
                <Badge tone={data.status === "active" ? "ok" : data.status === "expired" ? "warn" : "neutral"}>
                  {data.status === "active" ? "Active" : data.status === "expired" ? "Expired" : "Ended"}
                </Badge>
                {data.endReason && <span className="ss-sub ss-inline">{END_REASON_LABEL[data.endReason] ?? data.endReason}</span>}
              </dd>
              <dt>Started</dt>
              <dd>{formatDateTime(data.startedAt)}</dd>
              <dt>{data.endedAt ? "Ended" : "Last activity"}</dt>
              <dd>{formatDateTime(end)}</dd>
              <dt>Length</dt>
              <dd>{durationLabel(data.startedAt, end)}</dd>
              <dt>Device</dt>
              <dd>{deviceLabel(data.userAgent)}</dd>
              <dt>IP address</dt>
              <dd className="mono">
                {showIp ? data.ip ?? "Unknown" : maskIp(data.ip)}{" "}
                {data.ip && (
                  <button type="button" className="ss-link" onClick={() => setShowIp((v) => !v)}>
                    {showIp ? "Hide" : "Show full"}
                  </button>
                )}
              </dd>
              <dt>Email</dt>
              <dd>{data.email}</dd>
              <dt>Session ID</dt>
              <dd className="kv-id">{data.id}</dd>
            </dl>
          </div>
        </section>

        <section className="panel" aria-labelledby="session-events">
          <div className="panel-head"><h2 id="session-events">What happened</h2><div className="spacer"><span className="ss-sub">{data.events.length} recorded actions</span></div></div>
          <div className="panel-body flush">
            {data.events.length === 0 ? (
              <EmptyState title="No recorded actions" body="Reading pages is not audited; only sign-ins, changes and refused attempts appear here." />
            ) : (
              <ol className="ss-events">
                {data.events.map((e) => (
                  <li key={e.id} className="ss-event">
                    <time className="ss-time mono" dateTime={e.occurredAt}>{formatDateTime(e.occurredAt)}</time>
                    <span className="ss-what">
                      <span className="ss-name">{actionLabel(e.action)}</span>
                      {e.targetLabel && <span className="ss-sub">{e.targetLabel}</span>}
                    </span>
                    <Badge tone={RESULT_TONE[e.result]}>{e.result}</Badge>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>

      {confirming && (
        <ConfirmDialog
          title={`End ${person}'s session?`}
          body="They are signed out on this device at their next request and must sign in again. Their other sessions stay open. This is recorded in the audit trail."
          confirmLabel="End session"
          busy={revoke.isPending}
          onConfirm={() => revoke.mutate()}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
