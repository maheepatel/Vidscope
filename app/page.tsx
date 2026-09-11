'use client';
import {useState,useRef,useMemo,useEffect,useCallback} from 'react';
import {Search,ArrowUpRight,Play,Eye,Heart,MessageCircle,Globe2,SlidersHorizontal,ArrowRight,Layers3,Loader2,Info,X,Copy,HelpCircle,Languages} from 'lucide-react';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Skeleton} from '@/components/ui/skeleton';
import {Video,platforms,sortVideos,filterVideos,youtubeId,dedupeVideos,seconds,languagesIn,languageLabel,type Grouped} from '@/lib/videos';
import {canPlayInPage} from '@/lib/embed';
import {Player} from '@/components/player';
import type {Trust} from '@/lib/trust';
import cookieData from '@/data/cookies.json';
import type {SourceStatus} from '@/lib/discovery';
import {ThemeToggle} from '@/components/theme';
import {Thumb} from '@/components/poster';
import {Verdict,TrustChip,type Analysis} from '@/components/verdict';
import {Tour,tourWasSeen,type Step} from '@/components/tour';
const collection:Video[]=cookieData;
const fmt=(n:number|null)=>n===null?'—':new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(n);
const options=[['views:desc','Most viewed'],['views:asc','Least viewed'],['likes:desc','Most liked'],['likes:asc','Least liked'],['comments:desc','Most commented'],['comments:asc','Least commented'],['published:desc','Newest first'],['published:asc','Oldest first'],['relevance:desc','Relevance']];
const marks:Record<string,string>={YouTube:'▶',Instagram:'◎',TikTok:'♪',Facebook:'f',Reddit:'r',Dailymotion:'d',Vimeo:'v',Other:'↗'};
const lengths=[['all','Any length'],['short','Under 5 min'],['medium','5 – 20 min'],['long','Over 20 min']];
const TOUR:Step[]=[
 {target:'.searchbox',title:'One search, every platform',body:'Type a topic once. Vidscope queries YouTube, Instagram, TikTok, Facebook, Reddit, Vimeo and the wider web at the same time.'},
 {target:'.platforms',title:'Switch platform here',body:'Each tab filters the results you already have, and the number shows how many links that source returned. No re-search needed.'},
 {target:'.verdict',title:'The top picks are comment-verified',body:'Vidscope reads up to 100 comments per video, throws out bot and engagement-bait replies, and ranks what is left by how many viewers report the video actually worked.'},
 {target:'.filter-panel',title:'Narrow it down fast',body:'Filter by watch time, publication date and which statistics are available. Collapse reposts to hide the same upload mirrored across channels.'},
 {target:'.theme-toggle',title:'Light, dark or system',body:'Your choice is remembered on this device. System follows whatever your operating system is set to.'},
];
function Picker({value,onChange,items,label}:{value:string;onChange:(v:string)=>void;items:string[][];label:string}){return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="picker"><SelectValue/></SelectTrigger><SelectContent>{items.map(([v,t])=><SelectItem key={v} value={v}>{t}</SelectItem>)}</SelectContent></Select>}
function duration(v:string|null){const s=seconds(v);if(s===null)return null;const h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=s%60;return (h?[h,String(m).padStart(2,'0')]:[m]).concat(String(sec).padStart(2,'0')).join(':')}
// Analysis costs one YouTube quota unit per video, so spend it on what people will
// actually see: the most-watched results, plus a few engagement outliers so a small
// but unusually well-received video still gets a chance to rank.
function candidates(videos:Video[]){
 const yt=videos.map(v=>({v,id:youtubeId(v.url)})).filter((x):x is {v:Video;id:string}=>!!x.id);
 const watched=[...yt].sort((a,b)=>(b.v.views??-1)-(a.v.views??-1)).slice(0,8);
 const rest=yt.filter(x=>!watched.includes(x));
 const outliers=rest.sort((a,b)=>((b.v.comments??0)/Math.max(1,b.v.views??1))-((a.v.comments??0)/Math.max(1,a.v.views??1))).slice(0,4);
 return [...watched,...outliers].map(({v,id})=>({id,views:v.views,likes:v.likes,comments:v.comments,published:v.published}));
}
// Keeps a plain left click inside Vidscope while leaving ctrl/cmd/middle click to the
// browser, so the row is still an ordinary link for anyone who wants a new tab.
function openHere(run:()=>void){return (e:React.MouseEvent)=>{if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0)return;e.preventDefault();run()}}
export default function Home(){
const [input,setInput]=useState('cookies'),[query,setQuery]=useState(''),[videos,setVideos]=useState<Video[]>([]),[collected,setCollected]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[platform,setPlatform]=useState('All platforms'),[sort,setSort]=useState('views:desc'),[date,setDate]=useState('all'),[statsOnly,setStatsOnly]=useState('all'),[nextYoutube,setNextYoutube]=useState<string|null>(null),[elapsed,setElapsed]=useState(0),[fetched,setFetched]=useState(''),[sourceStates,setSourceStates]=useState<SourceStatus[]>([]);
const [length,setLength]=useState('all'),[language,setLanguage]=useState('all'),[playing,setPlaying]=useState<Video|null>(null),[collapse,setCollapse]=useState(true),[analysis,setAnalysis]=useState<Analysis>({state:'idle',results:[]}),[tour,setTour]=useState(false),[explain,setExplain]=useState(false);
const controller=useRef<AbortController|null>(null);const analyser=useRef<AbortController|null>(null);const retrievalSort=useRef('views:desc');
// Comment analysis is a second, parallel request so the list is never held back by it.
// Load-more keeps whatever has already been scored and only spends quota on the
// candidates that are new, so paging through results does not re-read the same comments.
const analyse=useCallback(async(found:Video[],keep:Trust[]=[])=>{
 analyser.current?.abort();
 const done=new Set(keep.map(t=>t.id));
 const wanted=candidates(found).filter(c=>!done.has(c.id));
 if(!wanted.length){
  if(keep.length)return;
  setAnalysis({state:'unsupported',results:[],message:'Comment analysis needs YouTube results; this search returned none.'});return;
 }
 const ac=new AbortController();analyser.current=ac;setAnalysis({state:'running',results:keep});
 try{const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({videos:wanted}),signal:ac.signal});
 const d=await r.json();if(ac.signal.aborted)return;
 const merged=[...keep,...(d.results||[])].sort((a,b)=>(a.verdict==='thin'?1:0)-(b.verdict==='thin'?1:0)||b.rank-a.rank);
 setAnalysis({state:d.state||'unavailable',results:merged,message:d.message,ms:d.ms,analysed:merged.length});
 }catch(e){if(!ac.signal.aborted)setAnalysis(prev=>keep.length?prev:{state:'error',results:[],message:'Comment analysis is unavailable right now.'})}
},[]);
function searchCollection(q=input){controller.current?.abort();analyser.current?.abort();setLoading(false);setError('');setCollected(true);setSourceStates([]);setFetched('');setAnalysis({state:'idle',results:[]});setInput(q);setQuery(q||'cookies');const words=q.toLowerCase().replace(/cookies/g,'cookie').split(/\s+/).filter(Boolean);setVideos(collection.filter(v=>words.every(w=>(v.title+' '+v.platform+' cookie').toLowerCase().replace(/cookies/g,'cookie').includes(w))));}
async function search(q=input,append=false,source=platform,window=date){q=q.trim();if(!q)return;controller.current?.abort();const ac=new AbortController();controller.current=ac;setLoading(true);setError('');const start=performance.now();if(!append){setStatsOnly('all');setLength('all');setLanguage('all');}const requested=append?sourceStates.filter(s=>s.next!==null&&(source==='All platforms'||s.source===source)).map(s=>s.source):source==='All platforms'?platforms:[source];const pages=Object.fromEntries(sourceStates.filter(s=>s.next!==null).map(s=>[s.source,s.next]));try{const r=await fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q,sort:append?retrievalSort.current:sort,sources:requested,pages:append?pages:{},youtubeToken:append?nextYoutube:null,freshness:window}),signal:ac.signal});const data=await r.json();if(!r.ok)throw new Error(data.error||'Search unavailable.');if(ac.signal.aborted)return;setCollected(false);const merged=[...new Map((append?[...videos,...data.videos]:data.videos).map((v:Video)=>[youtubeId(v.url)||v.url,v])).values()] as Video[];setVideos(merged);setSourceStates(prev=>append?[...new Map([...prev,...data.sources].map((s:SourceStatus)=>[s.source,s])).values()]:data.sources);setQuery(q);setInput(q);setNextYoutube(data.nextYoutube);setElapsed((performance.now()-start)/1000);setFetched(data.fetchedAt);if(!append)retrievalSort.current=sort;analyse(merged,append?analysis.results:[]);}catch(e){if(!ac.signal.aborted)setError(e instanceof Error?e.message:'Search failed.')}finally{if(!ac.signal.aborted)setLoading(false)}}
function chooseSource(p:string){setPlatform(p);}
const shown=useMemo(()=>{const filtered=filterVideos(videos,{platform,date,metric:statsOnly,length,language});return sortVideos(collapse?dedupeVideos(filtered,sort):filtered,sort) as Grouped[]},[videos,platform,sort,date,statsOnly,length,language,collapse]);
const trustById=useMemo(()=>new Map(analysis.results.map(t=>[t.id,t])),[analysis.results]);
const videoById=useMemo(()=>{const m=new Map<string,Video>();for(const v of videos){const id=youtubeId(v.url);if(id)m.set(id,v)}return m},[videos]);
const problems=sourceStates.filter(s=>s.state!=='ok');
const activeFilters=(date!=='all'?1:0)+(statsOnly!=='all'?1:0)+(platform!=='All platforms'?1:0)+(length!=='all'?1:0)+(language!=='all'?1:0);
const hidden=videos.length-filterVideos(videos,{platform,date,metric:statsOnly,length,language}).length;
// Instagram, TikTok and Facebook links reach us with no publication date, so any date
// filter silently removes them. Count them so a near-empty result reads as a coverage
// limit rather than a broken filter.
const undated=useMemo(()=>videos.filter(v=>!v.published).length,[videos]);
const languageOptions=useMemo(()=>[['all','Any language'],...languagesIn(videos).map(([code,n])=>[code,`${languageLabel(code)} (${n})`])],[videos]);
const playIndex=useMemo(()=>playing?shown.findIndex(v=>v.url===playing.url):-1,[playing,shown]);
const step=useCallback((delta:number)=>{setPlaying(current=>{
 if(!current)return current;
 const from=shown.findIndex(v=>v.url===current.url);
 if(from<0)return current;
 for(let i=from+delta;i>=0&&i<shown.length;i+=delta) if(canPlayInPage(shown[i]))return shown[i];
 return current;
})},[shown]);
const reposts=useMemo(()=>shown.reduce((n,v)=>n+(v.alternates?.length||0),0),[shown]);
// First-time visitors get the tour once results exist, so every step has something to point at.
useEffect(()=>{if(!tourWasSeen()&&videos.length&&!loading)setTour(true)},[videos.length,loading]);
return <div className="app-shell"><header className="topbar"><a className="brand" href="/" aria-label="Vidscope home"><span className="brand-icon"><Play size={19} fill="currentColor"/></span>vidscope<span className="beta">BETA</span></a><div className="header-right"><button className="tour-open" type="button" onClick={()=>setTour(true)}><HelpCircle size={15}/>Take the tour</button><span className="header-label">NO SIGNUP REQUIRED</span><ThemeToggle/></div></header>
<main><section className="search-area"><div className="search-heading"><div><p className="eyebrow">THE VIDEO INDEX</p><h1>Videos across<br/><span>the web.</span></h1></div><p className="intro">One place to explore videos.<br/>Compare the numbers. Go straight to the source.</p></div><form className="searchbox" onSubmit={e=>{e.preventDefault();search()}}><Search size={23}/><input aria-label="Search videos" maxLength={250} value={input} onChange={e=>setInput(e.target.value)} placeholder="Search any topic, creator, or idea…"/>{input&&<button type="button" className="clear" aria-label="Clear search" onClick={()=>setInput('')}><X size={17}/></button>}<button className="search-submit" disabled={loading||!input.trim()}>{loading?<Loader2 className="spin" size={18}/>:<>Search<ArrowRight size={18}/></>}</button></form><div className="suggestions"><span>Explore</span>{['Chocolate chip','Eggless','Decorating','Factory'].map(t=><button key={t} onClick={()=>{setInput(t);search(t+' cookies')}}>{t}<ArrowUpRight size={12}/></button>)}</div></section>
<section className="results"><div className="collection-switch"><button className="connect" onClick={()=>{setPlatform('All platforms');setDate('all');setStatsOnly('all');setLength('all');setLanguage('all');searchCollection('cookies')}}>Cookie collection · 60 links</button><button className="connect" disabled={loading} onClick={()=>search()}>Search the web<ArrowUpRight size={16}/></button></div>{collected&&<div className="notice"><Info size={17}/><p><strong>Collected cookie videos · 7 platforms.</strong> Two entries have indexed statistic snapshots; other counts are unavailable. Engagement does not establish accuracy. Playback is unverified.</p></div>}<div className="platforms"><button className={platform==='All platforms'?'active':''} onClick={()=>chooseSource('All platforms')}><Layers3 size={17}/>All platforms<span>{videos.length}</span></button>{platforms.map(p=><button key={p} className={platform===p?'active':''} onClick={()=>chooseSource(p)}><b className={'platform-icon '+p.toLowerCase()}>{marks[p]}</b>{p}{videos.some(v=>v.platform===p)&&<span>{videos.filter(v=>v.platform===p).length}</span>}</button>)}</div>
{error&&<div className="error" role="alert">{error}</div>}
{problems.length>0&&<div className="source-strip" aria-live="polite"><b>{problems.length} source{problems.length>1?'s':''} unavailable:</b>{problems.map(s=><span key={s.source}>{s.source} — {s.state==='not_configured'?'not connected':'temporarily unavailable'}{s.state==='unavailable'&&<> · <button onClick={()=>search(query,false,s.source)}>retry</button></>}</span>)}</div>}
<Verdict analysis={analysis} byId={videoById} onExplain={()=>setExplain(true)} onPlay={setPlaying}/>
<div className="result-toolbar"><div><h2>{query?<>Videos for <span>“{query}”</span></>:'Search public videos'}</h2><p aria-live="polite">{shown.length} video links{fetched&&` · ${elapsed.toFixed(2)} seconds`}</p></div><div className="tools"><span className="sort-label">Sort by</span><Picker value={sort} onChange={setSort} items={options} label="Sort videos"/></div></div>
<div className="filter-panel"><div className="filter-caption"><SlidersHorizontal size={17}/>Refine results{activeFilters>0&&<b>{activeFilters}</b>}</div><label>Length<Picker label="Video length" value={length} onChange={setLength} items={lengths}/></label><label><Languages size={14}/>Language<Picker label="Spoken language" value={language} onChange={setLanguage} items={languageOptions as string[][]}/></label><label>Published<Picker label="Publication date" value={date} onChange={v=>{setDate(v);if(query&&!collected)search(query,false,platform,v)}} items={[["all","Any time"],["7","Last 7 days"],["30","Last 30 days"],["365","Last year"]]}/></label><label>Metrics<Picker label="Available metrics" value={statsOnly} onChange={setStatsOnly} items={[["all","Any availability"],["views","Has view count"],["likes","Has like count"],["comments","Has comment count"]]}/></label><button type="button" className="toggle-pill" aria-pressed={collapse} onClick={()=>setCollapse(c=>!c)}><Copy size={15}/>Collapse reposts</button><button disabled={!activeFilters} onClick={()=>{const had=date!=='all';setDate('all');setStatsOnly('all');setLength('all');setLanguage('all');chooseSource('All platforms');if(had&&query&&!collected)search(query,false,'All platforms','all')}}>Reset filters</button></div>
<div className="ranking-note">{collected?'Collection snapshots · Not live counts · Missing metrics stay last.':date!=='all'&&undated>0?`${undated} of these links carry no publication date, so a date filter excludes them.`:'Sorted within retrieved results · Missing metrics stay last.'}<span>{shown.length} / {videos.length} shown{hidden>0?` · ${hidden} filtered out`:''}{reposts>0?` · ${reposts} reposts collapsed`:''}</span></div>
{loading?<div className="video-list" aria-label="Loading videos" role="status">{[1,2,3].map(i=><div className="loading-row" key={i}><Skeleton className="loading-thumb"/><div><Skeleton className="h-6 w-4/5 mb-4"/><Skeleton className="h-4 w-1/2"/></div></div>)}</div>:shown.length?<div className="video-list">{shown.map((v,i)=>{const id=youtubeId(v.url);const trust=id?trustById.get(id):undefined;return <article className="video-row" key={v.url}><span className="row-number">{String(i+1).padStart(2,'0')}</span><Thumb video={v} eager={i<3} onPlay={canPlayInPage(v)?()=>setPlaying(v):undefined}>{duration(v.duration)&&<span className="duration">{duration(v.duration)}</span>}{canPlayInPage(v)&&<span className="play-badge">Play here</span>}</Thumb><div className="row-info"><div className="row-source"><span className={'source-label '+v.platform.toLowerCase()}><b>{marks[v.platform]}</b>{v.platform}</span><span>{v.published?new Date(v.published).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'}):'Date unavailable'}</span></div><a className="video-title" href={v.url} target="_blank" rel="noopener noreferrer" onClick={canPlayInPage(v)?openHere(()=>setPlaying(v)):undefined}>{v.title}{canPlayInPage(v)?<Play size={16} fill="currentColor"/>:<ArrowUpRight size={20}/>}</a><p className="creator">{v.creator}</p>{v.metricNote&&<p className="snapshot-note">{v.observedAt} · {v.metricNote}</p>}<div className="row-trust">{trust&&<TrustChip trust={trust}/>}{v.alternates?.length?<span className="alt-count">+{v.alternates.length} repost{v.alternates.length>1?'s':''}</span>:null}<button className="details-link" onClick={()=>setPlaying(v)}>Details and playback <Info size={13}/></button></div></div><div className="row-metrics">{[[Eye,v.views,'Views'],[Heart,v.likes,'Likes'],[MessageCircle,v.comments,'Comments']].map(([Icon,n,label]:any)=><div className={'metric '+(sort.startsWith(label.toLowerCase()+':')?'sorted-metric':'')} key={label} title={n===null?`${label}: unavailable`:`${Number(n).toLocaleString()} ${label}`}><span><Icon size={14}/>{v.platform==='Reddit'&&label==='Comments'?'Post comments':label}</span><strong className={n===null?'unknown':''}>{n===null?'—':`${v.metricNote&&(label==='Views'||label==='Comments')?'≈ ':''}${fmt(n)}`}</strong>{n===null&&<small>Unavailable</small>}</div>)}</div></article>})}</div>:<div className="empty"><Search size={32}/><h3>{query?'No matching videos in this result set':'What do you want to learn?'}</h3><p>{query?'Try another topic or source. Source availability is shown above.':'Enter a topic to search YouTube, Instagram, Facebook, TikTok, Reddit and other sites.'}</p><button className="connect" onClick={()=>{chooseSource('All platforms');setDate('all');setStatsOnly('all');setLength('all');setLanguage('all')}}>Reset filters</button></div>}
{!loading&&sourceStates.some(s=>s.next!==null&&(platform==='All platforms'||s.source===platform))&&<div className="load-more"><button className="connect" onClick={()=>search(query,true)}>Load more videos<ArrowRight size={16}/></button></div>}
<footer><span><Globe2 size={15}/>More sources. More perspectives.</span><span>{fetched?`Retrieved ${new Date(fetched).toLocaleTimeString()}`:collected?'Collection assembled 8 Sep 2026':'Public video discovery'} · Coverage and metrics vary by source.</span></footer></section></main>
<Dialog open={explain} onOpenChange={setExplain}><DialogContent className="detail-dialog"><DialogTitle>How the trust score works</DialogTitle><DialogDescription>Deterministic scoring over public YouTube comments. No model, no guesswork.</DialogDescription>
<p className="description"><strong>1 · Discard the noise.</strong> Timestamp-only replies, “who’s watching in 2026”, sub-for-sub, channel promo, links and anything under three words are removed before scoring. Near-duplicate comment text is counted as a bot signal.</p>
<p className="description"><strong>2 · Find reported outcomes.</strong> The strongest evidence a video helped is a viewer saying so specifically — “I followed this and it worked”, “finally understood”, “fixed my…”. These carry 34% of the score. Generic praise is counted at less than half the weight.</p>
<p className="description"><strong>3 · Weight by likes.</strong> Each comment is weighted by log10 of its like count, so a comment thousands of people agreed with outweighs a lone reply without letting one comment dominate.</p>
<p className="description"><strong>4 · Penalise the warning signs.</strong> Recurring complaints, unanswered questions, duplicated comment text, a like rate far below the roughly 4% YouTube norm for the view count, and videos over five years old all reduce the score.</p>
<p className="description"><strong>5 · Damp by sample size.</strong> Ranking multiplies the score by a confidence factor from the number of substantive comments, so a video with four comments cannot outrank one with two hundred.</p>
<p className="description">Comment data is available for YouTube only. Other platforms do not expose comments through a public API, so their results are listed but not scored.</p>
</DialogContent></Dialog>
<Player video={playing} trust={playing?trustById.get(youtubeId(playing.url)||''):undefined} onClose={()=>setPlaying(null)} position={playIndex>=0?{index:playIndex,total:shown.length}:undefined} onStep={playIndex>=0?step:undefined}/>
<Tour steps={TOUR} open={tour} onClose={()=>setTour(false)}/>
</div>}
