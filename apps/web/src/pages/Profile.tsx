import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AuditEvent, Page } from "@/lib/types";
import { actionLabel, formatDate, relativeFromNow } from "@/lib/format";
import { Badge, SkeletonRows } from "@/components/ui";

export function Profile() {
  const { me, loading, signOut } = useAuth();
  const navigate = useNavigate();

  const { data: activity, isLoading } = useQuery({
    queryKey: ["profile-activity", me?.admin.id],
    queryFn: () => api<Page<AuditEvent>>(`/api/v1/activity?actorId=${me!.admin.id}&limit=10`),
    enabled: !!me,
  });

  if (loading || !me) {
    return <div className="card"><SkeletonRows rows={4} /></div>;
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Profile</h1>
          <p className="sub">Your administrator identity and your own activity on the platform.</p>
        </div>
        <div className="actions">
          <button
            className="btn btn-secondary"
            onClick={async () => {
              await signOut();
              navigate("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>Identity</h2></div>
          <div className="card-body">
            <dl className="kv">
              <dt>Name</dt><dd>{me.admin.name}</dd>
              <dt>Email</dt><dd>{me.admin.email}</dd>
              <dt>Roles</dt><dd>{me.roles.length ? me.roles.map((r) => <Badge key={r.id} tone="neutral">{r.name}</Badge>) : "—"}</dd>
              <dt>Scope</dt><dd>Platform</dd>
              <dt>Account since</dt><dd>{formatDate(me.admin["createdAt" as keyof typeof me.admin] as string)}</dd>
            </dl>
            <p className="meta" style={{ marginTop: 14 }}>
              Password changes and MFA enrollment arrive with the identity roadmap.
            </p>
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h2>Your recent activity</h2></div>
          <div className="card-body">
            {isLoading ? (
              <SkeletonRows rows={3} />
            ) : !activity || activity.items.length === 0 ? (
              <p className="meta">No recorded actions yet.</p>
            ) : (
              <div className="feed">
                {activity.items.map((event) => (
                  <div key={event.id} className="feed-item">
                    <time dateTime={event.occurredAt}>{relativeFromNow(event.occurredAt)}</time>
                    <span className="what">{actionLabel(event.action)}{event.targetLabel ? <> → {event.targetLabel}</> : null}</span>
                    {event.result !== "success" && <Badge tone={event.result === "denied" ? "warn" : "danger"}>{event.result}</Badge>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
