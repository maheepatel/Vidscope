// Comment-verified trust scoring. Pure functions: no network, no clock beyond the
// `now` argument, so the whole model is unit-testable and runs in single-digit ms.

export type RawComment = {text:string;likes:number;replies:number;published:string|null;author:string|null};
export type CommentKind = 'outcome'|'complaint'|'question'|'praise'|'neutral'|'noise';
export type Evidence = {text:string;author:string|null;likes:number;kind:CommentKind};
export type TrustParts = {outcome:number;sentiment:number;authenticity:number;engagement:number;depth:number;clean:number};
export type Trust = {
 id:string;score:number;rank:number;confidence:number;sample:number;
 parts:TrustParts;flags:string[];evidence:Evidence[];
 counts:{outcome:number;complaint:number;question:number;praise:number;noise:number};
 verdict:'verified'|'promising'|'mixed'|'thin'|'caution';
};

// A viewer telling you the thing actually worked for them. The strongest available
// proof that a video helped, and much rarer than generic praise.
const OUTCOME=[
 /\b(i|we)\s+(just\s+)?(made|tried|used|followed|did|built|cooked|baked|applied)\s+(this|these|it|them|your)\b/,
 /\b(it|this|they|these)\s+(all\s+)?(worked|works|turned out|came out)\b/,
 /\bworked\s+(perfectly|great|like a charm|first try|flawlessly|for me)\b/,
 /\b(turned|came)\s+out\s+(great|perfect|amazing|delicious|so good|really well|beautifully)\b/,
 /\bfinally\s+(understood|understand|got it|makes sense|works|fixed|figured)\b/,
 /\b(fixed|solved|saved)\s+(my|me|our|hours|so much)\b/,
 /\b(best|clearest|only)\s+(recipe|tutorial|explanation|guide|video|walkthrough)\b.{0,30}\b(i|that)\b/,
 /\bthis\s+(is\s+)?(the\s+)?(one|it)\b.{0,20}\b(works|worked)\b/,
 /\b(after|been)\s+(watching|trying)\s+\w+\s+(videos|tutorials)\b/,
 /\bexactly what i (was looking for|needed)\b/,
 /\b(followed|following)\s+(this|your|these)\s+(steps?|recipe|tutorial|instructions?|guide)\b/,
];
// Viewers saying it wasted their time or did not deliver.
const COMPLAINT=[
 /\b(did|does|do|would|will)\s*(n'?t|not|nt)\s+(work|help|explain|show)\b/,
 /\bwaste of (time|my time)\b/, /\bclick\s?bait\b/, /\bmisleading\b/, /\bfake\s+(recipe|video|views|comments?|reactions?|reviews?)\b/,
 /\b(too much|so much|stop) (talking|rambling|intro)\b/, /\bget to the (point|recipe)\b/,
 /\b(where'?s|wheres|where is) the (recipe|code|link|part)\b/,
 /\b(out\s?dated|no longer works|not working anymore|deprecated)\b/,
 /\b(wrong|incorrect|bad) (recipe|advice|information|measurements?|method)\b/,
 /\b(ruined|burnt|failed|disaster|inedible)\b/,
 /\b(nothing|no) (new|useful|helpful) (here|in this)\b/,
 /\bskip to \d/, /\bdislik(e|ed)\s+(this|it|the video)\b/,
];
const PRAISE=[/\b(nice|great|good|amazing|awesome|love|lovely|beautiful|perfect|excellent|wonderful|yummy|delicious|fire|goat|banger)\b/,/\bthank(s| you)\b/,/\b(sub|subscribed|liked)\b/];
const NEGATIVE=[/\b(bad|awful|terrible|horrible|worst|hate|boring|annoying|cringe|trash|garbage|useless|stupid)\b/];
// Engagement bait and channel promo. High volume on big videos, zero information.
const NOISE=[
 /^\s*\d{1,2}:\d{2}/, /\bwho'?s?\s+(still\s+)?(watching|here)\b/, /\b(in|anyone)\s+20\d\d\b/,
 /\b(first|early|notification squad|who else)\b/, /\bsub\s*(4|for|to)\s*sub\b/,
 /\bcheck (out )?my (channel|page|profile|video)\b/, /\blike if\b/, /\bpin (this|me)\b/,
 /https?:\/\//, /\bwhatsapp\b/, /\btelegram\b/, /\bdm me\b/, /\bpromo\s?code\b/,
];

const EMOJI=/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;
const strip=(s:string)=>s.replace(EMOJI,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const words=(s:string)=>s.split(/\s+/).filter(w=>/[a-z0-9]/i.test(w));
const hit=(list:RegExp[],s:string)=>list.some(r=>r.test(s));
// Log damping: a 10k-like comment should outweigh a 0-like one by ~5x, not 10000x.
const weigh=(likes:number,replies:number)=>1+Math.log10(1+Math.max(0,likes))+Math.min(0.5,replies/20);
// Normalised shingle used to spot templated / copy-pasted comment floods.
const shingle=(s:string)=>words(s.toLowerCase()).slice(0,9).join(' ');

export function classify(text:string):CommentKind{
 const clean=strip(text),low=clean.toLowerCase(),n=words(clean).length;
 if(!n||n<3||hit(NOISE,low))return 'noise';
 if(hit(COMPLAINT,low))return 'complaint';
 if(hit(OUTCOME,low))return 'outcome';
 if(/\?/.test(clean)&&/\b(how|why|what|which|can i|does (it|anyone)|is it|any(one|body))\b/.test(low))return 'question';
 if(hit(PRAISE,low)&&!hit(NEGATIVE,low))return 'praise';
 return 'neutral';
}

// Curve a rate so realistic values spread across the range instead of hugging zero.
// Outcome comments are rare: 12% of signal comments is already an excellent video.
const curve=(x:number,mid:number)=>x<=0?0:x/(x+mid);
const clamp=(x:number)=>Math.max(0,Math.min(1,x));

export function scoreVideo(
 id:string,
 stats:{views:number|null;likes:number|null;comments:number|null;published:string|null},
 raw:RawComment[],
 now=Date.now(),
):Trust{
 const seen=new Map<string,number>(),authors=new Set<string>();
 let dupes=0;
 const items=raw.map(c=>{
  const kind=classify(c.text),key=shingle(c.text),n=(seen.get(key)||0)+1;
  seen.set(key,n);if(n>1&&key)dupes++;
  if(c.author)authors.add(c.author);
  return {...c,kind,weight:weigh(c.likes,c.replies),length:words(strip(c.text)).length,clean:strip(c.text)};
 });
 const signal=items.filter(i=>i.kind!=='noise');
 const total=(f:(i:typeof items[number])=>boolean)=>signal.filter(f).reduce((s,i)=>s+i.weight,0);
 const base=signal.reduce((s,i)=>s+i.weight,0)||1;

 const outcomeW=total(i=>i.kind==='outcome');
 const complaintW=total(i=>i.kind==='complaint');
 const praiseW=total(i=>i.kind==='praise');
 const questionW=total(i=>i.kind==='question');
 const negW=signal.filter(i=>hit(NEGATIVE,i.clean.toLowerCase())).reduce((s,i)=>s+i.weight,0);

 // 1. Did viewers report a real outcome? Weighted, rate-based, not raw volume.
 const outcome=curve(outcomeW/base,0.10);
 // 2. Net sentiment, with generic praise discounted so emoji floods cannot carry a video.
 const sentiment=clamp(0.5+((praiseW*0.45+outcomeW)-(complaintW+negW*0.7))/(base*1.4));
 // 3. Authenticity: duplicated text and few distinct authors both indicate manufactured comments.
 const dupShare=raw.length?dupes/raw.length:0;
 const authorShare=raw.length?authors.size/raw.length:1;
 const noiseShare=raw.length?items.filter(i=>i.kind==='noise').length/raw.length:0;
 const authenticity=clamp(1-dupShare*1.2-Math.max(0,0.9-authorShare)*0.8-Math.max(0,noiseShare-0.45)*0.8);
 // 4. Engagement sanity against YouTube norms (~4% like rate, ~0.4% comment rate).
 // Rewards reaching the norm; never rewards exceeding it, so tiny videos cannot game rank.
 const v=stats.views??0;
 const likeRate=v>500&&stats.likes!==null?stats.likes/v:null;
 const cmtRate=v>500&&stats.comments!==null?stats.comments/v:null;
 const engagement=likeRate===null?0.5:clamp(Math.min(1,likeRate/0.04)*0.65+Math.min(1,(cmtRate??0)/0.004)*0.35);
 // 5. Depth: substantive comments beat one-word reactions.
 const depth=signal.length?curve(signal.filter(i=>i.length>=12).length/signal.length,0.45):0;
 // 6. Unanswered-question drag: lots of questions means the video left gaps.
 const clean=clamp(1-curve(complaintW/base,0.12)-curve(questionW/base,0.30)*0.4);

 const parts:TrustParts={outcome,sentiment,authenticity,engagement,depth,clean};
 // Authenticity and complaint-freedom are "nothing is wrong" signals rather than
 // merit. Added in, they gave every ordinary video a ~35 point floor and squashed
 // the usable range, so they scale the merit score instead of topping it up.
 const merit=outcome*0.52+sentiment*0.24+engagement*0.14+depth*0.10;
 const integrity=0.35+0.65*(authenticity*0.55+clean*0.45);
 let score=100*merit*integrity;

 const flags:string[]=[];
 const ageDays=stats.published?(now-Date.parse(stats.published))/86400000:null;
 if(ageDays!==null&&ageDays>1825){score-=6;flags.push('Over 5 years old');}
 if(dupShare>0.15)flags.push('Repeated comment text');
 if(noiseShare>0.6)flags.push('Mostly low-effort comments');
 if(likeRate!==null&&likeRate<0.009&&v>500000)flags.push('Low like rate for its view count');
 if(complaintW/base>0.18)flags.push('Recurring complaints');
 if(questionW/base>0.30)flags.push('Many unanswered questions');

 const sample=signal.length;
 const confidence=clamp(sample/40);
 // Rank damps by confidence so a 4-comment video cannot outrank a well-evidenced one.
 const rank=Math.max(0,score)*(0.55+0.45*confidence);

 const evidence=items
  .filter(i=>i.kind==='outcome'||i.kind==='complaint')
  .sort((a,b)=>(a.kind===b.kind?0:a.kind==='outcome'?-1:1)||b.weight-a.weight)
  .slice(0,3)
  .map(i=>({text:i.clean.length>170?i.clean.slice(0,167)+'…':i.clean,author:i.author,likes:i.likes,kind:i.kind}));

 const counts={
  outcome:signal.filter(i=>i.kind==='outcome').length,
  complaint:signal.filter(i=>i.kind==='complaint').length,
  question:signal.filter(i=>i.kind==='question').length,
  praise:signal.filter(i=>i.kind==='praise').length,
  noise:items.filter(i=>i.kind==='noise').length,
 };
 const verdict:Trust['verdict']=
  sample<8?'thin':
  complaintW/base>0.22?'caution':
  score>=55&&counts.outcome>=3?'verified':
  score>=38?'promising':'mixed';

 return {id,score:Math.round(Math.max(0,Math.min(100,score))),rank,confidence,sample,parts,flags,evidence,counts,verdict};
}

export const VERDICT_LABEL:Record<Trust['verdict'],string>={
 verified:'Verified helpful',promising:'Promising',mixed:'Mixed reception',
 thin:'Too few comments',caution:'Complaints reported',
};
