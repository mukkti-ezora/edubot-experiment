import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, qs } from "@/lib/api";
import type { Institution, Page, RoleSummary, UserRow } from "@/lib/types";
import { formatDate, formatNumber, relativeFromNow, typeLabel } from "@/lib/format";
import { DataTable, type Column } from "@/components/DataTable";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  Ident,
  Menu,
  MenuItem,
  MenuSep,
  PageHead,
  StatusPill,
} from "@/components/ui";
import { IconBan, IconCheck, IconDots, IconEye, IconSearch, IconUsers, IconX } from "@/components/icons";
import { useTableState } from "@/lib/useTableState";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import "@/styles/pages/users.css";

const TYPE_OPTIONS = [
  { value: "student", label: "Students" },
  { value: "teacher", label: "Teachers" },
  { value: "parent", label: "Parents" },
  { value: "administrator", label: "Administrators" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "suspended", label: "Suspended" },
  { value: "deactivated", label: "Deactivated" },
];

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

type PendingTransition = { user: UserRow; action: "activate" | "deactivate" };

export function Users() {
  const table = useTableState();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { me } = useAuth();
  const [pending, setPending] = useState<PendingTransition | null>(null);

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

  /* Only fetched to label the role filter chip when a ?roleId= deep link is present. */
  const { data: roleOptions } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api<RoleSummary[]>("/api/v1/roles"),
    staleTime: 120_000,
    enabled: !!roleId,
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
    mutationFn: async ({ user, action }: PendingTransition) =>
      api(`/api/v1/users/${user.id}/${action}`, { method: "POST", body: "{}" }),
    onSuccess: (_d, { user, action }) => {
      toast.notify(`${user.name} ${action === "deactivate" ? "deactivated" : "activated"}.`);
      setPending(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => toast.notify(e instanceof ApiError ? e.message : "Action failed.", "error"),
  });

  const hasFilters = !!(query || status || type || institutionId || roleId);
  const clearAll = () => table.set({ query: null, status: null, type: null, institutionId: null, roleId: null });

  const chips: { key: string; label: string; onClear: () => void }[] = [];
  if (query) chips.push({ key: "query", label: `Search: “${query}”`, onClear: () => table.set({ query: null }) });
  if (type) chips.push({ key: "type", label: `Type: ${typeLabel(type)}`, onClear: () => table.set({ type: null }) });
  if (status) chips.push({ key: "status", label: `Status: ${statusLabel(status)}`, onClear: () => table.set({ status: null }) });
  if (institutionId) {
    chips.push({
      key: "institution",
      label: `Institution: ${institutions?.items.find((i) => i.id === institutionId)?.name ?? "selected"}`,
      onClear: () => table.set({ institutionId: null }),
    });
  }
  if (roleId) {
    chips.push({
      key: "role",
      label: `Role: ${roleOptions?.find((r) => r.id === roleId)?.name ?? "selected"}`,
      onClear: () => table.set({ roleId: null }),
    });
  }

  const columns: Column<UserRow>[] = [
    {
      key: "name",
      label: "User",
      render: (row) => <Ident name={row.name} sub={row.email} />,
    },
    {
      key: "type",
      label: "Type",
      width: "128px",
      render: (row) => <Badge tone="neutral">{typeLabel(row.type)}</Badge>,
    },
    {
      key: "institution",
      label: "Institution",
      render: (row) => <span className="meta truncate inst-cell">{row.institutionName ?? "—"}</span>,
    },
    {
      key: "status",
      label: "Status",
      width: "120px",
      render: (row) => <StatusPill status={row.status} />,
    },
    {
      key: "lastLoginAt",
      label: "Last active",
      width: "110px",
      render: (row) => <span className="meta nowrap">{row.lastLoginAt ? relativeFromNow(row.lastLoginAt) : "Never"}</span>,
    },
    {
      key: "createdAt",
      label: "Created",
      width: "110px",
      render: (row) => <span className="meta nowrap">{formatDate(row.createdAt)}</span>,
    },
    {
      key: "actions",
      label: "",
      width: "56px",
      align: "right",
      render: (row) => {
        const isSelf = row.id === me?.admin.id;
        const manage =
          row.status === "deactivated"
            ? ({ action: "activate" as const, label: "Activate", icon: <IconCheck /> } as const)
            : !isSelf
              ? ({ action: "deactivate" as const, label: "Deactivate", icon: <IconBan /> } as const)
              : null;
        return (
          <div
            className="row-menu"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key !== "Tab") e.stopPropagation();
            }}
          >
            <Menu trigger={<IconButton label="Row actions" size="sm">{<IconDots />}</IconButton>} width={190}>
              <MenuItem icon={<IconEye />} onSelect={() => navigate(`/users/${row.id}`)}>
                View profile
              </MenuItem>
              {manage && <MenuSep />}
              {manage && (
                <MenuItem
                  icon={manage.icon}
                  danger={manage.action === "deactivate"}
                  onSelect={() => setPending({ user: row, action: manage.action })}
                >
                  {manage.label}
                </MenuItem>
              )}
            </Menu>
          </div>
        );
      },
    },
  ];

  const toolbar = (
    <div className="filterbar" role="search">
      <div className="search-wrap">
        <IconSearch />
        <input
          className="input"
          placeholder="Search name or email…"
          value={query}
          aria-label="Search users"
          onChange={(e) => table.set({ query: e.target.value || null })}
        />
      </div>
      <select
        className="select"
        aria-label="Filter by type"
        value={type}
        onChange={(e) => table.set({ type: e.target.value || null })}
      >
        <option value="">All types</option>
        {TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <select
        className="select"
        aria-label="Filter by status"
        value={status}
        onChange={(e) => table.set({ status: e.target.value || null })}
      >
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <select
        className="select"
        aria-label="Filter by institution"
        value={institutionId}
        onChange={(e) => table.set({ institutionId: e.target.value || null })}
      >
        <option value="">All institutions</option>
        {institutions?.items.map((inst) => (
          <option key={inst.id} value={inst.id}>{inst.name}</option>
        ))}
      </select>
      {chips.map((chip) => (
        <button
          key={chip.key}
          className="fchip"
          data-active="true"
          onClick={chip.onClear}
          aria-label={`Remove filter: ${chip.label}`}
        >
          <span className="chip-label">{chip.label}</span>
          <span className="x" aria-hidden="true">
            <IconX />
          </span>
        </button>
      ))}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          Clear all
        </Button>
      )}
    </div>
  );

  return (
    <div className="page-users">
      <PageHead title="Users" sub="Every person registered across all institutions." />

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
          toolbar={toolbar}
          empty={
            <EmptyState
              icon={<IconUsers />}
              title={hasFilters ? "No users match these filters" : "No users yet"}
              body={
                hasFilters
                  ? "Try a different institution, type, or search term — or clear the filters to see everyone."
                  : "People appear here as institutions register them and administrators are invited."
              }
              action={
                hasFilters ? (
                  <Button variant="secondary" size="sm" onClick={clearAll}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          }
          nextCursor={data?.nextCursor ?? null}
          onNext={() => table.onNext(data?.nextCursor ?? null)}
          onPrev={table.onPrev}
          pageIndex={table.pageIndex}
          countLabel={data ? `${formatNumber(data.items.length)} shown this page` : ""}
        />
      )}

      {pending && (
        <ConfirmDialog
          title={
            pending.action === "deactivate"
              ? `Deactivate ${pending.user.name}?`
              : `Activate ${pending.user.name}?`
          }
          body={
            pending.action === "deactivate" ? (
              <>
                {pending.user.name} will lose access immediately. Existing sessions are revoked and the action is
                recorded in the audit log.
              </>
            ) : (
              <>
                {pending.user.name} regains access immediately and can sign in again. The action is recorded in the
                audit log.
              </>
            )
          }
          confirmLabel={pending.action === "deactivate" ? "Deactivate user" : "Activate user"}
          danger={pending.action === "deactivate"}
          busy={transition.isPending}
          onConfirm={() => transition.mutate({ user: pending.user, action: pending.action })}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  );
}
