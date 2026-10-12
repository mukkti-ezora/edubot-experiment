/** Student preferences. For now: the language the EduBot tutor replies in. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export interface Preferences {
  tutorLanguage: string;
  languages: { code: string; name: string }[];
}

const key = ["student", "preferences"] as const;

export const usePreferences = (enabled = true) =>
  useQuery({ queryKey: key, queryFn: () => api<Preferences>("/api/v1/student/preferences"), enabled });

export function useSetTutorLanguage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tutorLanguage: string) =>
      api<Preferences>("/api/v1/student/preferences", { method: "PUT", body: JSON.stringify({ tutorLanguage }) }),
    onSuccess: (prefs) => queryClient.setQueryData(key, prefs),
  });
}

export function languageName(prefs: Preferences | undefined, code: string): string {
  return prefs?.languages.find((l) => l.code === code)?.name ?? code;
}
