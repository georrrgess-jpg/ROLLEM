/* ROLL'EM service worker: offline play after first visit */
const CACHE = 'rollem-v8';
const ASSETS = ['./', 'index.html', 'css/style.css', 'js/data-init.js', 'js/topics.js', 'js/data/food.js', 'js/data/nature.js', 'js/data/people.js', 'js/data/things.js', 'js/data/occasions.js', 'js/data/everyday.js', 'js/data/describe.js', 'js/data/places2.js', 'js/data/life.js', 'js/data/stuff.js', 'js/data/afterdark.js', 'js/data/pop2.js', 'js/data/foodnature2.js', 'js/data/mixed2.js', 'js/data/food3.js', 'js/data/world3.js', 'js/data/pop3.js', 'js/data/things3.js', 'js/data/life3.js',
  'js/engine.js', 'js/audio.js', 'js/fx.js', 'js/die3d.js', 'js/themes.js', 'js/app.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isFont = url.hostname.includes('fonts.g');
  if (url.origin !== location.origin && !isFont) return;
  // network-first for our files (fresh updates), cache fallback offline; cache-first for fonts
  e.respondWith(isFont
    ? caches.match(e.request).then(r => r || fetch(e.request).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return res; }))
    : fetch(e.request).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return res; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
