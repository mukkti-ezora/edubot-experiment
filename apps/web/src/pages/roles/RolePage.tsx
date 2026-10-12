import type { ReactNode } from "react";
import { useRoleDashboard, type DashboardRole } from "@/lib/roleDashboard";
import { DashboardPending } from "@/components/RoleDashboard";
import { EmptyState, PageHead } from "@/components/ui";

const PAGE_CLASS: Record<DashboardRole, string> = {
  student: "page-student-dashboard",
  teacher: "page-teacher-dashboard",
  parent: "page-parent-dashboard",
};

/**
 * Frame for a role portal sub-page: loads the role's dashboard BFF (shared cache with the
 * dashboard itself), shows pending/error states, then renders the page body from its data.
 */
export function RolePage<T>({
  role,
  title,
  sub,
  children,
}: {
  role: DashboardRole;
  title: string;
  sub: string | ((data: T) => string);
  children: (data: T) => ReactNode;
}) {
  const query = useRoleDashboard<T>(role);
  const { data } = query;
  if (!data) return <DashboardPending query={query} className={PAGE_CLASS[role]} />;
  return (
    <div className={PAGE_CLASS[role]}>
      <PageHead title={title} sub={typeof sub === "function" ? sub(data) : sub} />
      {children(data)}
    </div>
  );
}

export function Panel({ title, count, flush, children }: { title: string; count?: string; flush?: boolean; children: ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {count && (
          <div className="spacer">
            <span className="rd-count-tag tnum">{count}</span>
          </div>
        )}
      </div>
      <div className={`panel-body${flush ? " flush" : ""}`}>{children}</div>
    </div>
  );
}

export interface Message {
  from: string;
  subject: string;
  time: string;
}

export function MessageList({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return <EmptyState title="No messages" body="Messages from your institution appear here." />;
  }
  return (
    <div className="rd-list">
      {messages.map((m) => (
        <div key={`${m.subject}-${m.time}`} className="rd-list-item">
          <div className="rd-li-main">
            <span className="rd-li-title">{m.subject}</span>
            <span className="rd-li-meta">From {m.from} &middot; {m.time}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
