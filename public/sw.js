const SHELL_CACHE = "lcc-shell-v3-2";
const MEDIA_CACHE = "lcc-media-v3";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(["/", "/index.html", "/styles.css", "/app.js", "/manifest.webmanifest"]),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key.startsWith("lcc-") && key !== SHELL_CACHE && key !== MEDIA_CACHE) {
              return caches.delete(key);
            }
          }),
        ),
      ),
    ]),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;

    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }

    return new Response("Offline", { status: 503 });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/api/list") {
    event.respondWith(networkFirst(request, MEDIA_CACHE));
    return;
  }

  if (url.pathname === "/img") {
    event.respondWith(cacheFirst(request, MEDIA_CACHE));
    return;
  }

  if (
    request.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname === "/index.html" ||
    url.pathname === "/styles.css" ||
    url.pathname === "/app.js" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(networkFirst(request, SHELL_CACHE, "/"));
    return;
  }

  event.respondWith(cacheFirst(request, SHELL_CACHE));
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "PREPARE_OFFLINE") return;

  event.waitUntil(prepareOffline(data.prefixes || [], data.uiKeys || [], event.source));
});

async function prepareOffline(prefixes, uiKeys, client) {
  const cache = await caches.open(MEDIA_CACHE);
  let imageUrls = uiKeys.map((key) => `/img?key=${encodeURIComponent(key)}`);

  for (const prefix of prefixes) {
    const apiUrl = `/api/list?prefix=${encodeURIComponent(prefix)}`;

    try {
      const apiRequest = new Request(new URL(apiUrl, self.location.origin).href);
      const response = await fetch(apiRequest, { cache: "no-store" });
      if (!response.ok) continue;

      await cache.put(apiRequest, response.clone());
      const data = await response.json();
      imageUrls = imageUrls.concat((data.images || []).map((image) => image.url));
    } catch (error) {}
  }

  imageUrls = [...new Set(imageUrls)];

  let done = 0;
  let failed = 0;

  for (const imageUrl of imageUrls) {
    try {
      const request = new Request(new URL(imageUrl, self.location.origin).href);
      const existing = await cache.match(request);

      if (!existing) {
        const response = await fetch(request);
        if (!response.ok) throw new Error("Download failed");
        await cache.put(request, response.clone());
      }
    } catch (error) {
      failed += 1;
    }

    done += 1;
    client?.postMessage({ type: "OFFLINE_PROGRESS", done, total: imageUrls.length, failed });
  }

  client?.postMessage({ type: "OFFLINE_DONE", done, total: imageUrls.length, failed });
}
