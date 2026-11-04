// OpenOS service worker (I4): cache ONLY the public app shell. API
// responses, auth, uploads, app data and other users' content are never
// cached — private files must not outlive the session that created them.
const SHELL = ["/", "/workspace", "/studio/pdf", "/studio/image", "/studio/ocr", "/studio/audio", "/manifest.webmanifest"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open("openos-shell-v1").then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== "openos-shell-v1").map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data")) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then((hit) => hit || caches.match("/"))));
});
