export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${formatDate(iso)}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export function relativeFromNow(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function actionLabel(action: string): string {
  const map: Record<string, string> = {
    "auth.sign_in": "Signed in",
    "auth.sign_in_failed": "Failed sign-in",
    "auth.sign_in_rate_limited": "Sign-in rate limited",
    "auth.sign_out": "Signed out",
    "auth.refresh_reuse_detected": "Session replay blocked",
    "institution.create": "Created institution",
    "institution.update": "Updated institution",
    "institution.suspend": "Suspended institution",
    "institution.reactivate": "Reactivated institution",
    "user.update": "Updated user",
    "user.activate": "Activated user",
    "user.deactivate": "Deactivated user",
    "admin.create": "Invited administrator",
    "admin.update": "Updated administrator",
    "admin.deactivate": "Deactivated administrator",
    "admin.activate": "Activated administrator",
    "admin.account_created": "Created admin account",
    "admin.account_disabled": "Disabled admin account",
    "admin.account_enabled": "Enabled admin account",
    "role.create": "Created role",
    "role.update": "Updated role",
    "role.delete": "Deleted role",
    "role.assign": "Assigned role",
    "role.unassign": "Removed role assignment",
    "settings.update": "Changed platform settings",
    "authz.denied": "Denied action",
  };
  return map[action] ?? action.replaceAll(".", " · ");
}

export function typeLabel(type: string): string {
  return { student: "Student", teacher: "Teacher", parent: "Parent", administrator: "Administrator" }[type] ?? type;
}
