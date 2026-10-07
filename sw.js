// Beer Runner — service worker v5 : purge les vieux caches + network-first pour le code
// Pourquoi : le v4 était cache-first avec un nom de cache jamais bumpé → après un upload,
// le téléphone servait l'ANCIEN app.js (parfois cassé) mélangé aux nouveaux fichiers → crash.
const CACHE = "beer-runner-v9";
const ASSETS = [
  "./", "./index.html",
  "./bieres-1.js", "./bieres-2.js", "./bieres-3.js", "./bieres-4.js", "./bieres-5.js",
  "./app-1.js", "./app-2.js", "./app-3.js", "./app-4.js", "./app-5.js",
  "./manifest.webmanifest", "./icon.svg",
  "https://cdn.tailwindcss.com",
  "https://unpkg.com/react@18.3.1/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone@7.26.4/babel.min.js",
];
// code applicatif : TOUJOURS la version du serveur en priorité (fini les mélanges)
const CODE_FIRST = [
  "./app-1.js", "./app-2.js", "./app-3.js", "./app-4.js", "./app-5.js",
  "./bieres-1.js", "./bieres-2.js", "./bieres-3.js", "./bieres-4.js", "./bieres-5.js",
  "./index.html", "./",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  // purge TOUT sauf v5 → les vieux caches cassés disparaissent chez tous les utilisateurs
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const estCode = CODE_FIRST.some((p) => url.pathname.endsWith(p.replace("./", "/")) || url.pathname === p.replace("./", "/") || url.pathname.endsWith(p.slice(2)));
  if (estCode) {
    // network-first pour le code : on sert le serveur, le cache ne sert qu'hors ligne
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // reste (CDN React, tailwind…) : cache-first comme avant
  e.respondWith(caches.match(e.request).then((cached) => {
    const fetched = fetch(e.request).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => cached);
    return cached || fetched;
  }));
});
