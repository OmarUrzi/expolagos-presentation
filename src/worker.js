const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
];

const VIDEO_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".mov",
  ".m4v",
];

const VENDOR_ASSETS = {
  "/vendor/packery.js": "https://cdn.jsdelivr.net/npm/packery@3.0.0/dist/packery.pkgd.min.js",
};

const PUBLIC_R2_BASE = "https://pub-92ddf88a319e488c90b25470f45c3026.r2.dev";
const DEFAULT_THUMB_WIDTH = 960;
const MAX_THUMB_WIDTH = 1600;

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

function getMediaType(key) {
  const lower = key.toLowerCase();

  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "image";
  if (VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "video";

  return null;
}

function mimeFromKey(key) {
  const value = key.toLowerCase();

  if (value.endsWith(".jpg") || value.endsWith(".jpeg")) return "image/jpeg";
  if (value.endsWith(".png")) return "image/png";
  if (value.endsWith(".webp")) return "image/webp";
  if (value.endsWith(".gif")) return "image/gif";
  if (value.endsWith(".avif")) return "image/avif";
  if (value.endsWith(".mp4")) return "video/mp4";
  if (value.endsWith(".webm")) return "video/webm";
  if (value.endsWith(".mov")) return "video/quicktime";
  if (value.endsWith(".m4v")) return "video/x-m4v";

  return "application/octet-stream";
}

function encodeR2Key(key) {
  return key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function thumbnailWidth(url) {
  const requested = Number(url.searchParams.get("width")) || DEFAULT_THUMB_WIDTH;
  return Math.max(320, Math.min(MAX_THUMB_WIDTH, Math.round(requested)));
}

async function listMedia(env, prefix) {
  let cursor;
  const media = [];

  do {
    const result = await env.BUCKET.list({
      prefix,
      cursor,
      limit: 1000,
    });

    for (const object of result.objects) {
      const type = getMediaType(object.key);
      if (!type) continue;

      media.push({
        key: object.key,
        name: object.key.split("/").pop(),
        type,
        size: object.size,
        uploaded: object.uploaded,
        etag: object.etag || null,
        url: `/img?key=${encodeURIComponent(object.key)}`,
        thumbUrl:
          type === "image"
            ? `/thumb?width=${DEFAULT_THUMB_WIDTH}&key=${encodeURIComponent(object.key)}`
            : null,
      });
    }

    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  media.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return media;
}

function applyObjectHeaders(headers, object, key) {
  object.writeHttpMetadata?.(headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", mimeFromKey(key));
  }

  if (object.httpEtag) headers.set("ETag", object.httpEtag);

  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
}

function parseRange(rangeHeader, size) {
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

async function serveMedia(request, env, url) {
  const key = url.searchParams.get("key");

  if (!key) return new Response("Missing key", { status: 400 });

  const rangeHeader = request.headers.get("Range");

  if (rangeHeader) {
    const metadata = await env.BUCKET.head(key);

    if (!metadata) return new Response("Media not found", { status: 404 });

    const range = parseRange(rangeHeader, metadata.size);

    if (!range) {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${metadata.size}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    const object = await env.BUCKET.get(key, {
      range: {
        offset: range.start,
        length: range.length,
      },
    });

    if (!object) return new Response("Media not found", { status: 404 });

    const headers = new Headers();
    applyObjectHeaders(headers, metadata, key);
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${metadata.size}`);
    headers.set("Content-Length", String(range.length));

    return new Response(object.body, {
      status: 206,
      headers,
    });
  }

  const object = await env.BUCKET.get(key);

  if (!object) return new Response("Media not found", { status: 404 });

  const headers = new Headers();
  applyObjectHeaders(headers, object, key);

  return new Response(object.body, { headers });
}

async function serveThumbnail(request, env, url) {
  const key = url.searchParams.get("key");
  if (!key || getMediaType(key) !== "image") {
    return new Response("Invalid image key", { status: 400 });
  }

  const width = thumbnailWidth(url);
  const sourceUrl = `${PUBLIC_R2_BASE}/${encodeR2Key(key)}`;

  try {
    const transformed = await fetch(sourceUrl, {
      headers: {
        Accept: request.headers.get("Accept") || "image/avif,image/webp,image/*,*/*;q=0.8",
      },
      cf: {
        image: {
          width,
          fit: "scale-down",
          quality: 74,
          format: "auto",
          metadata: "none",
        },
      },
    });

    if (transformed.ok) {
      const headers = new Headers(transformed.headers);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      headers.set("Vary", "Accept");

      return new Response(transformed.body, {
        status: transformed.status,
        headers,
      });
    }
  } catch (error) {
    // Keep the gallery usable even if Image Transformations is unavailable.
  }

  const original = await env.BUCKET.get(key);
  if (!original) return new Response("Image not found", { status: 404 });

  const headers = new Headers();
  original.writeHttpMetadata?.(headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", mimeFromKey(key));
  headers.set("Cache-Control", "public, max-age=3600");
  headers.set("X-Thumbnail-Fallback", "original");

  return new Response(original.body, { headers });
}

async function serveVendorAsset(request, url) {
  const upstream = VENDOR_ASSETS[url.pathname];
  if (!upstream) return null;

  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);

  if (cached) return cached;

  const response = await fetch(upstream, {
    headers: {
      "User-Agent": "ExpoLagos-Presentation/1.0",
    },
  });

  if (!response.ok) {
    return new Response("Vendor asset unavailable", { status: 502 });
  }

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/javascript; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  const proxied = new Response(response.body, {
    status: response.status,
    headers,
  });

  await cache.put(cacheKey, proxied.clone());
  return proxied;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    if (VENDOR_ASSETS[url.pathname]) {
      return serveVendorAsset(request, url);
    }

    if (url.pathname === "/api/list") {
      const prefix = url.searchParams.get("prefix") || "";
      const media = await listMedia(env, prefix);
      const images = media.filter((item) => item.type === "image");
      const videos = media.filter((item) => item.type === "video");

      return json({
        prefix,
        count: media.length,
        imageCount: images.length,
        videoCount: videos.length,
        media,
        images,
        videos,
      });
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "ExpoLagos Gallery" });
    }

    if (url.pathname === "/img") {
      return serveMedia(request, env, url);
    }

    if (url.pathname === "/thumb") {
      return serveThumbnail(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
};