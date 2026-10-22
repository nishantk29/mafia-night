// Mafia Night service worker.
// - Static files (styles, JS modules, fonts, icons, portraits): cache-first from a versioned cache.
// - Page loads: network-first, falling back to the cached app shell, so "#/local" works offline after one visit.
// - /api/* and /ws/* never touch the cache: rooms are live and must come from the network.
// Bump VERSION on every deploy that changes a file below, or installed phones keep the old copy.
const VERSION = 'mafia-1792581055234';

const SHELL = '/';
const PRECACHE = [
  SHELL,
  '/styles.css',
  '/manifest.webmanifest',
  ...['app', 'art', 'art_manifest', 'board', 'engine', 'faq', 'host', 'icon_data', 'player', 'print', 'role_guide', 'role_icons',
    'roles', 'roles_extra', 'roles_extra2', 'room', 'state', 'theme', 'tools', 'ui_icons'].map((m) => `/js/${m}.js`),
  ...['big-shoulders-display-var', 'alegreya-sans-400', 'alegreya-sans-500', 'alegreya-sans-700',
    'alegreya-sans-800', 'alegreya-italic-var'].map((f) => `/fonts/${f}.woff2`),
  '/icons/favicon.svg', '/icons/favicon-32.png', '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/icon-maskable-512.png', '/icons/apple-touch-icon.png',
];

const isLive = (url) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/');
// A redirected response cannot answer a navigation, so only plain 200s are stored.
const storable = (res) => res && res.ok && res.status === 200 && !res.redirected && res.type === 'basic';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // One file at a time, so a single missing file never blocks the install.
    await Promise.allSettled(PRECACHE.map(async (path) => {
      const res = await fetch(path, { cache: 'reload' });
      if (storable(res)) await cache.put(path, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('mafia-') && k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || isLive(url)) return; // network only

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (url.pathname === SHELL && storable(res)) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(SHELL, copy));
        }
        return res;
      } catch {
        return (await caches.match(SHELL)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (storable(res)) {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
    }
    return res;
  })());
});
