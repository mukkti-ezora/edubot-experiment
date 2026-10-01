import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AuditEvent, Page } from "@/lib/types";
import { actionLabel, relativeFromNow, typeLabel } from "@/lib/format";
import {
  Avatar,
  Badge,
  Button,
  ErrorState,
  PageHead,
  Skeleton,
  SkeletonRows,
  StatusPill,
  type Tone,
} from "@/components/ui";
import { IconAlertTriangle, IconBan, IconCheckCircle, IconLogout } from "@/components/icons";
import "@/styles/pages/system.css";

type Result = AuditEvent["result"];

/** Same result vocabulary as the Activity page. */
const RESULT_META: Record<Result, { tone: Tone; tlTone: string; Icon: typeof IconCheckCircle }> = {
  success: { tone: "ok", tlTone: "tone-ok", Icon: IconCheckCircle },
  denied: { tone: "danger", tlTone: "tone-danger", Icon: IconBan },
  error: { tone: "warn", tlTone: "tone-warn", Icon: IconAlertTriangle },
};

function resultLabel(result: Result): string {
  return result.charAt(0).toUpperCase() + result.slice(1);
}

function ActivityTimeline({ events }: { events: AuditEvent[] }) {
  return (
    <div className="timeline">
      {events.map((event) => {
        const meta = RESULT_META[event.result];
        const { Icon } = meta;
        return (
          <div key={event.id} className="tl-item">
            <span className={`tl-icon ${meta.tlTone}`} aria-hidden="true">
              <Icon />
            </span>
            <div className="tl-body">
              <div className="tl-line">
                {actionLabel(event.action)}
                {event.targetLabel ? <> → {event.targetLabel}</> : null}
                {event.result !== "success" && (
                  <Badge tone={meta.tone}>{resultLabel(event.result)}</Badge>
                )}
              </div>
              <div className="tl-meta">
                <span>{event.institutionLabel ?? "Platform"}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={event.occurredAt}>{relativeFromNow(event.occurredAt)}</time>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Profile() {
  const { me, loading, signOut } = useAuth();
  const navigate = useNavigate();

  const { data: activity, isLoading, isError, refetch } = useQuery({
    queryKey: ["profile-activity", me?.admin.id],
    queryFn: () => api<Page<AuditEvent>>(`/api/v1/activity?actorId=${me!.admin.id}&limit=10`),
    enabled: !!me,
  });

  return (
    <div className="page-profile">
      <PageHead
        title="Profile"
        sub="Your platform identity and access"
        actions={
          me ? (
            <Button
              variant="secondary"
              icon={<IconLogout />}
              onClick={async () => {
                await signOut();
                navigate("/login");
              }}
            >
              Sign out
            </Button>
          ) : undefined
        }
      />

      {loading || !me ? (
        <>
          <div className="card">
            <div className="profile-head">
              <div className="skeleton profile-skel-avatar" />
              <div className="flex-col gap-2 flex-1">
                <Skeleton w={180} h={16} />
                <Skeleton w={230} />
              </div>
            </div>
          </div>
          <div className="profile-grid">
            <div className="card">
              <SkeletonRows rows={5} />
            </div>
            <div className="card">
              <SkeletonRows rows={5} />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="card">
            <div className="profile-head">
              <Avatar name={me.admin.name} size="lg" dark />
              <div className="profile-id">
                <div className="profile-name">{me.admin.name}</div>
                <div className="profile-email">{me.admin.email}</div>
                {me.roles.length > 0 && (
                  <div className="profile-roles">
                    {me.roles.map((role) => (
                      <Badge key={role.id} tone="violet">
                        {role.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <span className="badge badge-outline profile-scope">Platform</span>
            </div>
          </div>

          <div className="profile-grid">
            <section className="card">
              <div className="card-head">
                <h2>Identity</h2>
              </div>
              <div className="card-body">
                <dl className="kv">
                  <dt>Name</dt>
                  <dd>{me.admin.name}</dd>
                  <dt>Email</dt>
                  <dd>{me.admin.email}</dd>
                  <dt>Type</dt>
                  <dd>{typeLabel(me.admin.type)}</dd>
                  <dt>Status</dt>
                  <dd>
                    <StatusPill status={me.admin.status} />
                  </dd>
                  <dt>Institution</dt>
                  <dd>
                    {me.admin.institutionId ? (
                      <span className="mono">{me.admin.institutionId}</span>
                    ) : (
                      "Platform"
                    )}
                  </dd>
                  <dt>ID</dt>
                  <dd className="mono">{me.admin.id}</dd>
                </dl>
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Access</h2>
              </div>
              <div className="card-body">
                {(() => {
                  const groups = new Map<string, string[]>();
                  for (const key of me.permissions) {
                    const dot = key.indexOf(".");
                    const domain = dot === -1 ? "general" : key.slice(0, dot);
                    groups.set(domain, [...(groups.get(domain) ?? []), key]);
                  }
                  const domains = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
                  return (
                    <>
                      <p className="access-summary">
                        <b>{me.permissions.length}</b> permissions across <b>{domains.length}</b>{" "}
                        domains
                      </p>
                      {domains.length === 0 ? (
                        <p className="meta">No permissions assigned to your account.</p>
                      ) : (
                        domains.map(([domain, keys]) => (
                          <div key={domain} className="perm-group">
                            <div className="perm-domain">{domain}</div>
                            <div className="perm-chips">
                              {keys.map((key) => (
                                <span key={key} className="badge badge-outline mono">
                                  {key}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </>
                  );
                })()}
              </div>
            </section>
          </div>

          <section className="card profile-activity">
            <div className="card-head">
              <h2>Your recent activity</h2>
            </div>
            <div className="card-body">
              {isError ? (
                <ErrorState title="Your activity couldn't load" onRetry={() => refetch()} />
              ) : isLoading ? (
                <SkeletonRows rows={3} />
              ) : !activity || activity.items.length === 0 ? (
                <p className="meta">No recorded actions yet.</p>
              ) : (
                <ActivityTimeline events={activity.items} />
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
