import {chromium} from 'playwright';
import {assessRealAudio,sniffAudioPrefix}
  from './flower-media-validation.mjs';

// Entirely unmocked, informational production experiment. URL stays inside
// Chromium and is NEVER logged, stored in artifacts, or sent back to Node.
// Browser uses the same Flower source and media transport as the Web player.
// A URL or 200 response ALONE is *not* a successful playback test.
const base=process.env.TEST_BASE_URL||'https://only-testing-online-music.pages.dev';
const browser=await chromium.launch({
  headless:true,args:['--autoplay-policy=no-user-gesture-required']
});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
 await page.waitForFunction(()=>window.LXSourceManager?.getActive()?.inited,{timeout:20000});
 const observations=await page.evaluate(async()=>{
   const allow=['kuwo.cn','kuwo.com','migu.cn','miguvideo.com','cmvideo.cn',
     'migucloud.com','kugou.com','kugou.net','qq.com','qcloud.com',
     'myqcloud.com','qcloudcdn.com','music.126.net','netease.com',
     'ctyun.cn','bcebos.com','tencentmusic.com'];
   const safeUrl=value=>{
     try{
       const u=new URL(value);
       if(!['http:','https:'].includes(u.protocol)||u.username||u.password||
          u.port||u.hash||u.href.length>4096)return false;
       const h=u.hostname.toLowerCase();
       if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||
          /^[0-9.]+$/.test(h)||h.startsWith('['))return false;
       return allow.some(d=>h===d||h.endsWith('.'+d));
     }catch{return false;}
   };
   const callWithTimeout=(fn,ms)=>new Promise(resolve=>{
     let finished=false;
     const deadline=setTimeout(()=>{
       if(finished)return;finished=true;resolve({timeout:true});
     },ms);
     try{
       fn((err,data)=>{
         if(finished)return;finished=true;clearTimeout(deadline);
         resolve({error:!!err,data});
       });
     }catch{
       if(!finished){finished=true;clearTimeout(deadline);resolve({error:true});}
     }
   });
   const once=(media,name,ms)=>new Promise(resolve=>{
     let finished=false;
     const finish=value=>{
       if(finished)return;finished=true;
       clearTimeout(deadline);
       media.removeEventListener(name,ok);
       media.removeEventListener('error',bad);
       resolve(value);
     };
     const ok=()=>finish(true),bad=()=>finish(false);
     const deadline=setTimeout(()=>finish(false),ms);
     media.addEventListener(name,ok,{once:true});
     media.addEventListener('error',bad,{once:true});
   });
   const sourceState=window.LXSourceManager.getActive();
   const rows=[];
   for(const source of ['kw','mg']){
     const result={source,kind:'NOT_CHECKED',approvedMediaHost:false,
       durationSeconds:null,started:false,playProgressSeconds:0,
       seekConfirmed:false,afterSeekProgressSeconds:0,prefixBytes:[],
       rangeStatus:null,rangeBytes:0,rangeFailure:'NOT_CHECKED',rangeMs:0};
     rows.push(result);
     const qualitys=sourceState.sources?.[source]?.qualitys||[];
     if(!qualitys.includes('128k')){result.kind='QUALITY_UNDECLARED';continue;}
     const search=await callWithTimeout(done=>
       window.LXMusicSearch.search(source,'宋冬野',1,25,done),13000);
     if(search.timeout){result.kind='SEARCH_TIMEOUT';continue;}
     if(search.error){result.kind='SEARCH_FAILURE';continue;}
     const songs=Array.isArray(search.data?.list)?search.data.list:[];
     const track=songs.find(s=>String(s?.name||'').trim()==='郭源潮'&&
       String(s?.singer||'').includes('宋冬野'));
     if(!track){result.kind='TRACK_NOT_FOUND';continue;}
     const musicInfo={...track,...(track.raw||{}),source,
       songmid:track.songmid||track.id};
     const reply=await callWithTimeout(done=>
       window.LXSourceManager.requestAction(source,'musicUrl',
          {type:'128k',musicInfo},done),15500);
     if(reply.timeout){result.kind='RESOLVE_TIMEOUT';continue;}
     if(reply.error){result.kind='RESOLVE_ERROR';continue;}
     const raw=reply.data;
     const mediaUrl=typeof raw==='string'?raw:
        typeof raw?.url==='string'?raw.url:
        typeof raw?.result==='string'?raw.result:'';
     if(!/^https?:\/\//i.test(mediaUrl)){result.kind='RESOLVE_NOT_URL';continue;}
     result.kind='FLOWER_URL_RETURNED';
     result.approvedMediaHost=safeUrl(mediaUrl);
     if(!result.approvedMediaHost)continue; // Do not contact untrusted hosts.

     // Only first 64 KiB are allowed; proxy request is same-origin with
     // the production player's SSRF rules. Cancel response as soon as
     // enough bytes were read; metadata and URL are never logged.
     const controller=new AbortController();
     const rangeStart=performance.now();
     const timer=setTimeout(()=>controller.abort(),9000);
     try{
       const resp=await fetch(location.origin+'/api/proxy?url='+
         encodeURIComponent(mediaUrl),{
           headers:{Range:'bytes=0-65535'},signal:controller.signal
         });
       result.rangeStatus=resp.status;
       result.rangeFailure=resp.ok?'RESPONSE_OK':'HTTP_'+String(resp.status);
       if(resp.ok&&resp.body){
         const reader=resp.body.getReader();
         const prefix=[];
         let count=0;
         try{
           while(count<4096){
             const next=await reader.read();
             if(next.done)break;
             const bytes=next.value||new Uint8Array();
             const remaining=4096-count;
             for(let i=0;i<Math.min(remaining,bytes.length);i++){
               if(prefix.length<16)prefix.push(bytes[i]);
             }
             count+=Math.min(bytes.length,remaining);
           }
         }finally{try{await reader.cancel();}catch{}}
         result.rangeBytes=count;
         result.prefixBytes=prefix;
         result.rangeFailure=count>0?'SAMPLE_RECEIVED':'BODY_EMPTY';
       }else if(resp.ok)result.rangeFailure='NO_RESPONSE_BODY';
     }catch(error){
       result.rangeFailure=controller.signal.aborted?'RANGE_ABORTED_OR_TIMEOUT':
         'RANGE_NETWORK_FAILURE';
     }finally{
       result.rangeMs=Math.round(performance.now()-rangeStart);
       clearTimeout(timer);controller.abort();
     }

     // Direct HTTPS media uses the same browser path as the actual player;
     // HTTP media is routed through the site's existing HTTPS proxy.
     const audio=document.createElement('audio');
     audio.muted=true;audio.volume=0;audio.preload='auto';
     const preferred=mediaUrl.startsWith('https://')?mediaUrl:
       location.origin+'/api/proxy?url='+encodeURIComponent(mediaUrl);
     audio.src=preferred;
     document.body.appendChild(audio);
     try{
       const metadata=once(audio,'loadedmetadata',15000);
       audio.load();
       if(!await metadata){result.kind='MEDIA_METADATA_UNAVAILABLE';continue;}
       const duration=audio.duration;
       result.durationSeconds=Number.isFinite(duration)?
         Math.round(duration*10)/10:null;
       if(!Number.isFinite(duration)||duration<250||duration>700){
         result.kind='MEDIA_SHORT_OR_BAD_DURATION';continue;
       }
       result.started=await Promise.race([
         audio.play().then(()=>true,()=>false),
         new Promise(resolve=>setTimeout(()=>resolve(false),11000))
       ]);
       if(!result.started){result.kind='MEDIA_PLAY_START_FAILURE';continue;}
       const start=audio.currentTime;
       await new Promise(resolve=>setTimeout(resolve,1900));
       result.playProgressSeconds=Math.max(0,Math.round(
         (audio.currentTime-start)*10)/10);
       if(result.playProgressSeconds<.7){result.kind='MEDIA_NO_PROGRESS';continue;}
       const expectedSeek=Math.min(110,duration*.3);
       const seeked=once(audio,'seeked',10000);
       try{audio.currentTime=expectedSeek;}catch{}
       result.seekConfirmed=await seeked;
       if(!result.seekConfirmed){result.kind='MEDIA_SEEK_FAILED';continue;}
       const startAfterSeek=audio.currentTime;
       await new Promise(resolve=>setTimeout(resolve,1400));
       result.afterSeekProgressSeconds=Math.max(0,Math.round(
         (audio.currentTime-startAfterSeek)*10)/10);
       result.kind='MEDIA_PLAYBACK_CHECKED';
     }catch{result.kind='MEDIA_UNEXPECTED_ERROR';}
     finally{
       audio.pause();audio.removeAttribute('src');audio.load();audio.remove();
     }
   }
   return rows;
 });
 const safeRows=observations.map(row=>{
   const gate=assessRealAudio({...row,kind:
     row.kind==='MEDIA_PLAYBACK_CHECKED'?'FLOWER_URL_RETURNED':row.kind});
   const {prefixBytes,...visible}=row;
   return {...visible,signature:sniffAudioPrefix(prefixBytes),acceptance:gate};
 });
 console.log('FLOWER REAL AUDIO ACCEPTANCE:',JSON.stringify({
   source:'Flower-only',song:'宋冬野 / 郭源潮',expectedSeconds:446,
   checkedPlatforms:['kw','mg'],results:safeRows,
   verifiedPlatforms:safeRows.filter(r=>r.acceptance.verified).map(r=>r.source)
 }));
 if(safeRows.some(r=>r.acceptance.verified))
   console.log('FLOWER REAL AUDIO: browser decoded long-form media, started and seeked');
 else console.log('FLOWER REAL AUDIO: no platform met all audio authenticity and playback gates');
}finally{await browser.close();}
