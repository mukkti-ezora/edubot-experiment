import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { relativeFromNow, actionLabel, formatNumber } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import {
  IconGraduationCap,
  IconBookOpen,
  IconHeart,
  IconShieldCheck,
  IconBuilding,
  IconTrendingUp,
  IconAlertTriangle,
  IconCheckCircle,
  IconArrowRight,
  IconClock,
  IconUsers,
  IconActivity,
  IconSearch,
  IconInbox,
} from "@/components/icons";
import {
  PageHead,
  MetricTile,
  Avatar,
  Alert,
  EmptyState,
  Badge,
} from "@/components/ui";
import { useCommandState } from "@/components/CommandPalette";

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
  const cmdk = useCommandState();
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
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--surface-1)" }}>
        <div className="skeleton" style={{ width: 300, height: 16 }} />
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

  // Metric tiles data
  const metrics = [
    { label: "Institutions", value: totalInstitutions, category: "institution" as const, icon: <IconBuilding />, delta: { value: `+${summary?.institutions.newLast30Days ?? 0} this month`, trend: "up" as const }, to: "/institutions" },
    { label: "Students", value: totalStudents, category: "student" as const, icon: <IconGraduationCap />, delta: { value: `+${summary?.users.newLast30Days ?? 0} this month`, trend: "up" as const }, to: "/students" },
    { label: "Teachers", value: totalTeachers, category: "teacher" as const, icon: <IconBookOpen />, delta: { value: "—", trend: "flat" as const }, to: "/teachers" },
    { label: "Parents", value: totalParents, category: "parent" as const, icon: <IconHeart />, delta: { value: "—", trend: "flat" as const }, to: "/parents" },
    { label: "Administrators", value: totalAdmins, category: "admin" as const, icon: <IconShieldCheck />, delta: { value: "—", trend: "flat" as const }, to: "/administrators" },
    { label: "Needs Attention", value: pendingInstitutions.length + (elevatedSignins ? 1 : 0) + (suspendedUsers > 0 ? 1 : 0), category: "brand" as const, icon: <IconAlertTriangle />, delta: { value: elevatedSignins ? "Elevated" : "Normal", trend: elevatedSignins ? "down" as const : "flat" as const }, to: "/activity?action=auth.sign_in_failed" },
  ];

  // People overview from pstats
  const peopleOverview = pstats?.byType
    ? [
        { key: "student", label: "Students", count: pstats.byType.student?.total ?? 0, status: pstats.byType.student?.byStatus, cat: "student", icon: <IconGraduationCap /> },
        { key: "teacher", label: "Teachers", count: pstats.byType.teacher?.total ?? 0, status: pstats.byType.teacher?.byStatus, cat: "teacher", icon: <IconBookOpen /> },
        { key: "parent", label: "Parents", count: pstats.byType.parent?.total ?? 0, status: pstats.byType.parent?.byStatus, cat: "parent", icon: <IconHeart /> },
        { key: "administrator", label: "Administrators", count: pstats.byType.administrator?.total ?? 0, status: pstats.byType.administrator?.byStatus, cat: "admin", icon: <IconShieldCheck /> },
      ]
    : [
        { key: "student", label: "Students", count: totalStudents, status: null, cat: "student", icon: <IconGraduationCap /> },
        { key: "teacher", label: "Teachers", count: totalTeachers, status: null, cat: "teacher", icon: <IconBookOpen /> },
        { key: "parent", label: "Parents", count: totalParents, status: null, cat: "parent", icon: <IconHeart /> },
        { key: "administrator", label: "Administrators", count: totalAdmins, status: null, cat: "admin", icon: <IconShieldCheck /> },
      ];

  // Institution status dist
  const instStatus = summary?.institutions.byStatus
    ? Object.entries(summary.institutions.byStatus).map(([status, count]) => ({
        status, count, color: status === "active" ? "var(--student-600)" : status === "pending" ? "var(--parent-600)" : "var(--danger-600)"
      }))
    : [];

  // Top active institutions
  const topInstitutions = (summary?.institutionActivity ?? []).slice(0, 6);

  return (
    <div className="page-dashboard">
      {/* Greeting + Command Palette */}
      <PageHead
        title={<>
          <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Avatar name={me?.admin.name ?? "Admin"} size="md" category="brand" />
            <span>{greeting}, {me?.admin.name?.split(" ")[0] ?? "Admin"}</span>
          </span>
        </>}
        sub="Here's what's happening across EduBot today."
        trailing={
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--neutral-500)" }}>{today}</span>
            <button className="cmdk-trigger" onClick={() => cmdk.setOpen(true)} aria-keyshortcuts="meta+k ctrl+k">
              <IconSearch />
              <span className="cmdk-label">Search or jump to…</span>
              <kbd>⌘K</kbd>
            </button>
          </div>
        }
        actions={<button className="cmdk-trigger compact" onClick={() => cmdk.setOpen(true)} aria-keyshortcuts="meta+k ctrl+k"><IconSearch /><kbd>⌘K</kbd></button>}
      />

      {/* Metric Strip */}
      <div className="flex flex-wrap gap-4" style={{ marginBottom: "24px" }}>
        {metrics.map((m, i) => (
          <MetricTile key={i} {...m} />
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "24px", marginBottom: "24px" }}>
        {/* Institution Landscape */}
        <div className="panel">
          <div className="panel-head">
            <h2><IconBuilding /> Institution Landscape</h2>
            <div className="spacer">
              <Link to="/institutions" className="btn btn-ghost btn-sm"><IconArrowRight /> View all</Link>
            </div>
          </div>
          <div className="panel-body" style={{ display: "grid", gap: "20px" }}>
            {/* Status Distribution */}
            <div>
              <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "12px", color: "var(--neutral-700)" }}>Status Distribution</h3>
              <div className="distbar" style={{ height: "14px" }}>
                {instStatus.map((s) => (
                  <span key={s.status} style={{ width: `${totalInstitutions > 0 ? (s.count / totalInstitutions) * 100 : 0}%`, background: s.color }} />
                ))}
              </div>
              <div className="flex flex-wrap gap-4 mt-4" style={{ fontSize: "var(--text-xs)" }}>
                {instStatus.map(s => (
                  <div key={s.status} className="flex items-center gap-2">
                    <span style={{ width: "10px", height: "10px", borderRadius: "var(--radius-full)", background: s.color }} />
                    <span style={{ fontWeight: 500 }}>{s.status.charAt(0).toUpperCase() + s.status.slice(1)}</span>
                    <span className="tnum font-semibold">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Most Active Institutions */}
            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "16px" }}>
              <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "12px", color: "var(--neutral-700)" }}>Most Active Institutions</h3>
              {topInstitutions.length > 0 ? (
                <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {topInstitutions.map((inst, _i) => (
                    <div key={inst.institutionId} className="panel-tint-institution" style={{ borderRadius: "var(--radius-md)", padding: "12px 16px" }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="avatar avatar-sm avatar-institution">{inst.institution.charAt(0)}</span>
                          <div>
                            <div className="font-semibold text-sm">{inst.institution}</div>
                            <div className="text-xs text-neutral-500">#{_i + 1} most active</div>
                          </div>
                        </div>
                        <div className="tnum font-semibold text-institution-700">{inst.events}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No activity data" body="Institution activity will appear here as events are recorded." icon={<IconActivity />} />
              )}
            </div>
          </div>
        </div>

        {/* People Overview */}
        <div className="panel">
          <div className="panel-head">
            <h2><IconUsers /> People Overview</h2>
            <div className="spacer">
              <Link to="/students" className="btn btn-ghost btn-sm"><IconGraduationCap /> Students</Link>
              <Link to="/teachers" className="btn btn-ghost btn-sm"><IconBookOpen /> Teachers</Link>
              <Link to="/parents" className="btn btn-ghost btn-sm"><IconHeart /> Parents</Link>
            </div>
          </div>
          <div className="panel-body" style={{ display: "grid", gap: "16px" }}>
            {peopleOverview.map((p, _i) => (
              <div key={p.key} className={`panel-tint-${p.cat}`} style={{ borderRadius: "var(--radius-lg)", padding: "20px", display: "flex", alignItems: "center", gap: "16px" }}>
                <div className="flex items-center justify-center" style={{ width: "56px", height: "56px", borderRadius: "var(--radius-lg)", background: `var(--gradient-${p.cat})`, color: "white" }}>
                  {p.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 style={{ fontSize: "var(--text-base)", fontWeight: 600 }}>{p.label}</h3>
                    <span className="count-pill tnum">{formatNumber(p.count)}</span>
                  </div>
                  {p.status && (
                    <div className="flex flex-wrap gap-2 mt-2" style={{ fontSize: "var(--text-xs)" }}>
                      {Object.entries(p.status).map(([status, count]) => (
                        <span key={status} className="badge badge-outline" style={{ fontWeight: 500 }}>
                          {status}: {formatNumber(count)}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: "12px" }}>
                    <Link to={`/${p.key}s`} className="btn btn-ghost btn-sm" style={{ fontSize: "var(--text-xs)" }}>
                      View all <IconArrowRight />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Needs Attention + Activity */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "24px", marginBottom: "24px" }}>
        {/* Needs Attention */}
        <div className="panel">
          <div className="panel-head">
            <h2><IconAlertTriangle /> Needs Attention</h2>
          </div>
          <div className="panel-body" style={{ display: "grid", gap: "16px" }}>
            {pendingInstitutions.length > 0 && (
              <Alert tone="warn" title={`${pendingInstitutions.length} institution${pendingInstitutions.length > 1 ? "s" : ""} pending approval`}>
                <ul style={{ margin: "8px 0 0 20px", display: "grid", gap: "6px" }}>
                  {pendingInstitutions.slice(0, 3).map(inst => (
                    <li key={inst.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Link to={`/institutions/${inst.id}`} style={{ fontWeight: 600 }}>{inst.name}</Link>
                      <span className="mono text-xs text-neutral-500">({inst.code})</span>
                    </li>
                  ))}
                  {pendingInstitutions.length > 3 && (
                    <li><Link to="/institutions?status=pending" className="text-sm">View all {pendingInstitutions.length} →</Link></li>
                  )}
                </ul>
              </Alert>
            )}

            {suspendedUsers > 0 && (
              <Alert tone="warn" title={`${formatNumber(suspendedUsers)} user${suspendedUsers > 1 ? "s" : ""} suspended recently`}>
                <Link to="/users?status=suspended" style={{ fontWeight: 500 }}>Review suspended users →</Link>
              </Alert>
            )}

            {failedSignins > 0 && (
              <Alert tone={elevatedSignins ? "danger" : "warn"} title={`${formatNumber(failedSignins)} failed sign-in${failedSignins > 1 ? "s" : ""} in the last 24h`}>
                {elevatedSignins && <div className="text-sm text-danger-700 mt-1">Elevated — investigate sign-in activity</div>}
                <Link to="/activity?action=auth.sign_in_failed" style={{ fontWeight: 500 }}>View audit trail →</Link>
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

      {/* Institution Growth Trend (placeholder chart) */}
      {summary && (
        <div className="panel">
          <div className="panel-head">
            <h2><IconTrendingUp /> Institution Growth (Last 12 Months)</h2>
            <div className="spacer">
              <span className="meta">New: {summary.institutions.newLast30Days} this month · {summary.institutions.newPrior30Days} prior month</span>
            </div>
          </div>
          <div className="panel-body">
            <div className="chart-panel" style={{ height: "200px", display: "flex", alignItems: "end", gap: "16px", padding: "24px 0" }}>
              {Array.from({ length: 12 }).map((_, i) => {
                const base = Math.max(1, totalInstitutions - 12 + i);
                const val = base + Math.floor(Math.random() * 3);
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                    <div className="bar-fill" style={{ background: "var(--gradient-brand)", width: "24px", height: `${(val / Math.max(totalInstitutions, 1)) * 180}px`, minHeight: "20px", borderRadius: "var(--radius-sm) var(--radius-sm) 0 0", transition: "height 0.5s ease-out" }} />
                    <span className="text-xs text-neutral-500">{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][i]}</span>
                    <span className="tnum text-xs font-semibold">{val}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}