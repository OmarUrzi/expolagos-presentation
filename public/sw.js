const SHELL_CACHE = "lcc-shell-v3-8";
const MEDIA_CACHE = "lcc-media-v3";

const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/thumbnail-mode.js",
  "/packery-layout.js",
  "/video-audio.js",
  "/vendor/packery.js",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
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

function parseByteRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || "");
  if (!match) return null;

  const [, startText, endText] = match;
  let start;
  let end;

  if (!startText && endText) {
    const suffixLength = Number(endText);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;

    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : size - 1;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return null;
  }

  end = Math.min(end, size - 1);

  return {
    start,
    end,
    length: end - start + 1,
  };
}

async function cachedRangeResponse(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const fullRequest = new Request(request.url, { method: "GET" });
  const cached = await cache.match(fullRequest);
  if (!cached) return null;

  const blob = await cached.blob();
  const size = blob.size;
  const range = parseByteRange(request.headers.get("Range"), size);

  if (!range) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${size}`,
        "Accept-Ranges": "bytes",
      },
    });
  }

  const contentType = cached.headers.get("Content-Type") || blob.type || "application/octet-stream";
  const chunk = blob.slice(range.start, range.end + 1, contentType);

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  headers.set("Content-Length", String(range.length));
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  const etag = cached.headers.get("ETag");
  if (etag) headers.set("ETag", etag);

  return new Response(chunk, {
    status: 206,
    statusText: "Partial Content",
    headers,
  });
}

async function handleMediaRequest(request) {
  if (!request.headers.has("Range")) {
    return cacheFirst(request, MEDIA_CACHE);
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && (networkResponse.ok || networkResponse.status === 206)) {
      return networkResponse;
    }
  } catch (error) {
    // Network unavailable: fall through to the fully cached offline object.
  }

  const cachedRange = await cachedRangeResponse(request);
  if (cachedRange) return cachedRange;

  return new Response("Offline media unavailable", { status: 503 });
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
    event.respondWith(handleMediaRequest(request));
    return;
  }

  if (url.pathname === "/thumb") {
    event.respondWith(cacheFirst(request, MEDIA_CACHE));
    return;
  }

  if (
    request.mode === "navigate" ||
    SHELL_ASSETS.includes(url.pathname)
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
  let mediaUrls = uiKeys.map((key) => `/img?key=${encodeURIComponent(key)}`);

  for (const prefix of prefixes) {
    const apiUrl = `/api/list?prefix=${encodeURIComponent(prefix)}`;

    try {
      const apiRequest = new Request(new URL(apiUrl, self.location.origin).href);
      const response = await fetch(apiRequest, { cache: "no-store" });
      if (!response.ok) continue;

      await cache.put(apiRequest, response.clone());
      const data = await response.json();
      const media = data.media || data.images || [];

      for (const item of media) {
        if (item.url) mediaUrls.push(item.url);
        if (item.thumbUrl) mediaUrls.push(item.thumbUrl);
      }
    } catch (error) {}
  }

  mediaUrls = [...new Set(mediaUrls)];

  let done = 0;
  let failed = 0;

  for (const mediaUrl of mediaUrls) {
    try {
      const request = new Request(new URL(mediaUrl, self.location.origin).href, {
        method: "GET",
      });
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
    client?.postMessage({ type: "OFFLINE_PROGRESS", done, total: mediaUrls.length, failed });
  }

  client?.postMessage({ type: "OFFLINE_DONE", done, total: mediaUrls.length, failed });
}
