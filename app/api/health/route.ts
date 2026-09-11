export const runtime = 'nodejs';
export async function GET() {
  return Response.json({
    app: 'vidscope',
    version: 'vercel-live-search-1',
    configured: { youtube: !!process.env.YOUTUBE_API_KEY?.trim(), brave: !!process.env.BRAVE_SEARCH_API_KEY?.trim() },
    note: 'Configuration check only; use test:live to check provider responses.'
  }, {headers: {'Cache-Control':'no-store'}});
}
