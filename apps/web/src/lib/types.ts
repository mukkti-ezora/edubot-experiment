export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Institution {
  id: string;
  code: string;
  name: string;
  type: string;
  status: "active" | "pending" | "suspended";
  city: string | null;
  region: string | null;
  country: string | null;
  contactName: string | null;
  contactEmail: string | null;
  statusNote: string | null;
  createdAt: string;
  updatedAt: string;
  suspendedAt: string | null;
}

export type UserType = "student" | "teacher" | "parent" | "administrator";
export type UserStatus = "active" | "invited" | "suspended" | "deactivated";

export interface UserRow {
  id: string;
  institutionId: string | null;
  institutionName: string | null;
  type: UserType;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  roles?: { id: string; roleId: string; name: string }[];
  lastLoginAt?: string | null;
}

export interface Permission {
  id: string;
  key: string;
  domain: string;
  description: string;
}

export interface RoleSummary {
  id: string;
  name: string;
  scope: string;
  description: string;
  isSystem: boolean;
  permissionCount: number;
  memberCount: number;
}

export interface RoleDetail extends Omit<RoleSummary, "permissionCount"> {
  permissions: Permission[];
  members: {
    assignmentId: string;
    personId: string;
    name: string;
    email: string | null;
    status: string | null;
    scope: string;
  }[];
}

export interface AuditEvent {
  id: string;
  occurredAt: string;
  action: string;
  result: "success" | "denied" | "error";
  actorId: string | null;
  actorType: string;
  actorLabel: string | null;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  institutionId: string | null;
  institutionLabel: string | null;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  diff: Record<string, unknown> | null;
}

export interface DashboardSummary {
  generatedAt: string;
  institutions: {
    total: number;
    byStatus: Record<string, number>;
    newLast30Days: number;
    newPrior30Days: number;
  };
  users: {
    total: number;
    byType: Record<string, number>;
    newLast30Days: number;
    newPrior30Days: number;
  };
  attention: {
    pendingInstitutions: Institution[];
    suspendedUsersRecently: number;
    failedSignins24h: number;
    failedSigninsElevated: boolean;
  };
  recentActivity: AuditEvent[];
  institutionActivity: { institutionId: string; institution: string; events: number }[];
}

export interface InstitutionOverview {
  institution: Institution;
  stats: { users?: number; students?: number; teachers?: number; parents?: number };
  recentActivity: AuditEvent[];
}

export interface PlatformSettings {
  platformName: string;
  supportEmail: string | null;
  signInNotice: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface MeResponse {
  admin: {
    id: string;
    name: string;
    email: string;
    type: string;
    status: string;
    institutionId: string | null;
  };
  roles: { id: string; name: string }[];
  permissions: string[];
  scope: string;
}
