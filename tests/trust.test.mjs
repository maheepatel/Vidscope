import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
const dir=mkdtempSync(join(tmpdir(),'vidscope-trust-'));
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
try{
writeFileSync(join(dir,'trust.mjs'),compile(readFileSync('lib/trust.ts','utf8')));
writeFileSync(join(dir,'videos.mjs'),compile(readFileSync('lib/videos.ts','utf8')));
writeFileSync(join(dir,'embed.mjs'),compile(readFileSync('lib/embed.ts','utf8').replace("from './videos'","from './videos.mjs'")));
const {classify,scoreVideo}=await import(pathToFileURL(join(dir,'trust.mjs')));
const {seconds,dedupeVideos,derivedThumbnail,posterSeed,filterVideos,languageOf,languageLabel,languagesIn}=await import(pathToFileURL(join(dir,'videos.mjs')));
const {embedFor,canPlayInPage,isVertical}=await import(pathToFileURL(join(dir,'embed.mjs')));

// --- comment classification -------------------------------------------------
assert.equal(classify('I made this yesterday and it turned out amazing'),'outcome');
assert.equal(classify('Followed this recipe exactly, worked perfectly'),'outcome');
assert.equal(classify('finally understood after watching ten other tutorials'),'outcome');
assert.equal(classify('This did not work at all, waste of time'),'complaint');
assert.equal(classify('outdated, no longer works in the new version'),'complaint');
assert.equal(classify('Who is watching in 2026'),'noise');
assert.equal(classify('first'),'noise');
assert.equal(classify('🔥🔥🔥'),'noise');
assert.equal(classify('2:14 the good part'),'noise');
assert.equal(classify('check out my channel for more'),'noise');
assert.equal(classify('sub4sub anyone'),'noise');
assert.equal(classify('Great video, thanks!'),'praise');
assert.equal(classify('How long do I bake these for?'),'question');
// A complaint that also contains praise words is still a complaint.
assert.equal(classify('Nice video but it did not work for me'),'complaint');

const stats={views:1_000_000,likes:45_000,comments:4_000,published:'2025-01-01T00:00:00Z'};
const now=Date.parse('2026-09-11T00:00:00Z');
const many=(text,n,likes=5)=>Array.from({length:n},(_,i)=>({text:text+' '+i,likes,replies:0,published:null,author:'a'+i}));

// --- a genuinely helpful video outranks a generically praised one ------------
const helpful=scoreVideo('aaaaaaaaaaa',stats,[
 ...many('I followed this and it worked perfectly, so much detail here about every step',18,900),
 ...many('This is the clearest explanation I have found anywhere on the internet so far',10,300),
 ...many('Great video',20,2),
],now);
const shallow=scoreVideo('bbbbbbbbbbb',stats,[
 ...many('Nice',30,2),...many('🔥 amazing',18,1),...many('Who is watching in 2026',12,1),
],now);
assert.ok(helpful.score>shallow.score,`helpful ${helpful.score} should beat shallow ${shallow.score}`);
assert.equal(helpful.verdict,'verified');
assert.ok(helpful.counts.outcome>=20,'outcome comments counted');
assert.ok(shallow.counts.noise>=12,'engagement bait discarded');

// --- complaints pull a video down and raise a flag ---------------------------
const bad=scoreVideo('ccccccccccc',stats,[
 ...many('This did not work, the measurements are wrong and it ruined my batch',25,400),
 ...many('I made this and it turned out great',4,10),
 ...many('waste of time, clickbait title',10,120),
],now);
assert.equal(bad.verdict,'caution');
assert.ok(bad.score<helpful.score);
assert.ok(bad.flags.includes('Recurring complaints'),JSON.stringify(bad.flags));

// --- identical comment text is treated as manufactured -----------------------
const botted=scoreVideo('ddddddddddd',stats,
 Array.from({length:60},(_,i)=>({text:'I tried this and it worked perfectly thank you',likes:40,replies:0,published:null,author:'bot'+i})),now);
assert.ok(botted.flags.includes('Repeated comment text'),JSON.stringify(botted.flags));
assert.ok(botted.parts.authenticity<0.5,'duplicate text lowers authenticity');
assert.ok(botted.score<helpful.score,'a copy-pasted comment flood cannot beat real ones');

// --- thin evidence is damped, not promoted -----------------------------------
const thin=scoreVideo('eeeeeeeeeee',stats,many('I made this and it worked perfectly every time',3,50),now);
assert.equal(thin.verdict,'thin');
assert.ok(thin.rank<helpful.rank,'low sample size cannot outrank a well-evidenced video');
assert.ok(thin.confidence<0.2);

// --- like weighting is damped, not linear ------------------------------------
const oneHuge=scoreVideo('fffffffffff',stats,[
 {text:'I made this and it worked perfectly',likes:900000,replies:0,published:null,author:'x'},
 ...many('This did not work for me at all',20,300),
],now);
assert.equal(oneHuge.verdict,'caution','one massively liked comment cannot outvote twenty complaints');

// --- suspicious engagement ratio is flagged ----------------------------------
const bought=scoreVideo('ggggggggggg',{views:5_000_000,likes:9_000,comments:400,published:'2025-01-01T00:00:00Z'},
 many('I followed this and it worked',30,20),now);
assert.ok(bought.flags.includes('Low like rate for its view count'),JSON.stringify(bought.flags));

// --- age penalty --------------------------------------------------------------
const old=scoreVideo('hhhhhhhhhhh',{...stats,published:'2015-01-01T00:00:00Z'},
 many('I followed this and it worked perfectly with lots of useful detail',30,200),now);
const fresh=scoreVideo('iiiiiiiiiii',stats,
 many('I followed this and it worked perfectly with lots of useful detail',30,200),now);
assert.ok(old.score<fresh.score);
assert.ok(old.flags.includes('Over 5 years old'));

// --- evidence quoting ---------------------------------------------------------
assert.ok(helpful.evidence.length>0&&helpful.evidence[0].kind==='outcome');
assert.ok(helpful.evidence.every(e=>e.text.length<=170));
// Scores stay inside the advertised range whatever the input.
for(const t of [helpful,shallow,bad,botted,thin,oneHuge,bought,old,fresh])
 assert.ok(t.score>=0&&t.score<=100,'score out of range: '+t.score);
assert.deepEqual(scoreVideo('jjjjjjjjjjj',stats,[],now).evidence,[]);

// --- duration parsing ----------------------------------------------------------
assert.equal(seconds('PT4M13S'),253);
assert.equal(seconds('PT1H2M3S'),3723);
assert.equal(seconds('PT45S'),45);
assert.equal(seconds(null),null);
assert.equal(seconds('PT0S'),null);

// --- length filter uses the parsed duration ------------------------------------
const clips=[{platform:'YouTube',duration:'PT3M',views:1},{platform:'YouTube',duration:'PT30M',views:1},{platform:'Vimeo',duration:null,views:1}];
const band=f=>filterVideos(clips,{platform:'All platforms',date:'all',metric:'all',length:f}).length;
assert.equal(band('short'),1);
assert.equal(band('long'),1);
assert.equal(band('all'),3,'videos with no duration survive the default');
assert.equal(band('medium'),0);

// --- thumbnail recovery ---------------------------------------------------------
assert.equal(derivedThumbnail('https://www.instagram.com/reel/DMOaUaoyT8x/'),'/api/thumb?ig=DMOaUaoyT8x');
assert.equal(derivedThumbnail('https://www.instagram.com/p/DMOaUaoyT8x/'),'/api/thumb?ig=DMOaUaoyT8x');
assert.equal(derivedThumbnail('https://www.youtube.com/watch?v=rEdl2Uetpvo'),'https://i.ytimg.com/vi/rEdl2Uetpvo/hqdefault.jpg');
assert.equal(derivedThumbnail('https://www.tiktok.com/@baker/video/123'),'');
assert.equal(derivedThumbnail('not a url'),'');
// The generated placeholder is stable for a given URL and never empty.
const seed=posterSeed({url:'https://vimeo.com/1',title:'Chocolate Cake Recipe'});
assert.deepEqual(seed,posterSeed({url:'https://vimeo.com/1',title:'Chocolate Cake Recipe'}));
assert.equal(seed.initials,'CC');
assert.ok(seed.hue>=0&&seed.hue<360);
assert.equal(posterSeed({url:'https://x.test/a',title:'!!!'}).initials,'V');

// --- repost collapse ------------------------------------------------------------
const dupes=[
 {url:'https://youtube.com/watch?v=1',title:'The Best Chewy Chocolate Chip Cookies',views:900,thumbnail:'t',platform:'YouTube'},
 {url:'https://youtube.com/watch?v=2',title:'The Best Chewy Chocolate Chip Cookies | HD',views:12,thumbnail:'',platform:'YouTube'},
 {url:'https://vimeo.com/3',title:'the best chewy chocolate chip cookies (Official)',views:null,thumbnail:'',platform:'Vimeo'},
 {url:'https://youtube.com/watch?v=4',title:'Sourdough Starter From Scratch',views:5,thumbnail:'',platform:'YouTube'},
];
const collapsed=dedupeVideos(dupes);
assert.equal(collapsed.length,2,'three mirrors of one upload collapse to a single row');
const kept=collapsed.find(v=>v.alternates);
assert.equal(kept.url,'https://youtube.com/watch?v=1','the most-watched copy is kept');
assert.equal(kept.alternates.length,2);
// Short titles must not be collapsed together just because they are short.
assert.equal(dedupeVideos([{url:'a',title:'Cake',views:1},{url:'b',title:'Bread',views:1}]).length,2);


// --- duration: Brave clock form as well as YouTube ISO --------------------------
assert.equal(seconds('00:36'),36);
assert.equal(seconds('4:13'),253);
assert.equal(seconds('1:02:03'),3723);
assert.equal(seconds('00:00'),null);
assert.equal(seconds('not a duration'),null);

// --- language detection ----------------------------------------------------------
assert.equal(languageOf({language:'es-419',title:'Los mejores chocolates'}),'es');
assert.equal(languageOf({language:'en-US',title:'Best cookies'}),'en');
// No tag supplied: fall back to the script the title is written in.
assert.equal(languageOf({title:'सबसे आसान रेसिपी'}),'hi');
assert.equal(languageOf({title:'வணிகம்'}),'ta');
assert.equal(languageOf({title:'Как испечь'}),'ru');
assert.equal(languageOf({title:'Plain english title'}),null,'latin script alone is not evidence of a language');
assert.equal(languageLabel('hi'),'Hindi');
assert.deepEqual(languagesIn([{language:'en',title:'a'},{language:'en',title:'b'},{language:'es',title:'c'},{title:'d'}]),[['en',2],['es',1]]);
const langFiltered=filterVideos([{platform:'YouTube',language:'hi',title:'a'},{platform:'YouTube',language:'en',title:'b'}],
 {platform:'All platforms',date:'all',metric:'all',language:'hi'});
assert.equal(langFiltered.length,1);

// --- repost collapse keeps the copy that matches the active sort -------------------
const mirrors=[
 {url:'https://youtube.com/watch?v=hi',title:'Ultimate Sourdough Bread Masterclass',views:9000000,likes:10,comments:12,thumbnail:'t',platform:'YouTube'},
 {url:'https://youtube.com/watch?v=lo',title:'Ultimate Sourdough Bread Masterclass HD',views:100000,likes:900,comments:34000,thumbnail:'t',platform:'YouTube'},
];
assert.equal(dedupeVideos(mirrors,'views:desc')[0].comments,12,'views sort keeps the most-watched copy');
assert.equal(dedupeVideos(mirrors,'comments:desc')[0].comments,34000,'comment sort must not hide the most-commented copy');
assert.equal(dedupeVideos(mirrors,'likes:desc')[0].likes,900);
assert.equal(dedupeVideos(mirrors,'comments:desc')[0].alternates.length,1);


// --- in-page playback: every platform resolves to its own embed endpoint ----------
const vid=(url,extra={})=>({url,title:'x',platform:(new URL(url).hostname.includes('youtu')?'YouTube':new URL(url).hostname.includes('vimeo')?'Vimeo':new URL(url).hostname.includes('dailymotion')?'Dailymotion':new URL(url).hostname.includes('tiktok')?'TikTok':new URL(url).hostname.includes('instagram')?'Instagram':new URL(url).hostname.includes('facebook')?'Facebook':'Reddit'),duration:null,description:'',...extra});
assert.match(embedFor(vid('https://www.youtube.com/watch?v=rEdl2Uetpvo')).src,/^https:\/\/www\.youtube-nocookie\.com\/embed\/rEdl2Uetpvo/);
assert.equal(embedFor(vid('https://vimeo.com/287651716')).src,'https://player.vimeo.com/video/287651716');
assert.equal(embedFor(vid('https://www.dailymotion.com/video/x8abcde')).src,'https://geo.dailymotion.com/player.html?video=x8abcde');
assert.equal(embedFor(vid('https://www.tiktok.com/@baker/video/1234')).src,'https://www.tiktok.com/embed/v2/1234');
assert.equal(embedFor(vid('https://www.instagram.com/reel/DMOaUaoyT8x/')).src,'https://www.instagram.com/p/DMOaUaoyT8x/embed/captioned/');
assert.match(embedFor(vid('https://www.facebook.com/x/videos/123/')).src,/plugins\/video\.php/);
// A link with no resolvable id must not produce a broken frame.
assert.equal(embedFor(vid('https://vimeo.com/channels/staffpicks')),null);
assert.equal(canPlayInPage(vid('https://vimeo.com/channels/staffpicks')),false);
assert.equal(canPlayInPage(vid('https://someblog.example/video/1')),false,'unknown hosts are not framed');

// Shorts, reels and TikToks get a 9:16 frame; long-form gets 16:9.
assert.equal(isVertical(vid('https://www.tiktok.com/@baker/video/1234')),true);
assert.equal(isVertical(vid('https://www.instagram.com/reel/DMOaUaoyT8x/')),true);
assert.equal(isVertical(vid('https://www.instagram.com/p/DMOaUaoyT8x/')),false,'a feed post is not assumed vertical');
assert.equal(isVertical({...vid('https://www.youtube.com/watch?v=rEdl2Uetpvo'),duration:'PT45S'}),true);
assert.equal(isVertical({...vid('https://www.youtube.com/watch?v=rEdl2Uetpvo'),duration:'PT9M10S'}),false);
assert.equal(isVertical({...vid('https://www.youtube.com/watch?v=rEdl2Uetpvo'),title:'Recipe #shorts'}),true);
assert.equal(embedFor({...vid('https://www.youtube.com/watch?v=rEdl2Uetpvo'),duration:'PT45S'}).ratio,'portrait');
assert.equal(embedFor(vid('https://vimeo.com/287651716')).ratio,'landscape');

console.log('PASS: comment classification, outcome-weighted trust scoring, bot and engagement-bait rejection, complaint and age penalties, sample-size damping, score bounds, duration parsing, length filtering, thumbnail derivation, placeholder seeds, clock-form durations, language detection sort-aware repost collapse and in-page embed resolution.');
}finally{rmSync(dir,{recursive:true,force:true})}
