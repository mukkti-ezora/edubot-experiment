import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiError, qs } from "@/lib/api";
import type { Page, RoleSummary, UserRow } from "@/lib/types";
import { formatDateTime, formatNumber, relativeFromNow } from "@/lib/format";
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
  IconButton,
  Ident,
  Menu,
  MenuItem,
  MenuSep,
  PageHead,
  SkeletonRows,
  StatusPill,
} from "@/components/ui";
import {
  IconBan,
  IconDots,
  IconEye,
  IconRefresh,
  IconSearch,
  IconUserPlus,
  IconX,
} from "@/components/icons";
import { useTableState } from "@/lib/useTableState";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import "@/styles/pages/governance.css";

const inviteSchema = z.object({
  firstName: z.string().min(1, "Required."),
  lastName: z.string().min(1, "Required."),
  email: z.string().email("Enter a valid email."),
  roleId: z.string().min(1, "Choose a role."),
});
type InviteValues = z.infer<typeof inviteSchema>;

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "deactivated", label: "Deactivated" },
];

export function Administrators() {
  const table = useTableState();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { me } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<UserRow | null>(null);

  // Deep link: /administrators?invite=1 opens the invite drawer, then the param is consumed.
  useEffect(() => {
    if (searchParams.get("invite") !== "1") return;
    setInviteOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("invite");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const query = table.get("query");
  const status = table.get("status");
  const statusLabel = STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;

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
        <div className="flex items-center gap-2 min-w-0">
          <Ident name={row.name} sub={row.email} />
          {row.id === me?.admin.id && <Badge tone="info">you</Badge>}
        </div>
      ),
    },
    {
      key: "roles",
      label: "Roles",
      render: (row) =>
        row.roles?.length ? (
          <div className="rolecell">
            {row.roles.slice(0, 2).map((r) => (
              <Badge key={r.roleId} tone="violet">
                {r.name}
              </Badge>
            ))}
            {row.roles.length > 2 && <Badge tone="neutral">+{row.roles.length - 2}</Badge>}
          </div>
        ) : (
          <span className="meta">No role</span>
        ),
    },
    {
      key: "scope",
      label: "Scope",
      width: "150px",
      render: (row) => <span className="badge badge-outline">{row.institutionName ?? "Platform"}</span>,
    },
    {
      key: "status",
      label: "Status",
      width: "130px",
      render: (row) => <StatusPill status={row.status} />,
    },
    {
      key: "lastLoginAt",
      label: "Last active",
      width: "130px",
      render: (row) =>
        row.lastLoginAt ? (
          <span className="meta nowrap tnum" title={formatDateTime(row.lastLoginAt)}>
            {relativeFromNow(row.lastLoginAt)}
          </span>
        ) : (
          <span className="meta">Never</span>
        ),
    },
    {
      key: "actions",
      label: "",
      width: "56px",
      align: "right",
      render: (row) =>
        row.id === me?.admin.id ? null : (
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <Menu trigger={<IconButton label="Row actions" size="sm"><IconDots /></IconButton>}>
              <MenuItem icon={<IconEye />} onSelect={() => navigate(`/administrators/${row.id}`)}>
                View profile
              </MenuItem>
              <MenuSep />
              {row.status === "deactivated" ? (
                <MenuItem
                  icon={<IconRefresh />}
                  onSelect={() => transition.mutate({ admin: row, action: "activate" })}
                >
                  Reactivate
                </MenuItem>
              ) : (
                <MenuItem icon={<IconBan />} danger onSelect={() => setDeactivateTarget(row)}>
                  Deactivate
                </MenuItem>
              )}
            </Menu>
          </div>
        ),
    },
  ];

  return (
    <div className="page-administrators">
      <PageHead
        title="Administrators"
        sub="People with elevated platform or institution privileges."
        actions={
          <Button icon={<IconUserPlus />} onClick={() => setInviteOpen(true)}>
            Invite administrator
          </Button>
        }
      />

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
          toolbar={
            <div className="filterbar" role="search">
              <div className="search-wrap">
                <IconSearch />
                <input
                  className="input"
                  placeholder="Search name or email…"
                  defaultValue={query}
                  aria-label="Search administrators"
                  onChange={(e) => table.set({ query: e.target.value || null })}
                />
              </div>
              <select
                className="select"
                aria-label="Filter by status"
                value={status}
                onChange={(e) => table.set({ status: e.target.value || null })}
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {query && (
                <button className="fchip" data-active="true" onClick={() => table.set({ query: null })}>
                  Search: {query}
                  <span className="x" aria-hidden="true">
                    <IconX />
                  </span>
                </button>
              )}
              {status && (
                <button className="fchip" data-active="true" onClick={() => table.set({ status: null })}>
                  Status: {statusLabel}
                  <span className="x" aria-hidden="true">
                    <IconX />
                  </span>
                </button>
              )}
              {(query || status) && (
                <Button variant="ghost" size="sm" onClick={() => table.set({ query: null, status: null })}>
                  Clear all
                </Button>
              )}
            </div>
          }
          empty={
            <EmptyState
              title={query || status ? "No administrators match these filters" : "No other administrators yet"}
              body={
                query || status
                  ? "Try widening the search or clearing a filter."
                  : "Invite a platform administrator with a role that fits their responsibilities."
              }
              action={
                query || status ? undefined : (
                  <Button size="sm" icon={<IconUserPlus />} onClick={() => setInviteOpen(true)}>
                    Invite administrator
                  </Button>
                )
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

      {deactivateTarget && (
        <ConfirmDialog
          title={`Deactivate ${deactivateTarget.name}?`}
          body={
            <>
              Their sign-in is revoked immediately and their account is disabled. To undo,
              reactivate them. Every action is recorded in the audit log.
            </>
          }
          confirmLabel="Deactivate administrator"
          busy={transition.isPending}
          onConfirm={() => transition.mutate({ admin: deactivateTarget, action: "deactivate" })}
          onClose={() => setDeactivateTarget(null)}
        />
      )}

      {inviteOpen && (
        <InviteDrawer
          onClose={() => setInviteOpen(false)}
          onDone={() => {
            setInviteOpen(false);
            queryClient.invalidateQueries({ queryKey: ["administrators"] });
          }}
        />
      )}
    </div>
  );
}

function InviteDrawer({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: roles } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api<RoleSummary[]>("/api/v1/roles"),
  });
  const {
    register,
    control,
    handleSubmit,
    setError,
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
      toast.notify(`Invitation sent to ${result.administrator.email}.`);
      setInviteNote(result.invite.note);
      setTimeout(onDone, 900);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fields) {
          for (const [field, message] of Object.entries(error.fields)) {
            setError(field as keyof InviteValues, { message });
          }
        } else {
          setServerError(error.message);
        }
      } else {
        setServerError("Couldn't reach the server. Try again.");
      }
    }
  }

  return (
    <Drawer
      title="Invite administrator"
      sub="They'll receive an invitation to join the platform."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="invite-form" loading={isSubmitting}>
            Invite administrator
          </Button>
        </>
      }
    >
      <Alert tone="info" title="Simulated invite">
        Email delivery isn't configured yet — no email is sent. You'll get a setup note to share
        manually.
      </Alert>
      {serverError && (
        <Alert tone="danger" title="Couldn't send invitation">
          {serverError}
        </Alert>
      )}
      {inviteNote && <Alert tone="ok">{inviteNote}</Alert>}
      <form id="invite-form" onSubmit={handleSubmit(submit)} noValidate>
        <div className="grid-2">
          <Field label="First name" htmlFor="ia-fn" error={errors.firstName?.message}>
            <input id="ia-fn" className="input" aria-invalid={!!errors.firstName} {...register("firstName")} />
          </Field>
          <Field label="Last name" htmlFor="ia-ln" error={errors.lastName?.message}>
            <input id="ia-ln" className="input" aria-invalid={!!errors.lastName} {...register("lastName")} />
          </Field>
        </div>
        <Field
          label="Email"
          htmlFor="ia-email"
          error={errors.email?.message}
          help="This becomes their sign-in identity."
        >
          <input
            id="ia-email"
            className="input"
            autoComplete="off"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
        </Field>
        <Controller
          control={control}
          name="roleId"
          render={({ field }) => (
            <Field label="Role" error={errors.roleId?.message}>
              <div className="rolepick" role="group" aria-label="Role">
                {!roles && <SkeletonRows rows={3} />}
                {(roles ?? []).map((role) => (
                  <label
                    key={role.id}
                    className="panel-inset rolepick-row"
                    data-selected={field.value === role.id}
                  >
                    <input
                      type="checkbox"
                      className="check"
                      checked={field.value === role.id}
                      onChange={() => field.onChange(field.value === role.id ? "" : role.id)}
                    />
                    <span className="rolepick-main">
                      <span className="rolepick-name">{role.name}</span>
                      <span className="rolepick-desc">{role.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Field>
          )}
        />
      </form>
    </Drawer>
  );
}
