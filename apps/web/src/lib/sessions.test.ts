import { describe, expect, it } from "vitest";
import { deviceLabel, durationLabel, maskIp } from "./sessions";

describe("session helpers", () => {
  it.each([
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36", "Chrome on macOS"],
    ["Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0", "Edge on Windows"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari/604.1", "Safari on iOS"],
    ["curl/8.7.1", "Other client"],
    [null, "Unknown device"],
  ])("labels %s as %s", (ua, label) => {
    expect(deviceLabel(ua)).toBe(label);
  });

  it("masks the last IPv4 octet and IPv6 tail", () => {
    expect(maskIp("192.0.2.107")).toBe("192.0.2.x");
    expect(maskIp("2001:db8::1")).toBe("2001:…");
    expect(maskIp(null)).toBe("Unknown");
  });

  it("formats session length across boundaries", () => {
    const start = "2026-10-08T10:00:00Z";
    expect(durationLabel(start, "2026-10-08T10:00:20Z")).toBe("Under a minute");
    expect(durationLabel(start, "2026-10-08T10:45:00Z")).toBe("45 min");
    expect(durationLabel(start, "2026-10-08T13:05:00Z")).toBe("3 h 5 min");
    expect(durationLabel(start, "2026-10-11T10:00:00Z")).toBe("3 days");
  });
});
