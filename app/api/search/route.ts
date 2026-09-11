export const runtime = "nodejs";
export const maxDuration = 30;
import { discover, sources, Source, type Freshness } from "@/lib/discovery";
import { enrich, enrichmentStatus } from "@/lib/enrich";

function allowedOrigins(request: Request): Set<string> {
  const origins = new Set<string>();
  const add = (value: string | null) => {
    if (!value) return;
    const raw = value.trim();
    if (!raw) return;
    try {
      const url = new URL(raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`);
      origins.add(url.origin);
    } catch {}
  };

  add(new URL(request.url).origin);
  add(process.env.APP_URL?.trim() || null);
  add(process.env.NEXT_PUBLIC_APP_URL?.trim() || null);
  add(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host")?.trim();
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (host) add(`${proto}://${host}`);

  return origins;
}

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins(request).has(origin))
    return Response.json(
      { error: "Invalid request origin." },
      { status: 403, headers },
    );
  let b: any;
  try {
    const raw = await request.text();
    if (raw.length > 3000)
      return Response.json(
        { error: "Request too large." },
        { status: 413, headers },
      );
    b = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: "Invalid request." },
      { status: 400, headers },
    );
  }
  const q = typeof b?.q === "string" ? b.q.trim() : "";
  if (!q || q.length > 250 || q.split(/\s+/).length > 40)
    return Response.json(
      { error: "Enter a topic of up to 250 characters and 40 words." },
      { status: 400, headers },
    );
  const selected: Source[] = Array.isArray(b.sources)
    ? sources.filter((s) => b.sources.includes(s))
    : [...sources];
  if (!selected.length)
    return Response.json(
      { error: "Select a search source." },
      { status: 400, headers },
    );
  const pages: Partial<Record<Source, number>> = {};
  for (const s of selected) {
    const p = b.pages?.[s] ?? 0;
    if (!Number.isInteger(p) || p < 0 || p > 9)
      return Response.json(
        { error: "Invalid page." },
        { status: 400, headers },
      );
    pages[s] = p;
  }
  const secrets = process.env;
  const result = await discover(
    q,
    { brave: secrets.BRAVE_SEARCH_API_KEY, youtube: secrets.YOUTUBE_API_KEY },
    selected,
    pages,
    typeof b.youtubeToken === "string" && b.youtubeToken.length < 500
      ? b.youtubeToken
      : null,
    String(b.sort || "views:desc"),
    (["all", "7", "30", "365"].includes(String(b.freshness)) ? String(b.freshness) : "all") as Freshness,
  );
  // Instagram, TikTok and Facebook arrive without counts. When an enrichment vendor
  // is configured this fills them in; otherwise the results pass through untouched.
  const filled = await enrich(result.videos);
  return Response.json(
    { ...result, videos: filled.videos, enrichment: { ...enrichmentStatus(), filled: filled.enriched, error: filled.error } },
    { headers },
  );
}
