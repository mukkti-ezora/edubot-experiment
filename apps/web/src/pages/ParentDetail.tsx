import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, relativeFromNow } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { PageHead, Avatar, StatusPill, Badge, Alert, Button, EmptyState, ConfirmDialog } from "@/components/ui";
import {
  IconHeart,
  IconBuilding,
  IconActivity,
  IconArrowLeft,
  IconClock,
} from "@/components/icons";
import "@/styles/pages/people.css";

interface ParentDetailData {
  id: string;
  institutionId: string | null;
  institutionName: string | null;
  type: "parent";
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  status: "active" | "invited" | "suspended" | "deactivated";
  createdAt: string;
  updatedAt: string;
  roles?: { id: string; roleId: string; name: string }[];
  lastLoginAt?: string | null;
}

interface ParentActivityEvent {
  id: string;
  occurredAt: string;
  action: string;
  result: "success" | "denied" | "error";
  actorLabel: string | null;
  targetLabel: string | null;
  institutionLabel: string | null;
}

export function ParentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const [showDeactivate, setShowDeactivate] = useState(false);

  const { data: parent, isLoading, error, refetch } = useQuery<ParentDetailData>({
    queryKey: ["parent", id],
    queryFn: () => api<ParentDetailData>(`/api/v1/users/${id}`),
    enabled: !!id,
    retry: false,
  });

  const { data: activity, isLoading: aLoading } = useQuery<ParentActivityEvent[]>({
    queryKey: ["parent-activity", id],
    queryFn: () => api<ParentActivityEvent[]>(`/api/v1/activity?targetId=${id}&limit=20`),
    enabled: !!id,
    retry: false,
  );

  const handleActivate = async () => {
    try {
      await api(`/api/v1/users/${id}/activate`, { method: "POST", body: "{}" });
      toast.notify("Parent activated");
      refetch();
    } catch (e: any) {
      toast.notify(e.message ?? "Failed to activate parent", "error");
    }
  };

  const handleDeactivate = async () => {
    try {
      await api(`/api/v1/users/${id}/deactivate`, { method: "POST", body: "{}" });
      toast.notify("Parent deactivated");
      refetch();
      setShowDeactivate(false);
    } catch (e: any) {
      toast.notify(e.message ?? "Failed to deactivate parent", "error");
    }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--surface-1)" }}>
        <div className="skeleton" style={{ width: 120, height: 16 }} />
      </div>
    );
  }

  if (error || !parent) {
    return (
      <div className="page-parent-detail">
        <PageHead title="Parent not found" sub="The requested parent could not be found." actions={<Button variant="ghost" onClick={() => navigate("/parents")}><IconArrowLeft /> Back to parents</Button>} />
        <EmptyState title="Parent not found" body="The requested parent could not be found." action={<Button variant="secondary" onClick={() => navigate("/parents")}>Back to parents</Button>} />
      </div>
    );
  }

  return (
    <div className="page-parent-detail">
      <PageHead
        title={<>
          <Link to="/parents" className="btn btn-ghost btn-sm"><IconArrowLeft /></Link>
          <span style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Avatar name={parent.name} size="lg" category="parent" />
            <span>{parent.name}</span>
          </span>
        </>}
        sub={parent.email}
        actions={
          <>
            {parent.status !== "active" && can("user.update") && (
              <Button variant="secondary" onClick={handleActivate}>Activate</Button>
            )}
            {parent.status === "active" && can("user.update") && (
              <Button variant="danger-ghost" onClick={() => setShowDeactivate(true)}>Deactivate</Button>
            )}
          </>
        }
      />

      {(parent.status === "invited" || parent.status === "suspended" || parent.status === "deactivated") && (
        <Alert tone={parent.status === "deactivated" ? "danger" : "warn"} title={
          parent.status === "invited" ? "Invitation pending" : parent.status === "suspended" ? "Parent suspended" : "Parent deactivated"
        }>
          {parent.status === "invited" && "The parent hasn't activated their account yet."}
          {parent.status === "suspended" && "This parent has been suspended. They cannot access the platform."}
          {parent.status === "deactivated" && "This parent has been deactivated. Their account is permanently disabled."}
        </Alert>
      )}

      <div className="detail-sections">
        <div className="detail-section">
          <h3>Profile</h3>
          <div className="detail-kv">
            <dt>Email</dt>
            <dd>{parent.email}</dd>
            <dt>Institution</dt>
            <dd>
              {parent.institutionName ? (
                <Link to={`/institutions/${parent.institutionId}`}>{parent.institutionName}</Link>
              ) : "—"}
            </dd>
            <dt>Type</dt>
            <dd><Badge tone="parent">Parent</Badge></dd>
            <dt>Status</dt>
            <dd><StatusPill status={parent.status} /></dd>
            <dt>Created</dt>
            <dd>{formatDate(parent.createdAt)}</dd>
            <dt>Updated</dt>
            <dd>{formatDate(parent.updatedAt)}</dd>
            <dt>Last sign-in</dt>
            <dd>{parent.lastLoginAt ? relativeFromNow(parent.lastLoginAt) : "Never"}</dd>
            <dt>User ID</dt>
            <dd className="mono">{parent.id}</dd>
          </div>
        </div>

        <div className="detail-section">
          <h3>Roles</h3>
          {parent.roles && parent.roles.length > 0 ? (
            <div className="detail-roles">
              {parent.roles.map((role) => (
                <Badge key={role.id} tone="violet">{role.name}</Badge>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--neutral-500)" }}>No roles assigned</p>
          )}
        </div>

        <div className="detail-section">
          <h3>Recent Activity</h3>
          {!aLoading && activity.length === 0 && (
            <EmptyState title="No recent activity" body="No activity recorded for this parent." icon={<IconActivity />} />
          )}
          {!aLoading && activity.length > 0 && (
            <div className="timeline">
              {activity.slice(0, 10).map((evt) => (
                <div key={evt.id} className="tl-item">
                  <div className={`tl-icon ${evt.result === "denied" ? "tone-danger" : evt.result === "error" ? "tone-warn" : "tone-success"}`}>
                    <IconActivity />
                  </div>
                  <div className="tl-body">
                    <div className="tl-line">
                      <b>{evt.actorLabel ?? "System"}</b> {evt.action.replace(".", " ")}
                      {evt.targetLabel && <><span> → </span><b>{evt.targetLabel}</b></>}
                    </div>
                    <div className="tl-meta">
                      {evt.institutionLabel && <span><IconBuilding /> {evt.institutionLabel}</span>}
                      <span><IconClock /> {relativeFromNow(evt.occurredAt)}</span>
                      <Badge tone={evt.result === "denied" ? "danger" : evt.result === "error" ? "warn" : "ok"}>{evt.result}</Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {aLoading && <div className="skeleton" style={{ height: "100px", borderRadius: "var(--radius-md)" }} />}
        </div>
      </div>

      {/* ConfirmDialog is conditionally rendered */}
      {showDeactivate && (
        <ConfirmDialog
          title="Deactivate parent?"
          body={`${parent.name} will lose access immediately.`}
          confirmLabel="Deactivate parent"
          danger
          busy={false}
          onConfirm={async () => {
            try {
              await api(`/api/v1/users/${id}/deactivate`, { method: "POST", body: "{}" });
              toast.notify("Parent deactivated");
              refetch();
              setShowDeactivate(false);
            } catch (e: any) {
              toast.notify(e.message ?? "Failed to deactivate parent", "error");
            }
          }}
          onClose={() => setShowDeactivate(false)}
        />
      )}
    </div>
  );
}