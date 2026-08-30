// ============================================================
// SERVICE WORKER — auto-updating app shell.
//
// HTML / CSS / JS are served NETWORK-FIRST: har baar jab user
// online ho aur app kholay, browser latest file seedha server se
// leta hai (cache sirf offline fallback ke liye hai). Iska matlab
// naya dashboard.html / js / css upload karne ke baad, agli baar
// app kholte hi automatically naya version mil jayega —
// "clear cache" karne ki zaroorat nahi.
//
// Sirf images/icons/fonts CACHE-FIRST hain (yeh kam badalte hain,
// isliye fast + offline-friendly rakhe gaye hain).
//
// CACHE_NAME ko sirf tab badlein jab aap chahte hain purana
// offline-cache poori tarah wipe ho jaye (e.g. bahut saari purani
// files delete ki hon) — warna isay chhed'ne ki zaroorat nahi,
// updates apne aap chalte rahenge.
// ============================================================

const CACHE_NAME = "sm-shop-cache-v1";

// Sirf truly-static files pre-cache hoti hain.
const PRECACHE_URLS = [
  "manifest.json",
  "favicon.ico",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

const STATIC_EXT = /\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf)$/i;

self.addEventListener("install", (event) => {
  self.skipWaiting(); // naya SW turant activate ho, purane tabs band hone ka intezar nahi
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Kisi bhi purane cache-name ko khud-ba-khud delete kar do.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim(); // khule hue tabs ko turant control mein le lo
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase/CDN requests ko normal jaane do

  // Static assets: cache-first (fast, kam badalti hain)
  if (STATIC_EXT.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  // App shell (HTML/CSS/JS): NETWORK-FIRST — hamesha latest file
  // fetch karne ki koshish; sirf offline hone par cache se fallback.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match("index.html"))
      )
  );
});

// Page se manually bhi naya SW turant activate karwaya ja sakta hai.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
