// ThreatFeed Service Worker for Offline First / Caching
const CACHE_NAME = 'threatfeed-v5'; // v5: drops the TV version-check copies v4 kept (index.html?v=…)
// A separate cache for hashed build assets, capped so old deploys can't grow without limit
const ASSETS_CACHE_NAME = 'threatfeed-assets-v1';
const ASSETS_CACHE_LIMIT = 60;
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './data/feeds.json'
];

// How long a page load waits for the network before falling back to the cached copy
const NAVIGATION_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Failed to precache static assets:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

function cacheCopy(request, response) {
  if (response && response.status === 200) {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
  }
  return response;
}

// Network first, cached copy only when the network fails (or, if timeoutMs is set, is too slow)
function networkFirst(request, timeoutMs) {
  const network = fetch(request).then((response) => cacheCopy(request, response));
  const fallback = () => caches.match(request).then((cached) => cached || network);
  if (!timeoutMs) return network.catch(fallback);
  const slow = new Promise((resolve) => setTimeout(resolve, timeoutMs)).then(() =>
    caches.match(request).then((cached) => cached || network)
  );
  return Promise.race([network, slow]).catch(fallback);
}

// Content shards (data/content/<YYYY-MM-DD>.json) are one file per publish day. The app keeps articles 30 days,
// so shards older than that are dropped from the cache, which would otherwise gain a file every day
const CONTENT_SHARD = /\/data\/content\/(\d{4}-\d{2}-\d{2})\.json$/;
const CONTENT_KEEP_DAYS = 31;

function pruneContentShards() {
  const cutoff = new Date(Date.now() - CONTENT_KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return caches.open(CACHE_NAME).then((cache) =>
    cache.keys().then((requests) =>
      Promise.all(requests.map((request) => {
        const match = CONTENT_SHARD.exec(new URL(request.url).pathname);
        return match && match[1] < cutoff ? cache.delete(request) : undefined;
      }))
    )
  );
}

// Cache first: only for files whose content can never change under the same URL
function cacheFirstAsset(request) {
  return caches.open(ASSETS_CACHE_NAME).then((cache) =>
    cache.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          cache.put(request, copy);
        }
        return response;
      });
    })
  );
}

/**
 * Prunes the assets cache to at most ASSETS_CACHE_LIMIT entries, keeping the most recent ones.
 * Vite hashes every asset, so an entry for an old deploy is never needed again.
 */
function pruneOldAssets() {
  return caches.open(ASSETS_CACHE_NAME).then((cache) =>
    cache.keys().then((requests) => {
      if (requests.length <= ASSETS_CACHE_LIMIT) return;
      const toDelete = requests
        .sort((a, b) => (a.url < b.url ? 1 : a.url > b.url ? -1 : 0))
        .slice(ASSETS_CACHE_LIMIT);
      return Promise.all(toDelete.map((r) => cache.delete(r)));
    })
  );
}

// Serve from cache immediately and refresh it in the background
function staleWhileRevalidate(request) {
  return caches.match(request).then((cached) => {
    const network = fetch(request).then((response) => cacheCopy(request, response));
    if (cached) {
      network.catch(() => {});
      return cached;
    }
    return network;
  });
}

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  // Page loads: network first so a new deploy shows up on the first visit, not the second.
  // Offline (or on a connection slower than NAVIGATION_TIMEOUT_MS), the cached page is used.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      networkFirst(event.request, NAVIGATION_TIMEOUT_MS)
        .then((response) => response || caches.match('./index.html'))
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Asked for fresh on purpose (the TV screens' version check, index.html?v=<time>): the network only, and never
  // cached, so each check doesn't leave another copy in Cache Storage
  if (event.request.cache === 'no-store' || (url.search && url.pathname.endsWith('/index.html'))) return;

  // Vite's build output has a content hash in every file name, so a cached copy is always correct.
  // Hashed assets live in their own cache so old deploys are pruned instead of accumulating forever.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      cacheFirstAsset(event.request).then((response) => {
        if (response) event.waitUntil(pruneOldAssets().catch(() => {}));
        return response;
      })
    );
    return;
  }

  // Feed list and snapshot change between deploys (the snapshot every 30 minutes)
  if (url.pathname.includes('/data/')) {
    event.respondWith(networkFirst(event.request));
    if (CONTENT_SHARD.test(url.pathname)) event.waitUntil(pruneContentShards().catch(() => {}));
    return;
  }

  // Icon, manifest and other static files
  event.respondWith(staleWhileRevalidate(event.request));
});
