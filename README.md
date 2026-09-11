# Vidscope — Vercel edition

A guest-first public-video search app. Same list UI; the main Search button calls live providers for any entered topic. Cookie collection remains a separately labelled saved collection.

## What this release actually retrieves

| Source | Discovery | Statistics | Thumbnail |
| --- | --- | --- | --- |
| YouTube | YouTube Data API, or Brave when no YouTube key is set | API-provided views, likes and comments when returned | API thumbnail |
| Instagram, Facebook, TikTok | Brave web index filtered to video URLs | Views only if Brave supplies them; likes/comments unavailable in this release | Brave thumbnail when supplied |
| Reddit, Dailymotion, Vimeo | Brave video index | Views if returned; likes/comments unavailable | Brave thumbnail when supplied |
| Other websites | Brave video index | Views if returned; likes/comments unavailable | Brave thumbnail when supplied |

## Ranking, thumbnails and the guided tour

**Comment-verified top picks.** After a search returns, the app makes a second request to
`/api/analyze`, which reads up to 100 relevance-ordered comments for each of up to twelve
YouTube results and scores them in `lib/trust.ts`. The score is deterministic — regex
classification and arithmetic, no model — so the same comments always produce the same
number. It discards timestamp-only replies, engagement bait, channel promo and links,
then weights what is left by log10 of each comment's like count. Comments reporting an
actual outcome ("I followed this and it worked") carry 34% of the raw merit; generic
praise counts at under half that weight. Duplicated comment text, recurring complaints,
unanswered questions, a like rate far below the ~4% YouTube norm for the view count, and
an age over five years all reduce the result. Ranking is multiplied by a confidence
factor from the sample size, and a video with fewer than eight substantive comments is
labelled "Too few comments" and never leads the picks. Comment data exists for YouTube
only; other platforms are listed but not scored, and the panel says so.

**Thumbnails.** YouTube and Vimeo supply images directly. Instagram posters are fetched
through `/api/thumb`, which accepts a shortcode and nothing else — no caller-supplied URL
reaches `fetch` — because the browser's own cross-origin load of Instagram's poster is
refused. TikTok and Facebook expose no public poster. Every row that still has no image
renders a generated tile whose colour is derived from the video URL, so no result is ever
a blank grey box.

**Repost collapse.** On by default. Near-identical titles across channels and platforms
group onto the best-evidenced copy, with the rest shown as a "+n reposts" count.

**Length filter, tour and theme.** Results can be narrowed to under 5 minutes, 5–20
minutes or over 20 minutes using the duration the source reported; results with no
duration are only excluded when a band is chosen. A five-step tour runs once for a new
visitor after their first search and can be reopened from the header. Light, dark and
system themes are available from the header and remembered per device.

## Quota cost per search

| Call | Provider | Units |
| --- | --- | --- |
| Discovery search | YouTube Data API | 100 |
| Statistics lookup | YouTube Data API | 1 |
| Comment analysis | YouTube Data API | up to 12 |
| Per-source discovery | Brave | up to 7 requests |

Comment analysis adds at most twelve units to the roughly 101 a search already spends, so
it changes the daily search ceiling by about a tenth. Load more only analyses candidates
that have not been scored yet. Instagram poster requests hit `/api/thumb` once per image
and are cached for a week at the CDN.


These keys do not unlock every platform's statistics. This release has no general browser scraping/enrichment worker, persistent index, or restriction bypass. It does not guarantee exhaustive coverage or thumbnails for every result. Missing data stays unavailable, never zero or invented. External playback may require the source app/account/region. Search uses moderate safe-search. Ranking is within retrieved results, not a global internet ranking. The saved 60-link collection contains older snapshots, not live data.

## 1. Install locally (Windows / VS Code)

Install Node.js 22.13 or newer within Node 22 LTS. Extract this ZIP. Open the inner `vidscope-vercel` folder (the one containing package.json) in VS Code. Open Terminal > New Terminal.

```powershell
npm ci
Copy-Item .env.example .env.local
```

On macOS/Linux use `cp .env.example .env.local` instead of Copy-Item.

Edit `.env.local`:

```dotenv
YOUTUBE_API_KEY=replace_with_your_youtube_key
BRAVE_SEARCH_API_KEY=replace_with_your_brave_key
```

Use plain values without a trailing semicolon. Never add NEXT_PUBLIC_ to these variables. Do not commit `.env.local`. For YouTube enable YouTube Data API v3 in the key's Google Cloud project and restrict the key to that API. Browser-referrer restrictions do not match this server-side integration. Brave's subscription must cover web and video search.

```powershell
npm run dev
```

Open http://localhost:3000. Search cookies, then python loops, then a topic of your choice. The search is live; it does not silently substitute demo results on failure. Click a platform tab to filter retrieved results. Searching while a tab is selected searches that platform; choose All platforms before searching across the web. Click Load more to fetch subsequent available pages.

## 2. Test after adding your keys

Keep the app running. In a second terminal:

```powershell
npm test
npm run test:live
```

`npm test` uses controlled provider fixtures; it does not consume quota. `test:live` calls your running app with cookies and python loops, prints per-platform counts and metric availability, and fails if a source errors or YouTube/non-YouTube discovery is absent. It consumes quota. A source may legitimately return zero for a topic.

Open http://localhost:3000/api/health to see configuration booleans. This never reveals keys and does not prove the credentials are valid.

Browser checks:
- Search two unrelated topics and confirm titles change.
- Confirm at least one non-YouTube platform has results; inspect each platform's status.
- Open sample title links; compare available statistics with their sources, allowing for time changes.
- Confirm actual images load; an image URL alone does not prove thumbnail availability.
- Check highest views, likes and comments; missing counts must stay last, zero must remain zero.
- Test platform/date/metric filters, reset and Load more; results must not duplicate.
- Check a narrow mobile viewport and keyboard controls.
- Confirm the top-picks panel appears within a second or two of the list, and that its
  quoted comments open the video they came from.
- Confirm every row shows either a real thumbnail or a generated tile, never an empty box.
- Switch between light, dark and system and reload; the choice must survive the reload.
- Clear this site's local storage and search once; the tour must appear, and must not
  reappear after it is dismissed.

Then stop the dev server with Ctrl+C and run:

```powershell
npm run build
npm start
```

Repeat your essential checks on the production build at localhost:3000.

## 3. Put the project on GitHub

Create a new empty PRIVATE GitHub repository named `vidscope`. Do not initialize it with a README (this project already has one). In the project terminal:

```powershell
git init
git add .
git status
```

Confirm `.env.local`, node_modules and .next are not staged. Then:

```powershell
git commit -m "Prepare Vidscope live search for Vercel"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/vidscope.git
git push -u origin main
```

Replace YOUR_USERNAME with your account. Complete GitHub authentication if requested. The download contains no old Git credentials or deployment identity.

## 4. Deploy on Vercel

1. Sign in to https://vercel.com and connect GitHub.
2. Add New > Project > import your vidscope repository.
3. Framework preset: Next.js. Root directory: folder containing package.json (normally repository root).
4. Node.js version: 22.x. Keep the default output directory. Build command: npm run build. Install command: npm ci.
5. Add YOUTUBE_API_KEY and BRAVE_SEARCH_API_KEY in Environment Variables, with your real values. Enable them for Production and Preview if you want both to run searches.
6. Click Deploy. Open the Vercel URL after deployment succeeds.
7. Visit /api/health on that URL, then perform the browser checks above on the deployed website.
8. When changing keys later, redeploy: changes apply to new deployments.

Optional remote API smoke test in PowerShell, for a deployment you can access without Vercel's login protection:

```powershell
$env:VIDSCOPE_TEST_URL="https://YOUR_PROJECT.vercel.app"
npm run test:live
Remove-Item Env:VIDSCOPE_TEST_URL
```

For a protected Preview deployment, use its authenticated browser interface. A redirect to Vercel login is not an app API failure.

## Cost and troubleshooting

One all-platform search can use 7 Brave requests plus 2 YouTube requests; pagination repeats provider calls. There is no durable global spending cap or shared cache in this release. Set provider spending limits and Vercel firewall/rate limits before public promotion. Free allowances are small when one user search fans out across providers.

- Not connected: variable absent in server environment; restart/redeploy after adding it.
- Source access unavailable: invalid key, API not enabled, subscription entitlement, key restriction, or access denial. Check the provider dashboard. No secret is printed in app errors.
- Rate limit reached: quota exhausted; wait or adjust provider allowance.
- Missing metrics: source did not supply them. Adding Brave does not enable Instagram/Facebook/TikTok likes/comments in this implementation.
- Blank thumbnail: no usable image was returned or the remote image expired/blocked embedding.
- Zero results after filtering: reset filters and try a broader query; this does not indicate complete platform coverage.

## Verification supplied with this download

See TESTING.md for the checks performed in the build environment. Live calls with your credentials and the Vercel deployment are still yours to run; your keys were not provided to this environment.
