import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Cards, CheckCircle } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { intervalText, useRateCard, useReviewDue, type Rating, type ReviewCard } from "@/lib/practice";
import { Alert, EmptyState, ErrorState, SkeletonRows } from "@/components/ui";
import "@/styles/pages/student.css";
import "@/styles/pages/practice.css";

export const RATINGS: { rating: Rating; label: string; key: string; hint: string }[] = [
  { rating: "again", label: "Again", key: "1", hint: "Forgot it" },
  { rating: "hard", label: "Hard", key: "2", hint: "Got it, with effort" },
  { rating: "good", label: "Good", key: "3", hint: "Got it" },
  { rating: "easy", label: "Easy", key: "4", hint: "Knew it instantly" },
];

/** Shortcuts apply only when nothing else on the page has focus, or focus is inside the card itself. */
function shortcutsApply(target: EventTarget | null, deck: HTMLElement | null): boolean {
  if (target === document.body || target === document.documentElement || target === null) return true;
  return target instanceof Node && deck !== null && deck.contains(target);
}

/** Spaced review: recall the answer, reveal it, then say how well you knew it. */
export function ReviewDeck() {
  const { data, isLoading, isError, refetch } = useReviewDue();

  return (
    <div className="st-page pr-page">
      <nav className="st-crumbs" aria-label="Breadcrumb">
        <Link to="/s/practice"><ArrowLeft size={12} aria-hidden="true" /> Practice</Link>
      </nav>
      <header className="pr-head">
        <h1 className="st-title st-title-sm">Review deck</h1>
        <p className="st-muted">Try to recall each answer before you reveal it. Cards you find hard come back sooner.</p>
      </header>
      {isError ? (
        <ErrorState title="Your cards couldn't load" onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <SkeletonRows rows={4} />
      ) : data.cards.length === 0 ? (
        <EmptyState icon={<Cards size={20} aria-hidden="true" />} title="Nothing due right now"
          body="You're up to date. Make flashcards from any lesson, and cards come back here when it's time to review them."
          action={<Link to="/s/learn" className="btn btn-secondary btn-sm">Go to Learn</Link>} />
      ) : (
        <Session key={data.cards.map((c) => c.id).join(",")} cards={data.cards} />
      )}
    </div>
  );
}

export function Session({ cards }: { cards: ReviewCard[] }) {
  const client = useQueryClient();
  const rate = useRateCard();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const deckRef = useRef<HTMLElement>(null);
  const card = cards[index];
  const done = index >= cards.length;

  const choose = (rating: Rating) => {
    if (!card || rate.isPending) return;
    rate.mutate({ cardId: card.id, rating }, {
      onSuccess: (result) => {
        setLast(`${card.front.length > 40 ? "That card" : `"${card.front}"`} comes back ${intervalText(result.intervalDays)}.`);
        setRevealed(false);
        setIndex((i) => i + 1);
      },
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (done || !shortcutsApply(event.target, deckRef.current) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (!revealed && (event.key === " " || event.key === "Enter")) {
        event.preventDefault();
        setRevealed(true);
        return;
      }
      const match = revealed ? RATINGS.find((r) => r.key === event.key) : undefined;
      if (match) {
        event.preventDefault();
        choose(match.rating);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (done) {
    return (
      <section className="pr-card-done" aria-live="polite">
        <CheckCircle size={28} weight="fill" aria-hidden="true" />
        <h2>Session done</h2>
        <p className="tnum">You reviewed {cards.length} {cards.length === 1 ? "card" : "cards"}. {last}</p>
        <div className="pr-result-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void client.invalidateQueries({ queryKey: ["practice", "review"] })}>
            Check for more cards
          </button>
          <Link to="/s/practice" className="btn btn-primary btn-sm">Back to Practice</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="pr-deck" aria-label="Flashcard" ref={deckRef}>
      <div className="pr-deck-progress">
        <span className="tnum">Card {index + 1} of {cards.length}</span>
        <span>{card.courseCode}{card.topic ? ` · ${card.topic.title}` : ""}{card.isNew ? " · New" : ""}</span>
      </div>
      <div className="pr-card" data-revealed={revealed || undefined}>
        <p className="pr-card-side-label">Question</p>
        <p className="pr-card-front">{card.front}</p>
        {revealed ? (
          <div className="pr-card-back">
            <p className="pr-card-side-label">Answer</p>
            <p>{card.back}</p>
          </div>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => setRevealed(true)} autoFocus>
            Show answer <kbd>Space</kbd>
          </button>
        )}
      </div>
      {revealed && (
        <div className="pr-ratings" role="group" aria-label="How well did you know it?">
          {RATINGS.map((r) => (
            <button key={r.rating} type="button" className={`pr-rating is-${r.rating}`} onClick={() => choose(r.rating)} disabled={rate.isPending}>
              <span className="pr-rating-label">{r.label} <kbd>{r.key}</kbd></span>
              <span className="pr-rating-hint">{r.hint}</span>
            </button>
          ))}
        </div>
      )}
      {rate.isError && <Alert tone="danger">That rating didn't save. Check your connection and try again.</Alert>}
      <p className="sr-only" aria-live="polite">{last}</p>
    </section>
  );
}
