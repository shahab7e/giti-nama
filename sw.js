/* گیتی‌نما service worker: makes the site work offline after the first visit.
   Every request goes to the network first, so a new version is always used as soon as it is online;
   the cached copy is only a fallback when there is no connection. Bump CACHE to drop old copies. */
const CACHE = 'giti-nama-v1';
const FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'css/style.css', 'fonts/fonts.css',
  'fonts/vazirmatn-arabic.woff2', 'fonts/vazirmatn-latin.woff2', 'fonts/vazirmatn-latin-ext.woff2',
  'fonts/gulzar-arabic.woff2', 'fonts/gulzar-latin.woff2', 'fonts/gulzar-latin-ext.woff2',
  'js/core.js', 'js/render.js', 'js/map.js', 'js/app.js',
  'data/regions.js', 'data/world-map.js', 'data/hist-borders.js', 'data/iran.js', 'data/iran-rulers.js', 'data/iran-events.js',
  'data/near-east.js', 'data/asia.js', 'data/europe.js', 'data/africa-americas.js', 'data/extent.js', 'data/world-rulers.js',
  'data/world-events.js', 'data/people.js', 'data/geo-places.js', 'data/dominion.js', 'data/map-info.js', 'data/stories.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];

self.addEventListener('install', (ev) => {
  // one missing file must not stop the rest from being saved
  ev.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => { })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  ev.respondWith(
    fetch(req).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })
      .then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
