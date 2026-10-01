import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { AuditEvent, Page, UserRow } from "@/lib/types";
import { actionLabel, formatDate, formatDateTime, relativeFromNow, typeLabel } from "@/lib/format";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHead,
  Skeleton,
  SkeletonRows,
  StatusPill,
} from "@/components/ui";
import { IconActivity, IconAlertTriangle, IconArrowLeft, IconBan, IconShield } from "@/components/icons";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import "@/styles/pages/users.css";

export function UserDetail() {
  const { id } = useParams();
  const { me } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<"activate" | "deactivate" | null>(null);

  const { data: user, isLoading, isError, refetch } = useQuery({
    queryKey: ["user", id],
    queryFn: () => api<UserRow>(`/api/v1/users/${id}`),
    enabled: !!id,
  });

  const { data: activity } = useQuery({
    queryKey: ["user-activity", id],
    queryFn: () => api<Page<AuditEvent>>(`/api/v1/activity?query=${encodeURIComponent(user?.email ?? "")}&limit=8`),
    enabled: !!user,
  });

  const transition = useMutation({
    mutationFn: async (action: "activate" | "deactivate") =>
      api(`/api/v1/users/${id}/${action}`, { method: "POST", body: "{}" }),
    onSuccess: (_d, action) => {
      toast.notify(action === "deactivate" ? "User deactivated." : "User activated.");
      setConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["user", id] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => {
      toast.notify(e instanceof ApiError ? e.message : "Action failed.", "error");
      setConfirm(null);
    },
  });

  if (isError) {
    return (
      <div className="page-user-detail">
        <Link to="/users" className="back-link">
          <IconArrowLeft /> Users
        </Link>
        <ErrorState title="This user couldn't be loaded" onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading || !user) {
    return (
      <div className="page-user-detail">
        <Skeleton w={76} h={13} />
        <div className="page-head" style={{ marginTop: 14 }}>
          <div className="head-main">
            <Skeleton w={280} h={22} />
            <div style={{ marginTop: 8 }}>
              <Skeleton w={220} h={13} />
            </div>
          </div>
        </div>
        <div className="detail-grid">
          <div className="card">
            <SkeletonRows rows={6} />
          </div>
          <div className="side-stack">
            <div className="card">
              <SkeletonRows rows={2} />
            </div>
            <div className="card">
              <SkeletonRows rows={4} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-user-detail">
      <Link to="/users" className="back-link">
        <IconArrowLeft /> Users
      </Link>

      <PageHead
        title={
          <>
            {user.name} <StatusPill status={user.status} />{" "}
            <Badge tone="neutral">{typeLabel(user.type)}</Badge>
          </>
        }
        sub={user.email}
        actions={
          user.status === "deactivated" ? (
            <Button variant="primary" onClick={() => setConfirm("activate")}>
              Activate
            </Button>
          ) : user.id !== me?.admin.id ? (
            <Button variant="danger-ghost" onClick={() => setConfirm("deactivate")}>
              Deactivate
            </Button>
          ) : undefined
        }
      />

      {(user.status === "invited" || user.status === "suspended" || user.status === "deactivated") && (
        <div className="head-alerts">
          {user.status === "invited" && (
            <Alert tone="warn" title="Invitation pending">
              The user hasn't activated their account yet.
            </Alert>
          )}
          {user.status === "suspended" && (
            <Alert tone="danger" title="Account suspended">
              Sign-in is blocked until the account is reactivated. The action is recorded in the audit log.
            </Alert>
          )}
          {user.status === "deactivated" && (
            <Alert tone="danger" title="Account deactivated">
              All sessions are revoked and sign-in is blocked. Activate the account to restore access.
            </Alert>
          )}
        </div>
      )}

      <div className="detail-grid">
        <section className="card" aria-labelledby="u-profile">
          <div className="card-head">
            <h2 id="u-profile">Profile</h2>
          </div>
          <div className="card-body">
            <dl className="kv">
              <dt>Email</dt>
              <dd>{user.email}</dd>
              <dt>Institution</dt>
              <dd>
                {user.institutionId ? (
                  <Link to={`/institutions/${user.institutionId}`}>{user.institutionName}</Link>
                ) : (
                  "—"
                )}
              </dd>
              <dt>Type</dt>
              <dd>{typeLabel(user.type)}</dd>
              <dt>Status</dt>
              <dd>
                <StatusPill status={user.status} />
              </dd>
              <dt>Created</dt>
              <dd>{formatDate(user.createdAt)}</dd>
              <dt>Updated</dt>
              <dd>{formatDateTime(user.updatedAt)}</dd>
              <dt>Last sign-in</dt>
              <dd>
                {user.lastLoginAt ? (
                  <span title={formatDateTime(user.lastLoginAt)}>{relativeFromNow(user.lastLoginAt)}</span>
                ) : (
                  "Never"
                )}
              </dd>
              <dt>User ID</dt>
              <dd>
                <span className="uid">{user.id}</span>
              </dd>
            </dl>
          </div>
        </section>

        <div className="side-stack">
          <section className="card" aria-labelledby="u-roles">
            <div className="card-head">
              <h2 id="u-roles">Roles</h2>
            </div>
            <div className="card-body">
              {user.roles && user.roles.length > 0 ? (
                <div className="roles-wrap">
                  {user.roles.map((role) => (
                    <Badge key={role.roleId} tone="violet">
                      {role.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<IconShield />}
                  title="No roles assigned"
                  body="Roles grant capabilities; assign them from Administrators or Roles."
                />
              )}
            </div>
          </section>

          <section className="card" aria-labelledby="u-activity">
            <div className="card-head">
              <h2 id="u-activity">Recent activity</h2>
              <span className="spacer">
                <span className="meta">
                  <Link to={`/activity?query=${encodeURIComponent(user.email)}`}>Full history →</Link>
                </span>
              </span>
            </div>
            <div className="card-body">
              {!activity || activity.items.length === 0 ? (
                <p className="meta">No recorded activity involving this user.</p>
              ) : (
                <div className="timeline">
                  {activity.items.map((event) => (
                    <div key={event.id} className="tl-item">
                      <span
                        className={`tl-icon${event.result === "denied" ? " tone-warn" : event.result === "error" ? " tone-danger" : ""}`}
                      >
                        {event.result === "success" ? <IconActivity /> : event.result === "denied" ? <IconBan /> : <IconAlertTriangle />}
                      </span>
                      <div className="tl-body">
                        <div className="tl-line">
                          <b>{event.actorLabel ?? "System"}</b> · {actionLabel(event.action)}
                        </div>
                        <div className="tl-meta">
                          <time dateTime={event.occurredAt}>{relativeFromNow(event.occurredAt)}</time>
                          {event.result !== "success" && (
                            <Badge tone={event.result === "denied" ? "warn" : "danger"}>{event.result}</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm === "deactivate" ? `Deactivate ${user.name}?` : `Activate ${user.name}?`}
          body={
            confirm === "deactivate" ? (
              <>
                They will lose access immediately and existing sessions are revoked. The action is recorded in the
                audit log.
              </>
            ) : (
              <>They regain access immediately. The action is recorded in the audit log.</>
            )
          }
          confirmLabel={confirm === "deactivate" ? "Deactivate user" : "Activate user"}
          danger={confirm === "deactivate"}
          busy={transition.isPending}
          onConfirm={() => transition.mutate(confirm)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
