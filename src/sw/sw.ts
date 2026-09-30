/// <reference lib="webworker" />
// Hand-written service worker: precaches the build for offline use and receives GPX
// files shared from other apps (Web Share Target). Map tiles are not cached.
import { SHARE_CACHE, SHARED_FILE_KEY, SHARE_TARGET_PATH } from './shareConfig.ts';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: { url: string; revision: string | null }[];
};

const MANIFEST = self.__WB_MANIFEST;
const scope = self.registration.scope;
const abs = (path: string): string => new URL(path, scope).href;

// One cache per build; the name changes whenever any precached file changes.
const version = MANIFEST.map((e) => `${e.url}@${e.revision ?? ''}`).join('|');
let hash = 0;
for (let i = 0; i < version.length; i++) hash = (Math.imul(31, hash) + version.charCodeAt(i)) | 0;
const PRECACHE = `gpx-rebuilder-precache-${(hash >>> 0).toString(36)}`;

// Precache URLs (deduped: the plugin lists manifest icons twice), cache-busted by
// revision where the file name has no hash.
const entries = [...new Map(MANIFEST.map((e) => [abs(e.url), e.revision])).entries()].map(
  ([key, revision]) => ({ key, fetchUrl: revision ? `${key}?__rev=${revision}` : key }),
);
const INDEX = abs('index.html');

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      await Promise.all(
        entries.map(async ({ key, fetchUrl }) => {
          const res = await fetch(fetchUrl, { cache: 'reload' });
          if (!res.ok) throw new Error(`Precache failed for ${key}: ${res.status}`);
          await cache.put(key, res);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('gpx-rebuilder-precache-') && name !== PRECACHE)
          await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

async function receiveShare(request: Request): Promise<Response> {
  const app = new URL('./', scope);
  try {
    const form = await request.formData();
    const file = [...form.values()].find((v): v is File => v instanceof File);
    if (file) {
      // Held only until the page picks it up, then deleted.
      const cache = await caches.open(SHARE_CACHE);
      await cache.put(
        abs(SHARED_FILE_KEY),
        new Response(file, { headers: { 'X-File-Name': encodeURIComponent(file.name) } }),
      );
      app.searchParams.set('shared', '1');
    } else {
      app.searchParams.set('shared', 'none');
    }
  } catch {
    app.searchParams.set('shared', 'error');
  }
  return Response.redirect(app.href, 303);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(scope)) return;

  if (request.method === 'POST' && url.href === abs(SHARE_TARGET_PATH)) {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET') return;

  // App shell for navigations (works offline); precached assets cache-first.
  const key = request.mode === 'navigate' ? INDEX : url.origin + url.pathname;
  event.respondWith(
    (async () => {
      const cached = await caches.match(key, { cacheName: PRECACHE });
      return cached ?? fetch(request);
    })(),
  );
});
