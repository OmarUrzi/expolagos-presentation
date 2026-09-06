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

    return env.ASSETS.fetch(request);
  },
};
