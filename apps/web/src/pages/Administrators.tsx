import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiError, qs } from "@/lib/api";
import type { Page, RoleSummary, UserRow } from "@/lib/types";
import { formatDateTime, formatNumber } from "@/lib/format";
import { DataTable, type Column } from "@/components/DataTable";
import { Badge, ConfirmDialog, EmptyState, ErrorState, statusTone } from "@/components/ui";
import { useTableState } from "@/lib/useTableState";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";

const inviteSchema = z.object({
  firstName: z.string().min(1, "Required."),
  lastName: z.string().min(1, "Required."),
  email: z.string().email("Enter a valid email."),
  roleId: z.string().min(1, "Choose a role."),
});
type InviteValues = z.infer<typeof inviteSchema>;

export function Administrators() {
  const table = useTableState();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { me } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<UserRow | null>(null);

  const query = table.get("query");
  const status = table.get("status");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["administrators", query, status, table.sort, table.cursor],
    queryFn: () =>
      api<Page<UserRow>>(
        `/api/v1/administrators${qs({
          query: query || undefined,
          status: status || undefined,
          sort: table.sort ?? "name",
          cursor: table.cursor ?? undefined,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const transition = useMutation({
    mutationFn: async ({ admin, action }: { admin: UserRow; action: "activate" | "deactivate" }) =>
      api(`/api/v1/administrators/${admin.id}/${action}`, { method: "POST", body: "{}" }),
    onSuccess: (_d, { admin, action }) => {
      toast.notify(`${admin.name} ${action === "deactivate" ? "deactivated" : "reactivated"}.`);
      setDeactivateTarget(null);
      queryClient.invalidateQueries({ queryKey: ["administrators"] });
    },
    onError: (e) => toast.notify(e instanceof ApiError ? e.message : "Action failed.", "error"),
  });

  const columns: Column<UserRow>[] = [
    {
      key: "name",
      label: "Administrator",
      render: (row) => (
        <div>
          <div className="cell-main">{row.name}{row.id === me?.admin.id ? " (you)" : ""}</div>
          <div className="cell-sub">{row.email}</div>
        </div>
      ),
    },
    {
      key: "roles",
      label: "Role",
      render: (row) =>
        row.roles?.length ? (
          row.roles.map((r) => <Badge key={r.roleId} tone="neutral">{r.name}</Badge>)
        ) : (
          <span className="meta">No role</span>
        ),
    },
    {
      key: "status",
      label: "Status",
      width: "120px",
      render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge>,
    },
    {
      key: "lastLoginAt",
      label: "Last sign-in",
      width: "170px",
      render: (row) => <span className="meta nowrap">{row.lastLoginAt ? formatDateTime(row.lastLoginAt) : "Never"}</span>,
    },
    {
      key: "actions",
      label: "",
      width: "110px",
      render: (row) =>
        row.id === me?.admin.id ? null : row.status === "deactivated" ? (
          <button
            className="btn btn-quiet btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              transition.mutate({ admin: row, action: "activate" });
            }}
          >
            Reactivate
          </button>
        ) : (
          <button
            className="btn btn-quiet btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              setDeactivateTarget(row);
            }}
          >
            Deactivate
          </button>
        ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Administrators</h1>
          <p className="sub">People who can operate the platform. Permissions differ by assigned role.</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setInviteOpen(true)}>Invite administrator</button>
        </div>
      </div>

      <div className="filters" role="search">
        <input
          className="input search"
          placeholder="Search name or email…"
          defaultValue={query}
          aria-label="Search administrators"
          onChange={(e) => table.set({ query: e.target.value || null })}
        />
        <select className="select" aria-label="Filter by status" value={status} onChange={(e) => table.set({ status: e.target.value || null })}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="invited">Invited</option>
          <option value="deactivated">Deactivated</option>
        </select>
      </div>

      {isError ? (
        <ErrorState title="Administrators couldn't load" onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          keyOf={(row) => row.id}
          loading={isLoading}
          error={false}
          onRetry={() => refetch()}
          sort={table.sort}
          onSort={table.onSort}
          sortable={new Set(["name", "status", "createdAt"])}
          onRowClick={(row) => navigate(`/administrators/${row.id}`)}
          empty={
            <EmptyState
              title="No administrators match"
              body="Invite a platform administrator with a role that fits their responsibilities."
            />
          }
          nextCursor={data?.nextCursor ?? null}
          onNext={() => table.onNext(data?.nextCursor ?? null)}
          onPrev={table.onPrev}
          pageIndex={table.pageIndex}
          countLabel={data ? `${formatNumber(data.items.length)} shown this page` : ""}
        />
      )}

      {deactivateTarget && (
        <ConfirmDialog
          title={`Deactivate ${deactivateTarget.name}?`}
          body={
            <>
              Their sign-in is revoked immediately and their account is disabled.
              To undo, reactivate them. Every action is recorded in the audit log.
            </>
          }
          confirmLabel="Deactivate administrator"
          busy={transition.isPending}
          onConfirm={() => transition.mutate({ admin: deactivateTarget, action: "deactivate" })}
          onClose={() => setDeactivateTarget(null)}
        />
      )}

      {inviteOpen && <InviteDialog onClose={() => setInviteOpen(false)} onDone={() => {
        setInviteOpen(false);
        queryClient.invalidateQueries({ queryKey: ["administrators"] });
      }} />}
    </div>
  );
}

function InviteDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: roles } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api<RoleSummary[]>("/api/v1/roles"),
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InviteValues>({ resolver: zodResolver(inviteSchema) });

  async function submit(values: InviteValues) {
    setServerError(null);
    try {
      const result = await api<{ administrator: UserRow; invite: { simulated: boolean; note: string } }>(
        "/api/v1/administrators",
        {
          method: "POST",
          body: JSON.stringify(values),
        },
      );
      toast.notify(`${result.administrator.name} invited with role assigned.`);
      setInviteNote(result.invite.note);
      setTimeout(onDone, 900);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "Couldn't reach the server.");
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Invite administrator">
        <h2>Invite administrator</h2>
        <div className="body">
          <p style={{ marginBottom: 14 }}>
            The invite is <b>simulated</b> — no email is sent yet. You'll get a setup note to share manually.
          </p>
          {serverError && <div className="banner-error" role="alert">{serverError}</div>}
          {inviteNote && <div className="banner-error" style={{ borderColor: "var(--info-600)", background: "var(--info-100)", color: "var(--info-600)" }} role="status">{inviteNote}</div>}
          <form onSubmit={handleSubmit(submit)} noValidate>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="ia-fn">First name</label>
                <input id="ia-fn" className="input" aria-invalid={!!errors.firstName} {...register("firstName")} />
                {errors.firstName && <span className="error">{errors.firstName.message}</span>}
              </div>
              <div className="field">
                <label htmlFor="ia-ln">Last name</label>
                <input id="ia-ln" className="input" aria-invalid={!!errors.lastName} {...register("lastName")} />
                {errors.lastName && <span className="error">{errors.lastName.message}</span>}
              </div>
            </div>
            <div className="field">
              <label htmlFor="ia-email">Email</label>
              <input id="ia-email" className="input" autoComplete="off" aria-invalid={!!errors.email} {...register("email")} />
              {errors.email ? <span className="error">{errors.email.message}</span> : <span className="help">This becomes their sign-in identity.</span>}
            </div>
            <div className="field">
              <label htmlFor="ia-role">Role</label>
              <select id="ia-role" className="select" aria-invalid={!!errors.roleId} {...register("roleId")}>
                <option value="">Choose…</option>
                {roles?.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name} — {role.description}
                  </option>
                ))}
              </select>
              {errors.roleId && <span className="error">{errors.roleId.message}</span>}
            </div>
            <footer style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting && <span className="btn-spinner" aria-hidden="true" />}
                Invite administrator
              </button>
            </footer>
          </form>
        </div>
      </div>
    </div>
  );
}
