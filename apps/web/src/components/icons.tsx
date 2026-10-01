/**
 * Stroke icon set (Lucide-style, 1.5px stroke, currentColor).
 * One system, one weight — no unicode glyphs, no emoji.
 */
import type { SVGProps } from "react";

function Svg({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      width="16"
      height="16"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconDashboard = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Svg>
);
export const IconBuilding = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M3 21h18" /><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" /><path d="M9 7h2M9 11h2M9 15h2M13 7h2M13 11h2M13 15h2" /></Svg>
);
export const IconUsers = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Svg>
);
export const IconUser = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Svg>
);
export const IconUserPlus = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></Svg>
);
export const IconKey = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" /></Svg>
);
export const IconShield = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></Svg>
);
export const IconShieldCheck = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></Svg>
);
export const IconActivity = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></Svg>
);
export const IconSettings = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></Svg>
);
export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Svg>
);
export const IconChevronDown = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>
);
export const IconChevronRight = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>
);
export const IconChevronLeft = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="m15 18-6-6 6-6" /></Svg>
);
export const IconChevronUpDown = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></Svg>
);
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M5 12h14M12 5v14" /></Svg>
);
export const IconX = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>
);
export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>
);
export const IconCheckCircle = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></Svg>
);
export const IconAlertTriangle = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></Svg>
);
export const IconAlertCircle = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></Svg>
);
export const IconInfo = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></Svg>
);
export const IconMenu = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>
);
export const IconDots = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></Svg>
);
export const IconLogout = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Svg>
);
export const IconCommand = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" /></Svg>
);
export const IconClock = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></Svg>
);
export const IconGlobe = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></Svg>
);
export const IconMail = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></Svg>
);
export const IconArrowUpRight = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M7 7h10v10" /><path d="M7 17 17 7" /></Svg>
);
export const IconArrowRight = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></Svg>
);
export const IconArrowLeft = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></Svg>
);
export const IconArrowUp = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></Svg>
);
export const IconArrowDown = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></Svg>
);
export const IconFilter = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M3 6h18" /><path d="M7 12h10" /><path d="M10 18h4" /></Svg>
);
export const IconInbox = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></Svg>
);
export const IconEye = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></Svg>
);
export const IconPencil = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></Svg>
);
export const IconRefresh = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></Svg>
);
export const IconBan = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></Svg>
);
export const IconCalendar = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Svg>
);
export const IconFileText = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M9 13h6M9 17h6" /></Svg>
);
export const IconHome = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></Svg>
);
export const IconHash = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M4 9h16M4 15h16" /><path d="M10 3 8 21" /><path d="M16 3l-2 18" /></Svg>
);
export const IconLock = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></Svg>
);
export const IconSend = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></Svg>
);
export const IconCircleDot = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="1" /></Svg>
);
export const IconBook = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></Svg>
);
export const IconCopy = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>
);
