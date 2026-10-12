import { Atom, BookOpen, Code, Flask, Function as FunctionIcon, Leaf, type Icon } from "@phosphor-icons/react";

const SUBJECT_ICON: Record<string, Icon> = {
  physics: Atom,
  mathematics: FunctionIcon,
  computing: Code,
  chemistry: Flask,
  biology: Leaf,
};

/** Course identity: a subject glyph, never a colour alone. */
export function SubjectGlyph({ subject, size = 18 }: { subject: string; size?: number }) {
  const Glyph = SUBJECT_ICON[subject] ?? BookOpen;
  return (
    <span className={`subject-glyph subject-${subject}`} aria-hidden="true">
      <Glyph size={size} weight="duotone" />
    </span>
  );
}
