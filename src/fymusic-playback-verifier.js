import {createPlaybackVerifier} from './fymusic-playback-core.js';
// Passive, event-driven observer: does not modify audio.src, play(), or handlers.
const audio=document.getElementById('audio');
const monitor=createPlaybackVerifier();
const events=['loadstart','loadedmetadata','loadeddata','canplay','playing',
 'timeupdate','waiting','stalled','pause','ended','error','seeking','seeked','emptied','abort'];
let panel=null;
function notify(){
 if(panel){
  const s=monitor.snapshot();
  panel.textContent=[
   'FyMusic · 播放诊断',
   '状态：'+s.phase,
   '来源：'+(s.source||'—')+' · 请求音质：'+(s.quality||'—'),
   'URL：'+(s.urlResolved?'已获得':'未获得'),
   '媒体 HTTP：'+(s.mediaHttp?.status??'未暴露')+
    ' · MIME：'+(s.mediaHttp?.mime||'未知'),
   'HTTP 分类：'+(s.mediaHttp?.result||'未观察到'),
   '目录身份：'+s.identity.status+' ('+s.identity.reason+')',
   '解析错误：'+(s.resolverFailure||'无'),
   '元数据：'+(s.metadataLoaded?'已加载':'未确认'),
   '媒体：'+(s.mediaReady?'可解码':'未确认'),
   '进度：'+(s.progressConfirmed?'已推进':'未验证'),
   '时间：'+s.mediaSeconds+' 秒',
   '失败：'+(s.failureCode||'无')
  ].join('\n');
 }
 window.dispatchEvent(new CustomEvent('fymusic:diagnostics-update'));
}
window.FyMusicPlaybackDiagnostics=Object.freeze({snapshot:()=>monitor.snapshot()});
window.addEventListener('lx:trackchange',event=>{
 monitor.begin(event.detail||{});notify();
});
window.addEventListener('fymusic:url-resolved',event=>{
 monitor.resolved(event.detail||{});notify();
});
window.addEventListener('fymusic:resolver-error',event=>{
 monitor.resolverError(event.detail||{});notify();
});
window.addEventListener('fymusic:catalog-identity',event=>{
 monitor.catalogIdentity(event.detail?.expected,event.detail?.candidate);notify();
});
window.addEventListener('fymusic:media-http',event=>{
 monitor.httpResponse(event.detail||{});notify();
});
// Passive Resource Timing gives HTTP status only when the browser exposes
// it for this origin. Cross-origin 0/absent means UNKNOWN, never HTTP failure.
// No new media request is made; URL strings are used only for in-memory match.
if(audio&&'PerformanceObserver' in window){
 try{
  const observer=new PerformanceObserver(list=>{
   for(const entry of list.getEntries()){
    if(entry.initiatorType!=='audio')continue;
    if(!audio.currentSrc||entry.name!==audio.currentSrc)continue;
    const status=Number(entry.responseStatus)||null;
    const mime=typeof entry.contentType==='string'?entry.contentType:'';
    if(status===null&&!mime)continue;
    monitor.httpResponse({status,contentType:mime,provenance:'resource_timing'});
    notify();
   }
  });
  observer.observe({type:'resource',buffered:false});
 }catch{}
}
if(audio)for(const event of events){
 audio.addEventListener(event,()=>{
  monitor.media(event,{currentTime:audio.currentTime,duration:audio.duration,
   readyState:audio.readyState,paused:audio.paused,seeking:audio.seeking,
   errorCode:audio.error?.code||null});
  if(event!=='timeupdate'||panel)notify();
 },{passive:true});
}
// No panel, polling, storage or reflow in normal use. Opt-in: ?fy_debug=1
if(new URL(location.href).searchParams.get('fy_debug')==='1'){
 panel=document.createElement('pre');panel.id='fymusic-playback-debug';
 panel.setAttribute('role','status');panel.setAttribute('aria-live','off');
 Object.assign(panel.style,{
  position:'fixed',right:'14px',bottom:'92px',zIndex:'10000',
  padding:'14px 16px',margin:'0',maxWidth:'min(340px,90vw)',
  borderRadius:'14px',whiteSpace:'pre-wrap',
  background:'rgba(15,23,42,.94)',color:'#e2e8f0',
  font:'12px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace',
  boxShadow:'0 12px 34px rgba(0,0,0,.2)',pointerEvents:'none'
 });
 document.body.append(panel);notify();
}
