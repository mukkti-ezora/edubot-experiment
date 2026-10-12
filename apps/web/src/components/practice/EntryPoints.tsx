import { useState } from "react";
import { Link } from "react-router-dom";
import { Cards, Lightning } from "@phosphor-icons/react";
import { useAiFlashcards, useAiPractice } from "@/lib/practice";
import { StartTestDrawer, aiErrorMessage } from "./parts";
import "@/styles/pages/practice.css";

/** On a topic page: EduBot writes five questions on the topic, then the start drawer opens on them. */
export function PracticeTopicButton({ topicId, title }: { topicId: string; title: string }) {
  const generate = useAiPractice();
  const [setId, setSetId] = useState<string | null>(null);
  return (
    <span className="pr-entry">
      <button type="button" className="btn btn-secondary btn-sm" disabled={generate.isPending}
        aria-label={`Practise ${title} with 5 new questions`}
        onClick={() => generate.mutate(topicId, { onSuccess: (set) => setSetId(set.id) })}>
        {generate.isPending ? <span className="btn-spinner" aria-hidden="true" /> : <Lightning size={14} weight="fill" aria-hidden="true" />}
        {generate.isPending ? "Writing questions…" : "Practise this topic"}
      </button>
      {generate.isError && <span className="pr-inline-error" role="alert">{aiErrorMessage(generate.error)}</span>}
      {setId && <StartTestDrawer testId={setId} onClose={() => setSetId(null)} />}
    </span>
  );
}

/** On a lesson: EduBot turns the lesson into flashcards in the student's review deck. */
export function MakeFlashcardsButton({ lessonId }: { lessonId: string }) {
  const make = useAiFlashcards();
  return (
    <span className="pr-entry">
      <button type="button" className="btn btn-ghost btn-sm" disabled={make.isPending} onClick={() => make.mutate(lessonId)}>
        {make.isPending ? <span className="btn-spinner" aria-hidden="true" /> : <Cards size={14} aria-hidden="true" />}
        {make.isPending ? "Making cards…" : "Make flashcards"}
      </button>
      {make.isError && <span className="pr-inline-error" role="alert">{aiErrorMessage(make.error)}</span>}
      {make.isSuccess && (
        <span className="pr-inline-ok" role="status">
          {make.data.cards.length} cards added. <Link to="/s/review">Review them</Link>
        </span>
      )}
    </span>
  );
}
