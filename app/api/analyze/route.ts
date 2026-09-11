export const runtime = "nodejs";
export const maxDuration = 30;
import { scoreVideo, type RawComment, type Trust } from "@/lib/trust";

// One commentThreads call costs a single YouTube quota unit, so a full pass over the
// cap below adds roughly as much quota as one extra videos.list call. Requests run in
// parallel; the whole analysis is one network round trip.
const CAP = 12;
const ID = /^[a-zA-Z0-9_-]{11}$/;

type Target = {
  id: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  published: string | null;
};

function targets(value: unknown): Target[] {
  if (!Array.isArray(value)) return [];
  const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : null);
  const seen = new Set<string>();
  const out: Target[] = [];
  for (const item of value) {
    const id = typeof item?.id === "string" ? item.id : "";
    if (!ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      views: num(item.views),
      likes: num(item.likes),
      comments: num(item.comments),
      published: typeof item.published === "string" ? item.published : null,
    });
    if (out.length >= CAP) break;
  }
  return out;
}

async function comments(id: string, key: string): Promise<RawComment[] | null> {
  const params = new URLSearchParams({
    part: "snippet",
    videoId: id,
    maxResults: "100",
    order: "relevance",
    textFormat: "plainText",
    key,
  });
  const response = await fetch("https://www.googleapis.com/youtube/v3/commentThreads?" + params, {
    signal: AbortSignal.timeout(9000),
  });
  // 403 is the normal answer when a creator has disabled comments; that is not an error.
  if (!response.ok) return null;
  const data = (await response.json()) as any;
  return (data.items || []).map((item: any): RawComment => {
    const snippet = item.snippet?.topLevelComment?.snippet || {};
    return {
      text: String(snippet.textOriginal || snippet.textDisplay || ""),
      likes: Number(snippet.likeCount) || 0,
      replies: Number(item.snippet?.totalReplyCount) || 0,
      published: snippet.publishedAt || null,
      author: snippet.authorChannelId?.value || snippet.authorDisplayName || null,
    };
  });
}

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key)
    return Response.json(
      { results: [], state: "not_configured", message: "Comment analysis needs a YouTube key." },
      { headers },
    );

  let body: any;
  try {
    const raw = await request.text();
    if (raw.length > 8000)
      return Response.json({ error: "Request too large." }, { status: 413, headers });
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400, headers });
  }

  const wanted = targets(body?.videos);
  if (!wanted.length)
    return Response.json(
      { results: [], state: "unsupported", message: "No analysable videos in this result set." },
      { headers },
    );

  const started = Date.now();
  const settled = await Promise.all(
    wanted.map(async (target) => {
      try {
        const raw = await comments(target.id, key);
        if (!raw) return { id: target.id, skipped: "Comments unavailable for this video." };
        if (!raw.length) return { id: target.id, skipped: "No comments on this video." };
        return { id: target.id, trust: scoreVideo(target.id, target, raw) };
      } catch {
        return { id: target.id, skipped: "Comment lookup timed out." };
      }
    }),
  );

  const results = settled.filter((r): r is { id: string; trust: Trust } => "trust" in r).map((r) => r.trust);
  // Rank order, but a video with too few comments to judge never leads the picks:
  // a high score off four comments reads as authoritative and is not.
  const thin = (t: Trust) => (t.verdict === "thin" ? 1 : 0);
  results.sort((a, b) => thin(a) - thin(b) || b.rank - a.rank);

  return Response.json(
    {
      state: results.length ? "ok" : "unavailable",
      results,
      skipped: settled.filter((r) => "skipped" in r).length,
      analysed: wanted.length,
      ms: Date.now() - started,
    },
    { headers },
  );
}
