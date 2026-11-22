/*
 * Vexta's service worker: just enough to survive a dropped connection, and deliberately no more.
 *
 * The one rule that matters here: an API response belongs to one tenant and one signed-in user.
 * A service worker cache is shared by every session on the device, so anything stored from /api/
 * could be replayed to the next person who opens the app on that machine. Nothing under /api/ is
 * ever cached, and neither is anything that is not a plain same-origin GET.
 */

const CACHE = "vexta-v1";

/* The offline page and the icons it needs, so the fallback is already on disk the first time the
   network goes away rather than being fetched at the worst possible moment. */
const PRECACHE = ["/hors-ligne", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Individually rather than addAll: addAll rejects as a whole if a single entry 404s, which
      // would leave the worker uninstalled and the app with no fallback at all.
      .then((cache) =>
        Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))),
      )
      // The new worker takes over immediately: a stale one holding a previous build's chunk names
      // is worse than a brief double-activation.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // A navigation is the only thing worth a fallback: the person asked for a page, and an error
  // screen from the browser tells them nothing about what to do next.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match("/hors-ligne")) ?? Response.error();
      }),
    );
    return;
  }

  // Build assets carry a content hash in their URL, so a hit is always the right file and can be
  // served without asking the network first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;

        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
});
