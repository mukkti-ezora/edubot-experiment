import { useId, useRef, useState, type DragEvent } from "react";
import { IconFilePdf, IconPaperclip, IconX } from "@/components/icons";
import { ALLOWED_TYPES, formatSize, MAX_ATTACHMENTS } from "@/lib/files";
import type { Attachments } from "./useAttachments";
import "@/styles/files.css";

/** Attach photos of working or PDFs: choose, drag in, or paste into the message box. Uploads start at once. */
export function AttachmentPicker({ attachments, label = "Attach a photo or PDF" }: {
  attachments: Attachments;
  label?: string;
}) {
  const inputId = useId();
  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { items, errors, add, remove, retry, full, progress } = attachments;

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    add(Array.from(event.dataTransfer.files));
  };

  return (
    <div
      className={`attach${dragging ? " is-dragging" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className="attach-bar">
        <label htmlFor={inputId} className={`btn btn-ghost btn-sm attach-choose${full ? " is-disabled" : ""}`}
          aria-disabled={full || undefined}>
          <IconPaperclip width={16} height={16} /> {label}
        </label>
        <input
          ref={input}
          id={inputId}
          type="file"
          className="sr-only"
          accept={ALLOWED_TYPES.join(",")}
          multiple
          disabled={full}
          aria-describedby={hintId}
          onChange={(event) => {
            add(Array.from(event.target.files ?? []));
            if (input.current) input.current.value = "";
          }}
        />
        <span id={hintId} className="attach-hint">
          {full ? `${MAX_ATTACHMENTS} files attached` : `PNG, JPEG, WebP or PDF, up to 10 MB. Paste a screenshot or drop files here.`}
        </span>
      </div>

      {items.length > 0 && (
        <ul className="attach-list" aria-label="Attached files">
          {items.map((item) => (
            <li key={item.key} className={`attach-item is-${item.status}`}>
              {item.previewUrl ? (
                <img src={item.previewUrl} alt="" className="attach-thumb" />
              ) : (
                <span className="attach-thumb attach-thumb-file" aria-hidden="true"><IconFilePdf width={20} height={20} /></span>
              )}
              <span className="attach-name">
                <span className="truncate">{item.name}</span>
                <span className="attach-meta tnum">
                  {item.status === "uploading" ? "Uploading…" : item.status === "failed" ? (item.problem ?? "Didn't upload") : formatSize(item.size)}
                </span>
              </span>
              {item.status === "failed" && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => retry(item.key)}
                  aria-label={`Try uploading ${item.name} again`}>
                  Retry
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => remove(item.key)}
                aria-label={`Remove ${item.name}`}>
                <IconX width={14} height={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="sr-only" role="status">{progress}</p>
      {errors.length > 0 && (
        <ul className="attach-errors" role="alert">
          {errors.map((error) => <li key={error.key}>{error.message}</li>)}
        </ul>
      )}
    </div>
  );
}
