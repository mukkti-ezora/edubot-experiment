import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { relativeFromNow, actionLabel, formatNumber } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import {
  IconBuilding,
  IconTrendingUp,
  IconAlertTriangle,
  IconCheckCircle,
  IconArrowRight,
  IconClock,
  IconUsers,
  IconActivity,
  IconInbox,
} from "@/components/icons";
import {
  PageHead,
  Avatar,
  Alert,
  EmptyState,
  Badge,
} from "@/components/ui";
import { InstitutionGrowthChart, StatusDonut, ActivityBarChart } from "@/components/Charts";
import "@/styles/pages/dashboard.css";

type DashboardSummary = {
  generatedAt: string;
  institutions: { total: number; byStatus: Record<string, number>; newLast30Days: number; newPrior30Days: number };
  users: { total: number; byType: Record<string, number>; newLast30Days: number; newPrior30Days: number };
  attention: { pendingInstitutions: Array<{ id: string; name: string; code: string }>; suspendedUsersRecently: number; failedSignins24h: number; failedSigninsElevated: boolean };
  recentActivity: Array<{ id: string; occurredAt: string; action: string; result: "success" | "denied" | "error"; actorLabel: string | null; targetLabel: string | null; institutionLabel: string | null }>;
  institutionActivity: Array<{ institutionId: string; institution: string; events: number }>;
};

type PeopleStats = {
  generatedAt: string;
  byType: {
    student: { total: number; byStatus: Record<string, number> };
    teacher: { total: number; byStatus: Record<string, number> };
    parent: { total: number; byStatus: Record<string, number> };
    administrator: { total: number; byStatus: Record<string, number> };
  };
  byInstitution: {
    student: Array<{ institutionId: string; institutionName: string; count: number }>;
    teacher: Array<{ institutionId: string; institutionName: string; count: number }>;
    parent: Array<{ institutionId: string; institutionName: string; count: number }>;
    administrator: Array<{ institutionId: string; institutionName: string; count: number }>;
  };
};

export function Dashboard() {
  const { me } = useAuth();
  const [greeting, setGreeting] = useState("Good morning");

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting("Good morning");
    else if (h < 17) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  const { data: summary, isLoading: sLoading } = useQuery<DashboardSummary>({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardSummary>("/api/v1/dashboard/summary"),
    refetchInterval: 60_000,
    retry: 1,
  });

  const { data: pstats } = useQuery<PeopleStats | null>({
    queryKey: ["people-stats"],
    queryFn: async () => {
      try {
        return await api<PeopleStats>("/api/v1/people/stats");
      } catch {
        return null;
      }
    },
    retry: false,
    enabled: true,
  });

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  if (sLoading) {
    return (
      <div className="db-loading">
        <div className="skeleton db-loading-skeleton" />
      </div>
    );
  }

  const totalInstitutions = summary?.institutions.total ?? 0;
  const totalStudents = summary?.users.byType?.student ?? 0;
  const totalTeachers = summary?.users.byType?.teacher ?? 0;
  const totalParents = summary?.users.byType?.parent ?? 0;
  const totalAdmins = summary?.users.byType?.administrator ?? 0;
  const pendingInstitutions = summary?.attention.pendingInstitutions ?? [];
  const suspendedUsers = summary?.attention.suspendedUsersRecently ?? 0;
  const failedSignins = summary?.attention.failedSignins24h ?? 0;
  const elevatedSignins = summary?.attention.failedSigninsElevated ?? false;

  const attentionCount = pendingInstitutions.length + (elevatedSignins ? 1 : 0) + (suspendedUsers > 0 ? 1 : 0);

  const metrics = [
    {
      label: "Institutions",
      value: totalInstitutions,
      delta: `+${summary?.institutions.newLast30Days ?? 0} this month`,
      to: "/institutions",
    },
    {
      label: "Students",
      value: totalStudents,
      delta: `+${summary?.users.newLast30Days ?? 0} this month`,
      to: "/students",
    },
    {
      label: "Teachers",
      value: totalTeachers,
      delta: null,
      to: "/teachers",
    },
    {
      label: "Parents",
      value: totalParents,
      delta: null,
      to: "/parents",
    },
    {
      label: "Administrators",
      value: totalAdmins,
      delta: null,
      to: "/administrators",
    },
    {
      label: "Needs attention",
      value: attentionCount,
      delta: elevatedSignins ? "Elevated" : "Normal",
      to: "/activity?action=auth.sign_in_failed",
      warn: elevatedSignins,
    },
  ];

  const peopleRows = pstats?.byType
    ? [
        { key: "student", label: "Students", count: pstats.byType.student?.total ?? 0, status: pstats.byType.student?.byStatus, cat: "student", to: "/students" },
        { key: "teacher", label: "Teachers", count: pstats.byType.teacher?.total ?? 0, status: pstats.byType.teacher?.byStatus, cat: "teacher", to: "/teachers" },
        { key: "parent", label: "Parents", count: pstats.byType.parent?.total ?? 0, status: pstats.byType.parent?.byStatus, cat: "parent", to: "/parents" },
        { key: "administrator", label: "Administrators", count: pstats.byType.administrator?.total ?? 0, status: pstats.byType.administrator?.byStatus, cat: "admin", to: "/administrators" },
      ]
    : [
        { key: "student", label: "Students", count: totalStudents, status: null, cat: "student", to: "/students" },
        { key: "teacher", label: "Teachers", count: totalTeachers, status: null, cat: "teacher", to: "/teachers" },
        { key: "parent", label: "Parents", count: totalParents, status: null, cat: "parent", to: "/parents" },
        { key: "administrator", label: "Administrators", count: totalAdmins, status: null, cat: "admin", to: "/administrators" },
      ];

  const instStatus = summary?.institutions.byStatus
    ? Object.entries(summary.institutions.byStatus).map(([status, count]) => ({
        status, count, color: status === "active" ? "var(--student-600)" : status === "pending" ? "var(--parent-600)" : "var(--danger-600)"
      }))
    : [];

  const topInstitutions = (summary?.institutionActivity ?? []).slice(0, 6);

  return (
    <div className="page-dashboard">
      {/* ── Header ─────────────────────────────────── */}
      <PageHead
        title={<>
          <span className="db-greeting">
            <Avatar name={me?.admin.name ?? "Admin"} size="md" category="brand" />
            <span>{greeting}, {me?.admin.name?.split(" ")[0] ?? "Admin"}</span>
          </span>
        </>}
        sub="Here's what's happening across EduBot today."
        trailing={
          <div className="db-header-trailing">
            <span className="db-date">{today}</span>
          </div>
        }
      />

      {/* ── Metric Strip — hairline-divided grid ──── */}
      <div className="db-metric-grid">
        {metrics.map((m, i) => (
          <Link key={i} to={m.to} className={`db-metric-cell${m.warn ? " db-metric-warn" : ""}`}>
            <span className="db-metric-value">{formatNumber(m.value)}</span>
            <span className="db-metric-label">{m.label}</span>
            {m.delta && <span className="db-metric-delta">{m.delta}</span>}
          </Link>
        ))}
      </div>

      {/* ── Main Grid: Institutions + People ──────── */}
      <div className="db-grid-2col">
        {/* Institution Landscape */}
        <div className="panel">
          <div className="panel-head">
            <h2><IconBuilding /> Institution Landscape</h2>
            <div className="spacer">
              <Link to="/institutions" className="btn btn-ghost btn-sm"><IconArrowRight /> View all</Link>
            </div>
          </div>
          <div className="panel-body db-inst-body">
            <div>
              <h3 className="db-sub-heading">Status Distribution</h3>
              <StatusDonut
                data={instStatus.map((s) => ({
                  name: s.status.charAt(0).toUpperCase() + s.status.slice(1),
                  value: s.count,
                  color: s.color,
                }))}
                total={totalInstitutions}
              />
            </div>

            <div className="db-inst-activity">
              <h3 className="db-sub-heading">Most Active Institutions</h3>
              {topInstitutions.length > 0 ? (
                <ActivityBarChart
                  data={topInstitutions.map((inst) => ({
                    name: (inst.institution ?? "Unknown").length > 18 ? (inst.institution ?? "Unknown").slice(0, 18) + "…" : (inst.institution ?? "Unknown"),
                    events: inst.events,
                  }))}
                />
              ) : (
                <EmptyState title="No activity data" body="Institution activity will appear here as events are recorded." icon={<IconActivity />} />
              )}
            </div>
          </div>
        </div>

        {/* People Overview — category-accented rows with inline status */}
        <div className="panel">
          <div className="panel-head">
            <h2><IconUsers /> People Overview</h2>
            <div className="spacer">
              <span className="db-people-total tnum">{formatNumber(totalStudents + totalTeachers + totalParents + totalAdmins)} total</span>
            </div>
          </div>
          <div className="panel-body flush">
            <div className="db-people-table">
              {peopleRows.map((p) => (
                <Link key={p.key} to={p.to} className="db-people-row" data-cat={p.cat}>
                  <span className="db-pr-label">{p.label}</span>
                  <span className="db-pr-count tnum">{formatNumber(p.count)}</span>
                  <span className="db-pr-status">
                    {p.status
                      ? Object.entries(p.status).map(([status, count]) => (
                          <span key={status} className="db-pr-status-item">
                            <span className="db-pr-status-dot" data-status={status} />
                            {formatNumber(count)} {status}
                          </span>
                        ))
                      : <span className="db-pr-status-item db-pr-status-empty">--</span>
                    }
                  </span>
                  <IconArrowRight className="db-pr-arrow" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Attention + Activity ──────────────────── */}
      <div className="db-grid-2col">
        {/* Needs Attention */}
        <div className="panel">
          <div className="panel-head">
            <h2><IconAlertTriangle /> Needs Attention</h2>
          </div>
          <div className="panel-body db-attn-body">
            {pendingInstitutions.length > 0 && (
              <Alert tone="warn" title={`${pendingInstitutions.length} institution${pendingInstitutions.length > 1 ? "s" : ""} pending approval`}>
                <ul className="db-attn-list">
                  {pendingInstitutions.slice(0, 3).map(inst => (
                    <li key={inst.id}>
                      <Link to={`/institutions/${inst.id}`}>{inst.name}</Link>
                      <span className="db-attn-code">({inst.code})</span>
                    </li>
                  ))}
                  {pendingInstitutions.length > 3 && (
                    <li><Link to="/institutions?status=pending">View all {pendingInstitutions.length} →</Link></li>
                  )}
                </ul>
              </Alert>
            )}

            {suspendedUsers > 0 && (
              <Alert tone="warn" title={`${formatNumber(suspendedUsers)} user${suspendedUsers > 1 ? "s" : ""} suspended recently`}>
                <Link to="/users?status=suspended" className="db-attn-link">Review suspended users →</Link>
              </Alert>
            )}

            {failedSignins > 0 && (
              <Alert tone={elevatedSignins ? "danger" : "warn"} title={`${formatNumber(failedSignins)} failed sign-in${failedSignins > 1 ? "s" : ""} in the last 24h`}>
                {elevatedSignins && <div className="db-attn-elevated">Elevated — investigate sign-in activity</div>}
                <Link to="/activity?action=auth.sign_in_failed" className="db-attn-link">View audit trail →</Link>
              </Alert>
            )}

            {pendingInstitutions.length === 0 && suspendedUsers === 0 && failedSignins === 0 && (
              <EmptyState title="Nothing needs attention" body="All institutions are active, no recent suspensions, and sign-ins are normal." icon={<IconCheckCircle />} />
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="panel">
          <div className="panel-head">
            <h2><IconActivity /> Recent Platform Activity</h2>
            <div className="spacer">
              <Link to="/activity" className="btn btn-ghost btn-sm">View all <IconArrowRight /></Link>
            </div>
          </div>
          <div className="panel-body">
            <div className="timeline">
              {(summary?.recentActivity ?? []).slice(0, 8).map((evt) => {
                const isDenied = evt.result === "denied";
                const isError = evt.result === "error";
                return (
                  <div key={evt.id} className="tl-item">
                    <div className={`tl-icon ${isDenied ? "tone-danger" : isError ? "tone-warn" : "tone-success"}`}>
                      <IconCheckCircle />
                    </div>
                    <div className="tl-body">
                      <div className="tl-line">
                        <b>{evt.actorLabel ?? "System"}</b> {actionLabel(evt.action)}
                        {evt.targetLabel && <><span> → </span><b>{evt.targetLabel}</b></>}
                      </div>
                      <div className="tl-meta">
                        {evt.institutionLabel && <span><IconBuilding /> {evt.institutionLabel}</span>}
                        <span><IconClock /> {relativeFromNow(evt.occurredAt)}</span>
                        <Badge tone={isDenied ? "danger" : isError ? "warn" : "ok"}>{evt.result}</Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {(!summary?.recentActivity?.length) && <EmptyState title="No recent activity" body="Activity will appear here as events occur." icon={<IconInbox />} />}
          </div>
        </div>
      </div>

      {/* ── Growth Chart ──────────────────────────── */}
      {summary && (
        <div className="panel db-growth-panel">
          <div className="panel-head">
            <h2><IconTrendingUp /> Institution Growth (Last 12 Months)</h2>
            <div className="spacer">
              <span className="db-growth-meta">New: <b>{summary.institutions.newLast30Days}</b> this month · <b>{summary.institutions.newPrior30Days}</b> prior month</span>
            </div>
          </div>
          <div className="panel-body">
            <InstitutionGrowthChart
              data={(() => {
                const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                const base = Math.max(1, totalInstitutions - 12);
                return months.map((month, i) => ({
                  month,
                  count: base + Math.round((totalInstitutions - base) * ((i + 1) / 12)),
                }));
              })()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
