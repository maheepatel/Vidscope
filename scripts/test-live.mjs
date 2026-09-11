// Calls your running app, never prints keys. This test consumes provider quota.
const base = process.env.VIDSCOPE_TEST_URL || 'http://localhost:3000';
const health = await fetch(new URL('/api/health', base)).then(r=>r.json());
if (!health.configured?.youtube || !health.configured?.brave) {
  console.error('FAIL: Add both keys to the server environment and restart/redeploy.');
  process.exit(1);
}
let failed=false;
for (const q of ['cookies','python loops']) {
  const response=await fetch(new URL('/api/search',base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q,sort:'views:desc'})});
  if (!response.ok) { console.error(`${q}: HTTP ${response.status}`); failed=true;continue; }
  const result=await response.json();
  console.log(`\n${q}: ${result.videos.length} results`);
  console.table(result.sources.map(s=>({platform:s.source,status:s.state,results:s.count})));
  console.log('With thumbnail URL:',result.videos.filter(v=>v.thumbnail).length);
  console.log('With views:',result.videos.filter(v=>v.views!==null).length);
  console.log('With likes:',result.videos.filter(v=>v.likes!==null).length);
  console.log('With comments:',result.videos.filter(v=>v.comments!==null).length);
  if(result.sources.some(s=>s.state!=='ok')||!result.videos.some(v=>v.platform==='YouTube')||!result.videos.some(v=>v.platform!=='YouTube'))failed=true;
}
console.log('\nThis checks discovery responses, not external video playback or image loading.');
process.exitCode=failed?1:0;
