import { Fragment, type ReactNode } from "react";
import "@/styles/prose.css";

/**
 * Renders the small Markdown subset lessons and tutor replies use (## / ### headings, paragraphs,
 * - and 1. lists, fenced code, `code`, **bold**) as React elements. Never injects HTML, so model
 * output cannot become live markup.
 */
export function Prose({ text, className = "" }: { text: string; className?: string }) {
  return <div className={`prose ${className}`}>{blocks(text)}</div>;
}

function inline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={key}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={key}>{part.slice(2, -2)}</strong>;
    return <Fragment key={key}>{part}</Fragment>;
  });
}

function blocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${i}`;
    if (line.startsWith("```")) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i += 1;
      out.push(<pre key={key} tabIndex={0}><code>{code.join("\n")}</code></pre>);
      continue;
    }
    if (line.startsWith("### ")) {
      out.push(<h4 key={key}>{inline(line.slice(4), key)}</h4>);
      i += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      out.push(<h3 key={key}>{inline(line.slice(3), key)}</h3>);
      i += 1;
      continue;
    }
    const bullet = /^[-*] /;
    const numbered = /^\d+\. /;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const pattern = ordered ? numbered : bullet;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i])) items.push(lines[i++].replace(pattern, ""));
      const List = ordered ? "ol" : "ul";
      out.push(<List key={key}>{items.map((item, j) => <li key={j}>{inline(item, `${key}-${j}`)}</li>)}</List>);
      continue;
    }
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(```|## |### |[-*] |\d+\. )/.test(lines[i])) para.push(lines[i++]);
    out.push(<p key={key}>{inline(para.join(" "), key)}</p>);
  }
  return out;
}
