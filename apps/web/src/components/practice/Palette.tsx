import { useEffect, useState, type KeyboardEvent } from "react";
import { Check, Flag, X } from "@phosphor-icons/react";
import { PALETTE_LABELS, type PaletteState } from "@/lib/practice";

export interface PaletteEntry {
  id: string;
  number: number;
  section: string;
  state: PaletteState;
}

function StateMark({ state }: { state: PaletteState }) {
  if (state === "answered") return <Check size={10} weight="bold" aria-hidden="true" />;
  if (state === "not_answered") return <X size={10} weight="bold" aria-hidden="true" />;
  if (state === "marked") return <Flag size={10} weight="fill" aria-hidden="true" />;
  if (state === "answered_marked") {
    return <><Check size={10} weight="bold" aria-hidden="true" /><Flag size={10} weight="fill" aria-hidden="true" /></>;
  }
  return null;
}

/**
 * Jump to any question. Arrow keys, Home and End move focus between cells; Enter or Space opens the question, so
 * browsing the palette never changes the question (or triggers a save). Each state has its own shape and mark.
 */
export function Palette({ entries, current, onSelect }: { entries: PaletteEntry[]; current: number; onSelect: (index: number) => void }) {
  const [focused, setFocused] = useState(current);
  useEffect(() => setFocused(current), [current]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let target: number | null = null;
    if (event.key in moves) target = (focused + moves[event.key] + entries.length) % entries.length;
    if (event.key === "Home") target = 0;
    if (event.key === "End") target = entries.length - 1;
    if (target === null) return;
    event.preventDefault();
    setFocused(target);
    (event.currentTarget.querySelector(`[data-index="${target}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <div className="pr-palette">
      <div className="pr-palette-grid" role="group" aria-label="Questions" onKeyDown={onKeyDown}>
        {entries.map((entry, index) => (
          <button key={entry.id} type="button" data-index={index} tabIndex={index === focused ? 0 : -1}
            className={`pr-cell is-${entry.state}${index === current ? " is-current" : ""}`}
            aria-current={index === current ? "step" : undefined}
            aria-label={`Question ${entry.number}${entry.section ? `, ${entry.section}` : ""}: ${PALETTE_LABELS[entry.state]}`}
            onClick={() => onSelect(index)}>
            <span className="tnum">{entry.number}</span>
            <span className="pr-cell-mark"><StateMark state={entry.state} /></span>
          </button>
        ))}
      </div>
      <ul className="pr-legend" aria-label="What the marks mean">
        {(Object.keys(PALETTE_LABELS) as PaletteState[]).map((state) => (
          <li key={state}>
            <span className={`pr-cell is-${state} is-legend`} aria-hidden="true"><span className="pr-cell-mark"><StateMark state={state} /></span></span>
            {PALETTE_LABELS[state]}
          </li>
        ))}
      </ul>
    </div>
  );
}
