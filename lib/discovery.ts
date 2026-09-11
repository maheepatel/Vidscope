import {Video,platformOf,safeUrl,youtubeId} from './videos';
export const sources=['YouTube','Instagram','Facebook','TikTok','Reddit','Dailymotion','Vimeo','Other'] as const;
export type Source=typeof sources[number];
export type SourceStatus={source:Source;state:'ok'|'unavailable'|'not_configured';count:number;message:string;next:number|null};
const scopes:Record<Source,string>={YouTube:'site:youtube.com',Instagram:'site:instagram.com/reel/',Facebook:'site:facebook.com (inurl:videos OR inurl:reel OR inurl:watch)',TikTok:'site:tiktok.com inurl:video',Reddit:'site:reddit.com',Dailymotion:'site:dailymotion.com/video/',Vimeo:'site:vimeo.com',Other:'-site:youtube.com -site:youtu.be -site:instagram.com -site:facebook.com -site:tiktok.com -site:reddit.com'};
const count=(v:unknown)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
export function canonical(raw:unknown){const url=safeUrl(raw);if(!url)return '';const u=new URL(url);if(u.username||u.password)return '';u.hash='';for(const k of [...u.searchParams.keys()])if(k.startsWith('utm_')||['fbclid','igsh','si'].includes(k))u.searchParams.delete(k);const id=youtubeId(u.href);return id?`https://www.youtube.com/watch?v=${id}`:u.href;}
export function isVideoResult(v:any,videoIndex=false){const url=canonical(v.url);if(!url)return false;const u=new URL(url),p=platformOf(url);if(p==='YouTube')return !!youtubeId(url);if(p==='Instagram')return /^\/reels?\/[^/]+/.test(u.pathname);if(p==='TikTok')return /^\/@[^/]+\/video\/\d+/.test(u.pathname);if(p==='Facebook')return /\/(videos|reel)\/[^/]+/.test(u.pathname)||u.hostname==='fb.watch'||u.pathname==='/watch/'&&!!u.searchParams.get('v');if(p==='Reddit')return /\/comments\//.test(u.pathname)&&videoIndex;return videoIndex;}
export function webVideo(v:any):Video {const url=canonical(v.url);return {id:url,url,title:String(v.title||'Untitled video').replace(/<[^>]*>/g,''),thumbnail:safeUrl(v.thumbnail?.src)||safeUrl(v.thumbnail?.original),platform:platformOf(url),creator:String(v.video?.creator||v.video?.publisher||new URL(url).hostname),views:count(v.video?.views),likes:null,comments:null,published:v.video?.release_date||null,duration:v.video?.duration||null,description:String(v.description||'').replace(/<[^>]*>/g,''),discovery:'Brave Search',observedAt:new Date().toISOString()};}
async function json(url:string,headers:Record<string,string>={}){const r=await fetch(url,{headers,signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error(r.status===429?'Source rate limit reached.':r.status===401||r.status===403?'Source access unavailable.':'Source temporarily unavailable.');return r.json() as Promise<any>;}
function youtubeVideo(v:any):Video{return {id:v.id,url:`https://www.youtube.com/watch?v=${v.id}`,title:v.snippet.title,thumbnail:safeUrl(v.snippet.thumbnails?.high?.url)||safeUrl(v.snippet.thumbnails?.medium?.url)||safeUrl(v.snippet.thumbnails?.default?.url),platform:'YouTube',creator:v.snippet.channelTitle,views:count(v.statistics?.viewCount),likes:count(v.statistics?.likeCount),comments:count(v.statistics?.commentCount),published:v.snippet.publishedAt||null,duration:v.contentDetails?.duration||null,description:v.snippet.description||'',discovery:'YouTube Data API',observedAt:new Date().toISOString()};}
export async function discover(q:string,keys:{brave?:string;youtube?:string},selected:Source[],pages:Partial<Record<Source,number>>,token:string|null,sort:string){
 let nextYoutube:string|null=null;
 const batches=await Promise.all(selected.map(async source=>{
 const page=pages[source]??0;const status:SourceStatus={source,state:'ok',count:0,message:'',next:null};
 if(!(source==='YouTube'&&keys.youtube)&&!keys.brave)return {videos:[] as Video[],status:{...status,state:'not_configured' as const,message:'Search is not configured for this source.'}};
 try{let videos:Video[]=[];
 if(source==='YouTube'&&keys.youtube){const params=new URLSearchParams({part:'snippet',q,type:'video',maxResults:'25',key:keys.youtube,safeSearch:'moderate',order:sort==='views:desc'?'viewCount':sort==='published:desc'?'date':'relevance'});if(token)params.set('pageToken',token);const d=await json('https://www.googleapis.com/youtube/v3/search?'+params);nextYoutube=d.nextPageToken||null;status.next=nextYoutube?page+1:null;const ids=(d.items||[]).map((v:any)=>v.id?.videoId).filter(Boolean);if(ids.length){const data=await json('https://www.googleapis.com/youtube/v3/videos?'+new URLSearchParams({part:'snippet,statistics,contentDetails',id:ids.join(','),key:keys.youtube}));videos=(data.items||[]).map(youtubeVideo);}}
 else {
 // Video-index results are required for Reddit: a text post mentioning video is insufficient.
 const videoIndex=['YouTube','Reddit','Dailymotion','Vimeo','Other'].includes(source);const limit=videoIndex?50:20;
 const params=new URLSearchParams({q:`${q} ${scopes[source]}`,count:String(limit),offset:String(page),safesearch:'moderate'});
 const d=await json(`https://api.search.brave.com/res/v1/${videoIndex?'videos':'web'}/search?`+params,{'X-Subscription-Token':keys.brave!,Accept:'application/json'});
 const raw=videoIndex?d.results||[]:d.web?.results||[];
 videos=raw.filter((v:any)=>isVideoResult(v,videoIndex)).map(webVideo).filter((v:Video)=>v.platform===source);
 status.next=raw.length>=limit&&page<9?page+1:null;
 }
 videos=[...new Map(videos.map(v=>[v.url,v])).values()];status.count=videos.length;status.message=videos.length?'Indexed public video links; playback may require the source app.':'No matching video links returned by this source.';return {videos,status};
 }catch(e){return {videos:[] as Video[],status:{...status,state:'unavailable' as const,message:e instanceof Error?e.message:'Source unavailable.'}};}
 }));
 return {videos:batches.flatMap(b=>b.videos),sources:batches.map(b=>b.status),nextYoutube,fetchedAt:new Date().toISOString()};
}
