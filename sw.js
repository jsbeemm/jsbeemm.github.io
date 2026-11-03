/* Keeps a copy of the app on the phone, so it opens straight away — with no internet, a slow one,
   or when the site's address is blocked (the data itself comes from Firestore's copy on the phone).
   - the app page: the saved copy opens at once (like Facebook); the newest version is fetched in the background
     and saved for next time. The open app finds it by itself and shows a dot on its 🔔 (Refresh is tapped there),
     so nothing reloads while someone is working.
   - the very first visit (nothing saved yet): the internet
   - libraries, fonts, pictures: the saved copy first, else the internet
   - the app's own "is there a newer version?" check (index.html?b=…) always goes to the internet and is never saved
   - database traffic (googleapis.com) is never touched */
const CACHE = "golden-bee-v7";
const CORE = [
  "./", "index.html", "manifest.json", "icon-192.png", "icon-512.png",
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js",
  "lib/html2canvas-1.4.1.min.js", "lib/zxing-0.21.3.min.js", "lib/xlsx-0.18.5.full.min.js"
];
const STATIC_HOSTS = ["www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com", "cdn.jsdelivr.net"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const appPage = () => new URL("index.html", self.registration.scope).href;

/* fetch the newest published page (skipping the browser's own cache) and keep it for the next opening */
async function refreshPage() {
  const c = await caches.open(CACHE);
  const res = await fetch(appPage(), { cache: "no-store", credentials: "same-origin" });
  if (res.ok) await c.put(appPage(), res.clone());
  return res;
}

async function appFirst(e) {
  const req = e.request, c = await caches.open(CACHE);
  // only the app page itself is kept as the offline copy (other pages, e.g. keytest.html, are just loaded)
  const appUrls = [self.registration.scope, appPage()];
  if (!appUrls.includes(req.url.split("?")[0].split("#")[0])) return fetch(req).catch(() => c.match(req).then(r => r || Response.error()));
  const saved = (await c.match(appPage())) || (await c.match(self.registration.scope));
  if (saved) {
    e.waitUntil(refreshPage().catch(() => {}));   // in the background; the open app notices the new version itself
    return saved;
  }
  try { return await refreshPage() } catch (x) { return Response.error() }
}
async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") c.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate" && url.origin === location.origin) { e.respondWith(appFirst(e)); return; }
  // the version check reads the live page: straight to the internet, and the answer also refreshes the saved copy
  if (url.origin === location.origin && url.pathname.endsWith("/index.html") && url.search) {
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(appPage(), copy))) } return res }));
    return;
  }
  if (url.origin === location.origin || STATIC_HOSTS.includes(url.hostname)) { e.respondWith(cacheFirst(req)); return; }
});
