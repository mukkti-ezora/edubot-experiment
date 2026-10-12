/*
 * EduBot service worker. Two jobs, nothing more:
 *  1. Saved lessons: when the network is gone (or the server fails), answer a lesson request from the lessons the
 *     signed-in student chose to save. When the network answers, a saved copy is refreshed so it never goes
 *     stale. The page owns those caches (one per person, see src/lib/offline.ts); no other API response is cached.
 *  2. App shell (production only): keep the built JS, CSS and fonts, and the last page shell, so the app opens
 *     offline. In development (?mode=dev) this is off, so Vite's modules are never served stale.
 */
const SAVED_LESSONS_PREFIX = "edubot-saved-lessons-v2:";
const IDENTITY_CACHE = "edubot-offline-identity-v1";
const SHELL = "edubot-shell-v2";
const SHELL_PAGE = "/__shell";
const SHELL_MAX_ENTRIES = 80; // old hashed builds fall out as new ones arrive
const LESSON_API = /^\/api\/v1\/student\/lessons\/[0-9a-f-]{36}$/;
const SHELL_ASSETS = new Set(["script", "style", "font"]);
const SERVER_ERROR = 500;
const shellEnabled = new URL(self.location.href).searchParams.get("mode") !== "dev";

const isCurrentCache = (name) => name === SHELL || name === IDENTITY_CACHE || name.startsWith(SAVED_LESSONS_PREFIX);

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (!isCurrentCache(name)) await caches.delete(name);
    }
    if (!shellEnabled) await caches.delete(SHELL);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    if (LESSON_API.test(url.pathname)) event.respondWith(lessonNetworkFirst(event));
    return;
  }
  if (!shellEnabled) return;
  if (request.mode === "navigate") {
    event.respondWith(pageNetworkFirst(event));
  } else if (SHELL_ASSETS.has(request.destination)) {
    event.respondWith(staleWhileRevalidate(event));
  }
});

/** The saved-lesson caches on this device. The page keeps at most one: the signed-in student's. */
async function savedLessonCaches() {
  const names = (await caches.keys()).filter((name) => name.startsWith(SAVED_LESSONS_PREFIX));
  return Promise.all(names.map((name) => caches.open(name)));
}

async function savedCopy(url) {
  for (const cache of await savedLessonCaches()) {
    const match = await cache.match(url);
    if (match) return match;
  }
  return undefined;
}

async function refreshSavedCopies(url, response) {
  for (const cache of await savedLessonCaches()) {
    if (await cache.match(url)) await cache.put(url, response.clone());
  }
}

async function lessonNetworkFirst(event) {
  const { request } = event;
  try {
    const response = await fetch(request);
    if (response.ok) {
      event.waitUntil(refreshSavedCopies(request.url, response.clone()));
      return response;
    }
    if (response.status >= SERVER_ERROR) return (await savedCopy(request.url)) ?? response;
    return response;
  } catch (error) {
    const saved = await savedCopy(request.url);
    if (saved) return saved;
    throw error;
  }
}

async function pageNetworkFirst(event) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(event.request);
    if (response.ok) event.waitUntil(cache.put(SHELL_PAGE, response.clone()));
    if (response.status >= SERVER_ERROR) return (await cache.match(SHELL_PAGE)) ?? response;
    return response;
  } catch (error) {
    const shell = await cache.match(SHELL_PAGE);
    if (shell) return shell;
    throw error;
  }
}

async function trimShell(cache) {
  const keys = await cache.keys();
  for (const request of keys.slice(0, Math.max(keys.length - SHELL_MAX_ENTRIES, 0))) await cache.delete(request);
}

async function staleWhileRevalidate(event) {
  const { request } = event;
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request);
  const refresh = fetch(request).then(async (response) => {
    if (response.ok) {
      await cache.put(request, response.clone());
      await trimShell(cache);
    }
    return response;
  });
  event.waitUntil(refresh.catch(() => undefined));
  return cached ?? refresh;
}
