import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiError, qs } from "@/lib/api";
import type { Institution, Page } from "@/lib/types";
import { formatDate, formatNumber } from "@/lib/format";
import { DataTable, type Column } from "@/components/DataTable";
import {
  Alert,
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
  StatusPill,
} from "@/components/ui";
import {
  IconBan,
  IconBuilding,
  IconDots,
  IconEye,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconX,
} from "@/components/icons";
import { useTableState } from "@/lib/useTableState";
import { useToast } from "@/lib/toast";
import "@/styles/pages/institutions.css";

const TYPES = ["University", "College", "Community College", "Institute of Technology", "Academy"];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "suspended", label: "Suspended" },
];

const createSchema = z.object({
  name: z.string().min(2, "At least 2 characters."),
  code: z.string().regex(/^[A-Z0-9]{2,12}$/, "2–12 uppercase letters/digits."),
  type: z.string().min(1, "Choose a type."),
  city: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.union([z.literal(""), z.string().email("Enter a valid email.")]),
});
type CreateValues = z.infer<typeof createSchema>;

const editSchema = z.object({
  name: z.string().min(2, "At least 2 characters."),
  type: z.string().min(1, "Choose a type."),
  city: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.union([z.literal(""), z.string().email("Enter a valid email.")]),
});
type EditValues = z.infer<typeof editSchema>;

type PendingTransition = { inst: Institution; action: "suspend" | "reactivate" };

export function Institutions() {
  const table = useTableState();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(searchParams.get("create") === "1");
  const [editTarget, setEditTarget] = useState<Institution | null>(null);
  const [pending, setPending] = useState<PendingTransition | null>(null);
  const toast = useToast();
  const queryClient = useQueryClient();

  /* Deep link: ?create=1 opens the creation drawer, then the param is consumed. */
  useEffect(() => {
    if (searchParams.get("create") !== "1") return;
    setCreateOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const query = table.get("query");
  const status = table.get("status");
  const type = table.get("type");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["institutions", query, status, type, table.sort, table.cursor],
    queryFn: () =>
      api<Page<Institution>>(
        `/api/v1/institutions${qs({
          query: query || undefined,
          status: status || undefined,
          type: type || undefined,
          sort: table.sort ?? "name",
          cursor: table.cursor ?? undefined,
        })}`,
      ),
    placeholderData: (previous) => previous,
  });

  const transition = useMutation({
    mutationFn: async ({ inst, action, reason }: PendingTransition & { reason?: string }) =>
      api(`/api/v1/institutions/${inst.id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ reason: action === "suspend" ? (reason ?? "Administrative action") : null }),
      }),
    onSuccess: (_d, { inst, action }) => {
      toast.notify(action === "suspend" ? `${inst.name} suspended.` : `${inst.name} reactivated.`);
      setPending(null);
      queryClient.invalidateQueries({ queryKey: ["institutions"] });
    },
    onError: (e) => toast.notify(e instanceof ApiError ? e.message : "Action failed.", "error"),
  });

  const hasFilters = !!(query || status || type);
  const clearAll = () => table.set({ query: null, status: null, type: null });

  const chips: { key: string; label: string; onClear: () => void }[] = [];
  if (query) chips.push({ key: "query", label: `Search: “${query}”`, onClear: () => table.set({ query: null }) });
  if (status) {
    chips.push({
      key: "status",
      label: `Status: ${STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status}`,
      onClear: () => table.set({ status: null }),
    });
  }
  if (type) chips.push({ key: "type", label: `Type: ${type}`, onClear: () => table.set({ type: null }) });

  const columns: Column<Institution>[] = [
    {
      key: "name",
      label: "Institution",
      render: (row) => {
        const location = [row.city, row.region].filter(Boolean).join(", ");
        return (
          <Ident
            name={row.name}
            sub={
              <>
                <span className="mono">{row.code}</span>
                {location ? ` · ${location}` : ""}
              </>
            }
          />
        );
      },
    },
    { key: "type", label: "Type", width: "150px", render: (row) => row.type },
    {
      key: "status",
      label: "Status",
      width: "120px",
      render: (row) => <StatusPill status={row.status} />,
    },
    {
      key: "contact",
      label: "Contact",
      width: "220px",
      render: (row) =>
        !row.contactName && !row.contactEmail ? (
          <span className="meta">—</span>
        ) : (
          <div className="min-w-0">
            <div className="cell-main truncate">{row.contactName ?? row.contactEmail}</div>
            {row.contactName && row.contactEmail ? (
              <div className="cell-sub truncate">{row.contactEmail}</div>
            ) : null}
          </div>
        ),
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
      render: (row) => (
        <div
          className="row-menu"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key !== "Tab") e.stopPropagation();
          }}
        >
          <Menu trigger={<IconButton label="Row actions" size="sm">{<IconDots />}</IconButton>} width={200}>
            <MenuItem icon={<IconEye />} onSelect={() => navigate(`/institutions/${row.id}`)}>
              View details
            </MenuItem>
            <MenuItem icon={<IconPencil />} onSelect={() => setEditTarget(row)}>
              Edit institution
            </MenuItem>
            <MenuSep />
            {row.status === "suspended" ? (
              <MenuItem icon={<IconRefresh />} onSelect={() => setPending({ inst: row, action: "reactivate" })}>
                Reactivate
              </MenuItem>
            ) : (
              <MenuItem icon={<IconBan />} danger onSelect={() => setPending({ inst: row, action: "suspend" })}>
                Suspend
              </MenuItem>
            )}
          </Menu>
        </div>
      ),
    },
  ];

  const toolbar = (
    <div className="filterbar" role="search">
      <div className="search-wrap">
        <IconSearch />
        <input
          className="input"
          placeholder="Search name, code, or city…"
          value={query}
          aria-label="Search institutions"
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
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <select
        className="select"
        aria-label="Filter by type"
        value={type}
        onChange={(e) => table.set({ type: e.target.value || null })}
      >
        <option value="">All types</option>
        {TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
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
          Clear filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="page-institutions">
      <PageHead
        title="Institutions"
        sub="Institutions on the platform"
        actions={
          <Button icon={<IconPlus />} onClick={() => setCreateOpen(true)}>
            Create institution
          </Button>
        }
      />

      {isError ? (
        <ErrorState title="Institutions couldn't load" onRetry={() => refetch()} />
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
          onRowClick={(row) => navigate(`/institutions/${row.id}`)}
          toolbar={toolbar}
          empty={
            <EmptyState
              icon={<IconBuilding />}
              title={hasFilters ? "No institutions match these filters" : "No institutions yet"}
              body={
                hasFilters
                  ? "Try widening the search or clearing a filter to see more."
                  : "Institutions are the schools and organizations on the platform. Create the first one to get started."
              }
              action={
                hasFilters ? (
                  <Button variant="secondary" size="sm" onClick={clearAll}>
                    Clear filters
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" icon={<IconPlus />} onClick={() => setCreateOpen(true)}>
                    Create institution
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

      {pending?.action === "suspend" && (
        <SuspendInstitutionDialog
          inst={pending.inst}
          busy={transition.isPending}
          onConfirm={(reason) => transition.mutate({ inst: pending.inst, action: "suspend", reason })}
          onClose={() => setPending(null)}
        />
      )}
      {pending?.action === "reactivate" && (
        <ConfirmDialog
          title={`Reactivate ${pending.inst.name}?`}
          body={
            <>
              The institution and its users regain access immediately. The action is recorded in the platform
              audit log.
            </>
          }
          confirmLabel="Reactivate institution"
          danger={false}
          busy={transition.isPending}
          onConfirm={() => transition.mutate({ inst: pending.inst, action: "reactivate" })}
          onClose={() => setPending(null)}
        />
      )}

      {createOpen && (
        <CreateInstitutionDrawer
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            toast.notify("Institution created");
            queryClient.invalidateQueries({ queryKey: ["institutions"] });
          }}
        />
      )}

      {editTarget && (
        <EditInstitutionDrawer
          institution={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            toast.notify("Institution updated.");
            queryClient.invalidateQueries({ queryKey: ["institutions"] });
          }}
        />
      )}
    </div>
  );
}

export function SuspendInstitutionDialog({
  inst,
  busy,
  onConfirm,
  onClose,
}: {
  inst: Institution;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog
      title={`Suspend ${inst.name}?`}
      body={
        <div className="confirm-form">
          <p>
            Users at this institution will lose sign-in access until it is reactivated. The action is recorded in
            the platform audit log.
          </p>
          <Field label="Reason" htmlFor="suspend-reason" help="Recorded on the institution record; leave blank to use the default.">
            <textarea
              id="suspend-reason"
              className="input"
              rows={3}
              maxLength={400}
              value={reason}
              placeholder="Administrative action"
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </div>
      }
      confirmLabel="Suspend institution"
      busy={busy}
      onConfirm={() => onConfirm(reason.trim() || "Administrative action")}
      onClose={onClose}
    />
  );
}

function CreateInstitutionDrawer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (inst: Institution) => void;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { country: "United States" },
  });
  const [serverError, setServerError] = useState<string | null>(null);

  async function submit(values: CreateValues) {
    setServerError(null);
    try {
      const created = await api<Institution>("/api/v1/institutions", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          code: values.code,
          type: values.type,
          city: values.city || null,
          region: values.region || null,
          country: values.country || null,
          contactName: values.contactName || null,
          contactEmail: values.contactEmail || null,
        }),
      });
      onCreated(created);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fields) {
          for (const [field, message] of Object.entries(error.fields)) {
            setError(field as keyof CreateValues, { message });
          }
        }
        setServerError(error.message);
      } else {
        setServerError("Couldn't reach the server. Try again.");
      }
    }
  }

  return (
    <Drawer
      title="Create institution"
      sub="Register a new institution on the platform"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="create-institution-form" loading={isSubmitting}>
            Create institution
          </Button>
        </>
      }
    >
      <Alert tone="info">New institutions start as pending. Activate them after review.</Alert>
      {serverError && (
        <div className="banner-error" role="alert">
          {serverError}
        </div>
      )}
      <form id="create-institution-form" onSubmit={handleSubmit(submit)} noValidate>
        <Field label="Name" htmlFor="ci-name" error={errors.name?.message}>
          <input id="ci-name" className="input" aria-invalid={!!errors.name} {...register("name")} />
        </Field>
        <div className="grid-2">
          <Field
            label="Code"
            htmlFor="ci-code"
            error={errors.code?.message}
            help="Short uppercase identifier used across the platform."
          >
            <input
              id="ci-code"
              className="input mono"
              placeholder="e.g. ASHF"
              aria-invalid={!!errors.code}
              {...register("code")}
            />
          </Field>
          <Field label="Type" htmlFor="ci-type" error={errors.type?.message}>
            <select id="ci-type" className="select" aria-invalid={!!errors.type} {...register("type")}>
              <option value="">Choose…</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid-2">
          <Field label="City" htmlFor="ci-city">
            <input id="ci-city" className="input" {...register("city")} />
          </Field>
          <Field label="State / region" htmlFor="ci-region">
            <input id="ci-region" className="input" {...register("region")} />
          </Field>
        </div>
        <Field label="Country" htmlFor="ci-country">
          <input id="ci-country" className="input" {...register("country")} />
        </Field>
        <div className="grid-2">
          <Field label="Contact name" htmlFor="ci-cn">
            <input id="ci-cn" className="input" {...register("contactName")} />
          </Field>
          <Field label="Contact email" htmlFor="ci-ce" error={errors.contactEmail?.message}>
            <input
              id="ci-ce"
              className="input"
              aria-invalid={!!errors.contactEmail}
              {...register("contactEmail")}
            />
          </Field>
        </div>
      </form>
    </Drawer>
  );
}

function EditInstitutionDrawer({
  institution,
  onClose,
  onSaved,
}: {
  institution: Institution;
  onClose: () => void;
  onSaved: () => void;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: institution.name,
      type: institution.type,
      city: institution.city ?? "",
      region: institution.region ?? "",
      country: institution.country ?? "",
      contactName: institution.contactName ?? "",
      contactEmail: institution.contactEmail ?? "",
    },
  });
  const [serverError, setServerError] = useState<string | null>(null);

  async function submit(values: EditValues) {
    setServerError(null);
    try {
      await api(`/api/v1/institutions/${institution.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: values.name,
          type: values.type,
          city: values.city || null,
          region: values.region || null,
          country: values.country || null,
          contactName: values.contactName || null,
          contactEmail: values.contactEmail || null,
        }),
      });
      onSaved();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fields) {
          for (const [field, message] of Object.entries(error.fields)) {
            setError(field as keyof EditValues, { message });
          }
        }
        setServerError(error.message);
      } else {
        setServerError("Couldn't reach the server.");
      }
    }
  }

  return (
    <Drawer
      title="Edit institution"
      sub={`Update the record for ${institution.name}.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="edit-institution-form" loading={isSubmitting}>
            Save changes
          </Button>
        </>
      }
    >
      {serverError && (
        <div className="banner-error" role="alert">
          {serverError}
        </div>
      )}
      <form id="edit-institution-form" onSubmit={handleSubmit(submit)} noValidate>
        <Field label="Name" htmlFor="ei-name" error={errors.name?.message}>
          <input id="ei-name" className="input" aria-invalid={!!errors.name} {...register("name")} />
        </Field>
        <Field label="Type" htmlFor="ei-type" error={errors.type?.message}>
          <select id="ei-type" className="select" aria-invalid={!!errors.type} {...register("type")}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>
        <div className="grid-2">
          <Field label="City" htmlFor="ei-city">
            <input id="ei-city" className="input" {...register("city")} />
          </Field>
          <Field label="State / region" htmlFor="ei-region">
            <input id="ei-region" className="input" {...register("region")} />
          </Field>
        </div>
        <Field label="Country" htmlFor="ei-country">
          <input id="ei-country" className="input" {...register("country")} />
        </Field>
        <div className="grid-2">
          <Field label="Contact name" htmlFor="ei-cn">
            <input id="ei-cn" className="input" {...register("contactName")} />
          </Field>
          <Field label="Contact email" htmlFor="ei-ce" error={errors.contactEmail?.message}>
            <input
              id="ei-ce"
              className="input"
              aria-invalid={!!errors.contactEmail}
              {...register("contactEmail")}
            />
          </Field>
        </div>
      </form>
    </Drawer>
  );
}
