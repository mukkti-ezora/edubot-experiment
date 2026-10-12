import { useId, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { BookOpen, ChatsCircle, Clock, LockSimple, Sparkle } from "@phosphor-icons/react";
import { ApiError } from "@/lib/api";
import { useAskDoubt, useMyDoubts, type Ref } from "@/lib/doubts";
import { useCourses } from "@/lib/student";
import { Alert, Button, Drawer, Field } from "@/components/ui";
import { AttachmentPicker } from "@/components/files/AttachmentPicker";
import { useAttachments } from "@/components/files/useAttachments";
import "@/styles/pages/doubts.css";

const TITLE_MAX = 160;
const BODY_MAX = 4000;

export interface AskAnchor {
  lesson?: Ref | null;
  course?: { id: string; code: string; title: string } | null;
  topic?: Ref | null;
  /** The EduBot chat this doubt escalates from; the teacher sees it alongside the question. */
  conversationId?: string | null;
}

interface Props {
  anchor?: AskAnchor;
  initialTitle?: string;
  initialBody?: string;
  onClose: () => void;
}

interface Errors {
  course?: string;
  title?: string;
  body?: string;
}

/** In on-screen order, so focus lands on the first field that needs attention. */
const FIELD_ORDER: (keyof Errors)[] = ["course", "title", "body"];

function validate(title: string, body: string, courseId: string, needsCourse: boolean): Errors {
  const errors: Errors = {};
  if (!title.trim()) errors.title = "Give your doubt a short title.";
  else if (title.trim().length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters.`;
  if (!body.trim()) errors.body = "Describe what you're stuck on.";
  if (needsCourse && !courseId) errors.course = "Choose the course this is about.";
  return errors;
}

function hasAnchorFacts(anchor: AskAnchor): boolean {
  return Boolean(anchor.course || anchor.lesson || anchor.topic || anchor.conversationId);
}

/** "Ask your teacher": a private question to the teacher of the class, anchored to a lesson or course. */
export function AskTeacher({ anchor = {}, initialTitle = "", initialBody = "", onClose }: Props) {
  const ids = { title: useId(), body: useId(), course: useId() };
  const navigate = useNavigate();
  const askDoubt = useAskDoubt();
  const needsCourse = !anchor.lesson && !anchor.course;
  const courses = useCourses({ enabled: needsCourse });
  const replyTargetHours = useMyDoubts().data?.replyTargetHours;
  const [title, setTitle] = useState(initialTitle.slice(0, TITLE_MAX));
  const [body, setBody] = useState(initialBody);
  const [courseId, setCourseId] = useState(anchor.course?.id ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const attachments = useAttachments("student");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validate(title, body, courseId, needsCourse);
    setErrors(found);
    const firstInvalid = FIELD_ORDER.find((field) => found[field]);
    if (firstInvalid) {
      document.getElementById(ids[firstInvalid])?.focus();
      return;
    }
    askDoubt.mutate(
      {
        lessonId: anchor.lesson?.id,
        courseId: anchor.lesson ? undefined : courseId,
        topicId: anchor.lesson ? undefined : anchor.topic?.id,
        title: title.trim(),
        body: body.trim(),
        conversationId: anchor.conversationId ?? undefined,
        attachmentIds: attachments.ids,
      },
      { onSuccess: (doubt) => { onClose(); navigate(`/s/doubts/${doubt.id}`); } },
    );
  };

  const failure = askDoubt.error;
  const failureText = failure instanceof ApiError && (failure.status === 429 || failure.status === 404)
    ? failure.message
    : "Your doubt wasn't sent. Check your connection and try again.";

  return createPortal(
    <Drawer
      title="Ask your teacher"
      sub="Your teacher for this class gets the question and replies here."
      onClose={onClose}
      dismissible={!askDoubt.isPending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={askDoubt.isPending}>Cancel</Button>
          <Button type="submit" form="ask-teacher-form" loading={askDoubt.isPending} disabled={attachments.uploading}>
            {attachments.uploading ? "Uploading files…" : "Send to teacher"}
          </Button>
        </>
      }
    >
      <form id="ask-teacher-form" className="ask-form" onSubmit={submit} noValidate>
        {hasAnchorFacts(anchor) && (
          <ul className="ask-anchor" aria-label="This doubt is about">
            {anchor.course && <li><BookOpen size={14} aria-hidden="true" /> {anchor.course.code} · {anchor.course.title}</li>}
            {anchor.lesson && <li><BookOpen size={14} aria-hidden="true" /> Lesson: {anchor.lesson.title}</li>}
            {anchor.topic && <li><ChatsCircle size={14} aria-hidden="true" /> Topic: {anchor.topic.title}</li>}
            {anchor.conversationId && <li><Sparkle size={14} weight="fill" aria-hidden="true" /> Includes your EduBot chat</li>}
          </ul>
        )}

        {needsCourse && (
          <Field label="Course" htmlFor={ids.course} error={errors.course}>
            <select id={ids.course} className="select" value={courseId} onChange={(e) => setCourseId(e.target.value)}
              disabled={courses.isLoading}>
              <option value="">{courses.isLoading ? "Loading your courses" : "Choose a course"}</option>
              {courses.data?.courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
            </select>
          </Field>
        )}

        <Field label="Title" htmlFor={ids.title} error={errors.title}>
          <input id={ids.title} className="input" data-autofocus value={title} maxLength={TITLE_MAX}
            placeholder="For example: Why is the range largest at 45 degrees?"
            onChange={(e) => setTitle(e.target.value)} />
        </Field>

        <Field label="Your question" htmlFor={ids.body} error={errors.body}
          help="Say what you tried and where it stopped making sense.">
          <textarea id={ids.body} className="input" rows={6} value={body} maxLength={BODY_MAX}
            onChange={(e) => setBody(e.target.value)} onPaste={attachments.onPaste} />
        </Field>

        <AttachmentPicker attachments={attachments} label="Attach a photo of your working" />

        <ul className="ask-promises">
          <li><LockSimple size={14} aria-hidden="true" /> Only you and your teacher can see this.</li>
          <li>
            <Clock size={14} aria-hidden="true" />{" "}
            {replyTargetHours ? `Teachers aim to reply within ${replyTargetHours} hours.` : "Your teacher's reply will appear in Doubts."}
          </li>
        </ul>

        {askDoubt.isError && <Alert tone="danger">{failureText}</Alert>}
      </form>
    </Drawer>,
    document.body,
  );
}
