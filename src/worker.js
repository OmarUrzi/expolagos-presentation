const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
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

function mimeFromKey(key) {
  const value = key.toLowerCase();

  if (value.endsWith(".jpg") || value.endsWith(".jpeg")) return "image/jpeg";
  if (value.endsWith(".png")) return "image/png";
  if (value.endsWith(".webp")) return "image/webp";
  if (value.endsWith(".gif")) return "image/gif";
  if (value.endsWith(".avif")) return "image/avif";

  return "application/octet-stream";
}

async function listImages(env, prefix) {
  let cursor;
  const images = [];

  do {
    const result = await env.BUCKET.list({
      prefix,
      cursor,
      limit: 1000,
    });

    for (const object of result.objects) {
      const lower = object.key.toLowerCase();

      if (!IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) continue;

      images.push({
        key: object.key,
        name: object.key.split("/").pop(),
        size: object.size,
        uploaded: object.uploaded,
        url: `/img?key=${encodeURIComponent(object.key)}`,
      });
    }

    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  images.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return images;
}

async function serveImage(env, url) {
  const key = url.searchParams.get("key");

  if (!key) return new Response("Missing key", { status: 400 });

  const object = await env.BUCKET.get(key);

  if (!object) return new Response("Image not found", { status: 404 });

  const headers = new Headers();

  object.writeHttpMetadata?.(headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", mimeFromKey(key));
  }

  if (object.httpEtag) headers.set("ETag", object.httpEtag);

  headers.set("Cache-Control", "public, max-age=31536000, immutable");

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
      const images = await listImages(env, prefix);

      return json({ prefix, count: images.length, images });
    }

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "ExpoLagos Gallery" });
    }

    if (url.pathname === "/img") {
      return serveImage(env, url);
    }

    return env.ASSETS.fetch(request);
  },
};
