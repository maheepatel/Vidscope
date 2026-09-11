import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
const dir=mkdtempSync(join(tmpdir(),'vidscope-test-'));
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
try{
writeFileSync(join(dir,'videos.mjs'),compile(readFileSync('lib/videos.ts','utf8')));
writeFileSync(join(dir,'discovery.mjs'),compile(readFileSync('lib/discovery.ts','utf8').replace("from './videos'","from './videos.mjs'")));
writeFileSync(join(dir,'route.mjs'),compile(readFileSync('app/api/search/route.ts','utf8')
.replace("import {env} from 'cloudflare:workers';",'const env={};')
.replace(/from ['"]@\/lib\/discovery['"]/, "from './discovery.mjs'")));
const {sortVideos,filterVideos,platformOf,youtubeId,safeUrl}=await import(pathToFileURL(join(dir,'videos.mjs')));
const now=Date.parse('2026-09-08T00:00:00Z');
const fixtures=[{id:'a',platform:'YouTube',views:0,likes:2,comments:null,published:'2026-09-07T00:00:00Z'},{id:'b',platform:'Reddit',views:null,likes:null,comments:8,published:'2026-07-01T00:00:00Z'},{id:'c',platform:'YouTube',views:40,likes:null,comments:0,published:null},{id:'future',platform:'Other',views:10,published:'2027-01-01T00:00:00Z'}];
assert.deepEqual(filterVideos(fixtures,{platform:'YouTube',date:'7',metric:'views'},now).map(v=>v.id),['a']);
assert.deepEqual(filterVideos(fixtures,{platform:'All platforms',date:'all',metric:'comments'},now).map(v=>v.id),['b','c']);
assert.equal(filterVideos(fixtures,{platform:'Instagram',date:'all',metric:'all'},now).length,0);
assert.equal(filterVideos(fixtures,{platform:'All platforms',date:'all',metric:'all'},now).length,4);
assert.deepEqual(filterVideos(fixtures,{platform:'All platforms',date:'7',metric:'all'},now).map(v=>v.id),['a']);
const {POST}=await import(pathToFileURL(join(dir,'route.mjs')));
assert.deepEqual(sortVideos([{views:null},{views:0},{views:50}],'views:asc').map(v=>v.views),[0,50,null]);
assert.deepEqual(sortVideos([{views:null},{views:0},{views:50}],'views:desc').map(v=>v.views),[50,0,null]);
assert.equal(platformOf('https://youtube.com.evil.com/watch?v=abc'),'Other');assert.equal(safeUrl('javascript:alert(1)'),'');assert.equal(youtubeId('https://youtu.be/rEdl2Uetpvo'),'rEdl2Uetpvo');
const req=b=>new Request('https://vidscope.test/api/search',{method:'POST',body:JSON.stringify(b),headers:{origin:'https://vidscope.test'}});
assert.equal((await POST(req({q:''}))).status,400);const missing=await (await POST(req({q:'cookies',braveKey:'visitor-key'}))).json();assert.equal(missing.videos.length,0);assert.equal(missing.sources.length,8);assert.ok(missing.sources.every(s=>s.state==='not_configured'));
assert.equal((await POST(req({q:'cookies',sources:[]}))).status,400);assert.equal((await POST(req({q:'cookies',pages:{YouTube:-1}}))).status,400);
assert.equal((await POST(new Request('https://vidscope.test/api/search',{method:'POST',headers:{origin:'https://evil.test'},body:'{}'}))).status,403);
const fixture={id:'rEdl2Uetpvo',snippet:{title:'Cookies',channelTitle:'Baker',thumbnails:{high:{url:'https://i.ytimg.com/vi/rEdl2Uetpvo/hqdefault.jpg'}}},statistics:{viewCount:'100',likeCount:'0'},contentDetails:{duration:'PT2M'}};
const {discover,isVideoResult,canonical}=await import(pathToFileURL(join(dir,'discovery.mjs')));
assert.equal(isVideoResult({url:'https://instagram.com/p/image'}),false);
assert.equal(isVideoResult({url:'https://reddit.com/r/Baking/comments/abc/cookies'}),false);
assert.equal(isVideoResult({url:'https://tiktok.com/@baker/video/1234'}),true);
assert.equal(isVideoResult({url:'https://youtube.com.evil.com/watch?v=rEdl2Uetpvo'}),false);
assert.equal(canonical('https://instagram.com/reel/abc/?utm_source=test#x'),'https://instagram.com/reel/abc/');
let fail=false;const calls=[];
const urls={Instagram:'https://www.instagram.com/reel/abc/',Facebook:'https://www.facebook.com/baker/videos/1234/',TikTok:'https://www.tiktok.com/@baker/video/1234',Reddit:'https://www.reddit.com/r/Baking/comments/abc/cookies/',Other:'https://publisher.example/videos/cookies'};
globalThis.fetch=async url=>{url=new URL(url);calls.push(url);if(url.hostname==='api.search.brave.com'){const q=url.searchParams.get('q');const source=q.includes('-site:')?'Other':q.includes('instagram')?'Instagram':q.includes('facebook')?'Facebook':q.includes('tiktok')?'TikTok':'Reddit';if(fail&&source==='TikTok')return new Response('{}',{status:429});const item={url:urls[source],title:'Cookie video',video:{views:5}};return Response.json(url.pathname.includes('/web/')?{web:{results:[item,{url:'https://www.instagram.com/p/photo',title:'Still image'},item]}}:{results:[item]});}if(url.pathname.endsWith('/search'))return Response.json({items:[{id:{videoId:'rEdl2Uetpvo'}}],nextPageToken:'next-token'});return Response.json({items:[fixture]});};
let d=await discover('cookies',{youtube:'test',brave:'test'},['YouTube',...Object.keys(urls)],{},null,'views:desc');
assert.equal(d.videos.length,6);assert.equal(d.videos[0].likes,0);assert.equal(d.videos[0].comments,null);assert.equal(d.nextYoutube,'next-token');assert.ok(d.sources.every(s=>s.state==='ok'&&s.count===1));
fail=true;d=await discover('cookies',{brave:'test'},['Instagram','TikTok'],{},null,'views:desc');assert.equal(d.videos.length,1);assert.equal(d.sources[1].state,'unavailable');assert.match(d.sources[1].message,/rate limit/);
calls.length=0;await discover('cookies',{brave:'test'},['Instagram'],{Instagram:2},null,'views:desc');assert.equal(calls.length,1);assert.equal(calls[0].searchParams.get('offset'),'2');assert.match(calls[0].searchParams.get('q'),/site:instagram/);
console.log('PASS: filters, descending sorting, null/zero counts, URL checks, missing server keys, rejected visitor keys, six-source retrieval, deduplication, source selection, pagination and partial failure. Provider responses mocked; live coverage unverified.');
}finally{rmSync(dir,{recursive:true,force:true})}
