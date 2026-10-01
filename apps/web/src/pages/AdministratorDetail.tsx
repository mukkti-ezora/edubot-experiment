import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { AuditEvent, Page, RoleSummary, UserRow } from "@/lib/types";
import { actionLabel, formatDate, formatDateTime, relativeFromNow } from "@/lib/format";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  ErrorState,
  PageHead,
  Skeleton,
  SkeletonRows,
  StatusPill,
} from "@/components/ui";
import {
  IconActivity,
  IconArrowLeft,
  IconArrowRight,
  IconBan,
  IconLock,
  IconPencil,
  IconPlus,
  IconSettings,
  IconShield,
} from "@/components/icons";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import "@/styles/pages/governance.css";

interface AdminDetailResponse {
  administrator: UserRow;
  account: { status: string; email: string; lastLoginAt: string | null } | null;
  roles: { id: string; name: string }[];
}

function eventIcon(event: AuditEvent): { icon: React.ReactNode; tone?: string } {
  if (event.result === "denied") return { icon: <IconShield />, tone: "tone-danger" };
  const a = event.action;
  if (a.startsWith("auth.")) return { icon: <IconLock /> };
  if (a.startsWith("settings")) return { icon: <IconSettings /> };
  if (a.includes("suspend") || a.includes("deactivate") || a.includes("disabled")) {
    return { icon: <IconBan />, tone: "tone-warn" };
  }
  if (a.includes("create") || a.includes("assign") || a.includes("enabled")) return { icon: <IconPlus /> };
  if (a.includes("update") || a.includes("activate")) return { icon: <IconPencil /> };
  return { icon: <IconActivity /> };
}

export function AdministratorDetail() {
  const { id } = useParams();
  const { me } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<"deactivate" | "activate" | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["administrator", id],
    queryFn: () => api<AdminDetailResponse>(`/api/v1/administrators/${id}`),
    enabled: !!id,
  });

  // Role catalog gives us scope per role (the detail response carries id + name only).
  const { data: roleCatalog } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api<RoleSummary[]>("/api/v1/roles"),
  });

  const { data: activity } = useQuery({
    queryKey: ["administrator-activity", id],
    queryFn: () => api<Page<AuditEvent>>(`/api/v1/activity?actorId=${id}&limit=12`),
    enabled: !!data,
  });

  const transition = useMutation({
    mutationFn: async (action: "activate" | "deactivate") =>
      api(`/api/v1/administrators/${id}/${action}`, { method: "POST", body: "{}" }),
    onSuccess: (_d, action) => {
      toast.notify(action === "deactivate" ? "Administrator deactivated." : "Administrator reactivated.");
      setConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["administrator", id] });
      queryClient.invalidateQueries({ queryKey: ["administrators"] });
    },
    onError: (e) => {
      toast.notify(e instanceof ApiError ? e.message : "Action failed.", "error");
      setConfirm(null);
    },
  });

  if (isError) {
    return (
      <div className="page-administrator-detail">
        <ErrorState title="This administrator couldn't be loaded" onRetry={() => refetch()} />
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="page-administrator-detail">
        <Skeleton w={140} />
        <div style={{ height: 10 }} />
        <Skeleton w={280} h={22} />
        <div style={{ height: 22 }} />
        <div className="card">
          <SkeletonRows rows={5} />
        </div>
      </div>
    );
  }

  const { administrator: admin, account, roles } = data;
  const scopeById = new Map((roleCatalog ?? []).map((r) => [r.id, r.scope]));

  return (
    <div className="page-administrator-detail">
      <Link to="/administrators" className="backlink">
        <IconArrowLeft />
        Administrators
      </Link>
      <PageHead
        title={
          <>
            {admin.name}
            <StatusPill status={admin.status} />
            {admin.id === me?.admin.id && <Badge tone="info">you</Badge>}
          </>
        }
        sub={admin.email}
        actions={
          admin.id !== me?.admin.id ? (
            admin.status === "deactivated" ? (
              <Button onClick={() => setConfirm("activate")}>Reactivate</Button>
            ) : (
              <Button variant="danger-ghost" icon={<IconBan />} onClick={() => setConfirm("deactivate")}>
                Deactivate
              </Button>
            )
          ) : undefined
        }
      />

      <div className="detail-grid">
        <section className="card" aria-labelledby="admin-profile">
          <div className="card-head">
            <h2 id="admin-profile">Profile</h2>
          </div>
          <div className="card-body">
            <dl className="kv">
              <dt>Email</dt>
              <dd>{admin.email}</dd>
              <dt>Status</dt>
              <dd>
                <StatusPill status={admin.status} />
              </dd>
              <dt>Scope</dt>
              <dd>{admin.institutionName ?? "Platform"}</dd>
              <dt>Created</dt>
              <dd>{formatDate(admin.createdAt)}</dd>
              <dt>Last sign-in</dt>
              <dd>{account?.lastLoginAt ? formatDateTime(account.lastLoginAt) : "Never"}</dd>
              <dt>Administrator ID</dt>
              <dd className="kv-id">{admin.id}</dd>
            </dl>
          </div>
        </section>

        <section className="card" aria-labelledby="admin-roles">
          <div className="card-head">
            <h2 id="admin-roles">Role assignments</h2>
            <div className="spacer">
              <span className="count-pill">{roles.length}</span>
            </div>
          </div>
          {roles.length === 0 ? (
            <div className="card-body">
              <Alert tone="warn" title="No roles assigned">
                This administrator can sign in but has no capabilities. Roles are assigned at
                invitation time.
              </Alert>
            </div>
          ) : (
            <div>
              {roles.map((role) => (
                <div key={role.id} className="assign-row">
                  <Link to={`/roles/${role.id}`}>
                    <Badge tone="violet">{role.name}</Badge>
                  </Link>
                  {scopeById.get(role.id) && (
                    <span className="badge badge-outline">{scopeById.get(role.id)}</span>
                  )}
                  {admin.institutionName && <span className="meta">{admin.institutionName}</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="admin-activity">
        <div className="card-head">
          <h2 id="admin-activity">Recent activity</h2>
          <div className="spacer">
            <Link className="meta nowrap" to={`/activity?actorId=${admin.id}`}>
              View all <IconArrowRight style={{ verticalAlign: "-2px" }} />
            </Link>
          </div>
        </div>
        <div className="card-body">
          {!activity || activity.items.length === 0 ? (
            <p className="meta">No recorded actions yet.</p>
          ) : (
            <div className="timeline">
              {activity.items.map((event) => {
                const { icon, tone } = eventIcon(event);
                return (
                  <div key={event.id} className="tl-item">
                    <span className={`tl-icon${tone ? ` ${tone}` : ""}`}>{icon}</span>
                    <div className="tl-body">
                      <div className="tl-line">
                        {actionLabel(event.action)}
                        {event.targetLabel ? <> → <b>{event.targetLabel}</b></> : null}
                      </div>
                      <div className="tl-meta">
                        <time dateTime={event.occurredAt}>{relativeFromNow(event.occurredAt)}</time>
                        {event.result !== "success" && (
                          <Badge tone={event.result === "denied" ? "warn" : "danger"}>
                            {event.result}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {confirm && (
        <ConfirmDialog
          title={confirm === "deactivate" ? `Deactivate ${admin.name}?` : `Reactivate ${admin.name}?`}
          body={
            confirm === "deactivate"
              ? "Their sign-in is revoked immediately and the account is disabled. The action is recorded in the audit log."
              : "They can sign in again immediately. The action is recorded in the audit log."
          }
          confirmLabel={confirm === "deactivate" ? "Deactivate administrator" : "Reactivate administrator"}
          danger={confirm === "deactivate"}
          busy={transition.isPending}
          onConfirm={() => transition.mutate(confirm)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
