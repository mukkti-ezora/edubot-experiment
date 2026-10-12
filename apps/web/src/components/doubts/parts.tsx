import { AttachmentList } from "@/components/files/AttachmentList";
import { ArrowBendUpLeft, CheckCircle, HourglassMedium, WarningCircle, type Icon } from "@phosphor-icons/react";
import { Prose } from "@/components/Prose";
import { relativeTime, type DoubtMessage, type DoubtStatus } from "@/lib/doubts";
import "@/styles/pages/doubts.css";

type Viewer = "student" | "teacher";

const STATUS: Record<DoubtStatus | "overdue", { icon: Icon; tone: string; student: string; teacher: string }> = {
  open: { icon: HourglassMedium, tone: "neutral", student: "Waiting for teacher", teacher: "Waiting" },
  overdue: { icon: WarningCircle, tone: "danger", student: "Waiting for teacher", teacher: "Overdue" },
  answered: { icon: ArrowBendUpLeft, tone: "brand", student: "Answered", teacher: "Answered" },
  resolved: { icon: CheckCircle, tone: "ok", student: "Resolved", teacher: "Resolved" },
};

/** Status as icon plus words, never colour alone. Students are not shown "overdue"; teachers are. */
export function DoubtStatusChip({ status, overdue = false, viewer }: { status: DoubtStatus; overdue?: boolean; viewer: Viewer }) {
  const meta = STATUS[overdue && viewer === "teacher" ? "overdue" : status];
  return (
    <span className={`doubt-status tone-${meta.tone}`}>
      <meta.icon size={14} weight="fill" aria-hidden="true" /> {meta[viewer]}
    </span>
  );
}

function authorLabel(message: DoubtMessage, viewer: Viewer, studentName: string): string {
  if (message.authorRole === viewer && viewer === "student") return "You";
  if (message.authorRole === "student") return studentName;
  return message.authorName ?? "Teacher";
}

/** The conversation on one doubt. Teacher replies may use the lesson Markdown subset; student text stays plain. */
export function DoubtThread({ messages, viewer, studentName = "Student" }: {
  messages: DoubtMessage[];
  viewer: Viewer;
  studentName?: string;
}) {
  return (
    <ol className="doubt-thread" aria-label="Messages">
      {messages.map((message) => (
        <li key={message.id} className={`doubt-msg is-${message.authorRole}`}>
          <div className="doubt-msg-head">
            <span className="doubt-msg-author">{authorLabel(message, viewer, studentName)}</span>
            {message.authorRole === "teacher" && <span className="doubt-msg-role">Teacher</span>}
            <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
              {relativeTime(message.createdAt)}
            </time>
          </div>
          {message.authorRole === "teacher" ? <Prose text={message.body} /> : <p className="doubt-msg-body">{message.body}</p>}
          <AttachmentList attachments={message.attachments} role={viewer} />
        </li>
      ))}
    </ol>
  );
}

const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

function nextIndex(key: string, index: number, length: number): number | null {
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return key in STEP ? (index + STEP[key] + length) % length : null;
}

/** Segmented filter with counts. Arrow keys, Home and End move between options (ARIA radio group). */
export function DoubtFilter<T extends string>({ options, value, onChange, label }: {
  options: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="doubt-filter" role="radiogroup" aria-label={label}
      onKeyDown={(event) => {
        const target = nextIndex(event.key, options.findIndex((o) => o.id === value), options.length);
        if (target === null) return;
        event.preventDefault();
        const next = options[target];
        onChange(next.id);
        (event.currentTarget.querySelector(`[data-id="${next.id}"]`) as HTMLElement | null)?.focus();
      }}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button key={option.id} type="button" role="radio" aria-checked={selected} data-id={option.id}
            tabIndex={selected ? 0 : -1} className="doubt-filter-option" onClick={() => onChange(option.id)}>
            {option.label}
            {typeof option.count === "number" && <span className="doubt-filter-count tnum">{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
