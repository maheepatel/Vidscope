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

export function filterVideos(videos:Video[],filters:{platform:string;date:string;metric:string},now=Date.now()) {
 return videos.filter(v=>{
 if(filters.platform!=='All platforms'&&v.platform!==filters.platform)return false;
 if(filters.metric!=='all'){const n=v[filters.metric as 'views'|'likes'|'comments'];if(typeof n!=='number'||!Number.isFinite(n))return false;}
 if(filters.date!=='all'){const time=v.published?Date.parse(v.published):NaN;const age=now-time;if(!Number.isFinite(time)||age<0||age>Number(filters.date)*86400000)return false;}
 return true;
 });
}
