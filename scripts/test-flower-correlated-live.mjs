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
const rounds=2,results=[];
try{
  for(let round=1;round<=rounds;round++){
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    try{
      await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
      await page.waitForFunction(()=>{
        const active=window.LXSourceManager?.getActive?.();
        return !!active?.inited;
      },null,{timeout:20000});
      const rows=await page.evaluate(async ({platforms,round})=>{
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
            searchFound:false,searchState:'NOT_RUN',
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
            window.LXMusicSearch.search(source,'宋冬野',1,25,cb),12000);
          if(search.timedOut){row.searchState='SEARCH_TIMEOUT';continue;}
          if(search.error){row.searchState='SEARCH_ERROR';continue;}
          const matches=Array.isArray(search.data?.list)?search.data.list:[];
          const music=matches.find(x=>String(x?.name||'').trim()==='郭源潮'&&
            String(x?.singer||'').includes('宋冬野')&&x.source===source);
          if(!music){row.searchState='TRACK_NOT_FOUND';continue;}
          row.searchFound=true;row.searchState='MATCHED';
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
      },{platforms:PLATFORMS,round});
      for(const row of rows){
        row.outcome=classifyAttempt(row);
        results.push(row);
        console.log('FLOWER CORRELATED SAME-REQUEST:',JSON.stringify(row));
      }
    }finally{await page.close();}
  }
  console.log('FLOWER CORRELATED TWO-ROUND SUMMARY:',JSON.stringify({
    flowerOnly:true,expectedTrack:'宋冬野 / 郭源潮',
    expectedDurationSeconds:446,attempts:results.length,
    summary:summarizeAttempts(results),
    anyTrueAudio:results.some(row=>classifyAttempt(row)==='DECODED_LONG_FORM_AUDIO')
  }));
}finally{await browser.close();}
