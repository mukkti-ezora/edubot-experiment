import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Permission, RoleDetail as RoleDetailType } from "@/lib/types";
import { Badge, ConfirmDialog, ErrorState, SkeletonRows } from "@/components/ui";
import { useToast } from "@/lib/toast";

export function RoleDetail() {
  const { id } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState("");

  const { data: role, isLoading, isError, refetch } = useQuery({
    queryKey: ["role", id],
    queryFn: () => api<RoleDetailType>(`/api/v1/roles/${id}`),
    enabled: !!id,
  });
  const { data: permissions } = useQuery({
    queryKey: ["permissions"],
    queryFn: () => api<Permission[]>("/api/v1/permissions"),
  });

  const grouped = useMemo(() => {
    const out: Record<string, Permission[]> = {};
    for (const permission of permissions ?? []) {
      (out[permission.domain] ??= []).push(permission);
    }
    return out;
  }, [permissions]);

  const save = useMutation({
    mutationFn: async () =>
      api(`/api/v1/roles/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ description, permissionKeys: [...selected] }),
      }),
    onSuccess: () => {
      toast.notify("Role updated.");
      setEditMode(false);
      setWarnOpen(false);
      queryClient.invalidateQueries({ queryKey: ["role", id] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e) => toast.notify(e instanceof ApiError ? e.message : "Save failed.", "error"),
  });

  const remove = useMutation({
    mutationFn: async () => api(`/api/v1/roles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.notify("Role deleted.");
      window.history.back();
    },
    onError: (e) => toast.notify(e instanceof ApiError ? e.message : "Delete failed.", "error"),
  });

  if (isError) return <ErrorState title="This role couldn't load" onRetry={() => refetch()} />;
  if (isLoading || !role) {
    return (
      <div>
        <div className="page-head"><div className="skeleton" style={{ width: 240, height: 22 }} /></div>
        <div className="card"><SkeletonRows rows={6} /></div>
      </div>
    );
  }

  const inUse = role.memberCount > 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="meta" style={{ marginBottom: 4 }}><Link to="/roles">Roles &amp; permissions</Link></div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {role.name} {role.isSystem && <Badge tone="neutral">system</Badge>}
            {inUse && <Badge tone="warn">assigned to {role.memberCount}</Badge>}
          </h1>
          <p className="sub">{role.description || "No description."}</p>
        </div>
        <div className="actions">
          {!editMode && !role.isSystem && role.memberCount === 0 && (
            <button className="btn btn-danger" onClick={() => setWarnOpen(true)}>Delete role</button>
          )}
          {!editMode ? (
            <button
              className="btn btn-primary"
              onClick={() => {
                setSelected(new Set(role.permissions.map((p) => p.key)));
                setDescription(role.description);
                setEditMode(true);
              }}
            >
              Edit role
            </button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => setEditMode(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={save.isPending}
                onClick={() => (inUse ? setWarnOpen(true) : save.mutate())}
              >
                {save.isPending && <span className="btn-spinner" aria-hidden="true" />}
                Save changes
              </button>
            </>
          )}
        </div>
      </div>

      {inUse && !editMode && (
        <div className="banner-error" style={{ borderColor: "var(--warn-700)", background: "var(--warn-100)", color: "var(--warn-700)" }} role="note">
          This role is assigned to {role.memberCount} administrator{role.memberCount === 1 ? "" : "s"}. Edits change their access immediately.
        </div>
      )}

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>Permissions</h2><span className="meta">{editMode ? selected.size : role.permissions.length} selected</span></div>
          <div className="card-body" style={{ display: "grid", gap: 18 }}>
            {Object.entries(grouped).map(([domain, perms]) => (
              <div key={domain}>
                <div className="meta" style={{ fontWeight: 700, marginBottom: 6, color: "var(--ink-700)" }}>{domain}</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {perms.map((p) => {
                    const has = editMode ? selected.has(p.key) : role.permissions.some((rp) => rp.id === p.id);
                    return (
                      <label key={p.id} style={{ display: "grid", gridTemplateColumns: "auto 170px 1fr", gap: 8, alignItems: "baseline", fontSize: 13, cursor: editMode ? "pointer" : "default", opacity: has || editMode ? 1 : 0.45 }}>
                        {editMode ? (
                          <input
                            type="checkbox"
                            checked={selected.has(p.key)}
                            onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(p.key);
                              else next.delete(p.key);
                              setSelected(next);
                            }}
                          />
                        ) : (
                          <span aria-hidden="true" style={{ color: has ? "var(--ok-600)" : "var(--ink-400)" }}>{has ? "✓" : "–"}</span>
                        )}
                        <code>{p.key}</code>
                        <span className="meta">{p.description}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-head"><h2>Members</h2><span className="meta">{role.memberCount} assigned</span></div>
          <div className="card-body" style={{ display: "grid", gap: 12 }}>
            {editMode && (
              <div className="field">
                <label htmlFor="role-desc">Description</label>
                <textarea id="role-desc" className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            )}
            {role.members.length === 0 ? (
              <p className="meta">No administrator currently holds this role.</p>
            ) : (
              role.members.map((member) => (
                <div key={member.assignmentId} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 13 }}>
                  <Link to={`/administrators/${member.personId}`}><b>{member.name}</b></Link>
                  <span className="meta">{member.email ?? "—"}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {warnOpen && (
        <ConfirmDialog
          title={role.memberCount === 0 && !role.isSystem ? `Delete ${role.name}?` : "Apply role changes?"}
          body={
            role.memberCount === 0 && !role.isSystem
              ? "This permanently removes the role. The deletion is recorded in the audit log."
              : `${role.memberCount} administrator${role.memberCount === 1 ? "" : "s"} hold this role. Your permission changes apply to them immediately and are recorded in the audit log.`
          }
          confirmLabel={role.memberCount === 0 && !role.isSystem ? "Delete role" : "Apply changes"}
          danger={role.memberCount === 0 && !role.isSystem}
          busy={save.isPending || remove.isPending}
          onConfirm={() => (role.memberCount === 0 && !role.isSystem ? remove.mutate() : save.mutate())}
          onClose={() => setWarnOpen(false)}
        />
      )}
    </div>
  );
}
