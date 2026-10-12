import { AttachmentPicker } from "@/components/files/AttachmentPicker";
import { useAttachments } from "@/components/files/useAttachments";
import { useId, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { BookOpen, CheckCircle, Hash, Sparkle } from "@phosphor-icons/react";
import { isReplyLate, relativeTime, useDoubt, useFollowUp, useResolve, type DoubtDetail } from "@/lib/doubts";
import { DoubtStatusChip, DoubtThread } from "@/components/doubts/parts";
import { Alert, Button, ErrorState, SkeletonRows } from "@/components/ui";
import "@/styles/pages/student.css";
import "@/styles/pages/doubts.css";

export function DoubtView() {
  const { doubtId = "" } = useParams();
  const { data, isLoading, isError, refetch } = useDoubt(doubtId);
  if (isError) return <div className="st-page"><ErrorState title="This doubt couldn't load" onRetry={() => void refetch()} /></div>;
  if (isLoading || !data) return <div className="st-page"><SkeletonRows rows={6} /></div>;
  return <Doubt key={data.id} doubt={data} />;
}

/** Plain words for where the doubt stands and what the student can do next. */
function stateLine(doubt: DoubtDetail): string {
  if (isReplyLate(doubt)) return "Your teacher hasn't replied yet. It's taking longer than usual.";
  if (doubt.status === "open") return `Your teacher has it. A reply is expected ${relativeTime(doubt.replyDueAt)}.`;
  if (doubt.status === "answered") return "Your teacher replied. Still unsure? Follow up below. If it makes sense now, mark it resolved.";
  return "You marked this resolved. Sending a follow-up reopens it.";
}

function Doubt({ doubt }: { doubt: DoubtDetail }) {
  const followUp = useFollowUp(doubt.id);
  const resolve = useResolve(doubt.id);
  const [text, setText] = useState("");
  const inputId = useId();
  const attachments = useAttachments("student");

  const send = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() || attachments.uploading) return;
    followUp.mutate({ body: text.trim(), attachmentIds: attachments.ids }, {
      onSuccess: () => { setText(""); attachments.clear(); },
    });
  };

  return (
    <div className="st-page doubt-page">
      <nav className="st-crumbs" aria-label="Breadcrumb">
        <Link to="/s/doubts">Doubts</Link>
        <span aria-hidden="true">/</span>
        <span>{doubt.courseCode}</span>
      </nav>

      <header className="doubt-head">
        <h1 className="st-title st-title-sm">{doubt.title}</h1>
        <div className="doubt-anchors">
          <DoubtStatusChip status={doubt.status} viewer="student" />
          <Link className="doubt-anchor" to={`/s/learn/${doubt.courseId}`}><BookOpen size={14} aria-hidden="true" /> {doubt.courseCode}</Link>
          {doubt.topic && <Link className="doubt-anchor" to={`/s/topics/${doubt.topic.id}`}><Hash size={14} aria-hidden="true" /> {doubt.topic.title}</Link>}
          {doubt.lesson && <Link className="doubt-anchor" to={`/s/lessons/${doubt.lesson.id}`}><BookOpen size={14} aria-hidden="true" /> {doubt.lesson.title}</Link>}
          {doubt.conversationId && <span className="doubt-anchor is-static"><Sparkle size={14} weight="fill" aria-hidden="true" /> EduBot chat attached</span>}
        </div>
        <p className="doubt-state" role="status">{stateLine(doubt)}</p>
      </header>

      <section className="panel">
        <div className="panel-body"><DoubtThread messages={doubt.messages} viewer="student" /></div>
      </section>

      <form className="doubt-compose" onSubmit={send}>
        <label htmlFor={inputId}>{doubt.status === "open" ? "Add to your question" : "Follow up"}</label>
        <textarea id={inputId} className="input" rows={3} maxLength={4000} value={text}
          placeholder="What's still unclear?" onChange={(e) => setText(e.target.value)} onPaste={attachments.onPaste} />
        <AttachmentPicker attachments={attachments} />
        {followUp.isError && <Alert tone="danger">Your message wasn't sent. Try again.</Alert>}
        <div className="doubt-compose-actions">
          {doubt.status !== "resolved" && (
            <Button type="button" variant="secondary" size="sm" loading={resolve.isPending} onClick={() => resolve.mutate()}
              icon={<CheckCircle size={16} aria-hidden="true" />}>
              Mark as resolved
            </Button>
          )}
          <Button type="submit" size="sm" loading={followUp.isPending} disabled={!text.trim() || attachments.uploading}>Send</Button>
        </div>
        {resolve.isError && <Alert tone="danger">That didn't save. Try again.</Alert>}
      </form>
    </div>
  );
}
