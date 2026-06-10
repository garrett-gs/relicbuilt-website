// Service worker for the RELIC Axiom PWA.
//
// Scope:
//   • App shell: HTML/CSS/JS/fonts/icons → cache so the app opens even offline.
//   • API calls (/api/*) and Supabase requests → ALWAYS go to network. We
//     never serve stale invoice / estimate / project data — too dangerous
//     to risk showing the user a $0 invoice that's actually $5,000 because
//     the cache is out of date.
//   • Stripe checkout / proposal signing flows → always network.
//
// Caching strategy:
//   • Navigation requests (HTML pages): network-first, cache fallback. So
//     online users always see fresh pages, offline users get the last
//     version they viewed.
//   • Static assets (everything in /_next/static): cache-first. These have
//     content-hashed filenames so they never go stale.
//   • Other GETs (images, fonts, manifest): stale-while-revalidate.
//   • Anything else: passthrough.

const CACHE_VERSION = "v2";
const SHELL_CACHE = `relic-shell-${CACHE_VERSION}`;
const ASSETS_CACHE = `relic-assets-${CACHE_VERSION}`;
const PAGES_CACHE = `relic-pages-${CACHE_VERSION}`;

// Files we pre-cache on install so the offline experience is immediate
// on first launch after the worker activates.
const SHELL_FILES = [
  "/",
  "/manifest.json",
  "/logo-full.png",
  "/logo-emblem.png",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("relic-") && ![SHELL_CACHE, ASSETS_CACHE, PAGES_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isApi(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.hostname.endsWith(".supabase.co") ||
    url.hostname.endsWith(".supabase.in") ||
    url.hostname === "api.stripe.com" ||
    url.hostname === "checkout.stripe.com" ||
    url.hostname === "api.resend.com"
  );
}

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || /\.(?:woff2?|ttf|otf|eot)$/i.test(url.pathname);
}

function isImageOrAsset(url) {
  return /\.(?:png|jpe?g|gif|svg|webp|ico)$/i.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never cache writes

  const url = new URL(req.url);
  if (req.headers.get("upgrade") === "websocket") return;

  // 1) API / database / Stripe — always network, no caching. Better to
  // fail loudly than to show stale data.
  if (isApi(url)) return;

  // 2) Static hashed assets — cache-first, indefinite (filename is hashed).
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(req, ASSETS_CACHE));
    return;
  }

  // 3) Images, fonts, icons — stale-while-revalidate.
  if (isImageOrAsset(url)) {
    event.respondWith(staleWhileRevalidate(req, ASSETS_CACHE));
    return;
  }

  // 4) Navigation requests (HTML pages) — network-first, cache fallback.
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, PAGES_CACHE));
    return;
  }
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await network) || new Response("", { status: 504 });
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Last-resort offline fallback: serve the homepage from the shell
    // cache so the app still opens with something on screen.
    const home = await caches.match("/");
    if (home) return home;
    throw err;
  }
}
