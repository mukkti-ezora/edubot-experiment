import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { AuditEvent, Page, UserRow } from "@/lib/types";
import { actionLabel, formatDate, formatDateTime, relativeFromNow } from "@/lib/format";
import { Badge, ConfirmDialog, ErrorState, SkeletonRows, statusTone } from "@/components/ui";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";

interface AdminDetailResponse {
  administrator: UserRow;
  account: { status: string; email: string; lastLoginAt: string | null } | null;
  roles: { id: string; name: string }[];
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

  if (isError) return <ErrorState title="This administrator couldn't be loaded" onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return (
      <div>
        <div className="page-head"><div className="skeleton" style={{ width: 280, height: 22 }} /></div>
        <div className="card"><SkeletonRows rows={5} /></div>
      </div>
    );
  }

  const { administrator: admin, account, roles } = data;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="meta" style={{ marginBottom: 4 }}>
            <Link to="/administrators">Administrators</Link>
          </div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {admin.name} <Badge tone={statusTone(admin.status)}>{admin.status}</Badge>
            {admin.id === me?.admin.id && <Badge tone="info">you</Badge>}
          </h1>
          <p className="sub">{admin.email}</p>
        </div>
        <div className="actions">
          {admin.id !== me?.admin.id &&
            (admin.status === "deactivated" ? (
              <button className="btn btn-primary" onClick={() => setConfirm("activate")}>Reactivate</button>
            ) : (
              <button className="btn btn-danger" onClick={() => setConfirm("deactivate")}>Deactivate</button>
            ))}
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>Access</h2></div>
          <div className="card-body">
            <dl className="kv">
              <dt>Roles</dt>
              <dd>{roles.length ? roles.map((r) => <Badge key={r.id} tone="neutral">{r.name}</Badge>) : "—"}</dd>
              <dt>Account status</dt><dd>{account ? account.status : "—"}</dd>
              <dt>Last sign-in</dt><dd>{account?.lastLoginAt ? formatDateTime(account.lastLoginAt) : "Never"}</dd>
              <dt>Member since</dt><dd>{formatDate(admin.createdAt)}</dd>
            </dl>
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h2>Recent actions</h2><Link className="meta" to={`/activity?actorId=${admin.id}`}>All →</Link></div>
          <div className="card-body">
            {!activity || activity.items.length === 0 ? (
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
