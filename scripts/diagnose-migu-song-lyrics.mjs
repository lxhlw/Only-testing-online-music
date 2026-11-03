import {chromium} from 'playwright';
import assert from 'node:assert/strict';
// Read-only investigation. Never print lyrics, signed media URLs, cookie/token data.
const base='https://only-testing-online-music.pages.dev';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
let song;
try{
 const page=await browser.newPage();
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.LXSourceManager?.getActive?.()?.inited,null,{timeout:23000});
 await page.locator('.nav-item[data-view="search"]').click();
 await page.locator('#channel-list .channel-button[title="MG"]').click();
 for(const keyword of ['开始懂了','孙燕姿']){
  await page.locator('#global-search-input').fill(keyword);
  await page.locator('#global-search-btn').click();
  try{await page.waitForFunction(()=>window.__LXLastSearchResults?.some(s=>
    s.source==='mg'&&String(s.name||'').trim()==='开始懂了'&&
    String(s.singer||'').includes('孙燕姿')),null,{timeout:16000});}catch{}
  song=await page.evaluate(()=>window.__LXLastSearchResults?.find(s=>
    s.source==='mg'&&String(s.name||'').trim()==='开始懂了'&&
    String(s.singer||'').includes('孙燕姿'))||null);
  if(song)break;
 }
 await page.close();
}finally{await browser.close();}
assert.ok(song,'No exact Migu song found');
const copyright=String(song.copyrightId||'');
assert.match(copyright,/^[A-Za-z0-9_-]{1,80}$/);
const lyricUrl=String(song.lyricId||song.raw?.lrcUrl||song.raw?.lyricUrl||'');
let lyricHost='',lyricPath='';
try{const u=new URL(lyricUrl);lyricHost=u.hostname;lyricPath=u.pathname.slice(0,150)}catch{}
console.log('MIGU_TRACK_META',JSON.stringify({
 idClass:/^[0-9]+$/.test(String(song.id))?'numeric':'other',
 copyrightId:copyright,songMidClass:/^[0-9]+$/.test(String(song.songmid))?'numeric':'other',
 contentIdPresent:!!song.contentId,lyricUrlPresent:!!lyricUrl,lyricHost,lyricPath,
 rawRelevantKeys:Object.keys(song.raw||{}).filter(k=>/lyric|lrc|copyright|content/i.test(k)).slice(0,25)
}));
const endpoints=[
 ['official-v3-https','https://music.migu.cn/v3/api/music/audioPlayer/getLyric?copyrightId='+encodeURIComponent(copyright)],
 ['official-v3-www','https://www.music.migu.cn/v3/api/music/audioPlayer/getLyric?copyrightId='+encodeURIComponent(copyright)],
 ['official-v3-http','http://music.migu.cn/v3/api/music/audioPlayer/getLyric?copyrightId='+encodeURIComponent(copyright)],
 ['pc-strategy','https://app.c.nf.migu.cn/MIGUM3.0/strategy/pc/listen/v1.0?scene=&netType=01&resourceType=2&copyrightId='+encodeURIComponent(copyright)+'&contentId='+encodeURIComponent(String(song.contentId||''))+'&toneFlag=PQ']
];
if(lyricUrl){
 try{
  const u=new URL(lyricUrl);
  if(u.protocol==='https:'&&(/(^|\.)migu\.cn$|(^|\.)miguvideo\.com$|(^|\.)cmvideo\.cn$|(^|\.)migucloud\.com$/.test(u.hostname)))
    endpoints.push(['search-lrc-url',lyricUrl]);
 }catch{}
}
for(const [label,url] of endpoints){
 const obs={label,status:null,type:'',size:0,looksLrc:false,objectKeys:[],lyricLen:0,redirect:false,error:''};
 try{
  const res=await fetch(url,{signal:AbortSignal.timeout(8500),redirect:'manual',
    headers:{'Accept':'application/json,text/plain,*/*','Referer':'https://music.migu.cn/'}});
  obs.status=res.status;obs.type=(res.headers.get('content-type')||'').slice(0,80);
  obs.redirect=res.status>=300&&res.status<400;
  const raw=(await res.text()).slice(0,350000);obs.size=raw.length;
  obs.looksLrc=/\[\d{2,3}:\d{2}\.\d{2,3}\]/.test(raw);
  try{
   const data=JSON.parse(raw);obs.objectKeys=Object.keys(data||{}).slice(0,16);
   const v=data?.lyric||data?.lrc||data?.data?.lyric||data?.data?.lrc||data?.data?.lrcUrl;
   obs.lyricLen=typeof v==='string'?v.length:0;
  }catch{}
 }catch(e){obs.error=String(e.name||'error').slice(0,80)}
 console.log('MIGU_LYRIC_ENDPOINT_DIAG',JSON.stringify(obs));
}
