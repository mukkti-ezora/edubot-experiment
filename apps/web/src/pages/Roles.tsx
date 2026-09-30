import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Permission, RoleSummary } from "@/lib/types";
import { ErrorState, SkeletonRows } from "@/components/ui";
import { useToast } from "@/lib/toast";

export function Roles() {
  const navigate = useNavigate();
  const toast = useToast();
  const [pendingRole, setPendingRole] = useState<string | null>(null);

  const { data: roles, isLoading, isError, refetch } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api<RoleSummary[]>("/api/v1/roles"),
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

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Roles &amp; permissions</h1>
          <p className="sub">
            Permissions are capabilities. Roles bundle them. Administrators receive roles.
            Assignments and changes are recorded in the audit log.
          </p>
        </div>
      </div>

      <div className="grid-2">
        <section className="card" aria-labelledby="roles-list">
          <div className="card-head"><h2 id="roles-list">Roles</h2><span className="meta">{roles?.length ?? 0} platform roles</span></div>
          {isLoading ? (
            <SkeletonRows rows={4} />
          ) : isError ? (
            <div className="card-body"><ErrorState title="Roles couldn't load" onRetry={() => refetch()} /></div>
          ) : (
            <div>
              {(roles ?? []).map((role) => (
                <button
                  key={role.id}
                  className="nav-item"
                  style={{
                    width: "100%", background: "none", border: "none", borderBottom: "1px solid var(--line)",
                    borderRadius: 0, padding: "12px 16px", textAlign: "left", cursor: "pointer",
                  }}
                  onClick={() => {
                    if (role.memberCount > 0) {
                      setPendingRole(role.id);
                      toast.notify(`${role.name} is assigned to ${role.memberCount} administrator${role.memberCount === 1 ? "" : "s"}. Changes affect them immediately.`, "ok");
                    }
                    navigate(`/roles/${role.id}`);
                  }}
                >
                  <div style={{ width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="cell-main">{role.name}</span>
                      {role.isSystem && <span className="badge badge-neutral">system</span>}
                      {role.id === pendingRole && <span className="badge badge-warn">in use</span>}
                    </div>
                    <div className="cell-sub">{role.description}</div>
                    <div className="meta" style={{ marginTop: 4 }}>
                      {role.permissionCount} permissions · {role.memberCount} administrators
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="perm-catalog">
          <div className="card-head"><h2 id="perm-catalog">Permission catalog</h2><span className="meta">{permissions?.length ?? 0} capabilities</span></div>
          <div className="card-body" style={{ display: "grid", gap: 18 }}>
            {Object.entries(grouped).map(([domain, perms]) => (
              <div key={domain}>
                <div className="meta" style={{ fontWeight: 700, marginBottom: 6, color: "var(--ink-700)" }}>{domain}</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {perms.map((p) => (
                    <div key={p.id} style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 10, fontSize: 13 }}>
                      <code>{p.key}</code>
                      <span className="meta">{p.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
