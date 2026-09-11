import {type Video, platformOf, youtubeId, seconds} from './videos';

// Each platform's own published embed endpoint. Nothing here bypasses a restriction:
// where a video's owner has disabled embedding, the provider's player says so inside
// the frame and the modal keeps its link out to the source.
export type Embed = {src:string; ratio:'landscape'|'portrait'; provider:string; allow:string};

const PLAYER_ALLOW='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';

// Shorts and reels are 9:16. Anything else is played in a 16:9 frame, so a landscape
// video fills the modal instead of sitting in a letterboxed portrait box.
export function isVertical(v:Video){
 const p=v.platform;
 if(p==='TikTok')return true;
 if(p==='Instagram')return /\/reels?\//.test(v.url);
 if(p==='Facebook')return /\/reel\//.test(v.url);
 if(p==='YouTube'){
  if(/#shorts?\b/i.test(v.title))return true;
  // The Data API exposes no Shorts flag, and canonicalising /shorts/ID to watch?v=ID
  // loses the only other hint. A duration inside the Shorts limit is the reliable
  // proxy: a landscape clip this short is rare, and mis-framing one costs only side bars.
  const d=seconds(v.duration);
  return d!==null&&d<=60;
 }
 return false;
}

export function embedFor(v:Video):Embed|null {
 const ratio:Embed['ratio']=isVertical(v)?'portrait':'landscape';
 let u:URL;
 try{u=new URL(v.url)}catch{return null}
 const path=u.pathname;

 switch(platformOf(v.url)){
  case 'YouTube':{
   const id=youtubeId(v.url);
   if(!id)return null;
   // youtube-nocookie keeps the player from writing tracking cookies before playback.
   return {src:`https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`,ratio,provider:'YouTube',allow:PLAYER_ALLOW};
  }
  case 'Vimeo':{
   const id=/^\/(?:video\/)?(\d+)/.exec(path)?.[1];
   return id?{src:`https://player.vimeo.com/video/${id}`,ratio,provider:'Vimeo',allow:PLAYER_ALLOW}:null;
  }
  case 'Dailymotion':{
   const id=/^\/video\/([A-Za-z0-9]+)/.exec(path)?.[1];
   return id?{src:`https://geo.dailymotion.com/player.html?video=${id}`,ratio,provider:'Dailymotion',allow:PLAYER_ALLOW}:null;
  }
  case 'TikTok':{
   const id=/\/video\/(\d+)/.exec(path)?.[1];
   return id?{src:`https://www.tiktok.com/embed/v2/${id}`,ratio:'portrait',provider:'TikTok',allow:PLAYER_ALLOW}:null;
  }
  case 'Instagram':{
   const code=/^\/(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,20})/.exec(path)?.[1];
   return code?{src:`https://www.instagram.com/p/${code}/embed/captioned/`,ratio,provider:'Instagram',allow:PLAYER_ALLOW}:null;
  }

  case 'Facebook':
   return {src:`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(v.url)}&show_text=false`,ratio,provider:'Facebook',allow:PLAYER_ALLOW};
  case 'Reddit':
   return {src:`https://www.redditmedia.com${path}?embed=true&ref_source=embed&depth=1`,ratio,provider:'Reddit',allow:PLAYER_ALLOW};
  default:
   return null;
 }
}

// Platforms whose player reliably renders inside another site. The rest keep the
// external link so a viewer is never left staring at an empty frame.
// Verified by loading each one in a real browser and watching for a framing refusal.
// Instagram is included on that evidence: it answers a plain curl with
// X-Frame-Options: DENY but serves and renders normally to a browser request, so a
// header check alone gives the wrong answer here. TikTok publishes this embed endpoint
// but is unreachable from the build network, so it is included untested.
export const EMBEDDABLE=new Set(['YouTube','Vimeo','Dailymotion','TikTok','Instagram','Facebook','Reddit']);
export const canPlayInPage=(v:Video)=>EMBEDDABLE.has(v.platform)&&embedFor(v)!==null;
