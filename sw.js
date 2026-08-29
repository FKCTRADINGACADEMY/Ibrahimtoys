// ============================================================
// SERVICE WORKER — Ibrahim Toys & Cosmetics
// Caches the app shell (HTML/CSS/JS/icons/fonts/Firebase SDK)
// so the installed PWA can open even with no internet.
// Firestore's own offline persistence (see firebase-config.js)
// separately handles the actual product DATA offline/online sync.
// ============================================================

const CACHE_VERSION = "ibrahim-toys-v2";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./dashboard.html",
  "./manifest.json",
  "./css/style.css",
  "./js/firebase-config.js",
  "./js/auth.js",
  "./js/inventory.js",
  "./js/pos.js",
  "./icons/icon-72.png",
  "./icons/icon-96.png",
  "./icons/icon-128.png",
  "./icons/icon-144.png",
  "./icons/icon-152.png",
  "./icons/icon-192.png",
  "./icons/icon-384.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => console.warn("SW precache skip:", url, err))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle simple GET requests. Let everything else
  // (Firestore/Auth XHR & websocket traffic, POST, etc.) pass through untouched.
  if (req.method !== "GET") return;

  // Never intercept Firebase/Google API calls — Firestore/Auth manage
  // their own network + offline behaviour and must not be cached here.
  const url = new URL(req.url);
  if (
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("identitytoolkit.googleapis.com") ||
    url.hostname.includes("googleapis.com") && !url.hostname.includes("fonts.googleapis.com")
  ) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);

      // Stale-while-revalidate: serve cache instantly if present, refresh in background.
      return cached || networkFetch;
    })
  );
});
