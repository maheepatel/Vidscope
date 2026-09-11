export type Video = {score?:number;metricNote?:string;evidenceUrl?:string;discovery?:string;observedAt?:string;id:string;title:string;url:string;thumbnail:string;platform:string;creator:string;views:number|null;likes:number|null;comments:number|null;published:string|null;duration:string|null;description:string};
export const platforms=['YouTube','Instagram','TikTok','Facebook','Reddit','Dailymotion','Vimeo','Other'];
export function platformOf(url:string){try{const h=new URL(url).hostname.toLowerCase();for(const [domain,name] of [['youtube.com','YouTube'],['youtu.be','YouTube'],['instagram.com','Instagram'],['tiktok.com','TikTok'],['facebook.com','Facebook'],['fb.watch','Facebook'],['reddit.com','Reddit'],['dailymotion.com','Dailymotion'],['vimeo.com','Vimeo']])if(h===domain||h.endsWith('.'+domain))return name;}catch{}return 'Other'}
export function youtubeId(url:string){try{const u=new URL(url);if(platformOf(url)!=='YouTube')return null;const id=u.hostname==='youtu.be'?u.pathname.slice(1):u.searchParams.get('v')||u.pathname.split('/')[2];return id&&/^[a-zA-Z0-9_-]{11}$/.test(id)?id:null}catch{return null}}
export function safeUrl(url:unknown){try{const u=new URL(String(url));return u.protocol==='https:'?u.href:''}catch{return ''}}
export function sortVideos(v:Video[],sort:string){const [key,order]=sort.split(':');if(key==='relevance')return [...v];return [...v].sort((a,b)=>{const av=key==='published'?(a.published?Date.parse(a.published):null):a[key as 'views'];const bv=key==='published'?(b.published?Date.parse(b.published):null):b[key as 'views'];const x=typeof av==='number'&&Number.isFinite(av)?av:null;const y=typeof bv==='number'&&Number.isFinite(bv)?bv:null;if(x===null)return y===null?0:1;if(y===null)return -1;return order==='asc'?x-y:y-x})}
export const samples:Video[]=[
['rEdl2Uetpvo','How To Make Perfect Chocolate Chip Cookies'],
['3vUtRRZG0xY','The Best Chewy Chocolate Chip Cookies'],
['ZLULwy2cXVE','The Best Chocolate Chip Cookies Ever'],
['OaQJL18ZhiM','18 Chocolate Chip Cookie Recipe Compilation'],
['SWybai5dIl4','We Tested 50 Chocolate Chip Cookie Recipes'],
['77B_GLBhXGs','How To Make The Perfect Chocolate Chip Cookie']
].map(([id,title])=>({id,title,url:`https://www.youtube.com/watch?v=${id}`,thumbnail:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`,platform:'YouTube',creator:'YouTube video',views:null,likes:null,comments:null,published:null,duration:null,description:'A real cookie video, included in the sample collection. Connect live search to retrieve available engagement metrics.'}));

export function filterVideos(videos:Video[],filters:{platform:string;date:string;metric:string;length?:string},now=Date.now()) {
 return videos.filter(v=>{
 if(filters.platform!=='All platforms'&&v.platform!==filters.platform)return false;
 if(filters.metric!=='all'){const n=v[filters.metric as 'views'|'likes'|'comments'];if(typeof n!=='number'||!Number.isFinite(n))return false;}
 if(filters.length&&filters.length!=='all'){const s=seconds(v.duration);const band=lengthBands[filters.length];if(!band||s===null||s<band[0]||s>band[1])return false;}
 if(filters.date!=='all'){const time=v.published?Date.parse(v.published):NaN;const age=now-time;if(!Number.isFinite(time)||age<0||age>Number(filters.date)*86400000)return false;}
 return true;
 });
}

// ISO-8601 duration (PT4M13S) to seconds. Returns null when a source gives no duration.
export function seconds(iso:string|null|undefined){if(!iso)return null;const m=/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(String(iso));if(!m)return Number.isFinite(Number(iso))?Number(iso):null;const [,d,h,mi,s]=m;const total=(+(d||0))*86400+(+(h||0))*3600+(+(mi||0))*60+Math.round(+(s||0));return total>0?total:null}
export const lengthBands:Record<string,[number,number]>={short:[0,300],medium:[301,1200],long:[1201,Infinity]};

// Instagram, TikTok and Facebook links come out of the web index with no image.
// Instagram still serves a public poster for a shortcode, fetched through /api/thumb
// because the browser's own cross-origin load of it is refused. TikTok and Facebook
// expose nothing equivalent, so those rows fall back to the generated placeholder.
export function derivedThumbnail(url:string){
 try{
  const u=new URL(url),p=platformOf(url);
  if(p==='Instagram'){const m=/^\/(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,20})/.exec(u.pathname);return m?`/api/thumb?ig=${m[1]}`:''}
  if(p==='YouTube'){const id=youtubeId(url);return id?`https://i.ytimg.com/vi/${id}/hqdefault.jpg`:''}
 }catch{}
 return '';
}

// Deterministic placeholder so every row has artwork even with no remote image.
// Hue is derived from the URL, so the same video always gets the same tile.
export function posterSeed(v:{url:string;title:string}){
 let h=0;for(let i=0;i<v.url.length;i++)h=(h*31+v.url.charCodeAt(i))>>>0;
 const initials=(v.title.match(/[A-Za-z0-9]+/g)||['V']).slice(0,2).map(w=>w[0].toUpperCase()).join('');
 return {hue:h%360,initials};
}

// A topic search returns the same upload re-posted by aggregator channels and mirrored
// across platforms. Collapse them onto the best-evidenced copy and keep the rest as alternates.
const titleKey=(t:string)=>t.toLowerCase().replace(/[|\-–—#].*$/,'').replace(/\b(shorts?|reels?|official|hd|4k|full video|part \d+)\b/g,'').replace(/[^a-z0-9 ]/g,'').split(/\s+/).filter(w=>w.length>2).slice(0,8).join(' ');
export type Grouped=Video&{alternates?:Video[]};
export function dedupeVideos(videos:Video[]):Grouped[]{
 const groups=new Map<string,Video[]>();
 for(const v of videos){
  const key=titleKey(v.title);
  const bucket=key.split(' ').length>=3?key:'unique:'+v.url;
  groups.set(bucket,[...(groups.get(bucket)||[]),v]);
 }
 return [...groups.values()].map(group=>{
  if(group.length===1)return group[0];
  const ranked=[...group].sort((a,b)=>(b.views??-1)-(a.views??-1)||(b.thumbnail?1:0)-(a.thumbnail?1:0));
  return {...ranked[0],alternates:ranked.slice(1)};
 });
}
