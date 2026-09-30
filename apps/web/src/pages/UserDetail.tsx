import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { AuditEvent, Page, UserRow } from "@/lib/types";
import { actionLabel, formatDate, formatDateTime, relativeFromNow, typeLabel } from "@/lib/format";
import { Badge, ConfirmDialog, ErrorState, SkeletonRows, statusTone } from "@/components/ui";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";

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

  if (isError) return <ErrorState title="This user couldn't be loaded" onRetry={() => refetch()} />;
  if (isLoading || !user) {
    return (
      <div>
        <div className="page-head"><div className="skeleton" style={{ width: 260, height: 22 }} /></div>
        <div className="card"><SkeletonRows rows={5} /></div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="meta" style={{ marginBottom: 4 }}>
            <Link to="/users">Users</Link>
            <span className="dot-sep">/</span>
            <span>{typeLabel(user.type)}</span>
          </div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {user.name} <Badge tone={statusTone(user.status)}>{user.status}</Badge>
          </h1>
          <p className="sub">{user.email} · {user.institutionName ?? "Platform"}</p>
        </div>
        <div className="actions">
          {user.status === "deactivated" ? (
            <button className="btn btn-primary" onClick={() => setConfirm("activate")}>Activate</button>
          ) : user.id !== me?.admin.id ? (
            <button className="btn btn-danger" onClick={() => setConfirm("deactivate")}>Deactivate</button>
          ) : null}
        </div>
      </div>

      <div className="grid-2">
        <section className="card" aria-labelledby="u-record">
          <div className="card-head"><h2 id="u-record">Record</h2></div>
          <div className="card-body">
            <dl className="kv">
              <dt>Type</dt><dd>{typeLabel(user.type)}</dd>
              <dt>Institution</dt>
              <dd>
                {user.institutionId ? (
                  <Link to={`/institutions/${user.institutionId}`}>{user.institutionName}</Link>
                ) : (
                  "Platform"
                )}
              </dd>
              <dt>Created</dt><dd>{formatDate(user.createdAt)}</dd>
              <dt>Last updated</dt><dd>{formatDateTime(user.updatedAt)}</dd>
              <dt>Status</dt><dd><Badge tone={statusTone(user.status)}>{user.status}</Badge></dd>
            </dl>
          </div>
        </section>

        <section className="card" aria-labelledby="u-activity">
          <div className="card-head"><h2 id="u-activity">Related activity</h2></div>
          <div className="card-body">
            {!activity || activity.items.length === 0 ? (
              <p className="meta">No recorded activity involving this user.</p>
            ) : (
              <div className="feed">
                {activity.items.map((event) => (
                  <div key={event.id} className="feed-item">
                    <time dateTime={event.occurredAt}>{relativeFromNow(event.occurredAt)}</time>
                    <span className="what"><b>{event.actorLabel ?? "System"}</b> · {actionLabel(event.action)}</span>
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
          title={confirm === "deactivate" ? `Deactivate ${user.name}?` : `Activate ${user.name}?`}
          body={
            confirm === "deactivate"
              ? <>They will lose access immediately and existing sessions are revoked. The action is recorded in the audit log.</>
              : <>They regain access immediately. The action is recorded in the audit log.</>
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
