/* =========================================================================
   sw.js — minimal, hosting-agnostic cache layer (no Workbox, no build step).
   Registered with a RELATIVE path (see index.html) so scope is correct under
   a GitHub Pages project subpath as well as a Vercel root deploy.

   - CDN libs (jsdelivr/unpkg): stale-while-revalidate. Some URLs are pinned
     to an exact version (safe to cache long-term); a couple use a moving
     tag (sweetalert2@11, lucide@latest) — SWR still serves instantly from
     cache while quietly refreshing in the background, so it never freezes
     on a stale major version forever.
   - Same-origin app files (index.html, assets/**): network-first, falling
     back to cache when offline/flaky, so redeploys are seen immediately
     when online.
   - The Apps Script backend (script.google.com) and any non-GET request
     are never touched by the cache — a stale attendance read would be
     actively wrong, not just slow.
   ========================================================================= */
const CDN_CACHE = "qr-cdn-v1";
const APP_CACHE = "qr-app-v1";
const CACHES = [CDN_CACHE, APP_CACHE];

self.addEventListener("install", (e) => { self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !CACHES.includes(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isCdn(url) {
  return url.hostname === "cdn.jsdelivr.net" || url.hostname === "unpkg.com";
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // never cache mutating calls
  const url = new URL(req.url);
  if (url.hostname.indexOf("script.google.com") !== -1) return; // never cache the live backend

  if (isCdn(url)) {
    e.respondWith(staleWhileRevalidate(req, CDN_CACHE));
  } else if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(req, APP_CACHE));
  }
});

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw e;
  }
}
