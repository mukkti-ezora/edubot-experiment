import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DashboardSummary } from "@/lib/types";
import { actionLabel, formatNumber, relativeFromNow } from "@/lib/format";
import { Badge, ErrorState, SkeletonRows } from "@/components/ui";

function Delta({ now, before, suffix }: { now: number; before: number; suffix: string }) {
  if (now === before) return <span className="flat">±0 {suffix}</span>;
  const diff = now - before;
  return diff > 0 ? (
    <span className="up">+{formatNumber(diff)} {suffix}</span>
  ) : (
    <span className="down">{formatNumber(diff)} {suffix}</span>
  );
}

export function Dashboard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardSummary>("/api/v1/dashboard/summary"),
    refetchInterval: 60_000,
  });

  if (isError) {
    return <ErrorState title="The dashboard couldn't load" onRetry={() => refetch()} />;
  }
  if (isLoading || !data) {
    return (
      <div>
        <div className="page-head"><h1>Dashboard</h1></div>
        <div className="stat-grid">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="stat"><div className="skeleton" style={{ height: 13, width: 90 }} /><div className="skeleton" style={{ height: 26, width: 64, marginTop: 10 }} /></div>
          ))}
        </div>
        <div className="card"><SkeletonRows rows={6} /></div>
      </div>
    );
  }

  const { institutions, users, attention, recentActivity, institutionActivity } = data;
  const active = institutions.byStatus["active"] ?? 0;
  const pending = institutions.byStatus["pending"] ?? 0;
  const suspended = institutions.byStatus["suspended"] ?? 0;
  const attentionCount =
    attention.pendingInstitutions.length +
    (attention.suspendedUsersRecently > 0 ? 1 : 0) +
    (attention.failedSigninsElevated ? 1 : 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="sub">Platform-wide view of institutions, people, and administrative activity.</p>
        </div>
        <div className="actions">
          <Link className="btn btn-secondary" to="/institutions">All institutions</Link>
          <Link className="btn btn-primary" to="/institutions?create=1">Create institution</Link>
        </div>
      </div>

      <div className="stat-grid">
        <Link to="/institutions" className="stat" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="k">Institutions</div>
          <div className="v">{formatNumber(institutions.total)}</div>
          <div className="d">
            <Delta now={institutions.newLast30Days} before={institutions.newPrior30Days} suffix="new vs prior 30d" />
          </div>
        </Link>
        <Link to="/institutions?status=active" className="stat" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="k">Active institutions</div>
          <div className="v">{formatNumber(active)}</div>
          <div className="d">{pending} pending · {suspended} suspended</div>
        </Link>
        <Link to="/users" className="stat" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="k">People</div>
          <div className="v">{formatNumber(users.total)}</div>
          <div className="d">
            <Delta now={users.newLast30Days} before={users.newPrior30Days} suffix="new vs prior 30d" />
          </div>
        </Link>
        <div className="stat">
          <div className="k">Needs attention</div>
          <div className="v">{attentionCount}</div>
          <div className="d">pending reviews, risks, and anomalies</div>
        </div>
      </div>

      <div className="dash-grid">
        <div style={{ display: "grid", gap: 14 }}>
          <section className="card" aria-labelledby="inst-activity">
            <div className="card-head">
              <h2 id="inst-activity">Institution activity — last 7 days</h2>
              <span className="meta">audit events</span>
            </div>
            <div className="card-body">
              {institutionActivity.length === 0 ? (
                <p className="meta">No activity in the last 7 days.</p>
              ) : (
                institutionActivity.map((row) => {
                  const max = institutionActivity[0]?.events ?? 1;
                  return (
                    <div key={row.institutionId} className="bar-row">
                      <Link to={`/institutions/${row.institutionId}`}>{row.institution}</Link>
                      <span className="mono-num">{formatNumber(row.events)}</span>
                      <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.round((row.events / max) * 100)}%` }} /></span>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="card" aria-labelledby="recent-activity">
            <div className="card-head">
              <h2 id="recent-activity">Recent activity</h2>
              <Link to="/activity" className="meta">All activity →</Link>
            </div>
            <div className="card-body">
              {recentActivity.length === 0 ? (
                <p className="meta">Nothing has happened yet.</p>
              ) : (
                <div className="feed">
                  {recentActivity.slice(0, 8).map((event) => (
                    <div key={event.id} className="feed-item">
                      <time dateTime={event.occurredAt}>{relativeFromNow(event.occurredAt)}</time>
                      <span className="what">
                        <b>{event.actorLabel ?? "System"}</b> · {actionLabel(event.action)}
                        {event.targetLabel ? <> → {event.targetLabel}</> : null}
                      </span>
                      {event.result !== "success" && (
                        <Badge tone={event.result === "denied" ? "warn" : "danger"}>{event.result}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="card" aria-labelledby="attention">
          <div className="card-head">
            <h2 id="attention">Needs attention</h2>
          </div>
          <div className="card-body">
            <div className="attn">
              {attention.pendingInstitutions.map((inst) => (
                <Link key={inst.id} to={`/institutions/${inst.id}`} className="attn-item" style={{ textDecoration: "none", color: "inherit" }}>
                  <span className="attn-label">Review pending institution</span>
                  <span className="attn-meta">{inst.name} · {relativeFromNow(inst.createdAt)}</span>
                </Link>
              ))}
              {attention.suspendedUsersRecently > 0 && (
                <Link to="/users?status=suspended" className="attn-item" style={{ textDecoration: "none", color: "inherit" }}>
                  <span className="attn-label">Recently suspended users</span>
                  <span className="attn-meta">{attention.suspendedUsersRecently} in 14 days</span>
                </Link>
              )}
              {attention.failedSigninsElevated && (
                <Link to="/activity?action=auth.sign_in_failed" className="attn-item urgent" style={{ textDecoration: "none", color: "inherit" }}>
                  <span className="attn-label">Elevated failed sign-ins</span>
                  <span className="attn-meta">{attention.failedSignins24h} in 24h</span>
                </Link>
              )}
              {attentionCount === 0 && (
                <p className="meta" style={{ padding: "4px 2px" }}>
                  Nothing requires attention. Pending institutions and sign-in anomalies will appear here.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
