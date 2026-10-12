import { useId } from "react";
import { IconTranslate } from "@/components/icons";
import { languageName, usePreferences, useSetTutorLanguage } from "@/lib/preferences";

/** Picks the language EduBot replies in: English, Hinglish, or an Indian language in its own script. */
export function TutorLanguagePicker({ enabled }: { enabled: boolean }) {
  const selectId = useId();
  const prefs = usePreferences(enabled);
  const setLanguage = useSetTutorLanguage();
  if (!prefs.data?.languages?.length) return null;
  return (
    <span className="tutor-lang">
      <IconTranslate width={14} height={14} />
      <label htmlFor={selectId} className="sr-only">Reply language</label>
      <select
        id={selectId}
        className="tutor-lang-select"
        value={setLanguage.isPending ? setLanguage.variables : prefs.data.tutorLanguage}
        disabled={setLanguage.isPending}
        onChange={(event) => setLanguage.mutate(event.target.value)}
      >
        {prefs.data.languages.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}
      </select>
    </span>
  );
}

/** One line under the tutor's notice when replies won't be in English, so the switch never surprises anyone. */
export function TutorLanguageNote({ enabled }: { enabled: boolean }) {
  const prefs = usePreferences(enabled);
  const code = prefs.data?.tutorLanguage;
  if (!code || code === "en" || !prefs.data?.languages) return null;
  return <p className="tutor-lang-note">Replies in {languageName(prefs.data, code)}. Change it with the language menu above.</p>;
}
