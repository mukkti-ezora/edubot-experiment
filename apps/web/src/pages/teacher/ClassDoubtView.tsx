import { AttachmentPicker } from "@/components/files/AttachmentPicker";
import { useAttachments } from "@/components/files/useAttachments";
import { useId, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { Sparkle } from "@phosphor-icons/react";
import { ApiError } from "@/lib/api";
import { relativeTime, useAnswer, useClassDoubt, useDraft, type ClassDoubtDetail } from "@/lib/doubts";
import { Prose } from "@/components/Prose";
import { DoubtStatusChip, DoubtThread } from "@/components/doubts/parts";
import { Alert, Button, ErrorState, SkeletonRows } from "@/components/ui";
import "@/styles/pages/student.css";
import "@/styles/pages/doubts.css";

export function ClassDoubtView() {
  const { doubtId = "" } = useParams();
  const { data, isLoading, isError, refetch } = useClassDoubt(doubtId);
  if (isError) return <div className="st-page"><ErrorState title="This doubt couldn't load" onRetry={() => void refetch()} /></div>;
  if (isLoading || !data) return <div className="st-page"><SkeletonRows rows={6} /></div>;
  return <ClassDoubt key={data.id} doubt={data} />;
}

function ClassDoubt({ doubt }: { doubt: ClassDoubtDetail }) {
  return (
    <div className="st-page doubt-page">
      <nav className="st-crumbs" aria-label="Breadcrumb">
        <Link to="/t/doubts">Doubts</Link>
        <span aria-hidden="true">/</span>
        <span>{doubt.student.name}</span>
      </nav>
      <header className="doubt-head">
        <h1 className="st-title st-title-sm">{doubt.title}</h1>
        <div className="doubt-anchors">
          <DoubtStatusChip status={doubt.status} overdue={doubt.overdue} viewer="teacher" />
          <span className="doubt-row-when">
            Asked {relativeTime(doubt.createdAt)}
            {doubt.status === "open" && ` · reply ${doubt.overdue ? "was due" : "due"} ${relativeTime(doubt.replyDueAt)}`}
          </span>
        </div>
      </header>

      <div className="doubt-layout">
        <div className="doubt-main">
          <section className="panel">
            <div className="panel-body"><DoubtThread messages={doubt.messages} viewer="teacher" studentName={doubt.student.name} /></div>
          </section>
          <ReplyComposer doubt={doubt} />
        </div>
        <DoubtContext doubt={doubt} />
      </div>
    </div>
  );
}

/** Reply box. "Draft with AI" only fills the box; nothing reaches the student until the teacher sends it. */
export function ReplyComposer({ doubt }: { doubt: ClassDoubtDetail }) {
  const answer = useAnswer(doubt.id);
  const draft = useDraft(doubt.id);
  const [text, setText] = useState("");
  const [drafted, setDrafted] = useState(false);
  const [offered, setOffered] = useState<string | null>(null);  // a draft waiting for permission to replace typed text
  const inputId = useId();
  const attachments = useAttachments("teacher");

  const applyDraft = (suggestion: string) => {
    setText(suggestion);
    setDrafted(true);
    setOffered(null);
  };
  const makeDraft = () =>
    draft.mutate(undefined, {
      onSuccess: ({ draft: suggestion }) => (text.trim() ? setOffered(suggestion) : applyDraft(suggestion)),
    });
  const edit = (value: string) => {
    setText(value);
    if (!value.trim()) setDrafted(false);
  };
  const send = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() || attachments.uploading) return;
    answer.mutate({ body: text.trim(), attachmentIds: attachments.ids }, {
      onSuccess: () => { setText(""); setDrafted(false); attachments.clear(); },
    });
  };
  const draftFailure = draft.error instanceof ApiError && draft.error.code === "AI_UNAVAILABLE"
    ? "AI drafts aren't available right now. Write your reply directly."
    : "The draft couldn't be written. Try again or write your reply directly.";

  return (
    <form className="doubt-compose" onSubmit={send}>
      <div className="doubt-compose-top">
        <label htmlFor={inputId}>Your reply</label>
        <Button type="button" variant="ghost" size="sm" loading={draft.isPending} onClick={makeDraft}
          icon={<Sparkle size={14} weight="fill" aria-hidden="true" />}>
          Draft with AI
        </Button>
      </div>
      <textarea id={inputId} className="input" rows={7} maxLength={4000} value={text}
        placeholder="Explain the idea, point to the lesson, or ask what they've tried."
        onChange={(e) => edit(e.target.value)} onPaste={attachments.onPaste} />
      <AttachmentPicker attachments={attachments} label="Attach a sketch or worked example" />
      {offered !== null && (
        <div className="doubt-draft-offer" role="group" aria-label="AI draft ready">
          <p>Replace your text with the draft?</p>
          <Button type="button" size="sm" variant="secondary" onClick={() => applyDraft(offered)}>Replace</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOffered(null)}>Keep mine</Button>
        </div>
      )}
      {drafted && <p className="doubt-draft-note" role="status"><Sparkle size={12} weight="fill" aria-hidden="true" /> AI draft. Review before sending.</p>}
      {draft.isError && <Alert tone="warn">{draftFailure}</Alert>}
      {answer.isError && <Alert tone="danger">Your reply wasn't sent. Try again.</Alert>}
      <div className="doubt-compose-actions">
        <Button type="submit" size="sm" loading={answer.isPending} disabled={!text.trim() || attachments.uploading}>Send reply</Button>
      </div>
    </form>
  );
}

function DoubtContext({ doubt }: { doubt: ClassDoubtDetail }) {
  return (
    <aside className="doubt-context" aria-label="Context">
      <section className="panel">
        <div className="panel-body doubt-facts">
          <dl>
            <div><dt>Student</dt><dd>{doubt.student.name}</dd></div>
            <div><dt>Course</dt><dd>{doubt.courseCode} · {doubt.courseTitle}</dd></div>
            {doubt.topic && <div><dt>Topic</dt><dd>{doubt.topic.title}</dd></div>}
            {doubt.lesson && <div><dt>Lesson</dt><dd>{doubt.lesson.title}</dd></div>}
          </dl>
        </div>
      </section>
      {doubt.tutorTranscript.length > 0 && (
        <details className="panel doubt-transcript">
          <summary><Sparkle size={14} weight="fill" aria-hidden="true" /> EduBot chat before this doubt ({doubt.tutorTranscript.length} messages)</summary>
          <ol>
            {doubt.tutorTranscript.map((turn, index) => (
              <li key={index} className={`is-${turn.role}`}>
                <span className="doubt-msg-author">{turn.role === "user" ? doubt.student.name : "EduBot"}</span>
                {turn.role === "assistant" ? <Prose text={turn.content} /> : <p className="doubt-msg-body">{turn.content}</p>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </aside>
  );
}
