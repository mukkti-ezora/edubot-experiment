/** Sign-in sessions as served by the gateway (Platform Owner only). */
export type SessionStatus = "active" | "ended" | "expired";

export interface SessionRow {
  id: string;
  personId: string;
  name: string | null;
  email: string;
  role: string;
  institutionName: string | null;
  ip: string | null;
  userAgent: string | null;
  startedAt: string;
  lastSeenAt: string;
  endedAt: string | null;
  endReason: string | null;
  status: SessionStatus;
}

export const ROLE_LABEL: Record<string, string> = {
  platform: "Administrator",
  student: "Student",
  teacher: "Teacher",
  parent: "Parent",
};

export const END_REASON_LABEL: Record<string, string> = {
  signed_out: "Signed out",
  revoked: "Ended by an administrator",
  reuse_detected: "Ended: token reuse detected",
  expired: "Expired",
};

const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad/, "iOS"],
  [/Android/, "Android"],
  [/Mac OS X/, "macOS"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
];

/** "Chrome on macOS" from a user-agent string; falls back to "Unknown device". */
export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  const system = SYSTEMS.find(([re]) => re.test(userAgent))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? "Other client";
}

/** IPv4 shown as 192.0.2.x by default; other formats keep only their first segment. */
export function maskIp(ip: string | null): string {
  if (!ip) return "Unknown";
  const v4 = ip.split(".");
  if (v4.length === 4) return `${v4.slice(0, 3).join(".")}.x`;
  return `${ip.split(":")[0]}:…`;
}

export function durationLabel(fromIso: string, toIso: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60000));
  if (minutes < 1) return "Under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} days`;
}
