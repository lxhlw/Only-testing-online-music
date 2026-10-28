import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788';
const browser = await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
function makeWav(seconds=8,rate=8000){
  const frames=seconds*rate;
  const out=Buffer.alloc(44+frames*2);
  out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);
  out.write('WAVE',8);out.write('fmt ',12);out.writeUInt32LE(16,16);
  out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);
  out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);
  out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);
  out.write('data',36);out.writeUInt32LE(frames*2,40);
  return out;
}
const fixture = [
  '/** @name 野花🌷 */',
  '(function(){',
  ' var api=globalThis.lx;',
  ' api.on(api.EVENT_NAMES.request, function(input){',
  '  window.__resolvedActions=(window.__resolvedActions||0)+1;',
  '  return Promise.resolve({url:"https://media.example.test/song.wav?id=demo"});',
  ' });',
  ' api.send(api.EVENT_NAMES.inited,{status:true,sources:{',
  '  wy:{name:"网易云音乐",type:"music",actions:["musicUrl"],qualitys:["128k","320k"]},',
  '  tx:{name:"QQ音乐",type:"music",actions:["musicUrl"],qualitys:["128k","320k"]}',
  ' }});',
  '})();'
].join('\n');
const sourceUrl='https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js';
const checks=[];
try {
  const page = await browser.newPage({viewport:{width:1366,height:900}});
  const failures=[], requests=[];
  page.on('pageerror',error=>failures.push(String(error)));
  page.on('request',request=>requests.push(request.url()));
  await page.addInitScript(({sourceUrl,fixture})=>{
    window.__audioPlayCalls=0;
    window.__resolvedActions=0;
    const originalPlay=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){
      window.__audioPlayCalls++;
      return originalPlay.apply(this,arguments);
    };
    localStorage.setItem('only-testing-online-music.lx-sources',JSON.stringify([
      {id:'old-huibq',url:'https://example.test/old-source.js',name:'Huibq',code:'/** @name Huibq */'},
      {id:'saved-flower',url:sourceUrl,name:'野花🌷',code:fixture}
    ]));
    localStorage.setItem('only-testing-online-music.active-source-id','old-huibq');
  },{sourceUrl,fixture});
  await page.route('https://media.example.test/**',route=>route.fulfill({
    status:200,contentType:'audio/wav',body:makeWav()
  }));
  await page.route('**/api/netease-song-meta?*',route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({id:'123456',source:'wy',image:'https://p1.music.126.net/test-cover.png',albumName:'测试专辑',singer:'测试歌手'})
  }));
  await page.route('https://p1.music.126.net/**',route=>route.fulfill({
    status:200,contentType:'image/png',
    body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8X0AAAAASUVORK5CYII=','base64')
  }));
  await page.route('**/api/netease-comments?*',route=>{
    const q=new URL(route.request().url()).searchParams;
    const recent=q.get('mode')==='recent',offset=Number(q.get('offset')||0);
    const list=recent?Array.from({length:20},(_,i)=>({
      id:'new-'+(offset+i),user:'最新评论用户',content:'真实新评论 '+(offset+i),likedCount:0
    })):[{id:'a',user:'网易云听友',content:'真喜欢这首歌的旋律',likedCount:18}];
    return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({source:'wy',id:'123456',kind:recent?'recent':'hot',
        total:120,offset,hasMore:recent&&offset<100,comments:list})});
  });
  await page.route('**/api/qq-catalog?*',route=>{
    const q=new URL(route.request().url()).searchParams;
    const kind=q.get('kind'),id=q.get('id');
    let data;
    if(kind==='rank'){
      data=id?{songs:[{id:'QQMid123',songmid:'QQMid123',name:'QQ热歌',singer:'歌手',source:'tx'}]}
        :{list:[{id:'26',name:'QQ音乐热歌榜',source:'tx'}]};
    }else if(id){
      data={playlist:{id,name:'QQ测试歌单',source:'tx',trackCount:1},songs:[{
        id:'QQMid123',songmid:'QQMid123',name:'QQ歌单歌曲',singer:'QQ歌手',source:'tx'
      }],nextOffset:50,hasMore:false};
    }else{
      data={result:{playlists:[{id:'1234',name:'QQ测试歌单',source:'tx',trackCount:1}]}};
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.route('**/api/netease-lyrics?*',route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({lyric:'[00:00.00]第一行测试\\n[00:01.00]第二行测试'})
  }));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LXSourceManager?.getActive()?.inited,{timeout:14000});
  assert.equal(await page.locator('.brand').textContent(),'LX Music Web');
  assert.equal(await page.locator('#app-version').textContent(),'v0.4.7');
  assert.equal(await page.locator('#top-source-label').textContent(),'当前音源：野花🌷');
  assert.deepEqual(await page.evaluate(()=>window.LXSourceManager.getSources().map(x=>x.name)),['野花🌷']);
  assert.equal(await page.locator('#legacy-media-panel').count(),0);
  await page.locator('[data-view="settings"]').click();
  assert.equal(await page.locator('#source-url').isVisible(),false);
  const lightTheme=await page.evaluate(()=>{
    const css=selector=>getComputedStyle(document.querySelector(selector));
    const contrast=(a,b)=>{
      const toLinear=n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4};
      const luminance=s=>{const rgb=(s.match(/[0-9]+(?:[.][0-9]+)?/g)||[]).slice(0,3).map(Number);return rgb.length===3?.2126*toLinear(rgb[0])+.7152*toLinear(rgb[1])+.0722*toLinear(rgb[2]):0};
      const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
    };
    return {
      main:css('.main-stage').backgroundColor,
      sidebar:css('.nav-rail').backgroundColor,
      settings:css('.settings-section').backgroundColor,
      headingContrast:contrast(css('.view-header h1').color,css('.main-stage').backgroundColor)
    };
  });
  assert.equal(lightTheme.main,'rgb(244, 248, 242)','Main background must stay eye-care mint');
  assert.equal(lightTheme.sidebar,'rgb(234, 244, 233)','Navigation must be pale green, not charcoal gray');
  assert.equal(lightTheme.settings,'rgb(255, 255, 255)','Settings cards must remain crisp white');
  assert.ok(lightTheme.headingContrast>=7,'Headings must be readable with high contrast: '+JSON.stringify(lightTheme));
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.global-search-bar')).display==='none');

  assert.equal(await page.locator('#restore-default-sources-btn').isVisible(),true);
  assert.equal(await page.locator('#inline-fallback').isVisible(),true,
    'Listeners must see the downgrade setting rather than a hidden checkbox');
  const quality=await page.evaluate(()=>{
    const planLabel=document.getElementById('quality-summary').textContent;
    const available=window.LXSourceManager.getActive().sources.wy.qualitys;
    return {available,label:planLabel};
  });
  assert.ok(quality.available.includes('320k'));
  assert.ok(quality.label.includes('320k'),'Automatic mode must no longer hard force 128k: '+quality.label);
  checks.push('high-quality-default');

  await page.locator('[data-view="search"]').click();
  assert.equal(await page.locator('.search-inspiration').isVisible(),true,'Search landing must not be a blank canvas');
  assert.equal(await page.locator('.search-suggestions button').count(),5);
  const style=await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.equal(style,'rgb(244, 248, 242)');
  // Paginated search should load the next 20 at the viewport edge and
  // explicitly finish after the final partial page; no duplicate results.
  await page.evaluate(()=>{
    window.__searchPages=[];
    window.__savedSearch=window.LXMusicSearch.search;
    window.LXMusicSearch.search=(source,term,page,limit,done)=>{
      window.__searchPages.push(page);
      const len=page<3?20:5;
      done(null,{list:Array.from({length:len},(_,i)=>({
        id:'scroll-'+page+'-'+i,name:'滑动搜索歌曲 '+(page*20+i),
        singer:'搜索歌手',source:source
      }))});
    };
    document.getElementById('global-search-input').value='滑动搜索';
    document.getElementById('global-search-btn').click();
  });
  await page.waitForFunction(()=>document.querySelectorAll('#search-results .search-row').length===20,{timeout:3500});
  await page.locator('#song-search-footer').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelectorAll('#search-results .search-row').length>=40,{timeout:5500});
  await page.locator('#song-search-footer').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelectorAll('#search-results .search-row').length===45,{timeout:5500});
  assert.equal(await page.locator('#song-search-footer').textContent(),'已全部加载 · 共 45 首');
  assert.deepEqual(await page.evaluate(()=>window.__searchPages),[1,2,3]);
  await page.evaluate(()=>{window.LXMusicSearch.search=window.__savedSearch;});
  checks.push('song-search-scroll-20-20-5-no-manual-button');
  await page.evaluate(()=>{
    window.LXMusicSearch.resolveMusicUrl=()=>{throw new Error('legacy waterfall invoked')};
    window.LXMusicSearch.resolveMusicUrlFast=()=>{throw new Error('legacy provider race invoked')};
    window.OnlyTestingMusicApp.playMusic({id:'demo',songmid:'demo',name:'成都',singer:'赵雷',source:'wy',interval:8});
  });
  await page.waitForFunction(()=>window.__audioPlayCalls>=1,{timeout:6000});
  const state=await page.evaluate(()=>({
    requests:window.__resolvedActions,
    audioPlays:window.__audioPlayCalls,
    src:document.getElementById('audio').src,
    title:document.getElementById('player-title').textContent
  }));
  assert.equal(state.requests,1,'Modern Flower must resolve exactly once');
  assert.ok(state.audioPlays>=1,'Audio.play must begin without waiting for metadata');
  const mediaUrl=new URL(state.src);
  const target=mediaUrl.pathname==='/api/proxy' ?
    mediaUrl.searchParams.get('url') : mediaUrl.href;
  assert.equal(target,'https://media.example.test/song.wav?id=demo');
  assert.ok(mediaUrl.protocol==='https:'||mediaUrl.origin===new URL(url).origin,
    'Media may stream directly over HTTPS or use the protected first-party proxy');
  assert.equal(state.title,'成都');

  // A live Flower upstream can fail. Verify that one same-platform
  // replacement resolves without installing a second LX source script.
  await page.evaluate(()=>{
    window.__fallbackCalls=0;
    window.LXSourceManager.requestAction=(source,action,params,done)=>
      done(new Error('Flower upstream temporarily unavailable'));
    window.LXMusicSearch.resolveMusicUrlFast=(source,musicInfo,quality,done)=>{
      window.__fallbackCalls++;
      done(null,{url:'https://media.example.test/song.wav?id=backup',provider:'netease-native'});
    };
    window.OnlyTestingMusicApp.playMusic({
      id:'backup-test',songmid:'backup-test',name:'备用解析验证',singer:'测试',
      source:'wy',interval:8
    });
  });
  await page.waitForFunction(()=>window.__fallbackCalls===1 && window.__audioPlayCalls>=2,{timeout:5000});
  assert.equal(await page.locator('#player-title').textContent(),'备用解析验证');
  assert.deepEqual(await page.evaluate(()=>window.LXSourceManager.getSources().map(s=>s.name)),['野花🌷']);
  checks.push('Flower-failure-recovery');
  await page.evaluate(()=>{
    window.__qualityTypes=[];
    window.LXSourceManager.requestAction=(source,action,params,done)=>{
      window.__qualityTypes.push(params.type);
      if(params.type==='128k')return done(null,{url:'https://media.example.test/song.wav?id=128'});
      return done(new Error('高音质暂不可用'));
    };
    window.LXMusicSearch.resolveMusicUrlFast=(source,info,quality,done)=>done(new Error('高音质不可用'));
    window.OnlyTestingMusicApp.playMusic({
      id:'fallback-quality',songmid:'fallback-quality',name:'音质降级测试',singer:'测试歌手',source:'wy',interval:8
    });
  });
  await page.waitForFunction(()=>window.__qualityTypes.includes('128k')&&window.__audioPlayCalls>=3,{timeout:6000});
  assert.deepEqual(await page.evaluate(()=>window.__qualityTypes.slice(0,2)),['320k','128k'],
    'Automatic must try 320k first, then a single low-bitrate fallback');
  checks.push('bounded-quality-fallback');

  // Fixed Hi-Res has no right to silently substitute 128k or 320k.
  await page.locator('[data-view="settings"]').click();
  await page.locator('#inline-quality').selectOption('flac32bit');
  assert.equal(await page.locator('#inline-fallback').isChecked(),false,
    'Explicit fixed-quality choice disables surprise fallback');
  await page.locator('#inline-save-settings').click();
  const beforeFixed=await page.evaluate(()=>window.__qualityTypes.length);
  await page.locator('#inline-replay-quality').click();
  await page.waitForTimeout(130);
  const fixedStatus=await page.locator('#status').textContent();
  assert.ok(fixedStatus.includes('未声明支持'),
    'Strict FLAC32 must report unsupported explicitly (actual status: '+fixedStatus+')');
  assert.equal(await page.evaluate(()=>window.__qualityTypes.length),beforeFixed,
    'Unsupported fixed FLAC32 must never request 128k');
  await page.locator('#inline-quality').selectOption('320k');
  await page.locator('#inline-save-settings').click();
  await page.evaluate(()=>{
    window.__qualityTypes=[];
    window.LXSourceManager.requestAction=(source,action,params,done)=>{
      window.__qualityTypes.push(params.type);
      done(null,{url:'https://media.example.test/song.wav?id=manual320'});
    };
  });
  await page.locator('#inline-replay-quality').click();
  await page.waitForFunction(()=>window.__qualityTypes.length>0,{timeout:4500});
  assert.deepEqual(await page.evaluate(()=>window.__qualityTypes),['320k'],
    'Manual 320k must not initiate any lower-quality request');
  await page.locator('#inline-reset-settings').click();
  assert.equal(await page.locator('#inline-fallback').isChecked(),true);
  checks.push('fixed-quality-honored-no-hidden-downgrade');

  // Users explicitly accepting a 128k downgrade must be able to play
  // despite the upstream declaring no FLAC32. Previous code stopped early.
  await page.locator('#inline-quality').selectOption('flac32bit');
  await page.locator('#inline-fallback').check();
  await page.locator('#inline-save-settings').click();
  await page.evaluate(()=>{
    window.__qualityTypes=[];
    window.LXSourceManager.requestAction=(source,action,params,done)=>{
      window.__qualityTypes.push(params.type);
      done(null,{url:'https://media.example.test/song.wav?id=allowed128'});
    };
  });
  await page.locator('#inline-replay-quality').click();
  await page.waitForFunction(()=>window.__qualityTypes.includes('128k'),{timeout:5000});
  assert.deepEqual(await page.evaluate(()=>window.__qualityTypes),['128k'],
    'Opt-in downgrade must bypass unsupported FLAC32 and resolve 128k');
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('由 flac32bit 降级'),{timeout:7500});
  await page.locator('#inline-reset-settings').click();
  checks.push('explicit-unsupported-flac-downgrades-to-working-128k');
  await page.locator('[data-view="search"]').click();
  await page.evaluate(()=>{
    window.LXSourceManager.requestAction=(source,action,params,done)=>
      done(null,{url:'https://media.example.test/song.wav?id=good'});
  });
  await page.evaluate(()=>{
    window.OnlyTestingMusicApp.playMusic({
      id:'123456',songmid:'123456',name:'歌词同步测试',singer:'测试歌手',source:'wy',interval:8
    });
  });
  await page.waitForFunction(()=>
    document.querySelectorAll('#lyrics-lines .lyrics-line').length===2,{timeout:10000});
  await page.waitForFunction(()=>document.getElementById('player-cover-image')?.naturalWidth>0,{timeout:5500});
  assert.equal(await page.locator('#open-lyrics-btn').count(),0,'No redundant lyrics button');
  await page.locator('#player-cover-button').click();
  assert.equal(await page.locator('#lyrics-overlay').isVisible(),true,'Clicking album art opens Now Playing');
  assert.equal(await page.locator('#lyrics-title').textContent(),'歌词同步测试');
  assert.equal(await page.locator('#now-playing-album').textContent(),'专辑：测试专辑');
  const immersion=await page.evaluate(()=>{
    const box=document.querySelector('.lyrics-overlay').getBoundingClientRect();
    return {w:box.width,h:box.height,vw:innerWidth,vh:innerHeight};
  });
  assert.ok(immersion.w>=immersion.vw-1&&immersion.h>=immersion.vh-1,
    'Now Playing must fill entire viewport: '+JSON.stringify(immersion));
  await page.waitForFunction(()=>!!document.querySelector('#lyrics-lines .lyrics-line.active'),{timeout:5500});
  const center=await page.evaluate(()=>{
    const scroll=document.getElementById('lyrics-scroll').getBoundingClientRect();
    const line=document.querySelector('#lyrics-lines .lyrics-line.active').getBoundingClientRect();
    return Math.abs((line.top+line.height/2)-(scroll.top+scroll.height/2));
  });
  assert.ok(center<120,'Active lyric must be vertically centered: '+center);
  assert.equal(await page.locator('#detail-toggle-btn').isVisible(),true);
  assert.equal(await page.locator('#detail-seek').isVisible(),true);
  await page.locator('#comments-tab').click();
  await page.waitForFunction(()=>document.querySelectorAll('.now-comment-card').length===1,{timeout:5500});
  assert.equal(await page.locator('.now-comment-card p').first().textContent(),'真喜欢这首歌的旋律');
  await page.locator('#comments-recent-btn').click();
  await page.waitForFunction(()=>document.querySelectorAll('.now-comment-card').length===20,{timeout:5500});
  assert.equal(await page.locator('.now-comment-card p').first().textContent(),'真实新评论 0');
  assert.equal(await page.locator('#comments-load-more').isVisible(),false,
    'Comment pagination must work without a manual button');
  await page.locator('#comments-list').evaluate(el=>{
    el.scrollTop=el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  await page.waitForFunction(()=>document.querySelectorAll('.now-comment-card').length===40,{timeout:5500});
  assert.equal(await page.locator('.now-comment-card p').last().textContent(),'真实新评论 39');
  await page.locator('#comments-hot-btn').click();
  await page.waitForFunction(()=>document.querySelectorAll('.now-comment-card').length===1,{timeout:5500});
  checks.push('hot-latest-comment-pagination');

  assert.ok((await page.locator('#comments-official-link').getAttribute('href')).endsWith('id=123456'));
  await page.locator('.now-playing-cover-box').click();
  assert.equal(await page.locator('#lyrics-overlay').isVisible(),true,'Clicking left side never dismisses full-screen player');
  await page.locator('#lyrics-tab').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#lyrics-overlay').isVisible(),false,'Escape closes full screen');
  checks.push('immersive-fullscreen-art-comments-lyrics');


  // Exercise the library as a real desktop split-view with 50 songs.
  await page.evaluate(()=>{
    window.LXMusicLibrary.clearHistory();
    for(let i=0;i<50;i++)window.LXMusicLibrary.addHistory({
      id:'history-'+i,name:'收藏试听 '+i,singer:'演唱者 '+i,source:'wy'
    });
    window.OnlyTestingMusicApp.renderLibraryListForExternal(
      document.getElementById('history-list'),
      window.LXMusicLibrary.snapshot().history,'history');
  });
  await page.locator('[data-view="mylist"]').click();
  assert.equal(await page.locator('.music-library-sidebar').isVisible(),true);
  assert.equal(await page.locator('#history-list .library-row').count(),50);
  const library=await page.evaluate(()=>{
    const pane=document.querySelector('.music-library-content');
    return {height:pane.clientHeight,scroll:pane.scrollHeight,columns:getComputedStyle(
      document.querySelector('.music-library-workspace')).gridTemplateColumns.split(' ').length};
  });
  assert.equal(library.columns,2,'Desktop library must have two columns');
  assert.ok(library.scroll>library.height,'Large library must scroll inside right panel');
  await page.locator('[data-my-tab="queue"]').click();
  assert.equal(await page.locator('#my-queue-panel').isVisible(),true);
  assert.equal(await page.locator('#my-history-panel').isVisible(),false);
  await page.locator('[data-my-tab="history"]').click();
  await page.locator('#history-list .library-main').first().click();
  await page.waitForFunction(()=>document.querySelector('#player-title')?.textContent.startsWith('收藏试听'),{timeout:5000});
  checks.push('single-tap-library-history');
  checks.push('library-split');
  await page.locator('[data-view="search"]').click();

  const old=requests.filter(p=>/promise-lite|android-native-|android-external-audio|\/api\/babel|babel\.min\.js/.test(p));
  assert.deepEqual(old,[],'Legacy compatibility scripts must not load');
  assert.deepEqual(failures,[],'No page errors on desktop');
  checks.push('desktop');
  await page.locator('#search-results .search-song-main').nth(1).click();
  await page.waitForFunction(()=>document.getElementById('player-title')?.textContent==='滑动搜索歌曲 21',{timeout:5000});
  assert.equal(await page.locator('#search-results .search-song-row').count(),45);
  const searchTheme=await page.locator('#search-results .song-action-play').first().evaluate(el=>{
    const x=getComputedStyle(el);return {radius:x.borderRadius,bg:x.backgroundColor};
  });
  assert.ok(parseFloat(searchTheme.radius)>=8 && searchTheme.bg!=='rgb(239, 239, 239)',
    'Search play control must use common theme: '+JSON.stringify(searchTheme));
  checks.push('single-tap-search-and-themed-play');
  await page.locator('[data-view="playlist"]').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#view-playlist').evaluate(el=>el.classList.contains('active')),true);
  await page.locator('[data-view="ranking"]').click();
  assert.equal(await page.locator('[data-ranking-source="tx"]').isVisible(),true);
  await page.locator('[data-ranking-source="tx"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#ranking-list .ranking-item').length>0,{timeout:5000});
  await page.locator('#ranking-list .ranking-item').first().click();
  await page.waitForFunction(()=>document.querySelector('#ranking-songs')?.textContent.includes('QQ热歌'),{timeout:5000});
  assert.equal(await page.locator('#ranking-songs .chart-song-info').count(),1);
  await page.locator('#ranking-songs .chart-song-info').click();
  await page.waitForFunction(()=>document.getElementById('player-title')?.textContent==='QQ热歌',{timeout:5000});
  const buttonVisual=await page.locator('#ranking-songs .chart-play-btn').evaluate(el=>{
    const css=getComputedStyle(el);
    return {bg:css.backgroundColor,radius:css.borderRadius,minHeight:el.getBoundingClientRect().height};
  });
  assert.ok(buttonVisual.radius!=='0px'&&buttonVisual.bg.startsWith('rgb('),
    'Chart buttons must follow mint theme, not browser defaults: '+JSON.stringify(buttonVisual));
  assert.ok(buttonVisual.minHeight>=32,'Chart buttons must be tap-sized');
  checks.push('ranking-tap-song-and-themed-button');
  await page.locator('[data-ranking-source="wy"]').click();
  await page.locator('[data-view="playlist"]').click();
  assert.equal(await page.locator('#view-playlist [data-catalog-source="tx"]').isVisible(),true);
  await page.locator('#view-playlist [data-catalog-source="tx"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#playlist-featured .playlist-card').length>0,{timeout:5000});
  await page.locator('#playlist-featured .playlist-open-button').first().click();
  await page.waitForFunction(()=>document.querySelector('#playlist-detail-songs')?.textContent.includes('QQ歌单歌曲'),{timeout:5000});
  assert.equal(await page.locator('#view-playlist').evaluate(el=>el.classList.contains('is-detail-open')),true);
  await page.locator('#playlist-back-btn').click();
  await page.locator('#view-playlist [data-catalog-source="wy"]').click();
  checks.push('multi-platform-catalog-list-detail');
  checks.push('navigation');
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(100);
  const measure=await page.evaluate(()=>({
    page:document.documentElement.scrollWidth,
    viewport:window.innerWidth,
    nav:getComputedStyle(document.querySelector('.main-nav')).gridTemplateColumns.split(' ').length,
    controls:document.getElementById('player-toggle-btn').getBoundingClientRect()
  }));
  assert.ok(measure.page<=measure.viewport+2,'No sideways mobile scrolling');
  assert.equal(measure.nav,5,'Five bottom/top mobile navigation choices visible');
  assert.ok(measure.controls.width>=40,'Transport remains easily tappable');
  await page.locator('[data-view="search"]').click();
  const songMobile=await page.evaluate(()=>{
    const row=document.querySelector('#search-results .search-song-row');
    const rect=sel=>row?.querySelector(sel)?.getBoundingClientRect();
    const number=rect('.song-row-index'),title=rect('.song-title'),
      main=rect('.search-song-main'),actions=rect('.search-actions');
    const more=row?.querySelector('.song-more>summary');
    const play=row?.querySelector('.song-action-play');
    return {width:document.documentElement.scrollWidth,vw:innerWidth,
      rowHeight:row?.getBoundingClientRect().height,
      numberTop:number?.top,titleTop:title?.top,titleWidth:title?.width,
      mainRight:main?.right,actionsLeft:actions?.left,
      playWidth:play?.getBoundingClientRect().width,
      moreWidth:more?.getBoundingClientRect().width,
      queueVisible:getComputedStyle(row.querySelector('.song-action-queue')).display!=='none'};
  });
  assert.ok(songMobile.width<=songMobile.vw+2,'Search mobile overflow: '+JSON.stringify(songMobile));
  assert.ok(Math.abs(songMobile.numberTop-songMobile.titleTop)<22,
    'Number and song title must be same row: '+JSON.stringify(songMobile));
  assert.ok(songMobile.titleWidth>=115&&songMobile.mainRight<=songMobile.actionsLeft+3,
    'Song name must have usable space beside actions: '+JSON.stringify(songMobile));
  assert.ok(songMobile.rowHeight<=78&&!songMobile.queueVisible,
    'Mobile song rows must be compact: '+JSON.stringify(songMobile));
  await page.locator('#search-results .song-more summary').first().click();
  assert.equal(await page.locator('#search-results .song-more').first().getAttribute('open'),'',
    'Secondary actions should be in a discoverable overflow menu');
  await page.locator('#search-results .song-more-menu .song-action-queue').first().click();
  assert.equal(await page.locator('#player-title').textContent(),'滑动搜索歌曲 21',
    'Queue action must not accidentally start another song');
  checks.push('390px-search-row-density-and-safe-overflow-menu');
  await page.locator('[data-view="mylist"]').click();
  const clearTheme=await page.locator('#clear-history-btn').evaluate(el=>{
    const x=getComputedStyle(el);return {radius:x.borderRadius,bg:x.backgroundColor};
  });
  assert.ok(parseFloat(clearTheme.radius)>=8&&clearTheme.bg!=='rgb(239, 239, 239)',
    'Clear history must use common theme: '+JSON.stringify(clearTheme));
  await page.locator('[data-view="ranking"]').click();
  await page.locator('[data-ranking-source="tx"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#ranking-songs .chart-song-row').length>0,{timeout:5000});
  const compact=await page.evaluate(()=>{
    const row=document.querySelector('#ranking-songs .chart-song-row');
    const info=row?.querySelector('.chart-song-info')?.getBoundingClientRect();
    const play=row?.querySelector('.chart-play-btn')?.getBoundingClientRect();
    const box=selector=>{
      const el=document.querySelector(selector),r=el?.getBoundingClientRect();
      return r?{left:Math.round(r.left),width:Math.round(r.width),display:getComputedStyle(el).display}:null;
    };
    return {page:document.documentElement.scrollWidth,viewport:innerWidth,
      infoWidth:info?.width,playLeft:play?.left,infoRight:info?.right,
      playRight:play?.right,
      rankingLayout:box('#view-ranking .ranking-layout'),
      rankingContent:box('#view-ranking .ranking-content'),
      rankingSongs:box('#ranking-songs'),
      row:box('#ranking-songs .chart-song-row'),
      main:box('.main-stage')};
  });
  assert.ok(compact.page<=compact.viewport+2,'Ranking must not overflow phone: '+JSON.stringify(compact));
  assert.ok(compact.infoWidth>100&&compact.infoRight<=compact.playLeft+8,
    'Song title must remain readable and separate from play button: '+JSON.stringify(compact));
  assert.ok(compact.playRight<=compact.viewport,'Chart play button must fit viewport');
  await page.setViewportSize({width:320,height:740});
  const narrow=await page.evaluate(()=>({
    width:document.documentElement.scrollWidth,viewport:innerWidth,
    playRight:document.querySelector('.chart-play-btn')?.getBoundingClientRect().right
  }));
  assert.ok(narrow.width<=narrow.viewport+2 && narrow.playRight<=narrow.viewport,
    '320px chart layout must remain readable without horizontal overflow');
  await page.setViewportSize({width:390,height:844});
  checks.push('ranking-390-and-320-responsive');
  await page.locator('[data-view="mylist"]').click();
  const mobileLibrary=await page.evaluate(()=>({
    layout:getComputedStyle(document.querySelector('.music-library-workspace')).flexDirection,
    page:document.documentElement.scrollWidth,width:innerWidth,
    scroll:getComputedStyle(document.querySelector('.music-library-content')).overflowY
  }));
  assert.equal(mobileLibrary.layout,'column','Mobile library must stack vertically');
  assert.ok(mobileLibrary.page<=mobileLibrary.width+2,'Mobile library must not overflow horizontally');
  await page.locator('[data-my-tab="favorite"]').click();
  assert.equal(await page.locator('#my-favorite-panel').isVisible(),true);
  checks.push('mobile-library');

  // QQ chart songs may legitimately lack cover metadata. Restore a
  // NetEase song with known mock art before asserting real cover images.
  await page.evaluate(()=>window.OnlyTestingMusicApp.playMusic({
    id:'123456',songmid:'123456',name:'歌词同步测试',singer:'测试歌手',source:'wy',interval:8
  }));
  await page.waitForFunction(()=>document.getElementById('player-cover-image')?.naturalWidth>0,{timeout:5500});
  await page.locator('#player-cover-button').click();
  assert.equal(await page.locator('#lyrics-overlay').isVisible(),true);
  const fullMobile=await page.evaluate(()=>{
    const overlay=document.getElementById('lyrics-overlay').getBoundingClientRect();
    const seek=document.getElementById('detail-seek').getBoundingClientRect();
    const current=document.querySelector('.lyrics-line.active')?.getBoundingClientRect();
    const viewport=document.getElementById('lyrics-scroll').getBoundingClientRect();
    return {screenW:overlay.width,screenH:overlay.height,w:innerWidth,h:innerHeight,
      hasArt:!document.getElementById('lyrics-cover-image').hidden,
      seekVisible:seek.width>50 && seek.left>=0 && seek.right<=innerWidth,
      center:current?Math.abs(current.top+current.height/2-viewport.top-viewport.height/2):null
    };
  });
  assert.ok(fullMobile.screenW>=fullMobile.w-1 && fullMobile.screenH>=fullMobile.h-1,
    'Phone Now Playing must occupy entire viewport '+JSON.stringify(fullMobile));
  assert.equal(fullMobile.hasArt,true,'Mobile screen must show real album art');
  assert.equal(fullMobile.seekVisible,true,'Full-screen progress control must fit phone');
  assert.ok(fullMobile.center==null||fullMobile.center<110,'Mobile current LRC line should remain centered');
  await page.locator('#comments-tab').click();
  assert.equal(await page.locator('#comments-view').isVisible(),true);
  await page.locator('#lyrics-close-btn').click();
  assert.equal(await page.locator('#lyrics-overlay').isVisible(),false);
  checks.push('mobile-fullscreen');

  checks.push('mobile');
  console.log('PASS modern-web:',checks.join(', '),'Flower-first recovery, bounded playback and responsive library');
}finally{await browser.close()}
