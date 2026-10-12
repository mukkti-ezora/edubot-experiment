import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui";
import { ChildSwitcher } from "@/components/ChildSwitcher";
import { FeeSummary, MetricStrip } from "@/components/RoleDashboard";
import { SubjectBars } from "@/components/SubjectBars";
import { Timetable } from "@/components/Timetable";
import { workTone } from "@/lib/roleDashboard";
import type { ChildData, ParentDashboardData } from "@/pages/ParentDashboard";
import { MessageList, Panel, RolePage } from "./RolePage";
import "@/styles/pages/parent-dashboard.css";

/** Child picker shared by the per-child parent pages; keeps the choice by id, not position. */
function WithChild({ data, children }: { data: ParentDashboardData; children: (child: ChildData) => ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const child = data.children.find((c) => c.id === activeId) ?? data.children[0];
  if (!child) return <p className="rd-li-meta">No children are linked to this account yet.</p>;
  return (
    <>
      <ChildSwitcher
        options={data.children.map(({ id, name, class: className }) => ({ id, name, class: className }))}
        activeId={child.id}
        onChange={setActiveId}
      />
      {children(child)}
    </>
  );
}

export function ParentChildren() {
  return (
    <RolePage<ParentDashboardData> role="parent" title="Children" sub={(d) => `${d.children.length} linked to your account`}>
      {(data) => (
        <div className="rd-col">
          {data.children.map((child) => (
            <Panel key={child.id} title={child.name} count={`${child.class} · ${child.institution}`}>
              <MetricStrip stats={child.stats} />
            </Panel>
          ))}
        </div>
      )}
    </RolePage>
  );
}

export function ParentAcademics() {
  return (
    <RolePage<ParentDashboardData> role="parent" title="Academics" sub="Subjects, schedule and homework">
      {(data) => (
        <WithChild data={data}>
          {(child) => (
            <div className="rd-grid-2col">
              <Panel title="Subjects">
                <SubjectBars subjects={child.subjects} />
              </Panel>
              <div className="rd-col">
                <Panel title="Homework" count={`${child.homework.length}`} flush>
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
                </Panel>
                <Panel title="Today">
                  <Timetable entries={child.timetable} showTeacher />
                </Panel>
              </div>
            </div>
          )}
        </WithChild>
      )}
    </RolePage>
  );
}

export function ParentFees() {
  return (
    <RolePage<ParentDashboardData> role="parent" title="Fees" sub="Per child, this academic year">
      {(data) => (
        <div className="rd-grid-2col">
          {data.children.map((child) => (
            <div key={child.id} className="rd-col">
              <h2 className="rd-section-title">{child.name}</h2>
              <FeeSummary fees={child.fees} />
            </div>
          ))}
        </div>
      )}
    </RolePage>
  );
}

export function ParentMessages() {
  return (
    <RolePage<ParentDashboardData> role="parent" title="Messages" sub="From teachers and your institution">
      {(data) => (
        <div className="rd-grid-2col">
          <Panel title="Inbox" count={`${data.messages.length}`} flush>
            <MessageList messages={data.messages} />
          </Panel>
          <Panel title="Upcoming events" count={`${data.events.length}`} flush>
            <div className="rd-list">
              {data.events.map((e) => (
                <div key={`${e.title}-${e.date}`} className="rd-list-item">
                  <div className="rd-li-main">
                    <span className="rd-li-title">{e.title}</span>
                    <span className="rd-li-meta">{e.type} &middot; {e.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </RolePage>
  );
}
