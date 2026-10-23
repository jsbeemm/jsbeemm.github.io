/* Keeps a copy of the app on the phone, so it still opens when the site's address
   is blocked by the network (the data itself comes from Firestore, which stays reachable).
   - the app page: try the internet first (to get the newest version), else the saved copy
   - libraries, fonts, pictures: the saved copy first, else the internet
   - database traffic (googleapis.com) is never touched */
const CACHE = "golden-bee-v3";
const CORE = [
  "./", "index.html", "manifest.json", "icon-192.png", "icon-512.png",
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js",
  "lib/html2canvas-1.4.1.min.js", "lib/zxing-0.21.3.min.js"
];
const STATIC_HOSTS = ["www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com", "cdn.jsdelivr.net"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));

async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(req), timeout(6000)]);
    if (res.ok) c.put(new URL("index.html", self.registration.scope).href, res.clone());
    return res;
  } catch (e) {
    return (await c.match(new URL("index.html", self.registration.scope).href)) || (await c.match(self.registration.scope)) || Response.error();
  }
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
  if (req.mode === "navigate" && url.origin === location.origin) { e.respondWith(networkFirst(req)); return; }
  if (url.origin === location.origin || STATIC_HOSTS.includes(url.hostname)) { e.respondWith(cacheFirst(req)); return; }
});
