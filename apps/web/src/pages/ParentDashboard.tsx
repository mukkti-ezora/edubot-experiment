import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRoleDashboard, workTone, type FeeSummaryData, type StatCard, type WorkItem } from "@/lib/roleDashboard";
import { PageHead, EmptyState, Badge } from "@/components/ui";
import { DashboardPending, FeeSummary, MetricStrip } from "@/components/RoleDashboard";
import { Timetable, type TimetableEntry } from "@/components/Timetable";
import { SubjectBars, type SubjectBarEntry } from "@/components/SubjectBars";
import { ChildSwitcher } from "@/components/ChildSwitcher";
import "@/styles/pages/parent-dashboard.css";

export interface ChildData {
  id: string;
  name: string;
  class: string;
  institution: string;
  stats: Record<string, StatCard>;
  subjects: SubjectBarEntry[];
  timetable: TimetableEntry[];
  homework: WorkItem[];
  fees: FeeSummaryData;
  achievements: string[];
}

export interface MessageItem { from: string; subject: string; time: string }
export interface EventItem { title: string; date: string; type: string }

export interface ParentDashboardData {
  profile: { name: string; email: string };
  children: ChildData[];
  messages: MessageItem[];
  events: EventItem[];
}

/* ── Component ────────────────────────────────────────── */

export function ParentDashboard() {
  const { me } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(null);
  const query = useRoleDashboard<ParentDashboardData>("parent");
  const { data } = query;
  if (!data) return <DashboardPending query={query} className="page-parent-dashboard" />;

  const child = data.children.find((c) => c.id === activeId) ?? data.children[0];
  if (!child) {
    return (
      <div className="page-parent-dashboard">
        <PageHead title={data.profile.name || me?.admin.name || "Parent"} sub="Parent Dashboard" />
        <EmptyState
          title="No children linked yet"
          body="Once your school links your children to this account, their schedule, grades and fees appear here."
        />
      </div>
    );
  }

  return (
    <div className="page-parent-dashboard">
      <PageHead
        title={data.profile.name || me?.admin.name || "Parent"}
        sub="Parent Dashboard"
      />

      <ChildSwitcher
        options={data.children.map(({ id, name, class: className }) => ({ id, name, class: className }))}
        activeId={child.id}
        onChange={setActiveId}
      />

      <MetricStrip stats={child.stats} />

      <div className="rd-grid-2col">
        <div className="rd-col">
          <div className="panel">
            <div className="panel-head"><h2>Academic Health</h2></div>
            <div className="panel-body">
              <SubjectBars subjects={child.subjects} />
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>{child.name}'s Schedule</h2></div>
            <div className="panel-body">
              <Timetable entries={child.timetable} showTeacher />
            </div>
          </div>

          <FeeSummary fees={child.fees} />
        </div>

        <div className="rd-col">
          <div className="panel">
            <div className="panel-head">
              <h2>Homework</h2>
              <div className="spacer"><span className="rd-count-tag tnum">{child.homework.length} items</span></div>
            </div>
            <div className="panel-body flush">
              {child.homework.length > 0 ? (
                <div className="rd-list">
                  {child.homework.map((hw) => (
                    <div key={hw.title} className="rd-list-item">
                      <div className="rd-li-main">
                        <span className="rd-li-title">{hw.title}</span>
                        <span className="rd-li-meta">{hw.subject} &middot; {hw.due}</span>
                      </div>
                      <Badge tone={workTone(hw.status)}>{hw.score ?? hw.status}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No homework" body="No homework assigned." />
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Upcoming Events</h2></div>
            <div className="panel-body flush">
              {data.events.length > 0 ? (
                <div className="rd-list">
                  {data.events.map((evt) => (
                    <div key={`${evt.title}-${evt.date}`} className="rd-list-item">
                      <div className="rd-li-main">
                        <span className="rd-li-title">{evt.title}</span>
                        <span className="rd-li-meta">{evt.type} &middot; {evt.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No events" body="Upcoming events will appear here." />
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Messages</h2></div>
            <div className="panel-body flush">
              {data.messages.length > 0 ? (
                <div className="rd-list">
                  {data.messages.map((msg) => (
                    <div key={`${msg.subject}-${msg.time}`} className="rd-list-item">
                      <div className="rd-li-main">
                        <span className="rd-li-title">{msg.subject}</span>
                        <span className="rd-li-meta">From {msg.from} &middot; {msg.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No messages" body="Messages from teachers appear here." />
              )}
            </div>
          </div>
        </div>
      </div>

      {child.achievements.length > 0 && (
        <div className="panel pd-achievements-panel">
          <div className="panel-head"><h2>Achievements</h2></div>
          <div className="panel-body">
            <div className="pd-achievements">
              {child.achievements.map((title) => (
                <span key={title} className="pd-ach-badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                    <circle cx="12" cy="8" r="7" /><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12" />
                  </svg>
                  {title}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
