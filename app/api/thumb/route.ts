export const runtime = "nodejs";
export const maxDuration = 15;

// Instagram serves a public poster for a shortcode, but only to a same-site or
// server request: the browser's own cross-origin <img> load is refused. This route
// fetches that one image and streams it back.
//
// It takes a shortcode, never a URL, so there is nothing here that can be pointed at
// another host: the only address this route can ever reach is built below.
const CODE = /^[A-Za-z0-9_-]{5,20}$/;
const MAX_BYTES = 3_000_000;

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("ig") || "";
  if (!CODE.test(code)) return new Response("Not found", { status: 404 });

  try {
    const upstream = await fetch(`https://www.instagram.com/p/${code}/media/?size=m`, {
      signal: AbortSignal.timeout(8000),
      headers: {
        // Instagram serves the redirect only to a browser-shaped request.
        "User-Agent": "Mozilla/5.0 (compatible; Vidscope/1.0; +https://vidscope.vercel.app)",
        Accept: "image/avif,image/webp,image/jpeg,image/*;q=0.8",
      },
    });
    const type = upstream.headers.get("content-type") || "";
    const length = Number(upstream.headers.get("content-length") || 0);
    if (!upstream.ok || !type.startsWith("image/") || length > MAX_BYTES)
      return new Response("No image", { status: 404, headers: {"Cache-Control": "public, max-age=3600"} });

    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) return new Response("Too large", { status: 404 });

    return new Response(bytes, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(bytes.byteLength),
        // Posters do not change, so let the CDN answer every repeat.
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Unavailable", { status: 404, headers: {"Cache-Control": "public, max-age=600"} });
  }
}
