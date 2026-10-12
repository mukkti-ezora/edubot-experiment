import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from "react";
import { ApiError } from "@/lib/api";
import { fileProblem, MAX_ATTACHMENTS, uploadAttachment, type AttachmentMeta, type FileRole } from "@/lib/files";

export interface PickedFile {
  key: string;
  name: string;
  contentType: string;
  size: number;
  previewUrl: string | null;
  status: "uploading" | "ready" | "failed";
  meta: AttachmentMeta | null;
  /** Why this file didn't upload, when it failed. */
  problem: string | null;
}

export interface PickProblem {
  key: string;
  message: string;
}

let pickCounter = 0;
const nextKey = (prefix: string) => `${prefix}-${++pickCounter}`;

/** Files chosen for one message: uploads them straight away and tracks which are ready to send. */
export function useAttachments(role: FileRole) {
  const [items, setItems] = useState<PickedFile[]>([]);
  const [errors, setErrors] = useState<PickProblem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  // The original File (for retrying) and the in-flight request (for cancelling) of each picked file.
  const files = useRef(new Map<string, File>());
  const uploads = useRef(new Map<string, AbortController>());

  useEffect(() => () => {
    itemsRef.current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    uploads.current.forEach((upload) => upload.abort());
  }, []);

  const update = (key: string, change: Partial<PickedFile>) =>
    setItems((prev) => prev.map((p) => (p.key === key ? { ...p, ...change } : p)));

  const upload = useCallback((key: string, file: File) => {
    const controller = new AbortController();
    uploads.current.set(key, controller);
    update(key, { status: "uploading", problem: null });
    uploadAttachment(file, role, controller.signal).then(
      (meta) => update(key, { status: "ready", meta }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        update(key, {
          status: "failed",
          problem: error instanceof ApiError ? error.message : `${file.name} couldn't upload. Try again.`,
        });
      },
    ).finally(() => uploads.current.delete(key));
  }, [role]);

  const add = useCallback((picked: File[]) => {
    const problems: string[] = [];
    // Failed files don't hold a place: the student can remove or retry them.
    const room = MAX_ATTACHMENTS - itemsRef.current.filter((item) => item.status !== "failed").length;
    const accepted = picked.filter((file) => {
      const problem = fileProblem(file);
      if (problem) problems.push(problem);
      return !problem;
    });
    if (accepted.length > room) {
      problems.push(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      accepted.splice(Math.max(room, 0));
    }
    setErrors(problems.map((message) => ({ key: nextKey("problem"), message })));
    const fresh = accepted.map((file): PickedFile => ({
      key: nextKey("pick"),
      name: file.name,
      contentType: file.type,
      size: file.size,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      status: "uploading",
      meta: null,
      problem: null,
    }));
    setItems((prev) => [...prev, ...fresh]);
    fresh.forEach((item, index) => {
      files.current.set(item.key, accepted[index]);
      upload(item.key, accepted[index]);
    });
  }, [upload]);

  const retry = useCallback((key: string) => {
    const file = files.current.get(key);
    if (file) upload(key, file);
  }, [upload]);

  const remove = useCallback((key: string) => {
    uploads.current.get(key)?.abort();
    uploads.current.delete(key);
    files.current.delete(key);
    setItems((prev) => {
      const gone = prev.find((p) => p.key === key);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  }, []);

  const clear = useCallback(() => {
    itemsRef.current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    uploads.current.forEach((controller) => controller.abort());
    uploads.current.clear();
    files.current.clear();
    setItems([]);
    setErrors([]);
  }, []);

  /** Lets a screenshot pasted into the message box become an attachment. */
  const onPaste = useCallback((event: ClipboardEvent) => {
    const pasted = Array.from(event.clipboardData.files);
    if (pasted.length === 0) return;
    event.preventDefault();
    add(pasted);
  }, [add]);

  const uploadingCount = items.filter((item) => item.status === "uploading").length;
  return {
    items,
    errors,
    add,
    retry,
    remove,
    clear,
    onPaste,
    ids: items.flatMap((item) => (item.meta ? [item.meta.id] : [])),
    uploading: uploadingCount > 0,
    /** For screen readers: what's happening with the uploads right now. */
    progress: uploadingCount > 0 ? `Uploading ${uploadingCount} ${uploadingCount === 1 ? "file" : "files"}…` : "",
    full: items.filter((item) => item.status !== "failed").length >= MAX_ATTACHMENTS,
  };
}

export type Attachments = ReturnType<typeof useAttachments>;
