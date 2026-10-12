import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Permission, RoleDetail as RoleDetailType } from "@/lib/types";
import { DataTable, type Column } from "@/components/DataTable";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  Ident,
  PageHead,
  Skeleton,
  SkeletonRows,
  StatusPill,
  Tabs,
} from "@/components/ui";
import { IconArrowLeft, IconBan, IconPencil, IconUsers } from "@/components/icons";
import { useToast } from "@/lib/toast";
import "@/styles/pages/governance.css";

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function scopeLabel(scope: string): string {
  return scope.charAt(0).toUpperCase() + scope.slice(1);
}

type Member = RoleDetailType["members"][number];

export function RoleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("permissions");
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [confirm, setConfirm] = useState<"save" | "delete" | null>(null);
  const [descOpen, setDescOpen] = useState(false);

  const { data: role, isLoading, isError, refetch } = useQuery({
    queryKey: ["role", id],
    queryFn: () => api<RoleDetailType>(`/api/v1/roles/${id}`),
    enabled: !!id,
  });
  const { data: permissions } = useQuery({
    queryKey: ["permissions"],
    queryFn: () => api<Permission[]>("/api/v1/permissions"),
  });

  const granted = useMemo(
    () => new Set((role?.permissions ?? []).map((p) => p.key)),
    [role],
  );

  // (Re)initialize the working selection when the role record first arrives or the id changes.
  useEffect(() => {
    setSelected(null);
    setTab("permissions");
  }, [id]);
  useEffect(() => {
    if (role && selected === null) {
      setSelected(new Set(role.permissions.map((p) => p.key)));
    }
  }, [role, selected]);

  const effectiveSelected = selected ?? granted;
  const dirty = selected !== null && !sameSet(selected, granted);

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
        body: JSON.stringify({ description: role?.description, permissionKeys: [...effectiveSelected] }),
      }),
    onSuccess: () => {
      toast.notify("Role updated.");
      setConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["role", id] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e) => toast.notify(e instanceof ApiError ? e.message : "Save failed.", "error"),
  });

  const remove = useMutation({
    mutationFn: async () => api(`/api/v1/roles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.notify("Role deleted.");
      navigate("/roles");
    },
    onError: (e) => toast.notify(e instanceof ApiError ? e.message : "Delete failed.", "error"),
  });

  if (isError) {
    return (
      <div className="page-role-detail">
        <ErrorState title="This role couldn't load" onRetry={() => refetch()} />
      </div>
    );
  }
  if (isLoading || !role) {
    return (
      <div className="page-role-detail">
        <Skeleton w={170} />
        <div className="skel-gap-sm" />
        <Skeleton w={260} h={22} />
        <div className="skel-gap-lg" />
        <div className="card">
          <SkeletonRows rows={6} />
        </div>
      </div>
    );
  }

  const inUse = role.memberCount > 0;

  function toggle(key: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current ?? granted);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleDomain(perms: Permission[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current ?? granted);
      for (const p of perms) {
        if (on) next.add(p.key);
        else next.delete(p.key);
      }
      return next;
    });
  }

  const memberColumns: Column<Member>[] = [
    {
      key: "member",
      label: "Member",
      render: (row) => <Ident name={row.name} sub={row.email ?? "—"} />,
    },
    {
      key: "status",
      label: "Status",
      width: "130px",
      render: (row) => (row.status ? <StatusPill status={row.status} /> : <span className="meta">—</span>),
    },
    {
      key: "scope",
      label: "Scope",
      width: "120px",
      render: (row) => <span className="badge badge-outline">{scopeLabel(row.scope)}</span>,
    },
  ];

  return (
    <div className="page-role-detail">
      <Link to="/roles" className="backlink">
        <IconArrowLeft />
        Roles &amp; permissions
      </Link>
      <PageHead
        title={
          <>
            {role.name}
            <span className="badge badge-outline">{scopeLabel(role.scope)}</span>
            {role.isSystem && <Badge tone="neutral">System</Badge>}
          </>
        }
        sub={role.description || "No description."}
        actions={
          <>
            {!role.isSystem && role.memberCount === 0 && (
              <Button variant="danger-ghost" icon={<IconBan />} onClick={() => setConfirm("delete")}>
                Delete role
              </Button>
            )}
            {!role.isSystem && (
              <Button variant="secondary" icon={<IconPencil />} onClick={() => setDescOpen(true)}>
                Edit description
              </Button>
            )}
          </>
        }
      />

      {inUse && (
        <Alert tone="warn" title={`Assigned to ${role.memberCount} administrator${role.memberCount === 1 ? "" : "s"}`}>
          Edits to this role change their access immediately and are recorded in the audit log.
        </Alert>
      )}

      <Tabs
        tabs={[
          { id: "permissions", label: "Permissions" },
          { id: "members", label: "Members", count: role.memberCount },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "permissions" && (
        <div>
          {role.isSystem && (
            <p className="system-note">System roles are built in and can't be edited.</p>
          )}
          <div className="perm-stack">
            {Object.entries(grouped).map(([domain, perms]) => {
              const grantedInDomain = perms.filter((p) => effectiveSelected.has(p.key)).length;
              const all = grantedInDomain === perms.length;
              const some = grantedInDomain > 0 && !all;
              return (
                <section key={domain} className="card perm-group" aria-labelledby={`perm-${domain}`}>
                  <div className="card-head">
                    <h2 id={`perm-${domain}`}>{domain}</h2>
                    <span className="count-pill">
                      {grantedInDomain}/{perms.length}
                    </span>
                    <div className="spacer">
                      <label className="selectall" data-disabled={role.isSystem}>
                        <input
                          type="checkbox"
                          className="check"
                          checked={all}
                          disabled={role.isSystem}
                          ref={(el) => {
                            if (el) el.indeterminate = some;
                          }}
                          onChange={(e) => toggleDomain(perms, e.target.checked)}
                        />
                        Select all
                      </label>
                    </div>
                  </div>
                  <div className="perm-rows">
                    {perms.map((p) => (
                      <label key={p.id} className="perm-row" data-disabled={role.isSystem}>
                        <input
                          type="checkbox"
                          className="check"
                          checked={effectiveSelected.has(p.key)}
                          disabled={role.isSystem}
                          onChange={(e) => toggle(p.key, e.target.checked)}
                        />
                        <span className="perm-main">
                          <span className="perm-key">{p.key}</span>
                          <span className="perm-desc">{p.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {tab === "members" && (
        <DataTable
          columns={memberColumns}
          rows={role.members}
          keyOf={(row) => row.assignmentId}
          loading={false}
          error={false}
          onRetry={() => refetch()}
          sort={null}
          onSort={() => {}}
          onRowClick={(row) => navigate(`/administrators/${row.personId}`)}
          empty={
            <EmptyState
              icon={<IconUsers />}
              title="No members yet"
              body="Assign this role to an administrator from the Administrators page."
            />
          }
          nextCursor={null}
          onNext={() => {}}
          onPrev={() => {}}
          pageIndex={0}
          countLabel={`${role.memberCount} member${role.memberCount === 1 ? "" : "s"}`}
        />
      )}

      {dirty && (
        <div className="savebar">
          <span className="savebar-label">Unsaved changes</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={save.isPending}
            onClick={() => setSelected(new Set(granted))}
          >
            Discard
          </Button>
          <Button
            size="sm"
            loading={save.isPending}
            onClick={() => (inUse ? setConfirm("save") : save.mutate())}
          >
            Save role
          </Button>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm === "delete" ? `Delete ${role.name}?` : "Apply role changes?"}
          body={
            confirm === "delete"
              ? "This permanently removes the role. The deletion is recorded in the audit log."
              : `${role.memberCount} administrator${role.memberCount === 1 ? "" : "s"} hold this role. Your permission changes apply to them immediately and are recorded in the audit log.`
          }
          confirmLabel={confirm === "delete" ? "Delete role" : "Apply changes"}
          danger={confirm === "delete"}
          busy={save.isPending || remove.isPending}
          onConfirm={() => (confirm === "delete" ? remove.mutate() : save.mutate())}
          onClose={() => setConfirm(null)}
        />
      )}

      {descOpen && (
        <EditDescriptionDrawer
          role={role}
          onClose={() => setDescOpen(false)}
          onSaved={() => {
            setDescOpen(false);
            toast.notify("Role updated.");
            queryClient.invalidateQueries({ queryKey: ["role", id] });
            queryClient.invalidateQueries({ queryKey: ["roles"] });
          }}
        />
      )}
    </div>
  );
}

function EditDescriptionDrawer({
  role,
  onClose,
  onSaved,
}: {
  role: RoleDetailType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(role.description);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api(`/api/v1/roles/${role.id}`, {
        method: "PATCH",
        body: JSON.stringify({ description }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server. Try again.");
      setBusy(false);
    }
  }

  return (
    <Drawer
      title="Edit description"
      sub={role.name}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="edit-role-desc-form" loading={busy}>
            Save changes
          </Button>
        </>
      }
    >
      {error && (
        <Alert tone="danger" title="Couldn't save">
          {error}
        </Alert>
      )}
      <form id="edit-role-desc-form" onSubmit={submit} noValidate>
        <Field
          label="Description"
          htmlFor="role-desc"
          help="Shown on the roles list and inside the assignment pickers."
        >
          <textarea
            id="role-desc"
            className="input"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </form>
    </Drawer>
  );
}
