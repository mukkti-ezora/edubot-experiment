import { IconFilePdf } from "@/components/icons";
import { attachmentUrl, formatSize, isImage, type AttachmentMeta, type FileRole } from "@/lib/files";
import "@/styles/files.css";

/** Files on a sent message: image thumbnails that open full size, and PDF chips that download. */
export function AttachmentList({ attachments, role }: { attachments: AttachmentMeta[] | undefined; role: FileRole }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <ul className="attach-sent" aria-label="Attachments">
      {attachments.map((file) => {
        const url = attachmentUrl(file.id, role);
        return (
          <li key={file.id}>
            {isImage(file.contentType) ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="attach-sent-image">
                <img src={url} alt={file.filename} loading="lazy" />
                <span className="sr-only">Open {file.filename} full size in a new tab</span>
              </a>
            ) : (
              <a href={url} className="attach-sent-file" download={file.filename}>
                <IconFilePdf width={16} height={16} />
                <span className="truncate">{file.filename}</span>
                <span className="attach-meta tnum">{formatSize(file.size)}</span>
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
