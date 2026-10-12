/**
 * Offline lessons. A student saves a lesson; its JSON goes into Cache Storage under the same URL the app
 * fetches, and the service worker (public/sw.js) answers from that cache when the network is gone.
 * Nothing else from the API is ever cached. Videos stream from YouTube and are never saved.
 *
 * Saved lessons belong to one person: the cache is named after them, and the app deletes every other person's
 * cache as soon as it knows who is signed in, on a 401, and on sign-out. So a shared device never shows one
 * student's saved lessons to another. To open offline from a cold start, the signed-in identity is kept next to
 * the lessons (and only while there are saved lessons); it unlocks the saved-lesson pages and nothing else.
 */
import { useEffect, useState } from "react";
import type { LessonDetail } from "./student";
import type { MeResponse } from "./types";

export const SAVED_LESSONS_PREFIX = "edubot-saved-lessons-v2:";
const IDENTITY_CACHE = "edubot-offline-identity-v1";
const IDENTITY_KEY = "/__offline/me";
const LEGACY_CACHES = ["edubot-saved-lessons-v1"];

export interface SavedLesson {
  id: string;
  title: string;
  courseCode: string;
  courseTitle: string;
  minutes: number;
}

/** Who the saved lessons on this device belong to. Set by the auth layer once the session is known. */
let owner: MeResponse | null = null;

export function lessonUrl(id: string): string {
  return `/api/v1/student/lessons/${id}`;
}

export function offlineSupported(): boolean {
  return typeof window !== "undefined" && "caches" in window;
}

const cacheFor = (personId: string) => `${SAVED_LESSONS_PREFIX}${personId}`;

async function ownerCache(): Promise<Cache | null> {
  if (!offlineSupported() || !owner) return null;
  return caches.open(cacheFor(owner.admin.id));
}

async function rememberIdentity(me: MeResponse): Promise<void> {
  const cache = await caches.open(IDENTITY_CACHE);
  await cache.put(IDENTITY_KEY, new Response(JSON.stringify(me), { headers: { "Content-Type": "application/json" } }));
}

/**
 * Record who is signed in. Every other person's saved lessons are deleted, and if this person has saved
 * lessons their identity is refreshed so the app can open offline next time.
 */
export async function setOfflineOwner(me: MeResponse): Promise<void> {
  owner = me;
  if (!offlineSupported()) return;
  const mine = cacheFor(me.admin.id);
  for (const name of await caches.keys()) {
    const someoneElses = name.startsWith(SAVED_LESSONS_PREFIX) && name !== mine;
    if (someoneElses || LEGACY_CACHES.includes(name)) await caches.delete(name);
  }
  const cache = await caches.open(mine);
  if ((await cache.keys()).length > 0) await rememberIdentity(me);
  else await caches.delete(IDENTITY_CACHE);
}

/** The identity saved with the lessons, used only to open the saved-lesson pages without a connection. */
export async function offlineIdentity(): Promise<MeResponse | null> {
  if (!offlineSupported()) return null;
  const response = await (await caches.open(IDENTITY_CACHE)).match(IDENTITY_KEY);
  if (!response) return null;
  try {
    const me = (await response.json()) as MeResponse;
    const hasLessons = (await (await caches.open(cacheFor(me.admin.id))).keys()).length > 0;
    if (!hasLessons) return null;
    owner = me;
    return me;
  } catch {
    return null;
  }
}

export async function saveLessonOffline(lesson: LessonDetail): Promise<void> {
  const cache = await ownerCache();
  if (!cache || !owner) throw new Error("Sign in to save lessons for offline reading.");
  await cache.put(lessonUrl(lesson.id), new Response(JSON.stringify(lesson), {
    headers: { "Content-Type": "application/json" },
  }));
  await rememberIdentity(owner);
}

export async function removeLessonOffline(id: string): Promise<void> {
  const cache = await ownerCache();
  if (!cache) return;
  await cache.delete(lessonUrl(id));
  if ((await cache.keys()).length === 0) await caches.delete(IDENTITY_CACHE);
}

export async function isLessonSaved(id: string): Promise<boolean> {
  const cache = await ownerCache();
  return cache ? (await cache.match(lessonUrl(id))) !== undefined : false;
}

/** A saved entry, or null when it can't be read (a damaged entry is skipped, never fatal to the list). */
async function readSaved(cache: Cache, request: Request): Promise<SavedLesson | null> {
  try {
    const response = await cache.match(request);
    if (!response) return null;
    const data = (await response.json()) as LessonDetail;
    return { id: data.id, title: data.title, courseCode: data.course.code, courseTitle: data.course.title,
      minutes: data.minutes };
  } catch {
    return null;
  }
}

export async function listSavedLessons(): Promise<SavedLesson[]> {
  const cache = await ownerCache();
  if (!cache) return [];
  const lessons = (await Promise.all((await cache.keys()).map((request) => readSaved(cache, request))))
    .filter((lesson): lesson is SavedLesson => lesson !== null);
  return lessons.sort((a, b) => a.courseCode.localeCompare(b.courseCode) || a.title.localeCompare(b.title));
}

/** Saved lessons belong to whoever saved them, so they go when that person signs out or their session ends. */
export async function clearSavedLessons(): Promise<void> {
  owner = null;
  if (!offlineSupported()) return;
  for (const name of await caches.keys()) {
    if (name.startsWith(SAVED_LESSONS_PREFIX) || name === IDENTITY_CACHE || LEGACY_CACHES.includes(name)) {
      await caches.delete(name);
    }
  }
}

export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  // In development the worker only serves saved lessons, so Vite's hot reload is never shadowed by a cache.
  const mode = import.meta.env.DEV ? "dev" : "prod";
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`/sw.js?mode=${mode}`).catch(() => {
      /* Offline reading is an enhancement; the app works without it. */
    });
  });
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/** Paths a student may open with only an offline identity: the saved-lesson list and the lessons in it. */
export function isOfflineReadablePath(pathname: string): boolean {
  return pathname === "/s/offline" || /^\/s\/lessons\/[^/]+$/.test(pathname);
}
