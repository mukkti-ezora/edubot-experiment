import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, relativeFromNow, formatNumber } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { PageHead, Avatar, StatusPill, Badge, SectionHead, Alert, Button, EmptyState, ConfirmDialog } from "@/components/ui";
import {
  IconBookOpen,
  IconBuilding,
  IconUser,
  IconKey,
  IconActivity,
  IconArrowLeft,
  IconEdit,
  IconBan,
  IconCheckCircle,
} from "@/components/icons";
import "@/styles/pages/people.css";

interface TeacherDetailData {
  id: string;
  institutionId: string | null;
  institutionName: string | null;
  type: "teacher";
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

interface TeacherActivityEvent {
  id: string;
  occurredAt: string;
  action: string;
  result: "success" | "denied" | "error";
  actorLabel: string | null;
  targetLabel: string | null;
  institutionLabel: string | null;
}

export function TeacherDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const [showDeactivate, setShowDeactivate] = useState(false);

  const { data: teacher, isLoading, error, refetch } = useQuery<TeacherDetailData>({
    queryKey: ["teacher", id],
    queryFn: () => api<TeacherDetailData>(`/api/v1/users/${id}`),
    enabled: !!id,
    retry: false,
  });

  const { data: activity, isLoading: aLoading } = useQuery<TeacherActivityEvent[]>({
    queryKey: ["teacher-activity", id],
    queryFn: () => api<TeacherActivityEvent[]>(`/api/v1/activity?targetId=${id}&limit=20`),
    enabled: !!id,
    retry: false,
  });

  const handleActivate = async () => {
    try {
      await api(`/api/v1/users/${id}/activate`, { method: "POST", body: "{}" });
      toast.notify("Teacher activated");
      refetch();
    } catch (e: any) {
      toast.notify(e.message ?? "Failed to activate teacher", "error");
    }
  };

  const handleDeactivate = async () => {
    try {
      await api(`/api/v1/users/${id}/deactivate`, { method: "POST", body: "{}" });
      toast.notify("Teacher deactivated");
      refetch();
      setShowDeactivate(false);
    } catch (e: any) {
      toast.notify(e.message ?? "Failed to deactivate teacher", "error");
    }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--surface-1)" }}>
        <div className="skeleton" style={{ width: 120, height: 16 }} />
      </div>
    );
  }

  if (error || !teacher) {
    return (
      <div className="page-teacher-detail">
        <PageHead title="Teacher not found" sub="The requested teacher could not be found." actions={<Button variant="ghost" onClick={() => navigate("/teachers")}><IconArrowLeft /> Back to teachers</Button>} />
        <EmptyState title="Teacher not found" body="The requested teacher could not be found." action={<Button variant="secondary" onClick={() => navigate("/teachers")}>Back to teachers</Button>} />
      </div>
    );
  }

  const isInvited = teacher.status === "invited";
  const isSuspended = teacher.status === "suspended";
  const isDeactivated = teacher.status === "deactivated";

  return (
    <div className="page-teacher-detail">
      <PageHead
        title={<>
          <Link to="/teachers" className="btn btn-ghost btn-sm"><IconArrowLeft /></Link>
          <span style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Avatar name={teacher.name} size="lg" category="teacher" />
            <span>{teacher.name}</span>
          </span>
        </>}
        sub={teacher.email}
        actions={
          <>
            {teacher.status !== "active" && can("user.update") && (
              <Button variant="secondary" onClick={handleActivate}>Activate</Button>
            )}
            {teacher.status === "active" && can("user.update") && (
              <Button variant="danger-ghost" onClick={() => setShowDeactivate(true)}>Deactivate</Button>
            )}
          </>
        }
      />

      {(teacher.status === "invited" || teacher.status === "suspended" || teacher.status === "deactivated") && (
        <Alert tone={teacher.status === "deactivated" ? "danger" : "warn"} title={
          teacher.status === "invited" ? "Invitation pending" : teacher.status === "suspended" ? "Teacher suspended" : "Teacher deactivated"
        }>
          {teacher.status === "invited" && "The teacher hasn't activated their account yet."}
          {teacher.status === "suspended" && "This teacher has been suspended. They cannot access the platform."}
          {teacher.status === "deactivated" && "This teacher has been deactivated. Their account is permanently disabled."}
        </Alert>
      )}

      <div className="detail-sections">
        <div className="detail-section">
          <h3>Profile</h3>
          <div className="detail-kv">
            <dt>Email</dt>
            <dd>{teacher.email}</dd>
            <dt>Institution</dt>
            <dd>
              {teacher.institutionName ? (
                <Link to={`/institutions/${teacher.institutionId}`}>{teacher.institutionName}</Link>
              ) : "—"}
            </dd>
            <dt>Type</dt>
            <dd><Badge tone="teacher">Teacher</Badge></dd>
            <dt>Status</dt>
            <dd><StatusPill status={teacher.status} /></dd>
            <dt>Created</dt>
            <dd>{formatDate(teacher.createdAt)}</dd>
            <dt>Updated</dt>
            <dd>{formatDate(teacher.updatedAt)}</dd>
            <dt>Last sign-in</dt>
            <dd>{teacher.lastLoginAt ? relativeFromNow(teacher.lastLoginAt) : "Never"}</dd>
            <dt>User ID</dt>
            <dd className="mono">{teacher.id}</dd>
          </div>
        </div>

        <div className="detail-section">
          <h3>Roles</h3>
          {teacher.roles && teacher.roles.length > 0 ? (
            <div className="detail-roles">
              {teacher.roles.map((role) => (
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
            <EmptyState title="No recent activity" body="No activity recorded for this teacher." icon={<IconActivity />} />
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

      <ConfirmDialog
        title="Deactivate teacher?"
        body={`${teacher.name} will lose access immediately.`}
        confirmLabel="Deactivate teacher"
        danger
        busy={false}
        onConfirm={async () => {
          try {
            await api(`/api/v1/users/${id}/deactivate`, { method: "POST", body: "{}" });
            toast.notify("Teacher deactivated");
            refetch();
            setShowDeactivate(false);
          } catch (e: any) {
            toast.notify(e.message ?? "Failed to deactivate teacher", "error");
          }
        }}
        onClose={() => setShowDeactivate(false)}
        isOpen={showDeactivate}
        onCloseOverlay={() => setShowDeactivate(false)}
      />
    </div>
  );
}