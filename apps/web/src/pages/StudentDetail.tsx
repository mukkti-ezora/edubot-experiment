import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatDate, relativeFromNow } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { PageHead, Avatar, StatusPill, Badge, Alert, Button, EmptyState, ConfirmDialog } from "@/components/ui";
import {
  IconBuilding,
  IconActivity,
  IconArrowLeft,
  IconClock,
} from "@/components/icons";
import "@/styles/pages/people.css";

interface StudentDetailData {
  id: string;
  institutionId: string | null;
  institutionName: string | null;
  type: "student";
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

interface StudentActivityEvent {
  id: string;
  occurredAt: string;
  action: string;
  result: "success" | "denied" | "error";
  actorLabel: string | null;
  targetLabel: string | null;
  institutionLabel: string | null;
}

export function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const [showDeactivate, setShowDeactivate] = useState(false);

  const { data: student, isLoading, error, refetch } = useQuery<StudentDetailData>({
    queryKey: ["student", id],
    queryFn: () => api<StudentDetailData>(`/api/v1/users/${id}`),
    enabled: !!id,
    retry: false,
  });

  const { data: activity, isLoading: aLoading } = useQuery<StudentActivityEvent[]>({
    queryKey: ["student-activity", id],
    queryFn: () => api<StudentActivityEvent[]>(`/api/v1/activity?targetId=${id}&limit=20`),
    enabled: !!id,
    retry: false,
  });

  const handleActivate = async () => {
    try {
      await api(`/api/v1/users/${id}/activate`, { method: "POST", body: "{}" });
      toast.notify("Student activated");
      refetch();
    } catch (e: any) {
      toast.notify(e.message ?? "Failed to activate student", "error");
    }
  };

  const handleDeactivate = async () => {
    try {
      await api(`/api/v1/users/${id}/deactivate`, { method: "POST", body: "{}" });
      toast.notify("Student deactivated");
      refetch();
      setShowDeactivate(false);
    } catch (e: any) {
      toast.notify(e.message ?? "Failed to deactivate student", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="page-student-detail is-loading">
        <div className="skeleton" />
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="page-student-detail">
        <PageHead title="Student not found" sub="The requested student could not be found." actions={<Button variant="ghost" onClick={() => navigate("/students")}><IconArrowLeft /> Back to students</Button>} />
        <EmptyState title="Student not found" body="The requested student could not be found." action={<Button variant="secondary" onClick={() => navigate("/students")}>Back to students</Button>} />
      </div>
    );
  }

  const isInvited = student.status === "invited";
  const isSuspended = student.status === "suspended";
  const isDeactivated = student.status === "deactivated";

  return (
    <div className="page-student-detail">
      <PageHead
        title={<>
          <Link to="/students" className="btn btn-ghost btn-sm"><IconArrowLeft /></Link>
          <span className="detail-head-identity">
            <Avatar name={student.name} size="lg" category="student" />
            <span>{student.name}</span>
          </span>
        </>}
        sub={student.email}
        actions={
          <>
            {student.status !== "active" && can("user.update") && (
              <Button variant="secondary" onClick={handleActivate}>Activate</Button>
            )}
            {student.status === "active" && can("user.update") && (
              <Button variant="danger-ghost" onClick={() => setShowDeactivate(true)}>Deactivate</Button>
            )}
          </>
        }
      />

      {(isInvited || isSuspended || isDeactivated) && (
        <Alert tone={isDeactivated ? "danger" : "warn"} title={
          isInvited ? "Invitation pending" : isSuspended ? "Student suspended" : "Student deactivated"
        }>
          {isInvited && "The student hasn't activated their account yet."}
          {isSuspended && "This student has been suspended. They cannot access the platform."}
          {isDeactivated && "This student has been deactivated. Their account is permanently disabled."}
        </Alert>
      )}

      <div className="detail-sections">
        <div className="detail-section">
          <h3>Profile</h3>
          <div className="detail-kv">
            <dt>Email</dt>
            <dd>{student.email}</dd>
            <dt>Institution</dt>
            <dd>
              {student.institutionName ? (
                <Link to={`/institutions/${student.institutionId}`}>{student.institutionName}</Link>
              ) : "—"}
            </dd>
            <dt>Type</dt>
            <dd><Badge tone="student">Student</Badge></dd>
            <dt>Status</dt>
            <dd><StatusPill status={student.status} /></dd>
            <dt>Created</dt>
            <dd>{formatDate(student.createdAt)}</dd>
            <dt>Updated</dt>
            <dd>{formatDate(student.updatedAt)}</dd>
            <dt>Last sign-in</dt>
            <dd>{student.lastLoginAt ? relativeFromNow(student.lastLoginAt) : "Never"}</dd>
            <dt>User ID</dt>
            <dd className="mono">{student.id}</dd>
          </div>
        </div>

        <div className="detail-section">
          <h3>Roles</h3>
          {student.roles && student.roles.length > 0 ? (
            <div className="detail-roles">
              {student.roles.map((role) => (
                <Badge key={role.id} tone="violet">{role.name}</Badge>
              ))}
            </div>
          ) : (
            <p className="text-muted">No roles assigned</p>
          )}
        </div>

        <div className="detail-section">
          <h3>Recent Activity</h3>
          {!aLoading && activity?.length === 0 && (
            <EmptyState title="No recent activity" body="No activity recorded for this student." icon={<IconActivity />} />
          )}
          {!aLoading && (activity?.length ?? 0) > 0 && (
            <div className="timeline">
              {activity!.slice(0, 10).map((evt) => (
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
          {aLoading && <div className="skeleton skel-activity" />}
        </div>
      </div>

      {showDeactivate && (
        <ConfirmDialog
          title="Deactivate student?"
          body={`${student.name} will lose access immediately.`}
          confirmLabel="Deactivate student"
          danger
          busy={false}
          onConfirm={() => { handleDeactivate(); }}
          onClose={() => setShowDeactivate(false)}
        />
      )}
    </div>
  );
}