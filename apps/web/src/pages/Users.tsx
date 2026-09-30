import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, qs } from "@/lib/api";
import type { Institution, Page, UserRow } from "@/lib/types";
import { formatNumber, typeLabel } from "@/lib/format";
import { DataTable, type Column } from "@/components/DataTable";
import { Badge, ConfirmDialog, EmptyState, ErrorState, statusTone } from "@/components/ui";
import { useTableState } from "@/lib/useTableState";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";

export function Users() {
  const table = useTableState();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { me } = useAuth();
  const [deactivateTarget, setDeactivateTarget] = useState<UserRow | null>(null);

  const query = table.get("query");
  const status = table.get("status");
  const type = table.get("type");
  const institutionId = table.get("institutionId");
  const roleId = table.get("roleId");

  const { data: institutions } = useQuery({
    queryKey: ["institutions", "options"],
    queryFn: () => api<Page<Institution>>("/api/v1/institutions?limit=100&sort=name"),
    staleTime: 120_000,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["users", query, status, type, institutionId, roleId, table.sort, table.cursor],
    queryFn: () =>
      api<Page<UserRow>>(
        `/api/v1/users${qs({
          query: query || undefined,
          status: status || undefined,
          type: type || undefined,
          institutionId: institutionId || undefined,
          roleId: roleId || undefined,
          sort: table.sort ?? "name",
          cursor: table.cursor ?? undefined,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const transition = useMutation({
    mutationFn: async ({ user, action }: { user: UserRow; action: "activate" | "deactivate" }) =>
      api(`/api/v1/users/${user.id}/${action}`, { method: "POST", body: "{}" }),
    onSuccess: (_d, { user, action }) => {
      toast.notify(`${user.name} ${action === "deactivate" ? "deactivated" : "activated"}.`);
      setDeactivateTarget(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => toast.notify(e instanceof ApiError ? e.message : "Action failed.", "error"),
  });

  const columns: Column<UserRow>[] = [
    {
      key: "name",
      label: "Name",
      render: (row) => (
        <div>
          <div className="cell-main">{row.name}</div>
          <div className="cell-sub">{row.email}</div>
        </div>
      ),
    },
    { key: "type", label: "Type", width: "130px", render: (row) => typeLabel(row.type) },
    {
      key: "institution",
      label: "Institution",
      render: (row) => <span className="meta">{row.institutionName ?? "Platform"}</span>,
    },
    {
      key: "status",
      label: "Status",
      width: "120px",
      render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge>,
    },
    {
      key: "actions",
      label: "",
      width: "110px",
      render: (row) =>
        row.status === "deactivated" ? (
          <button
            className="btn btn-quiet btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              transition.mutate({ user: row, action: "activate" });
            }}
          >
            Activate
          </button>
        ) : row.id === me?.admin.id ? null : (
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
          <h1>Users</h1>
          <p className="sub">
            Every person known to the platform, across all institutions. Identity operations are recorded in the audit log.
          </p>
        </div>
      </div>

      <div className="filters" role="search">
        <input
          className="input search"
          placeholder="Search name or email…"
          defaultValue={query}
          aria-label="Search users"
          onChange={(e) => table.set({ query: e.target.value || null })}
        />
        <select className="select" aria-label="Filter by institution" value={institutionId} onChange={(e) => table.set({ institutionId: e.target.value || null })}>
          <option value="">All institutions</option>
          {institutions?.items.map((inst) => (
            <option key={inst.id} value={inst.id}>{inst.name}</option>
          ))}
        </select>
        <select className="select" aria-label="Filter by type" value={type} onChange={(e) => table.set({ type: e.target.value || null })}>
          <option value="">All types</option>
          <option value="student">Students</option>
          <option value="teacher">Teachers</option>
          <option value="parent">Parents</option>
          <option value="administrator">Administrators</option>
        </select>
        <select className="select" aria-label="Filter by status" value={status} onChange={(e) => table.set({ status: e.target.value || null })}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="invited">Invited</option>
          <option value="suspended">Suspended</option>
          <option value="deactivated">Deactivated</option>
        </select>
        {(query || status || type || institutionId) && (
          <button className="btn btn-quiet btn-sm" onClick={() => table.set({ query: null, status: null, type: null, institutionId: null })}>
            Clear filters
          </button>
        )}
      </div>

      {isError ? (
        <ErrorState title="The user registry couldn't load" onRetry={() => refetch()} />
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
          sortable={new Set(["name", "type", "status", "createdAt"])}
          onRowClick={(row) => navigate(`/users/${row.id}`)}
          empty={
            <EmptyState
              title="No users match these filters"
              body="Try a different institution, type, or search term."
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
              {deactivateTarget.name} will lose access immediately. Existing sessions are revoked and the action is recorded in the audit log.
            </>
          }
          confirmLabel="Deactivate user"
          busy={transition.isPending}
          onConfirm={() => transition.mutate({ user: deactivateTarget, action: "deactivate" })}
          onClose={() => setDeactivateTarget(null)}
        />
      )}
    </div>
  );
}
