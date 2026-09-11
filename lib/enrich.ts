import {type Video, platformOf} from './videos';

// ── Why this file exists ─────────────────────────────────────────────────────
// Instagram, TikTok and Facebook show view, like and comment counts to anyone
// browsing their apps, but expose none of it to a developer. Their official APIs
// return only the posts of the account that authorised you, and neither Instagram
// nor TikTok offers a public keyword or hashtag search endpoint at all. Connecting
// a user's own account does not change that: the token's scopes cover that user's
// own media, not the reels a search turns up.
//
// The only routes to those numbers are a vendor that already collects them at scale,
// or running that collection ourselves. This module is the seam for the first: one
// interface, one adapter per vendor, selected by environment variable. Nothing here
// is enabled unless a key is configured, and every adapter degrades to "no data"
// rather than inventing a number.
//
// Configure with:
//   ENRICH_PROVIDER=apify | brightdata | scrapecreators | none   (default none)
//   ENRICH_API_KEY=<vendor key>
//   ENRICH_MAX=<max videos enriched per search, default 40>

export type Enriched = {url:string; views?:number|null; likes?:number|null; comments?:number|null; published?:string|null; thumbnail?:string|null};
export type Provider = {
  name: string;
  /** Platforms this adapter can return counts for. */
  handles: Set<string>;
  fetch(urls: string[], key: string, signal: AbortSignal): Promise<Enriched[]>;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const SOCIAL = new Set(['Instagram', 'TikTok', 'Facebook']);

// Normalises whatever shape a vendor returns into our own. Vendors differ in field
// names but all of them expose these five, so the mapping stays small.
function normalise(rows: any[]): Enriched[] {
  return (rows || [])
    .map((r) => {
      const url = String(r.url || r.postUrl || r.webVideoUrl || r.inputUrl || r.link || '');
      if (!url) return null;
      return {
        url,
        views: num(r.playCount ?? r.videoPlayCount ?? r.views ?? r.viewCount ?? r.play_count),
        likes: num(r.likesCount ?? r.likes ?? r.likeCount ?? r.diggCount ?? r.digg_count),
        comments: num(r.commentsCount ?? r.comments ?? r.commentCount ?? r.comment_count),
        published: typeof r.timestamp === 'string' ? r.timestamp : r.createTime ? new Date(Number(r.createTime) * 1000).toISOString() : null,
        thumbnail: typeof r.displayUrl === 'string' ? r.displayUrl : typeof r.covers === 'string' ? r.covers : null,
      } as Enriched;
    })
    .filter((r): r is Enriched => r !== null);
}

const apify: Provider = {
  name: 'Apify',
  handles: new Set(['Instagram', 'TikTok', 'Facebook']),
  async fetch(urls, key, signal) {
    // Synchronous actor run: returns dataset items directly.
    const response = await fetch(
      `https://api.apify.com/v2/acts/apify~social-media-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({startUrls: urls.map((url) => ({url})), resultsLimit: urls.length}),
        signal,
      },
    );
    if (!response.ok) throw new Error(`Apify responded ${response.status}`);
    return normalise(await response.json());
  },
};

const brightdata: Provider = {
  name: 'Bright Data',
  handles: new Set(['Instagram', 'TikTok', 'Facebook']),
  async fetch(urls, key, signal) {
    const response = await fetch('https://api.brightdata.com/datasets/v3/scrape', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${key}`},
      body: JSON.stringify({input: urls.map((url) => ({url}))}),
      signal,
    });
    if (!response.ok) throw new Error(`Bright Data responded ${response.status}`);
    const body = await response.json();
    return normalise(Array.isArray(body) ? body : body.data || body.results || []);
  },
};

const scrapecreators: Provider = {
  name: 'ScrapeCreators',
  handles: new Set(['Instagram', 'TikTok']),
  async fetch(urls, key, signal) {
    // One call per URL; run them together so the whole batch is a single round trip.
    const rows = await Promise.all(
      urls.map(async (url) => {
        const platform = platformOf(url) === 'TikTok' ? 'tiktok' : 'instagram';
        const response = await fetch(
          `https://api.scrapecreators.com/v1/${platform}/post?url=${encodeURIComponent(url)}`,
          {headers: {'x-api-key': key}, signal},
        );
        if (!response.ok) return null;
        const body = await response.json();
        return {url, ...(body.data || body)};
      }),
    );
    return normalise(rows.filter(Boolean));
  },
};

const PROVIDERS: Record<string, Provider> = {apify, brightdata, scrapecreators};

export function activeProvider(): Provider | null {
  const name = (process.env.ENRICH_PROVIDER || 'none').trim().toLowerCase();
  if (name === 'none' || !process.env.ENRICH_API_KEY?.trim()) return null;
  return PROVIDERS[name] || null;
}

export function enrichmentStatus() {
  const configured = (process.env.ENRICH_PROVIDER || 'none').trim().toLowerCase();
  const provider = activeProvider();
  return {
    enabled: provider !== null,
    provider: provider?.name ?? null,
    // Distinguish "not set up" from "set up wrong" so /api/health is actually useful.
    reason: provider
      ? null
      : configured === 'none'
        ? 'No enrichment provider configured. Instagram, TikTok and Facebook counts stay unavailable.'
        : !process.env.ENRICH_API_KEY?.trim()
          ? `ENRICH_PROVIDER is "${configured}" but ENRICH_API_KEY is not set.`
          : `Unknown ENRICH_PROVIDER "${configured}". Expected apify, brightdata, scrapecreators or none.`,
  };
}

/**
 * Fills missing counts on social results in place of nothing. Returns the videos
 * unchanged when no provider is configured, when the batch fails, or when the vendor
 * has no record of a URL — a missing count stays missing and is never guessed.
 */
export async function enrich(videos: Video[], timeoutMs = 12000): Promise<{videos: Video[]; enriched: number; provider: string | null; error?: string}> {
  const provider = activeProvider();
  if (!provider) return {videos, enriched: 0, provider: null};

  const cap = Math.max(0, Math.min(200, Number(process.env.ENRICH_MAX) || 40));
  const targets = videos
    .filter((v) => SOCIAL.has(v.platform) && provider.handles.has(v.platform) && v.views === null && v.likes === null)
    .slice(0, cap);
  if (!targets.length) return {videos, enriched: 0, provider: provider.name};

  try {
    const rows = await provider.fetch(
      targets.map((v) => v.url),
      process.env.ENRICH_API_KEY!.trim(),
      AbortSignal.timeout(timeoutMs),
    );
    // Match on the URL path, since vendors echo back canonicalised or tracking-stripped URLs.
    const path = (u: string) => {
      try {
        return new URL(u).pathname.replace(/\/+$/, '');
      } catch {
        return u;
      }
    };
    const byPath = new Map(rows.map((r) => [path(r.url), r]));

    let enriched = 0;
    const merged = videos.map((v) => {
      const row = byPath.get(path(v.url));
      if (!row) return v;
      const next: Video = {
        ...v,
        views: v.views ?? row.views ?? null,
        likes: v.likes ?? row.likes ?? null,
        comments: v.comments ?? row.comments ?? null,
        published: v.published ?? row.published ?? null,
        thumbnail: v.thumbnail || row.thumbnail || '',
        discovery: `${v.discovery} + ${provider.name}`,
      };
      if (next.views !== v.views || next.likes !== v.likes || next.comments !== v.comments) enriched++;
      return next;
    });
    return {videos: merged, enriched, provider: provider.name};
  } catch (error) {
    // Enrichment is additive: a vendor outage must never fail the search itself.
    return {videos, enriched: 0, provider: provider.name, error: error instanceof Error ? error.message : 'Enrichment failed.'};
  }
}
