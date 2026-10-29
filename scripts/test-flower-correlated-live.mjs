import {chromium} from 'playwright';
import {PLATFORMS,classifyAttempt,summarizeAttempts}
  from './flower-correlated-validation.mjs';

// Each attempt uses EXACTLY ONE source-resolved media URL for its Range
// sample and HTML5 Audio stream. No cross-attempt URL matching or reuse.
// Real Cloudflare production, no request interception, no provider fallback,
// no signed URLs/tags/headers/audio bytes or raw upstream errors in logs.
const base=process.env.TEST_BASE_URL||'https://only-testing-online-music.pages.dev';
const browser=await chromium.launch({headless:true,
  args:['--autoplay-policy=no-user-gesture-required']});
// Baseline remains unchanged. A separate opt-in live case replays the user's
// confirmed LX Desktop comparison: Flower → Kugou → 赵雷《成都》.
const caseName=process.env.FLOWER_DIAGNOSTIC_CASE||'baseline';
if(!['baseline','kugou-chengdu'].includes(caseName))
  throw new Error('Unknown Flower diagnostic case');
const caseSpec=caseName==='kugou-chengdu'
  ? {platforms:['kg'],keyword:'成都',title:'成都',artist:'赵雷'}
  : {platforms:PLATFORMS,keyword:'宋冬野',title:'郭源潮',artist:'宋冬野'};
const rounds=2,results=[];
try{
  for(let round=1;round<=rounds;round++){
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const upstreamProbes=[];
    // Observe only sanitized failure categories; do not intercept, alter,
    // replay or log signed requests, song IDs, tags, URLs or media bytes.
    page.on('response',async response=>{
      try{
        const u=new URL(response.url());
        if(u.pathname!=='/api/proxy')return;
        const original=new URL(u.searchParams.get('url')||'');
        if(original.protocol!=='http:'||original.hostname!=='97.64.37.235'||
          !original.pathname.startsWith('/flower/v1/url/'))return;
        const channel=original.pathname.split('/')[4]||'';
        let data={};
        try{data=await response.json();}catch{}
        const categories=new Set(['ts-short','tm-short','ts-full','tm-full',
          'sslip-short','nip-short','sslip-full','nip-full','canonical-socket']);
        const codes=/^(?:HTTP_[0-9]{3}|FLOWER_SOCKET_[A-Z0-9_]+|INVALID_PAYLOAD|BLOCKED_TARGET|TIMEOUT|NETWORK_ERROR)$/;
        const routes=Array.isArray(data.attempts)?data.attempts:[];
        upstreamProbes.push({
          source:channel,
          status:response.status(),
          diagnostic:/^FLOWER_[A-Z0-9_]+$/.test(String(data.diagnostic||''))
            ? data.diagnostic:null,
          routes:routes.filter(x=>categories.has(x?.route)&&
            codes.test(String(x?.code||''))).slice(0,9)
            .map(x=>({route:x.route,code:x.code}))
        });
      }catch{}
    });
    try{
      await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
      await page.waitForFunction(()=>{
        const active=window.LXSourceManager?.getActive?.();
        return !!active?.inited;
      },null,{timeout:20000});
      const rows=await page.evaluate(async ({platforms,round,keyword,title,artist})=>{
        const manager=window.LXSourceManager;
        const active=manager.getActive();
        const flowerActive=!!active?.inited &&
          String(active?.url||'').includes('/flower/latest.js') &&
          String(active?.name||'').includes('野花');
        // Reject private/unlisted destinations even when the source claims
        // they are media. The existing server proxy applies extra SSRF rules.
        const domains=['kuwo.cn','kuwo.com','migu.cn','miguvideo.com',
          'cmvideo.cn','migucloud.com','kugou.com','kugou.net',
          'qq.com','qcloud.com','myqcloud.com','qcloudcdn.com',
          'music.126.net','netease.com','ctyun.cn','bcebos.com',
          'tencentmusic.com'];
        const approvedUrl=value=>{
          try{
            const u=new URL(value);
            const host=u.hostname.toLowerCase();
            return ['http:','https:'].includes(u.protocol)&&
              !u.username&&!u.password&&!u.port&&!u.hash&&u.href.length<=4096&&
              !host.endsWith('.local')&&!host.endsWith('.localhost')&&
              !/^[0-9.]+$/.test(host)&&!host.startsWith('[')&&
              domains.some(d=>host===d||host.endsWith('.'+d));
          }catch{return false;}
        };
        const deadline=(run,ms)=>new Promise(resolve=>{
          let done=false;
          const timer=setTimeout(()=>{
            if(done)return;done=true;resolve({timedOut:true});
          },ms);
          try{run((err,data)=>{
            if(done)return;done=true;clearTimeout(timer);
            resolve({error:!!err,data});
          });}
          catch{
            if(!done){done=true;clearTimeout(timer);resolve({error:true});}
          }
        });
        const event=(audio,name,ms)=>new Promise(resolve=>{
          let done=false;
          const finish=ok=>{
            if(done)return;done=true;
            clearTimeout(timer);
            audio.removeEventListener(name,onSuccess);
            audio.removeEventListener('error',onError);
            resolve(ok);
          };
          const onSuccess=()=>finish(true),onError=()=>finish(false);
          const timer=setTimeout(()=>finish(false),ms);
          audio.addEventListener(name,onSuccess,{once:true});
          audio.addEventListener('error',onError,{once:true});
        });
        const sniff=b=>{
          if(b.length<4)return 'INSUFFICIENT_BYTES';
          if(b[0]===73&&b[1]===68&&b[2]===51)return 'ID3_MP3_CONTAINER';
          if(b[0]===255&&(b[1]&224)===224&&(b[1]&6)!==0)
            return 'MPEG_AUDIO_FRAME';
          const s=String.fromCharCode(...b.slice(0,4));
          if(s==='OggS')return 'OGG_CONTAINER';
          if(s==='fLaC')return 'FLAC_CONTAINER';
          if(s==='RIFF'&&b.length>=12&&
            String.fromCharCode(...b.slice(8,12))==='WAVE')
            return 'WAVE_CONTAINER';
          if(b.length>=8&&String.fromCharCode(...b.slice(4,8))==='ftyp')
            return 'MP4_AUDIO_CONTAINER';
          return 'NOT_RECOGNIZED_AS_AUDIO';
        };
        const rows=[];
        for(const source of platforms){
          const row={source,round,flowerActive,qualityDeclared:false,
            searchFound:false,searchState:'NOT_RUN',searchProvider:'UNKNOWN',
            trackHashShape:'NOT_APPLICABLE',requestIdMatchesTrackKey:null,
            flowerRequested:false,routeMatchesSource:false,
            resolverState:'NOT_RUN',urlReturned:false,resolverMs:null,
            approvedMediaHost:false,rangeHttpStatus:null,rangeBytes:0,
            rangeFailure:'NOT_RUN',rangeMs:null,signature:'INSUFFICIENT_BYTES',
            audioDurationSeconds:null,started:false,playProgressSeconds:0,
            seekConfirmed:false,afterSeekProgressSeconds:0};
          rows.push(row);
          if(!flowerActive){row.resolverState='WRONG_SOURCE';continue;}
          const decl=active.sources?.[source];
          row.qualityDeclared=Array.isArray(decl?.qualitys)&&
            decl.qualitys.includes('128k');
          if(!row.qualityDeclared)continue;
          const search=await deadline(cb=>
            window.LXMusicSearch.search(source,keyword,1,25,cb),12000);
          if(search.timedOut){row.searchState='SEARCH_TIMEOUT';continue;}
          if(search.error){row.searchState='SEARCH_ERROR';continue;}
          const matches=Array.isArray(search.data?.list)?search.data.list:[];
          const music=matches.find(x=>String(x?.name||'').trim()===title&&
            String(x?.singer||'').includes(artist)&&x.source===source);
          if(!music){row.searchState='TRACK_NOT_FOUND';continue;}
          row.searchFound=true;row.searchState='MATCHED';
          const provider=String(search.data?.searchProvider||'');
          row.searchProvider=['kugou-native','kugou-mobile-native',
            'netease-native','qqmusic-native','kuwo-native',
            'migu-native','gdstudio-native'].includes(provider)
            ? provider:'OTHER';
          if(source==='kg'){
            const hash=String(music.hash||'');
            row.trackHashShape=/^[0-9a-f]{32}$/i.test(hash)
              ? 'KG_HASH_32_HEX' : hash ? 'KG_HASH_OTHER' : 'KG_HASH_MISSING';
          }
          const requestStart=active.runtime?.__debugRequests?.length||0;
          const resolveStarted=performance.now();
          const reply=await deadline(cb=>
            manager.requestAction(source,'musicUrl',{
              type:'128k',musicInfo:{...music,...(music.raw||{}),source,
                songmid:music.songmid||music.id}
            },cb),14500);
          row.resolverMs=Math.round(performance.now()-resolveStarted);
          const recorded=(active.runtime?.__debugRequests||[]).slice(requestStart);
          const hit=recorded.find(req=>{
            try{
              const u=new URL(req.url);
              return u.hostname==='97.64.37.235'&&
                u.pathname.startsWith('/flower/v1/url/');
            }catch{return false;}
          });
          row.flowerRequested=!!hit;
          row.routeMatchesSource=!!hit&&
            new URL(hit.url).pathname.startsWith('/flower/v1/url/'+source+'/');
          if(source==='kg'&&hit){
            const segments=new URL(hit.url).pathname.split('/').filter(Boolean);
            row.requestIdMatchesTrackKey=segments.length===6&&
              segments[4].toUpperCase()===String(music.hash||'').toUpperCase();
          }
          if(reply.timedOut){row.resolverState='RESOLVE_TIMEOUT';continue;}
          if(reply.error){row.resolverState='RESOLVE_ERROR';continue;}
          const raw=reply.data;
          const url=typeof raw==='string'?raw:
            typeof raw?.url==='string'?raw.url:
            typeof raw?.result==='string'?raw.result:'';
          if(typeof url!=='string'||!/^https?:\/\//i.test(url)){
            row.resolverState='NO_VALID_URL';continue;
          }
          row.urlReturned=true;row.resolverState='URL_RETURNED';
          row.approvedMediaHost=approvedUrl(url);
          if(!row.approvedMediaHost)continue;
          // Sample this EXACT URL via the existing first-party proxy.
          // Only 4 KiB of a <=64KiB HTTP range response, no log of bytes.
          const proxy=location.origin+'/api/proxy?url='+encodeURIComponent(url);
          const ctrl=new AbortController();
          const rangeStarted=performance.now();
          const timer=setTimeout(()=>ctrl.abort(),8000);
          try{
            const response=await fetch(proxy,{
              headers:{Range:'bytes=0-65535'},signal:ctrl.signal
            });
            row.rangeHttpStatus=response.status;
            row.rangeFailure=response.ok?'HTTP_OK':'HTTP_'+response.status;
            if(response.ok&&response.body){
              const reader=response.body.getReader(),prefix=[];
              let read=0;
              try{
                while(read<4096){
                  const next=await reader.read();
                  if(next.done)break;
                  const chunk=next.value||new Uint8Array();
                  const take=Math.min(chunk.length,4096-read);
                  for(let i=0;i<take&&prefix.length<16;i++)prefix.push(chunk[i]);
                  read+=take;
                }
              }finally{try{await reader.cancel();}catch{}}
              row.rangeBytes=read;
              row.signature=sniff(prefix);
              row.rangeFailure=read?'SAMPLE_OK':'EMPTY_AUDIO_BODY';
            }else if(response.ok)row.rangeFailure='NO_AUDIO_BODY';
          }catch{
            row.rangeFailure=ctrl.signal.aborted?'RANGE_TIMEOUT':'RANGE_NETWORK_ERROR';
          }finally{
            row.rangeMs=Math.round(performance.now()-rangeStarted);
            clearTimeout(timer);ctrl.abort();
          }
          // The same resolved URL must also decode in the real browser.
          const audio=document.createElement('audio');
          audio.muted=true;audio.volume=0;audio.preload='auto';
          audio.src=url.startsWith('https://')?url:proxy;
          document.body.appendChild(audio);
          try{
            const metadata=event(audio,'loadedmetadata',13000);
            audio.load();
            if(!await metadata){row.resolverState='MEDIA_METADATA_FAILED';continue;}
            if(Number.isFinite(audio.duration))
              row.audioDurationSeconds=Math.round(audio.duration*10)/10;
            if(!Number.isFinite(audio.duration)||audio.duration<250||
               audio.duration>670){row.resolverState='SHORT_OR_INVALID_DURATION';continue;}
            row.started=await Promise.race([
              audio.play().then(()=>true,()=>false),
              new Promise(done=>setTimeout(()=>done(false),9500))
            ]);
            if(!row.started){row.resolverState='PLAY_REJECTED';continue;}
            const start=audio.currentTime;
            await new Promise(done=>setTimeout(done,1700));
            row.playProgressSeconds=Math.round(
              Math.max(0,audio.currentTime-start)*10)/10;
            if(row.playProgressSeconds<.7){row.resolverState='NO_PROGRESS';continue;}
            const seeked=event(audio,'seeked',10000);
            try{audio.currentTime=Math.min(110,audio.duration*.3);}catch{}
            row.seekConfirmed=await seeked;
            if(!row.seekConfirmed){row.resolverState='SEEK_FAILURE';continue;}
            const middle=audio.currentTime;
            await new Promise(done=>setTimeout(done,1400));
            row.afterSeekProgressSeconds=Math.round(
              Math.max(0,audio.currentTime-middle)*10)/10;
            row.resolverState='DECODE_CHECKED';
          }catch{row.resolverState='MEDIA_ERROR';}
          finally{
            audio.pause();audio.removeAttribute('src');audio.load();audio.remove();
          }
        }
        return rows;
      },{platforms:caseSpec.platforms,round,
        keyword:caseSpec.keyword,title:caseSpec.title,artist:caseSpec.artist});
      // Playwright response bodies resolve asynchronously after XHR load.
      await page.waitForTimeout(200);
      if(caseName==='kugou-chengdu'){
        console.log('FLOWER KUGOU CHENGDU SAFE UPSTREAM:',JSON.stringify({
          round,probes:upstreamProbes.filter(x=>x.source==='kg')
        }));
      }
      for(const row of rows){
        row.outcome=classifyAttempt(row);
        results.push(row);
        console.log('FLOWER CORRELATED SAME-REQUEST:',JSON.stringify(row));
      }
    }finally{await page.close();}
  }
  console.log('FLOWER CORRELATED TWO-ROUND SUMMARY:',JSON.stringify({
    flowerOnly:true,caseName,
    expectedTrack:caseSpec.artist+' / '+caseSpec.title,
    expectedDurationSeconds:caseName==='baseline'?446:null,
    attempts:results.length,
    summary:summarizeAttempts(results).filter(x=>caseSpec.platforms.includes(x.source)),
    anyTrueAudio:results.some(row=>classifyAttempt(row)==='DECODED_LONG_FORM_AUDIO')
  }));
}finally{await browser.close();}
