import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiError } from "@/lib/api";
import type { RoleDetail as RoleDetailType, RoleSummary } from "@/lib/types";
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
  Menu,
  MenuItem,
  MenuSep,
  PageHead,
} from "@/components/ui";
import { IconDots, IconEye, IconKey, IconPencil, IconPlus, IconX } from "@/components/icons";
import { useToast } from "@/lib/toast";
import "@/styles/pages/governance.css";

const createSchema = z.object({
  name: z.string().min(2, "At least 2 characters."),
  description: z.string(),
});
type CreateValues = z.infer<typeof createSchema>;

function scopeLabel(scope: string): string {
  return scope.charAt(0).toUpperCase() + scope.slice(1);
}

export function Roles() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoleSummary | null>(null);

  // Deep link: /roles?create=1 opens the create drawer, then the param is consumed.
  useEffect(() => {
    if (searchParams.get("create") !== "1") return;
    setCreateOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const { data: roles, isLoading, isError, refetch } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api<RoleSummary[]>("/api/v1/roles"),
  });

  const remove = useMutation({
    mutationFn: async (role: RoleSummary) => api(`/api/v1/roles/${role.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.notify("Role deleted.");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e) => {
      toast.notify(e instanceof ApiError ? e.message : "Delete failed.", "error");
      setDeleteTarget(null);
    },
  });

  const columns: Column<RoleSummary>[] = [
    {
      key: "name",
      label: "Role",
      render: (row) => (
        <div className="min-w-0">
          <div className="cell-main">{row.name}</div>
          <div className="cell-sub truncate role-desc">{row.description || "No description."}</div>
        </div>
      ),
    },
    {
      key: "scope",
      label: "Scope",
      width: "120px",
      render: (row) => <span className="badge badge-outline">{scopeLabel(row.scope)}</span>,
    },
    {
      key: "members",
      label: "Members",
      width: "100px",
      align: "right",
      render: (row) => <span className="tnum">{row.memberCount}</span>,
    },
    {
      key: "permissions",
      label: "Permissions",
      width: "110px",
      align: "right",
      render: (row) => <span className="tnum">{row.permissionCount}</span>,
    },
    {
      key: "system",
      label: "System",
      width: "100px",
      render: (row) => (row.isSystem ? <Badge tone="neutral">System</Badge> : <span className="meta">—</span>),
    },
    {
      key: "actions",
      label: "",
      width: "56px",
      align: "right",
      render: (row) => (
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <Menu trigger={<IconButton label="Row actions" size="sm"><IconDots /></IconButton>}>
            <MenuItem icon={<IconEye />} onSelect={() => navigate(`/roles/${row.id}`)}>
              View
            </MenuItem>
            <MenuItem icon={<IconPencil />} onSelect={() => navigate(`/roles/${row.id}`)}>
              Edit
            </MenuItem>
            {!row.isSystem && row.memberCount === 0 && (
              <>
                <MenuSep />
                <MenuItem icon={<IconX />} danger onSelect={() => setDeleteTarget(row)}>
                  Delete role
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      ),
    },
  ];

  return (
    <div className="page-roles">
      <PageHead
        title="Roles & permissions"
        sub="Compose capabilities into roles; assign with explicit scope."
        actions={
          <Button icon={<IconPlus />} onClick={() => setCreateOpen(true)}>
            Create role
          </Button>
        }
      />

      {isError ? (
        <ErrorState title="Roles couldn't load" onRetry={() => refetch()} />
      ) : (
        <DataTable
          columns={columns}
          rows={roles ?? []}
          keyOf={(row) => row.id}
          loading={isLoading}
          error={false}
          onRetry={() => refetch()}
          sort={null}
          onSort={() => {}}
          onRowClick={(row) => navigate(`/roles/${row.id}`)}
          empty={
            <EmptyState
              icon={<IconKey />}
              title="No roles yet"
              body="Roles bundle permissions into assignable capabilities. Create one, then grant it to administrators."
              action={
                <Button size="sm" icon={<IconPlus />} onClick={() => setCreateOpen(true)}>
                  Create role
                </Button>
              }
            />
          }
          nextCursor={null}
          onNext={() => {}}
          onPrev={() => {}}
          pageIndex={0}
          countLabel={roles ? `${roles.length} roles` : ""}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete ${deleteTarget.name}?`}
          body="This permanently removes the role. The deletion is recorded in the audit log."
          confirmLabel="Delete role"
          busy={remove.isPending}
          onConfirm={() => remove.mutate(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {createOpen && (
        <CreateRoleDrawer
          onClose={() => setCreateOpen(false)}
          onCreated={(role) => {
            setCreateOpen(false);
            toast.notify("Role created.");
            queryClient.invalidateQueries({ queryKey: ["roles"] });
            navigate(`/roles/${role.id}`);
          }}
        />
      )}
    </div>
  );
}

function CreateRoleDrawer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (role: RoleDetailType) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", description: "" },
  });

  async function submit(values: CreateValues) {
    setServerError(null);
    try {
      const created = await api<RoleDetailType>("/api/v1/roles", {
        method: "POST",
        body: JSON.stringify({ name: values.name, description: values.description }),
      });
      onCreated(created);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fields) {
          for (const [field, message] of Object.entries(error.fields)) {
            setError(field as keyof CreateValues, { message });
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
      title="Create role"
      sub="Bundle permissions into a reusable capability set."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="create-role-form" loading={isSubmitting}>
            Create role
          </Button>
        </>
      }
    >
      {serverError && (
        <Alert tone="danger" title="Couldn't create role">
          {serverError}
        </Alert>
      )}
      <form id="create-role-form" onSubmit={handleSubmit(submit)} noValidate>
        <Field label="Name" htmlFor="cr-name" error={errors.name?.message}>
          <input
            id="cr-name"
            className="input"
            placeholder="e.g. Enrollment Manager"
            aria-invalid={!!errors.name}
            {...register("name")}
          />
        </Field>
        <Field label="Scope" htmlFor="cr-scope" help="Roles apply platform-wide in this release.">
          <select id="cr-scope" className="select" disabled value="platform">
            <option value="platform">Platform</option>
          </select>
        </Field>
        <Field label="Description" htmlFor="cr-desc" error={errors.description?.message}>
          <textarea
            id="cr-desc"
            className="input"
            rows={3}
            placeholder="What this role is for, and who should hold it."
            {...register("description")}
          />
        </Field>
      </form>
    </Drawer>
  );
}
