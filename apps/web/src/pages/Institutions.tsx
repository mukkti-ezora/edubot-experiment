import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiError, qs } from "@/lib/api";
import type { Institution, Page } from "@/lib/types";
import { formatNumber } from "@/lib/format";
import { DataTable, type Column } from "@/components/DataTable";
import { Badge, ConfirmDialog, EmptyState, ErrorState, statusTone } from "@/components/ui";
import { useTableState } from "@/lib/useTableState";
import { useToast } from "@/lib/toast";

const TYPES = ["University", "College", "Community College", "Institute of Technology", "Academy"];

const createSchema = z.object({
  name: z.string().min(2, "At least 2 characters."),
  code: z.string().regex(/^[A-Z0-9]{2,12}$/, "2–12 uppercase letters/digits."),
  type: z.string().min(1, "Choose a type."),
  city: z.string().optional(),
  region: z.string().optional(),
  contactEmail: z.union([z.literal(""), z.string().email("Enter a valid email.")]),
});
type CreateValues = z.infer<typeof createSchema>;

export function Institutions() {
  const table = useTableState();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(searchParams.get("create") === "1");
  const [suspendTarget, setSuspendTarget] = useState<Institution | null>(null);
  const toast = useToast();
  const queryClient = useQueryClient();

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

  const suspend = useMutation({
    mutationFn: async (inst: Institution) =>
      api(`/api/v1/institutions/${inst.id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ reason: "Administrative action" }),
      }),
    onSuccess: (_d, inst) => {
      toast.notify(`${inst.name} suspended.`);
      queryClient.invalidateQueries({ queryKey: ["institutions"] });
      setSuspendTarget(null);
    },
    onError: (e) => toast.notify(e instanceof ApiError ? e.message : "Suspend failed.", "error"),
  });

  const columns: Column<Institution>[] = [
    {
      key: "name",
      label: "Institution",
      render: (row) => (
        <div>
          <div className="cell-main">{row.name}</div>
          <div className="cell-sub mono">{row.code}</div>
        </div>
      ),
    },
    { key: "type", label: "Type", render: (row) => row.type },
    {
      key: "status",
      label: "Status",
      width: "110px",
      render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge>,
    },
    {
      key: "createdAt",
      label: "Location",
      render: (row) => <span className="meta">{[row.city, row.region].filter(Boolean).join(", ") || "—"}</span>,
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Institutions</h1>
          <p className="sub">Every institution on the platform. Create, review, suspend, or reactivate.</p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            Create institution
          </button>
        </div>
      </div>

      <div className="filters" role="search">
        <input
          className="input search"
          placeholder="Search name, code, or city…"
          defaultValue={query}
          aria-label="Search institutions"
          onChange={(e) => table.set({ query: e.target.value || null })}
        />
        <select
          className="select"
          aria-label="Filter by status"
          value={status}
          onChange={(e) => table.set({ status: e.target.value || null })}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
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
        {(query || status || type) && (
          <button className="btn btn-quiet btn-sm" onClick={() => table.set({ query: null, status: null, type: null })}>
            Clear filters
          </button>
        )}
      </div>

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
          empty={
            <EmptyState
              title={query || status || type ? "No institutions match these filters" : "No institutions yet"}
              body={
                query || status || type
                  ? "Try widening the search or clearing a filter."
                  : "Create the first institution to bring it onto the platform."
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

      {suspendTarget && (
        <ConfirmDialog
          title={`Suspend ${suspendTarget.name}?`}
          body={
            <>
              Users at this institution will lose sign-in access until it is reactivated.
              The action is recorded in the platform audit log.
            </>
          }
          confirmLabel="Suspend institution"
          busy={suspend.isPending}
          onConfirm={() => suspend.mutate(suspendTarget)}
          onClose={() => setSuspendTarget(null)}
        />
      )}

      {createOpen && (
        <CreateInstitutionDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(inst) => {
            setCreateOpen(false);
            toast.notify(`${inst.name} created. It's pending review.`);
            queryClient.invalidateQueries({ queryKey: ["institutions"] });
          }}
        />
      )}
    </div>
  );
}

function CreateInstitutionDialog({
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
  } = useForm<CreateValues>({ resolver: zodResolver(createSchema) });
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
          country: "United States",
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
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Create institution">
        <h2>Create institution</h2>
        <div className="body">
          <p style={{ marginBottom: 16 }}>
            New institutions start as <b>pending</b>. Activate them after review.
          </p>
          {serverError && <div className="banner-error" role="alert">{serverError}</div>}
          <form onSubmit={handleSubmit(submit)} noValidate>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="ci-name">Name</label>
                <input id="ci-name" className="input" aria-invalid={!!errors.name} {...register("name")} />
                {errors.name && <span className="error">{errors.name.message}</span>}
              </div>
              <div className="field">
                <label htmlFor="ci-code">Code</label>
                <input id="ci-code" className="input mono" placeholder="e.g. ASHF" aria-invalid={!!errors.code} {...register("code")} />
                {errors.code ? (
                  <span className="error">{errors.code.message}</span>
                ) : (
                  <span className="help">Short uppercase identifier used in URLs and fixtures.</span>
                )}
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="ci-type">Type</label>
                <select id="ci-type" className="select" aria-invalid={!!errors.type} {...register("type")}>
                  <option value="">Choose…</option>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {errors.type && <span className="error">{errors.type.message}</span>}
              </div>
              <div className="field">
                <label htmlFor="ci-contact">Contact email</label>
                <input id="ci-contact" className="input" aria-invalid={!!errors.contactEmail} {...register("contactEmail")} />
                {errors.contactEmail && <span className="error">{errors.contactEmail.message}</span>}
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="ci-city">City</label>
                <input id="ci-city" className="input" {...register("city")} />
              </div>
              <div className="field">
                <label htmlFor="ci-region">State / region</label>
                <input id="ci-region" className="input" {...register("region")} />
              </div>
            </div>
            <footer style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting && <span className="btn-spinner" aria-hidden="true" />}
                Create institution
              </button>
            </footer>
          </form>
        </div>
      </div>
    </div>
  );
}
