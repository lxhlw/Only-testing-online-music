import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Explicit one-time Huibq choice in a fresh browser. This does not change
// the site's default source and never falls back to another provider.
// A returned URL alone is NOT evidence of real audio. Do not log song IDs,
// signed media URLs, original request headers, tokens or response bodies.
const base=process.env.TEST_BASE_URL||'https://only-testing-online-music.pages.dev';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const result={manualSource:'Huibq',imported:false,active:false,searchFound:false,
  advertisedQuality:false,htmlAudioStarted:false,durationMatched:false,
  progressSeconds:0,seekWorked:false,verified:false,phase:'START'};
const page=await browser.newPage({viewport:{width:1280,height:800}});
try{
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
  result.phase='IMPORT';
  const installed=await page.evaluate(()=>new Promise(resolve=>{
    let done=false;
    const timer=setTimeout(()=>{if(!done){done=true;resolve({error:'TIMEOUT'});}},28000);
    try{
      window.LXSourceManager.installBuiltinHuibq((err,item)=>{
        if(done)return;done=true;clearTimeout(timer);
        resolve({error:err?String(err.message||err).slice(0,70):'',
          id:item?.id||''});
      });
    }catch(e){if(!done){done=true;clearTimeout(timer);resolve({error:'INSTALL_EXCEPTION'});}}
  }));
  if(installed.error||!installed.id)throw Error('IMPORT_FAILED');
  await page.waitForFunction(id=>window.LXSourceManager?.getSources()
    .some(x=>x.id===id&&x.inited),installed.id,{timeout:12000});
  result.imported=true;
  result.phase='SELECT';
  result.active=await page.evaluate(id=>{
    const selected=window.LXSourceManager.activate(id);
    return !!selected && selected.id===id;
  },installed.id);
  assert.equal(result.active,true);
  result.advertisedQuality=await page.evaluate(()=>
    !!window.LXSourceManager.getActive()?.sources?.kw?.qualitys?.includes('128k'));
  if(!result.advertisedQuality)throw Error('KW_128K_NOT_DECLARED');
  result.phase='SEARCH';
  const match=await page.evaluate(()=>new Promise(resolve=>{
    let done=false;
    const timer=setTimeout(()=>{if(!done){done=true;resolve(null);}},18000);
    window.LXMusicSearch.search('kw','宋冬野',1,30,(err,payload)=>{
      if(done)return;done=true;clearTimeout(timer);
      if(err)return resolve(null);
      const found=(payload?.list||[]).find(x=>
        String(x.name||'').trim()==='郭源潮'&&
        String(x.singer||'').includes('宋冬野')&&
        x.source==='kw');
      resolve(found||null);
    });
  }));
  if(!match)throw Error('SONG_NOT_FOUND');
  result.searchFound=true;
  result.phase='PLAY';
  await page.evaluate(song=>{
    const a=document.getElementById('audio');
    if(a){a.muted=true;a.volume=0;}
    window.OnlyTestingMusicApp.playMusic(song);
  },match);
  await page.waitForFunction(()=>{
    const a=document.getElementById('audio');
    return !!a&&a.readyState>=2&&!a.paused&&Number(a.currentTime)>=0.65;
  },null,{timeout:25000});
  const stats=await page.locator('#audio').evaluate(a=>({
    duration:Number(a.duration),progress:Number(a.currentTime),ready:a.readyState
  }));
  result.htmlAudioStarted=stats.ready>=2&&stats.progress>=0.65;
  result.progressSeconds=Math.round(stats.progress*10)/10;
  result.durationMatched=stats.duration>400&&stats.duration<490;
  if(!result.durationMatched)throw Error('DURATION_MISMATCH');
  result.phase='SEEK';
  const seek=await page.locator('#audio').evaluate(a=>{
    try{a.currentTime=a.duration*0.2;return true;}catch{return false;}
  });
  if(seek){
    await page.waitForFunction(()=>{
      const a=document.getElementById('audio');
      return !!a&&Number(a.currentTime)>45&&!a.paused;
    },null,{timeout:10000});
    result.seekWorked=true;
  }
  result.verified=result.imported&&result.active&&result.searchFound&&
    result.htmlAudioStarted&&result.durationMatched&&result.seekWorked;
  result.phase=result.verified?'REAL_AUDIO_VERIFIED':'MEDIA_UNVERIFIED';
}catch(err){
  result.phase=result.phase==='START'?'START_FAILED':result.phase+'_FAILED';
  // Never propagate source URLs, signed query strings or HTTP response text.
  result.errorClass=/^(IMPORT_FAILED|KW_128K_NOT_DECLARED|SONG_NOT_FOUND|DURATION_MISMATCH)$/
    .test(String(err.message||''))?String(err.message):'SOURCE_OR_MEDIA_UNAVAILABLE';
}finally{
  await browser.close();
  console.log('OPTIONAL HUIBQ EXPLICIT-LX REAL AUDIO:',JSON.stringify(result));
}
assert.equal(result.verified,true,'Explicit Huibq source did not prove genuine long-form playback and seek');
