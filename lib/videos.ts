export type Video = {language?:string|null;score?:number;metricNote?:string;evidenceUrl?:string;discovery?:string;observedAt?:string;id:string;title:string;url:string;thumbnail:string;platform:string;creator:string;views:number|null;likes:number|null;comments:number|null;published:string|null;duration:string|null;description:string};
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

export function filterVideos(videos:Video[],filters:{platform:string;date:string;metric:string;length?:string;language?:string},now=Date.now()) {
 return videos.filter(v=>{
 if(filters.platform!=='All platforms'&&v.platform!==filters.platform)return false;
 if(filters.metric!=='all'){const n=v[filters.metric as 'views'|'likes'|'comments'];if(typeof n!=='number'||!Number.isFinite(n))return false;}
 if(filters.length&&filters.length!=='all'){const s=seconds(v.duration);const band=lengthBands[filters.length];if(!band||s===null||s<band[0]||s>band[1])return false;}
 if(filters.language&&filters.language!=='all'&&languageOf(v)!==filters.language)return false;
 if(filters.date!=='all'){const time=v.published?Date.parse(v.published):NaN;const age=now-time;if(!Number.isFinite(time)||age<0||age>Number(filters.date)*86400000)return false;}
 return true;
 });
}

// ISO-8601 duration (PT4M13S) to seconds. Returns null when a source gives no duration.
export function seconds(value:string|null|undefined){
 if(!value)return null;
 const raw=String(value).trim();
 // Clock form from Brave's video index: mm:ss or hh:mm:ss.
 if(/^\d{1,3}(:[0-5]?\d){1,2}$/.test(raw)){
  const parts=raw.split(':').map(Number);
  const total=parts.reduce((sum,n)=>sum*60+n,0);
  return total>0?total:null;
 }
 const m=/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(raw);
 if(!m)return Number.isFinite(Number(raw))?Number(raw)||null:null;
 const [,d,h,mi,sec]=m;
 const total=(+(d||0))*86400+(+(h||0))*3600+(+(mi||0))*60+Math.round(+(sec||0));
 return total>0?total:null;
}
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
export function dedupeVideos(videos:Video[],sort='views:desc'):Grouped[]{
 const groups=new Map<string,Video[]>();
 for(const v of videos){
  const key=titleKey(v.title);
  const bucket=key.split(' ').length>=3?key:'unique:'+v.url;
  groups.set(bucket,[...(groups.get(bucket)||[]),v]);
 }
 // Keep the copy that best represents the group under the metric being sorted on.
 // Keeping the most-viewed copy regardless meant sorting by comments could show a
 // mirror with a handful of comments while hiding the copy that had thousands.
 const key=sort.split(':')[0];
 const rank=(v:Video)=>key==='published'?(v.published?Date.parse(v.published):-1)
  :key==='likes'?(v.likes??-1):key==='comments'?(v.comments??-1):(v.views??-1);
 return [...groups.values()].map(group=>{
  if(group.length===1)return group[0];
  const ranked=[...group].sort((a,b)=>rank(b)-rank(a)||(b.views??-1)-(a.views??-1)||(b.thumbnail?1:0)-(a.thumbnail?1:0));
  return {...ranked[0],alternates:ranked.slice(1)};
 });
}

// ── Language ──────────────────────────────────────────────────────────────
// Brave returns a language code on web results and YouTube reports the audio
// language, but the video index reports neither. Where no code is supplied the
// title's script is a reliable enough signal to be worth offering as a filter.
const SCRIPTS:[RegExp,string][]=[
 [/[\u0900-\u097F]/,'hi'],[/[\u0980-\u09FF]/,'bn'],[/[\u0A00-\u0A7F]/,'pa'],[/[\u0A80-\u0AFF]/,'gu'],
 [/[\u0B00-\u0B7F]/,'or'],[/[\u0B80-\u0BFF]/,'ta'],[/[\u0C00-\u0C7F]/,'te'],[/[\u0C80-\u0CFF]/,'kn'],
 [/[\u0D00-\u0D7F]/,'ml'],[/[\u0E00-\u0E7F]/,'th'],[/[\u0600-\u06FF]/,'ar'],[/[\u0590-\u05FF]/,'he'],
 [/[\u0400-\u04FF]/,'ru'],[/[\u0370-\u03FF]/,'el'],[/[\uAC00-\uD7AF]/,'ko'],
 [/[\u3040-\u30FF]/,'ja'],[/[\u4E00-\u9FFF]/,'zh'],
];
export const LANGUAGE_NAMES:Record<string,string>={
 en:'English',hi:'Hindi',bn:'Bengali',pa:'Punjabi',gu:'Gujarati',or:'Odia',ta:'Tamil',te:'Telugu',
 kn:'Kannada',ml:'Malayalam',mr:'Marathi',ur:'Urdu',th:'Thai',ar:'Arabic',he:'Hebrew',ru:'Russian',
 el:'Greek',ko:'Korean',ja:'Japanese',zh:'Chinese',es:'Spanish',pt:'Portuguese',fr:'French',
 de:'German',it:'Italian',nl:'Dutch',pl:'Polish',tr:'Turkish',id:'Indonesian',vi:'Vietnamese',
 fa:'Persian',uk:'Ukrainian',sv:'Swedish',da:'Danish',fi:'Finnish',no:'Norwegian',cs:'Czech',
 ro:'Romanian',hu:'Hungarian',ms:'Malay',tl:'Filipino',sw:'Swahili',
};
export function languageOf(v:{language?:string|null;title?:string;description?:string}){
 const tag=(v.language||'').trim().toLowerCase().split(/[-_]/)[0];
 if(tag && /^[a-z]{2}$/.test(tag)) return tag;
 const text=`${v.title||''} ${(v.description||'').slice(0,160)}`;
 for(const [re,code] of SCRIPTS) if(re.test(text)) return code;
 return null;
}
export function languageLabel(code:string){return LANGUAGE_NAMES[code]||code.toUpperCase()}
// Languages actually present in a result set, most common first, for the filter menu.
export function languagesIn(videos:Video[]){
 const counts=new Map<string,number>();
 for(const v of videos){const c=languageOf(v);if(c)counts.set(c,(counts.get(c)||0)+1)}
 return [...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
}
