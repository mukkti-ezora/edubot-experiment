import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  CalendarBlank, CaretLeft, CaretRight, ChalkboardTeacher, Copy, Exam, Flag, Prohibit, Rss, WarningCircle,
} from "@phosphor-icons/react";
import {
  addDayKeys, ATTENDANCE_LABELS, dayKey, formatTime, keyToDate, minutesInDay, todayKey, useCalendarFeed, useSchedule,
  weekKeys, weekStartKey, ZONE_LABEL, type ScheduleEvent,
} from "@/lib/schedule";
import { Alert, Button, ConfirmDialog, Drawer, EmptyState, ErrorState, SkeletonRows } from "@/components/ui";
import "@/styles/pages/student.css";
import "@/styles/pages/schedule.css";

const DAYS_PER_WEEK = 7;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const DEFAULT_FIRST_HOUR = 8;
const DEFAULT_LAST_HOUR = 18;
const HOUR_HEIGHT_PX = 56;
const MIN_SLOT_PX = 24;

// Day keys are the institution's calendar days; formatting them in UTC shows that day's own date.
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });
const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const longDayFormat = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const formatDay = (format: Intl.DateTimeFormat, key: string) => format.format(keyToDate(key));
/** An hour label for the grid ("9 am"), independent of the browser's zone. */
const hourLabel = (hour: number) => new Intl.DateTimeFormat(undefined, { hour: "numeric", timeZone: "UTC" })
  .format(new Date(Date.UTC(2000, 0, 1, hour)));

/** Sub-navigation shared by Schedule, Attendance and Leave. */
export function ScheduleNav() {
  const links = [
    { to: "/s/schedule", label: "Schedule", end: true },
    { to: "/s/schedule/attendance", label: "Attendance", end: false },
    { to: "/s/schedule/leave", label: "Leave", end: false },
  ];
  return (
    <nav className="sch-subnav" aria-label="Schedule sections">
      {links.map((link) => (
        <NavLink key={link.to} to={link.to} end={link.end} className="sch-subnav-link">{link.label}</NavLink>
      ))}
    </nav>
  );
}

type View = "week" | "agenda";

/** A student's week: classes, deadlines and test windows across every course. */
export function Schedule() {
  const [weekStart, setWeekStart] = useState(() => weekStartKey(todayKey()));
  const [view, setView] = useState<View>("week");
  const [syncing, setSyncing] = useState(false);
  const days = useMemo(() => weekKeys(weekStart), [weekStart]);
  const from = days[0];
  const to = days[DAYS_PER_WEEK - 1];
  const { data, isLoading, isError, refetch } = useSchedule(from, to);
  const byDay = useMemo(() => groupByDay(data?.events ?? []), [data]);
  const isThisWeek = weekStartKey(todayKey()) === from;

  return (
    <div className="st-page">
      <header className="sch-head">
        <div>
          <h1 className="st-title st-title-sm">Schedule</h1>
          <p className="st-muted">Classes, deadlines and tests across your courses. Times are {ZONE_LABEL}, your institution's time.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSyncing(true)}>
          <Rss size={14} aria-hidden="true" /> Sync to calendar
        </button>
      </header>
      <ScheduleNav />

      <div className="sch-toolbar">
        <div className="sch-week-nav">
          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Previous week"
            onClick={() => setWeekStart((w) => addDayKeys(w, -DAYS_PER_WEEK))}>
            <CaretLeft size={16} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Next week"
            onClick={() => setWeekStart((w) => addDayKeys(w, DAYS_PER_WEEK))}>
            <CaretRight size={16} aria-hidden="true" />
          </button>
          <h2 className="sch-week-label" aria-live="polite">
            {formatDay(dayFormat, from)} to {formatDay(dayFormat, to)}
          </h2>
          {!isThisWeek && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setWeekStart(weekStartKey(todayKey()))}>
              This week
            </button>
          )}
        </div>
        <ViewToggle value={view} onChange={setView} />
      </div>

      <Legend />

      {isError ? (
        <ErrorState title="Your schedule couldn't load" onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <div className="panel st-pad"><SkeletonRows rows={6} /></div>
      ) : data.events.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<CalendarBlank size={20} aria-hidden="true" />} title="Nothing scheduled this week"
            body="No classes, deadlines or tests fall in this week. Use the arrows to look ahead." />
        </div>
      ) : (
        <>
          {view === "week" && <WeekGrid days={days} byDay={byDay} />}
          <Agenda days={days} byDay={byDay} onlyOnSmallScreens={view === "week"} />
        </>
      )}

      {syncing && <CalendarSync onClose={() => setSyncing(false)} />}
    </div>
  );
}

const VIEW_OPTIONS: { id: View; label: string }[] = [{ id: "week", label: "Week" }, { id: "agenda", label: "Agenda" }];
const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREVIOUS_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

/** A radio group: one tab stop, arrow keys move and select, like native radios. */
export function ViewToggle({ value, onChange }: { value: View; onChange: (view: View) => void }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = VIEW_OPTIONS.findIndex((o) => o.id === value);
    const step = NEXT_KEYS.has(event.key) ? 1 : PREVIOUS_KEYS.has(event.key) ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (current + step + VIEW_OPTIONS.length) % VIEW_OPTIONS.length;
    onChange(VIEW_OPTIONS[next].id);
    buttons.current[next]?.focus();
  };
  return (
    <div className="sch-toggle" role="radiogroup" aria-label="Layout" onKeyDown={onKeyDown}>
      {VIEW_OPTIONS.map((option, index) => (
        <button key={option.id} type="button" role="radio" aria-checked={value === option.id}
          tabIndex={value === option.id ? 0 : -1} ref={(node) => { buttons.current[index] = node; }}
          className="sch-toggle-option" onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Legend() {
  return (
    <ul className="sch-legend" aria-label="Legend">
      <li><ChalkboardTeacher size={14} aria-hidden="true" /> Class</li>
      <li><Flag size={14} aria-hidden="true" /> Deadline</li>
      <li><Exam size={14} aria-hidden="true" /> Test window</li>
      <li><Prohibit size={14} aria-hidden="true" /> Cancelled</li>
    </ul>
  );
}

// ---- grouping and layout maths ----

function groupByDay(events: ScheduleEvent[]): Map<string, ScheduleEvent[]> {
  const grouped = new Map<string, ScheduleEvent[]>();
  for (const event of [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const day = dayKey(event.startsAt);
    grouped.set(day, [...(grouped.get(day) ?? []), event]);
  }
  return grouped;
}

/** Where an event sits on its day: start and end in minutes after midnight. A class that runs past midnight
 *  is drawn to the end of its first day. */
export function slotMinutes(event: Pick<ScheduleEvent, "startsAt" | "endsAt">): { start: number; end: number } {
  const start = minutesInDay(event.startsAt);
  if (!event.endsAt) return { start, end: start + MINUTES_PER_HOUR };
  const end = dayKey(event.endsAt) === dayKey(event.startsAt) ? minutesInDay(event.endsAt) : MINUTES_PER_DAY;
  return { start, end: Math.max(end, start) };
}

/** Hours the grid shows: the usual teaching day, stretched to fit any earlier or later class. */
function visibleHours(classes: ScheduleEvent[]): { first: number; last: number } {
  let first = DEFAULT_FIRST_HOUR;
  let last = DEFAULT_LAST_HOUR;
  for (const event of classes) {
    const { start, end } = slotMinutes(event);
    first = Math.min(first, Math.floor(start / MINUTES_PER_HOUR));
    last = Math.max(last, Math.ceil(end / MINUTES_PER_HOUR));
  }
  return { first, last };
}

/** Side-by-side lanes so overlapping classes on one day stay readable. */
function assignLanes(classes: ScheduleEvent[]): Map<string, { lane: number; lanes: number }> {
  const ends: number[] = [];
  const lanes = new Map<string, { lane: number; lanes: number }>();
  for (const event of classes) {
    const { start, end } = slotMinutes(event);
    let lane = ends.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) lane = ends.length;
    ends[lane] = end;
    lanes.set(event.id, { lane, lanes: 0 });
  }
  for (const value of lanes.values()) value.lanes = ends.length;
  return lanes;
}

function eventHref(event: ScheduleEvent): string {
  if (event.type === "due") return `/s/assignments/${event.id}`;
  if (event.type === "assessment") return "/s/practice";
  return `/s/learn/${event.courseId}`;
}

function eventTypeLabel(event: ScheduleEvent): string {
  if (event.type === "due") return "Deadline";
  if (event.type === "assessment") return "Test window";
  return event.kind.charAt(0).toUpperCase() + event.kind.slice(1);
}

/** The full sentence a screen reader hears for an event. */
function describeEvent(event: ScheduleEvent): string {
  const parts = [eventTypeLabel(event), event.courseCode, event.type === "class" ? null : event.title];
  const time = event.type === "class" && event.endsAt
    ? `${formatTime(event.startsAt)} to ${formatTime(event.endsAt)}`
    : `${event.type === "due" ? "due" : "opens"} ${formatTime(event.startsAt)}`;
  parts.push(time);
  if (event.room) parts.push(`room ${event.room}`);
  if (event.status === "cancelled") parts.push("cancelled");
  if (event.attendance) parts.push(`you were marked ${ATTENDANCE_LABELS[event.attendance].toLowerCase()}`);
  return parts.filter(Boolean).join(", ");
}

// ---- week grid ----

function WeekGrid({ days, byDay }: { days: string[]; byDay: Map<string, ScheduleEvent[]> }) {
  const allClasses = [...byDay.values()].flat().filter((e) => e.type === "class");
  const { first, last } = visibleHours(allClasses);
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const today = todayKey();
  const bodyHeight = (last - first) * HOUR_HEIGHT_PX;

  return (
    <div className="panel sch-week" role="region" aria-label="Week view">
      <div className="sch-week-grid" style={{ "--sch-body-h": `${bodyHeight}px` } as React.CSSProperties}>
        <div className="sch-corner" aria-hidden="true" />
        {days.map((key) => {
          return (
            <div key={key} className={`sch-day-head${key === today ? " is-today" : ""}`}>
              <span className="sch-day-name">{formatDay(weekdayFormat, key)}</span>
              <span className="sch-day-date tnum">{formatDay(dateFormat, key)}</span>
              {key === today && <span className="sr-only">(today)</span>}
            </div>
          );
        })}

        <div className="sch-gutter-label" aria-hidden="true">Due</div>
        {days.map((day) => {
          const markers = (byDay.get(day) ?? []).filter((e) => e.type !== "class");
          return (
            <ul key={day} className="sch-markers" aria-label={`Deadlines and tests, ${formatDay(longDayFormat, day)}`}>
              {markers.map((event) => (
                <li key={`${event.type}-${event.id}`}>
                  <Link to={eventHref(event)} className={`sch-marker is-${event.type}`} aria-label={describeEvent(event)}>
                    {event.type === "due" ? <Flag size={12} aria-hidden="true" /> : <Exam size={12} aria-hidden="true" />}
                    <span className="truncate">{event.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          );
        })}

        <div className="sch-hours" aria-hidden="true">
          {hours.map((hour) => (
            <span key={hour} className="sch-hour tnum" style={{ top: (hour - first) * HOUR_HEIGHT_PX }}>
              {hourLabel(hour)}
            </span>
          ))}
        </div>
        {days.map((key) => {
          const classes = (byDay.get(key) ?? []).filter((e) => e.type === "class");
          const lanes = assignLanes(classes);
          return (
            <ul key={key} className={`sch-day-col${key === today ? " is-today" : ""}`}
              aria-label={`Classes, ${formatDay(longDayFormat, key)}`}>
              {classes.map((event) => {
                const { start, end } = slotMinutes(event);
                const { lane, lanes: laneCount } = lanes.get(event.id) ?? { lane: 0, lanes: 1 };
                const style = {
                  top: ((start - first * MINUTES_PER_HOUR) / MINUTES_PER_HOUR) * HOUR_HEIGHT_PX,
                  height: Math.max(((end - start) / MINUTES_PER_HOUR) * HOUR_HEIGHT_PX - 2, MIN_SLOT_PX),
                  left: `calc(${(lane / laneCount) * 100}% + 2px)`,
                  width: `calc(${100 / laneCount}% - 4px)`,
                };
                return (
                  <li key={event.id} className="sch-class-slot" style={style}>
                    <Link to={eventHref(event)} aria-label={describeEvent(event)}
                      className={`sch-class is-${event.kind}${event.status === "cancelled" ? " is-cancelled" : ""}`}>
                      <span className="sch-class-code">
                        {event.status === "cancelled" && <Prohibit size={12} aria-hidden="true" />}
                        {event.courseCode}
                      </span>
                      <span className="sch-class-meta tnum">{formatTime(event.startsAt)}{event.room ? ` · ${event.room}` : ""}</span>
                      <span className="sch-class-meta">{eventTypeLabel(event)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          );
        })}
      </div>
    </div>
  );
}

// ---- agenda ----

function Agenda({ days, byDay, onlyOnSmallScreens }: {
  days: string[];
  byDay: Map<string, ScheduleEvent[]>;
  onlyOnSmallScreens: boolean;
}) {
  const busyDays = days.filter((day) => (byDay.get(day) ?? []).length > 0);
  const today = todayKey();
  return (
    <div className={`panel sch-agenda${onlyOnSmallScreens ? " is-small-only" : ""}`} role="region" aria-label="Agenda">
      <ol className="sch-agenda-days">
        {busyDays.map((day) => (
          <li key={day} className="sch-agenda-day">
            <h3 className="sch-agenda-date">
              {formatDay(longDayFormat, day)}
              {day === today && <span className="sch-today-tag">Today</span>}
            </h3>
            <ul className="sch-agenda-list">
              {(byDay.get(day) ?? []).map((event) => (
                <li key={`${event.type}-${event.id}`}>
                  <Link to={eventHref(event)} className={`sch-agenda-item${event.status === "cancelled" ? " is-cancelled" : ""}`}>
                    <span className="sch-agenda-time tnum">
                      {formatTime(event.startsAt)}
                      {event.type === "class" && event.endsAt ? ` to ${formatTime(event.endsAt)}` : ""}
                    </span>
                    <span className="sch-agenda-main">
                      <span className="sch-agenda-title">
                        <EventIcon event={event} /> {event.type === "class" ? `${event.courseCode} ${eventTypeLabel(event).toLowerCase()}` : event.title}
                      </span>
                      <span className="sch-agenda-meta">
                        {[event.type === "class" ? event.courseTitle : `${eventTypeLabel(event)} · ${event.courseCode}`,
                          event.room, event.status === "cancelled" ? "Cancelled" : null,
                          event.attendance ? ATTENDANCE_LABELS[event.attendance] : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EventIcon({ event }: { event: ScheduleEvent }) {
  if (event.status === "cancelled") return <Prohibit size={14} aria-hidden="true" />;
  if (event.type === "due") return <Flag size={14} aria-hidden="true" />;
  if (event.type === "assessment") return <Exam size={14} aria-hidden="true" />;
  return <ChalkboardTeacher size={14} aria-hidden="true" />;
}

// ---- calendar sync ----

type CopyState = "idle" | "copied" | "failed";

export function CalendarSync({ onClose }: { onClose: () => void }) {
  const feed = useCalendarFeed();
  const [copy, setCopy] = useState<CopyState>("idle");
  const [confirming, setConfirming] = useState(false);
  const url = feed.data ? new URL(feed.data.url, window.location.origin).toString() : null;

  const copyLink = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };
  const createLink = () => {
    setConfirming(false);
    setCopy("idle");
    feed.mutate();
  };

  return (
    <Drawer title="Sync to your calendar" sub="Subscribe once and your classes, deadlines and tests stay up to date."
      onClose={onClose} dismissible={!feed.isPending}>
      <div className="sch-sync">
        <Alert tone="warn" title="This link is private">
          Anyone with the link can see your schedule. Don't share it. Getting a new link stops the old one working.
        </Alert>
        {feed.isError && <Alert tone="danger">The link couldn't be created. Try again.</Alert>}
        {url ? (
          <div className="sch-sync-url">
            <label htmlFor="calendar-url" className="sch-sync-label">Your calendar link</label>
            <div className="sch-sync-row">
              <input id="calendar-url" className="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copyLink()}>
                <Copy size={14} aria-hidden="true" /> {copy === "copied" ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="st-muted sch-sync-note" role="status">
              {copy === "copied" ? "Link copied."
                : copy === "failed" ? "Copying didn't work here. Select the link and copy it yourself."
                : `Covers the next ${feed.data?.days} days. Calendar apps refresh it every few hours.`}
            </p>
          </div>
        ) : (
          <>
            <p className="st-muted">
              If you've made a calendar link before, a new one replaces it: calendars subscribed to the old link stop updating
              until you add the new one.
            </p>
            <Button variant="primary" loading={feed.isPending} onClick={() => setConfirming(true)}>Create my calendar link</Button>
          </>
        )}

        <section className="sch-sync-steps" aria-labelledby="google-steps">
          <h3 id="google-steps">Google Calendar</h3>
          <ol>
            <li>On a computer, open Google Calendar.</li>
            <li>Next to Other calendars, choose Add, then From URL.</li>
            <li>Paste your link and choose Add calendar.</li>
          </ol>
        </section>
        <section className="sch-sync-steps" aria-labelledby="apple-steps">
          <h3 id="apple-steps">Apple Calendar</h3>
          <ol>
            <li>In Calendar on a Mac, choose File, then New Calendar Subscription.</li>
            <li>Paste your link and choose Subscribe.</li>
            <li>On iPhone: Settings, Calendar, Accounts, Add Account, Other, Add Subscribed Calendar.</li>
          </ol>
        </section>

        {url && (
          <button type="button" className="btn btn-ghost btn-sm sch-sync-rotate" onClick={() => setConfirming(true)}
            disabled={feed.isPending}>
            <WarningCircle size={14} aria-hidden="true" /> Get a new link
          </button>
        )}
        {confirming && (
          <ConfirmDialog title="Replace your calendar link?" confirmLabel="Create a new link"
            body="Any calendar subscribed to your previous link stops updating. Add the new link to keep your schedule in sync."
            onConfirm={createLink} onClose={() => setConfirming(false)} />
        )}
      </div>
    </Drawer>
  );
}
