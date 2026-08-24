/* Service worker — offline shell + auto-update for clients */
// ⚠️ Har baar app.js / CSS change pe version BADLO (v14 → v15 → v16 ...)
const CACHE = "sm-shell-v15";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/config.js",
  "./js/db.js",
  "./js/firebase-sync.js",
  "./js/app.js",
  "./js/thermal-printer.js",
  "./manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const networkFirst =
    path.endsWith(".js") ||
    path.endsWith(".html") ||
    path.endsWith("/") ||
    path.endsWith("service-worker.js") ||
    path.endsWith("sw.js");

  if (networkFirst) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.ok && e.request.method === "GET") {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request)
        .then((res) => {
          if (res && res.ok && e.request.method === "GET") {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
