/** Uploads for doubts, submissions and requests. Files go up as the raw request body; the server checks the bytes. */
import { api } from "./api";

export type FileRole = "student" | "teacher";

export interface AttachmentMeta {
  id: string;
  filename: string;
  contentType: string;
  size: number;
}

export const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 4;
const BYTES_PER_MB = 1024 * 1024;

/** Why a file can't be attached, in words a student can act on; null when it's fine. */
export function fileProblem(file: File): string | null {
  if (!(ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name} isn't a PNG, JPEG, WebP or PDF.`;
  }
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name} is larger than ${MAX_FILE_BYTES / BYTES_PER_MB} MB.`;
  return null;
}

export function isImage(contentType: string): boolean {
  return contentType.startsWith("image/");
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < BYTES_PER_MB) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
}

export function uploadAttachment(file: File, role: FileRole, signal?: AbortSignal): Promise<AttachmentMeta> {
  return api<AttachmentMeta>(`/api/v1/${role}/attachments?filename=${encodeURIComponent(file.name)}`, {
    method: "POST",
    body: file,
    headers: { "Content-Type": file.type },
    signal,
  });
}

export function attachmentUrl(id: string, role: FileRole): string {
  return `/api/v1/${role}/attachments/${id}`;
}
