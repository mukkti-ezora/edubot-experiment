import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DashboardSummary } from "@/lib/types";
import { actionLabel, formatNumber, relativeFromNow } from "@/lib/format";
import { Badge, EmptyState, ErrorState, PageHead, Skeleton, SkeletonRows } from "@/components/ui";
import {
  IconActivity,
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconBan,
  IconCheckCircle,
  IconLock,
  IconPencil,
  IconPlus,
  IconSettings,
  IconShield,
} from "@/components/icons";
import "@/styles/pages/dashboard.css";

function Delta({ now, before }: { now: number; before: number }) {
  const diff = now - before;
  if (diff === 0) return <span className="delta delta-flat">±0</span>;
  return diff > 0 ? (
    <span className="delta delta-up">
      <IconArrowUp />+{formatNumber(diff)}
    </span>
  ) : (
    <span className="delta delta-down">
      <IconArrowDown />
      {formatNumber(diff)}
    </span>
  );
}

function actionIcon(action: string) {
  if (action.startsWith("auth.")) return <IconLock />;
  if (action.startsWith("authz.")) return <IconShield />;
  if (action.includes("suspend") || action.includes("deactivate") || action.includes("disable")) return <IconBan />;
  if (action.includes("create")) return <IconPlus />;
  if (action.includes("update")) return <IconPencil />;
  if (action.startsWith("settings")) return <IconSettings />;
  return <IconActivity />;
}

const STATUS_SEGMENTS = [
  { key: "active", label: "Active", color: "var(--ok-600)" },
  { key: "pending", label: "Pending", color: "var(--warn-700)" },
  { key: "suspended", label: "Suspended", color: "var(--danger-600)" },
];

function todayLabel(): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function DashboardLoading() {
  return (
    <>
      <div className="card metric-strip" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div className="metric" key={i}>
            <Skeleton w={96} />
            <Skeleton w={72} h={26} />
            <Skeleton w={120} h={12} />
          </div>
        ))}
      </div>
      <div className="band" aria-hidden="true">
        <section className="card">
          <div className="card-head"><Skeleton w={170} /></div>
          <div className="card-body"><SkeletonRows rows={7} /></div>
        </section>
        <section className="card">
          <div className="card-head"><Skeleton w={140} /></div>
          <div className="card-body"><SkeletonRows rows={7} /></div>
        </section>
      </div>
      <section className="card" aria-hidden="true">
        <div className="card-head"><Skeleton w={200} /></div>
        <div className="card-body"><SkeletonRows rows={8} /></div>
      </section>
    </>
  );
}

export function Dashboard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardSummary>("/api/v1/dashboard/summary"),
    refetchInterval: 60_000,
  });

  const head = (
    <PageHead
      title="Dashboard"
      sub={`Platform overview · ${todayLabel()}`}
      actions={
        <Link to="/activity" className="btn btn-ghost">
          View activity
        </Link>
      }
    />
  );

  if (isError) {
    return (
      <div className="page-dashboard">
        {head}
        <ErrorState title="The dashboard couldn't load" onRetry={() => refetch()} />
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="page-dashboard">
        {head}
        <DashboardLoading />
      </div>
    );
  }

  const { institutions, users, attention, recentActivity, institutionActivity } = data;

  const segments = STATUS_SEGMENTS.map((s) => ({ ...s, count: institutions.byStatus[s.key] ?? 0 }));
  const instTotal = Math.max(institutions.total, 1);

  const topActive = institutionActivity.slice(0, 6);
  const maxEvents = Math.max(1, ...topActive.map((r) => r.events));

  const pending = attention.pendingInstitutions;
  const allClear =
    pending.length === 0 && attention.suspendedUsersRecently === 0 && !attention.failedSigninsElevated;

  return (
    <div className="page-dashboard">
      {head}

      {/* metric strip — one card, four stat cells */}
      <section className="card metric-strip" aria-label="Platform metrics">
        <div className="metric">
          <div className="m-label">Institutions</div>
          <div className="m-value">{formatNumber(institutions.total)}</div>
          <div className="m-foot">
            <Delta now={institutions.newLast30Days} before={institutions.newPrior30Days} />
            <span>vs prior 30 days</span>
          </div>
        </div>
        <div className="metric">
          <div className="m-label">People</div>
          <div className="m-value">{formatNumber(users.total)}</div>
          <div className="m-foot">
            <Delta now={users.newLast30Days} before={users.newPrior30Days} />
            <span>vs prior 30 days</span>
          </div>
        </div>
        <div className="metric">
          <div className="m-label">Administrators</div>
          <div className="m-value">{formatNumber(users.byType["administrator"] ?? 0)}</div>
          <div className="m-foot">Privileged platform &amp; institution actors</div>
        </div>
        <div className="metric">
          <div className="m-label">Sign-in failures</div>
          <div className={`m-value${attention.failedSigninsElevated ? " warn" : ""}`}>
            {formatNumber(attention.failedSignins24h)}
          </div>
          <div className={`m-foot${attention.failedSigninsElevated ? " warn" : ""}`}>
            {attention.failedSigninsElevated ? (
              <>
                <IconAlertTriangle /> Elevated — investigate sign-in activity
              </>
            ) : (
              "last 24 hours"
            )}
          </div>
        </div>
      </section>

      <div className="band">
        {/* institution landscape */}
        <section className="card" aria-labelledby="landscape-h">
          <div className="card-head">
            <h2 id="landscape-h">Institution landscape</h2>
          </div>
          <div className="card-body">
            <div
              className="distbar"
              role="img"
              aria-label={`Institution status: ${segments.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(", ")}`}
            >
              {segments
                .filter((s) => s.count > 0)
                .map((s) => (
                  <span
                    key={s.key}
                    style={{ width: `${(s.count / instTotal) * 100}%`, background: s.color }}
                  />
                ))}
            </div>
            <div className="dist-legend">
              {segments.map((s) => (
                <span className="li" key={s.key}>
                  <i style={{ background: s.color }} />
                  {s.label} <b>{formatNumber(s.count)}</b>
                </span>
              ))}
            </div>

            <div className="subhead">
              <h3>Most active in the window</h3>
              <span className="meta right">audit events · last 7 days</span>
            </div>
            {topActive.length === 0 ? (
              <p className="meta">No institution activity in the last 7 days.</p>
            ) : (
              topActive.map((row) => (
                <div className="act-row" key={row.institutionId}>
                  <Link to={`/institutions/${row.institutionId}`} className="act-name truncate">
                    {row.institution}
                  </Link>
                  <span className="act-track">
                    <span
                      className="act-fill"
                      style={{ width: `${Math.round((row.events / maxEvents) * 100)}%` }}
                    />
                  </span>
                  <span className="act-count">{formatNumber(row.events)}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* needs attention */}
        <section className="card" aria-labelledby="attn-h">
          <div className="card-head">
            <h2 id="attn-h">Needs attention</h2>
          </div>
          <div className="card-body">
            {allClear ? (
              <div className="attn-clear">
                <EmptyState
                  icon={<IconCheckCircle />}
                  title="Nothing needs attention"
                  body="Pending institutions, recent suspensions, and sign-in anomalies will appear here."
                />
              </div>
            ) : (
              <>
                {pending.slice(0, 5).map((inst) => (
                  <div className="attn-row" key={inst.id}>
                    <div className="attn-main min-w-0">
                      <div className="attn-name truncate">{inst.name}</div>
                      <div className="attn-code mono">{inst.code}</div>
                    </div>
                    <Link className="textlink" to={`/institutions/${inst.id}`}>
                      Review
                    </Link>
                  </div>
                ))}
                {pending.length > 5 && (
                  <div className="attn-row">
                    <Link className="textlink" to="/institutions?status=pending">
                      View all {formatNumber(pending.length)} pending institutions →
                    </Link>
                  </div>
                )}
                <div className="attn-sums">
                  <Link to="/users?status=suspended" className="attn-sum warn">
                    <IconBan />
                    <span>
                      <b>{formatNumber(attention.suspendedUsersRecently)}</b> users suspended recently
                    </span>
                  </Link>
                  <Link
                    to="/activity?action=auth.sign_in_failed"
                    className={`attn-sum${attention.failedSigninsElevated ? " danger" : ""}`}
                  >
                    <IconLock />
                    <span>
                      <b>{formatNumber(attention.failedSignins24h)}</b> failed sign-ins (24h)
                    </span>
                  </Link>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {/* recent platform activity */}
      <section className="card" aria-labelledby="recent-h">
        <div className="card-head">
          <h2 id="recent-h">Recent platform activity</h2>
        </div>
        <div className="card-body">
          {recentActivity.length === 0 ? (
            <p className="meta">No activity recorded yet. Sign-ins, changes, and denied actions will appear here.</p>
          ) : (
            <div className="timeline">
              {recentActivity.slice(0, 10).map((event) => (
                <div className="tl-item" key={event.id}>
                  <span className={`tl-icon${event.result !== "success" ? " tone-danger" : ""}`}>
                    {actionIcon(event.action)}
                  </span>
                  <div className="min-w-0">
                    <div className="tl-line">
                      <b>{actionLabel(event.action)}</b>
                      {event.targetLabel ? <> → {event.targetLabel}</> : null}
                    </div>
                    <div className="tl-meta">
                      <span>
                        {[event.actorLabel ?? "System", event.institutionLabel].filter(Boolean).join(" · ")}
                      </span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={event.occurredAt}>{relativeFromNow(event.occurredAt)}</time>
                      <Badge tone={event.result === "success" ? "ok" : event.result === "denied" ? "danger" : "warn"}>
                        {event.result[0].toUpperCase() + event.result.slice(1)}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card-foot">
          <Link className="textlink" to="/activity">
            View full audit trail →
          </Link>
        </div>
      </section>
    </div>
  );
}
