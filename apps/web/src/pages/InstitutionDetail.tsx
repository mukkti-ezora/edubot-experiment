import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiError } from "@/lib/api";
import type { Institution, InstitutionOverview } from "@/lib/types";
import { actionLabel, formatDate, formatDateTime, formatNumber, relativeFromNow } from "@/lib/format";
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
  Skeleton,
  SkeletonRows,
  StatusPill,
  Tabs,
} from "@/components/ui";
import {
  IconActivity,
  IconArrowLeft,
  IconArrowRight,
  IconBan,
  IconDots,
  IconLock,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconShield,
  IconUsers,
} from "@/components/icons";
import { useToast } from "@/lib/toast";
import { SuspendInstitutionDialog } from "./Institutions";
import "@/styles/pages/institutions.css";

const TYPES = ["University", "College", "Community College", "Institute of Technology", "Academy"];

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

function eventIcon(action: string) {
  if (action.includes("denied")) return <IconShield />;
  if (action.startsWith("auth.")) return <IconLock />;
  if (action.includes("suspend")) return <IconBan />;
  if (action.includes("create")) return <IconPlus />;
  if (action.includes("update")) return <IconPencil />;
  if (action.startsWith("settings")) return <IconSettings />;
  return <IconActivity />;
}

export function InstitutionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<"suspend" | "reactivate" | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["institution", id],
    queryFn: () => api<InstitutionOverview>(`/api/v1/institutions/${id}/overview`),
    enabled: !!id,
  });

  const transition = useMutation({
    mutationFn: async ({ action, reason }: { action: "suspend" | "reactivate"; reason?: string }) =>
      api(`/api/v1/institutions/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ reason: action === "suspend" ? (reason ?? "Administrative action") : null }),
      }),
    onSuccess: (_d, { action }) => {
      toast.notify(action === "suspend" ? "Institution suspended." : "Institution reactivated.");
      setConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["institution", id] });
      queryClient.invalidateQueries({ queryKey: ["institutions"] });
    },
    onError: (e) => toast.notify(e instanceof ApiError ? e.message : "Action failed.", "error"),
  });

  if (isError) {
    return (
      <div className="page-institution-detail">
        <Link to="/institutions" className="btn btn-ghost btn-sm back-link">
          <IconArrowLeft /> Institutions
        </Link>
        <ErrorState title="This institution couldn't load" onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="page-institution-detail">
        <Skeleton w={96} h={13} />
        <div className="page-head skel-mt">
          <div className="head-main">
            <Skeleton w={280} h={22} />
            <div className="skel-gap-sm">
              <Skeleton w={320} h={13} />
            </div>
          </div>
        </div>
        <div className="card metric-strip" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div className="metric" key={i}>
              <Skeleton w={88} />
              <Skeleton w={64} h={26} />
            </div>
          ))}
        </div>
        <div className="detail-grid" aria-hidden="true">
          <div className="card">
            <div className="card-body">
              <SkeletonRows rows={7} />
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <SkeletonRows rows={4} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { institution: inst, stats, recentActivity } = data;
  const location = [inst.city, inst.region, inst.country].filter(Boolean).join(", ");

  return (
    <div className="page-institution-detail">
      <Link to="/institutions" className="btn btn-ghost btn-sm back-link">
        <IconArrowLeft /> Institutions
      </Link>

      <PageHead
        title={
          <>
            {inst.name} <StatusPill status={inst.status} />
          </>
        }
        sub={
          <>
            <span className="mono">{inst.code}</span> · {inst.type}
            {location ? ` · ${location}` : ""}
          </>
        }
        actions={
          <>
            <Button variant="secondary" icon={<IconPencil />} onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <Menu trigger={<IconButton label="More actions">{<IconDots />}</IconButton>} align="right" width={220}>
              <MenuItem icon={<IconPencil />} onSelect={() => setEditOpen(true)}>
                Edit institution
              </MenuItem>
              <MenuItem icon={<IconActivity />} onSelect={() => navigate(`/activity?institutionId=${inst.id}`)}>
                View audit history
              </MenuItem>
              <MenuSep />
              {inst.status === "suspended" ? (
                <MenuItem icon={<IconRefresh />} onSelect={() => setConfirm("reactivate")}>
                  Reactivate institution
                </MenuItem>
              ) : (
                <MenuItem icon={<IconBan />} danger onSelect={() => setConfirm("suspend")}>
                  Suspend institution
                </MenuItem>
              )}
            </Menu>
          </>
        }
      />

      {inst.status !== "active" && (
        <div className="head-alerts">
          {inst.status === "suspended" ? (
            <Alert tone="danger" title="Institution suspended">
              Sign-in is blocked for everyone at this institution
              {inst.suspendedAt ? ` since ${formatDate(inst.suspendedAt)}` : ""}.
              {inst.statusNote ? ` Reason: ${inst.statusNote}.` : ""} Reactivate to restore access.
            </Alert>
          ) : (
            <Alert tone="warn" title="Pending review">
              This institution was registered {formatDate(inst.createdAt)} and isn't active yet.
              {inst.statusNote ? ` Note: ${inst.statusNote}` : ""}
            </Alert>
          )}
        </div>
      )}

      {/* metric strip — one card, four stat cells */}
      <section className="card metric-strip" aria-label="People at this institution">
        <div className="metric">
          <div className="m-label">Users total</div>
          <div className="m-value">{formatNumber(stats.users ?? 0)}</div>
        </div>
        <div className="metric">
          <div className="m-label">Students</div>
          <div className="m-value">{formatNumber(stats.students ?? 0)}</div>
        </div>
        <div className="metric">
          <div className="m-label">Teachers</div>
          <div className="m-value">{formatNumber(stats.teachers ?? 0)}</div>
        </div>
        <div className="metric">
          <div className="m-label">Parents</div>
          <div className="m-value">{formatNumber(stats.parents ?? 0)}</div>
        </div>
      </section>

      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "activity", label: "Activity" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "overview" && (
        <div className="detail-grid">
          <section className="card" aria-labelledby="i-contact">
            <div className="card-head">
              <h2 id="i-contact">Contact &amp; registration</h2>
            </div>
            <div className="card-body">
              <dl className="kv">
                <dt>Contact name</dt>
                <dd>{inst.contactName ?? "—"}</dd>
                <dt>Contact email</dt>
                <dd>{inst.contactEmail ?? "—"}</dd>
                <dt>Type</dt>
                <dd>{inst.type}</dd>
                <dt>Code</dt>
                <dd className="mono">{inst.code}</dd>
                <dt>Created</dt>
                <dd>{formatDate(inst.createdAt)}</dd>
                <dt>Last updated</dt>
                <dd>{formatDateTime(inst.updatedAt)}</dd>
                {inst.suspendedAt ? (
                  <>
                    <dt>Suspended</dt>
                    <dd>{formatDate(inst.suspendedAt)}</dd>
                  </>
                ) : null}
                <dt>Institution ID</dt>
                <dd className="mono iid">{inst.id}</dd>
              </dl>
            </div>
          </section>

          <section className="card" aria-labelledby="i-directory">
            <div className="card-head">
              <h2 id="i-directory">Directory</h2>
            </div>
            <div className="card-body flush">
              <div className="rowlist">
                <Link className="row" to={`/users?institutionId=${inst.id}`}>
                  <span className="dir-icon">
                    <IconUsers />
                  </span>
                  <span className="dir-text">
                    <span className="dir-label">Users in this institution</span>
                    <span className="dir-sub">{formatNumber(stats.users ?? 0)} on record</span>
                  </span>
                  <IconArrowRight className="dir-arrow" />
                </Link>
                <Link className="row" to={`/activity?institutionId=${inst.id}`}>
                  <span className="dir-icon">
                    <IconActivity />
                  </span>
                  <span className="dir-text">
                    <span className="dir-label">Audit history</span>
                    <span className="dir-sub">Every recorded action for this institution</span>
                  </span>
                  <IconArrowRight className="dir-arrow" />
                </Link>
              </div>
            </div>
          </section>
        </div>
      )}

      {tab === "activity" && (
        <section className="card" aria-labelledby="i-activity">
          <div className="card-head">
            <h2 id="i-activity">Recent activity</h2>
            <span className="spacer">
              <Link className="link-more" to={`/activity?institutionId=${inst.id}`}>
                Full history <IconArrowRight />
              </Link>
            </span>
          </div>
          <div className="card-body">
            {recentActivity.length === 0 ? (
              <EmptyState
                icon={<IconActivity />}
                title="No recorded activity for this institution yet"
                body="Sign-ins, record changes, and status transitions affecting this institution will appear here as they happen."
              />
            ) : (
              <div className="timeline">
                {recentActivity.map((event) => (
                  <div key={event.id} className="tl-item">
                    <span className={`tl-icon${event.result !== "success" ? " tone-danger" : ""}`}>
                      {eventIcon(event.action)}
                    </span>
                    <div className="tl-body">
                      <div className="tl-line">
                        <b>{actionLabel(event.action)}</b>
                        {event.targetLabel ? <span className="text-muted"> · {event.targetLabel}</span> : null}
                      </div>
                      <div className="tl-meta">
                        <span>{event.actorLabel ?? "System"}</span>
                        <span aria-hidden="true">·</span>
                        <time dateTime={event.occurredAt}>{relativeFromNow(event.occurredAt)}</time>
                        {event.result !== "success" && (
                          <>
                            <span aria-hidden="true">·</span>
                            <Badge tone={event.result === "denied" ? "warn" : "danger"}>{event.result}</Badge>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {confirm === "suspend" && (
        <SuspendInstitutionDialog
          inst={inst}
          busy={transition.isPending}
          onConfirm={(reason) => transition.mutate({ action: "suspend", reason })}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "reactivate" && (
        <ConfirmDialog
          title={`Reactivate ${inst.name}?`}
          body={
            <>
              The institution and its users regain access immediately. The action is recorded in the platform
              audit log.
            </>
          }
          confirmLabel="Reactivate institution"
          danger={false}
          busy={transition.isPending}
          onConfirm={() => transition.mutate({ action: "reactivate" })}
          onClose={() => setConfirm(null)}
        />
      )}

      {editOpen && (
        <EditInstitutionDrawer
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
