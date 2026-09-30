import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiError } from "@/lib/api";
import type { Institution, InstitutionOverview } from "@/lib/types";
import { actionLabel, formatDate, formatDateTime, formatNumber, relativeFromNow } from "@/lib/format";
import { Badge, ConfirmDialog, ErrorState, SkeletonRows, statusTone } from "@/components/ui";
import { useToast } from "@/lib/toast";

const editSchema = z.object({
  name: z.string().min(2),
  type: z.string().min(1),
  city: z.string().optional(),
  region: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.union([z.literal(""), z.string().email("Enter a valid email.")]),
});
type EditValues = z.infer<typeof editSchema>;

export function InstitutionDetail() {
  const { id } = useParams();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["institution", id],
    queryFn: () => api<InstitutionOverview>(`/api/v1/institutions/${id}/overview`),
    enabled: !!id,
  });
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<"suspend" | "reactivate" | null>(null);
  const toast = useToast();
  const queryClient = useQueryClient();

  const transition = useMutation({
    mutationFn: async (action: "suspend" | "reactivate") =>
      api(`/api/v1/institutions/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ reason: action === "suspend" ? "Administrative action" : null }),
      }),
    onSuccess: (_d, action) => {
      toast.notify(action === "suspend" ? "Institution suspended." : "Institution reactivated.");
      setConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["institution", id] });
      queryClient.invalidateQueries({ queryKey: ["institutions"] });
    },
    onError: (e) => toast.notify(e instanceof ApiError ? e.message : "Action failed.", "error"),
  });

  if (isError) {
    return <ErrorState title="This institution couldn't load" onRetry={() => refetch()} />;
  }
  if (isLoading || !data) {
    return (
      <div>
        <div className="page-head"><div className="skeleton" style={{ width: 280, height: 22 }} /></div>
        <div className="card"><SkeletonRows rows={6} /></div>
      </div>
    );
  }

  const { institution: inst, stats, recentActivity } = data;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="meta" style={{ marginBottom: 4 }}>
            <Link to="/institutions">Institutions</Link>
            <span className="dot-sep">/</span>
            <span className="mono">{inst.code}</span>
          </div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {inst.name} <Badge tone={statusTone(inst.status)}>{inst.status}</Badge>
          </h1>
          <p className="sub">
            {inst.type} · {[inst.city, inst.region, inst.country].filter(Boolean).join(", ")}
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => setEditOpen(true)}>Edit</button>
          {inst.status === "suspended" ? (
            <button className="btn btn-primary" onClick={() => setConfirm("reactivate")}>Reactivate</button>
          ) : (
            <button className="btn btn-danger" onClick={() => setConfirm("suspend")}>Suspend</button>
          )}
        </div>
      </div>

      {inst.status === "suspended" && inst.statusNote && (
        <div className="banner-error" role="note">
          Suspended {formatDate(inst.suspendedAt)} — {inst.statusNote}
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 14 }}>
        <section className="card" aria-labelledby="i-profile">
          <div className="card-head"><h2 id="i-profile">Record</h2></div>
          <div className="card-body">
            <dl className="kv">
              <dt>Contact</dt><dd>{inst.contactName ?? "—"} {inst.contactEmail ? <span className="meta">({inst.contactEmail})</span> : null}</dd>
              <dt>Created</dt><dd>{formatDate(inst.createdAt)}</dd>
              <dt>Last updated</dt><dd>{formatDateTime(inst.updatedAt)}</dd>
              <dt>Reference</dt><dd className="mono">{inst.code}-{inst.id.slice(0, 4).toUpperCase()}</dd>
            </dl>
          </div>
        </section>
        <section className="card" aria-labelledby="i-people">
          <div className="card-head"><h2 id="i-people">People</h2><span className="meta"><Link to={`/users?institutionId=${inst.id}`}>View in registry →</Link></span></div>
          <div className="card-body">
            <div className="stat-grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 0 }}>
              <div className="stat"><div className="k">Total</div><div className="v">{formatNumber(stats.users ?? 0)}</div></div>
              <div className="stat"><div className="k">Students</div><div className="v">{formatNumber(stats.students ?? 0)}</div></div>
              <div className="stat"><div className="k">Teachers</div><div className="v">{formatNumber(stats.teachers ?? 0)}</div></div>
              <div className="stat"><div className="k">Parents</div><div className="v">{formatNumber(stats.parents ?? 0)}</div></div>
            </div>
          </div>
        </section>
      </div>

      <section className="card" aria-labelledby="i-activity">
        <div className="card-head">
          <h2 id="i-activity">Recent institution activity</h2>
          <Link to={`/activity?institutionId=${inst.id}`} className="meta">Full history →</Link>
        </div>
        <div className="card-body">
          {recentActivity.length === 0 ? (
            <p className="meta">No recorded activity for this institution yet.</p>
          ) : (
            <div className="feed">
              {recentActivity.map((event) => (
                <div key={event.id} className="feed-item">
                  <time dateTime={event.occurredAt}>{relativeFromNow(event.occurredAt)}</time>
                  <span className="what"><b>{event.actorLabel ?? "System"}</b> · {actionLabel(event.action)}{event.targetLabel ? <> → {event.targetLabel}</> : null}</span>
                  {event.result !== "success" && <Badge tone={event.result === "denied" ? "warn" : "danger"}>{event.result}</Badge>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {confirm && (
        <ConfirmDialog
          title={confirm === "suspend" ? `Suspend ${inst.name}?` : `Reactivate ${inst.name}?`}
          body={
            confirm === "suspend"
              ? <>Users at this institution will lose sign-in access until it is reactivated. The action is recorded in the platform audit log.</>
              : <>The institution and its users regain access immediately. The action is recorded in the platform audit log.</>
          }
          confirmLabel={confirm === "suspend" ? "Suspend institution" : "Reactivate institution"}
          danger={confirm === "suspend"}
          busy={transition.isPending}
          onConfirm={() => transition.mutate(confirm)}
          onClose={() => setConfirm(null)}
        />
      )}

      {editOpen && (
        <EditInstitutionDialog
          institution={inst}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            toast.notify("Institution updated.");
            queryClient.invalidateQueries({ queryKey: ["institution", id] });
            queryClient.invalidateQueries({ queryKey: ["institutions"] });
          }}
        />
      )}
    </div>
  );
}

function EditInstitutionDialog({
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
    formState: { errors, isSubmitting },
  } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: institution.name,
      type: institution.type,
      city: institution.city ?? "",
      region: institution.region ?? "",
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
          contactName: values.contactName || null,
          contactEmail: values.contactEmail || null,
        }),
      });
      onSaved();
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "Couldn't reach the server.");
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Edit institution">
        <h2>Edit {institution.code}</h2>
        <div className="body">
          {serverError && <div className="banner-error" role="alert">{serverError}</div>}
          <form onSubmit={handleSubmit(submit)} noValidate>
            <div className="field">
              <label htmlFor="ei-name">Name</label>
              <input id="ei-name" className="input" aria-invalid={!!errors.name} {...register("name")} />
              {errors.name && <span className="error">{errors.name.message}</span>}
            </div>
            <div className="field">
              <label htmlFor="ei-type">Type</label>
              <select id="ei-type" className="select" {...register("type")}>
                {["University", "College", "Community College", "Institute of Technology", "Academy"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="ei-city">City</label>
                <input id="ei-city" className="input" {...register("city")} />
              </div>
              <div className="field">
                <label htmlFor="ei-region">State / region</label>
                <input id="ei-region" className="input" {...register("region")} />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="ei-cn">Contact name</label>
                <input id="ei-cn" className="input" {...register("contactName")} />
              </div>
              <div className="field">
                <label htmlFor="ei-ce">Contact email</label>
                <input id="ei-ce" className="input" aria-invalid={!!errors.contactEmail} {...register("contactEmail")} />
                {errors.contactEmail && <span className="error">{errors.contactEmail.message}</span>}
              </div>
            </div>
            <footer style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting && <span className="btn-spinner" aria-hidden="true" />}
                Save changes
              </button>
            </footer>
          </form>
        </div>
      </div>
    </div>
  );
}
