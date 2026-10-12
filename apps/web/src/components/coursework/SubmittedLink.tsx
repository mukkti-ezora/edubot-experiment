import { LinkSimple } from "@phosphor-icons/react";
import { isValidLink } from "@/lib/coursework";

/** Only a validated http(s) link becomes clickable; anything else (for example javascript:) is shown as text. */
export function SubmittedLink({ link }: { link: string | null }) {
  if (!link) return null;
  if (!isValidLink(link)) return <p className="cw-work-link">{link}</p>;
  return (
    <a className="cw-work-link" href={link} target="_blank" rel="noopener noreferrer">
      <LinkSimple size={16} aria-hidden="true" /> {link}
    </a>
  );
}
