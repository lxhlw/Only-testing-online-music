// Native Electron exercising original LX v2.12.6 preload via original IPC.
// No monkey patch to preload, Needle or source script; not full packaged LX UI.
// Never print signed URLs, song identifiers, headers or media contents.
const {app,BrowserWindow,ipcMain}=require('electron');
const {readFileSync}=require('node:fs');
const conf=JSON.parse(readFileSync(process.env.LX_DIAG_META,'utf8'));
let win,finished=false;
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
app.disableHardwareAcceleration();
function end(output) {
 if(finished)return;
 finished=true;
 console.log('ORIGINAL_NATIVE_RESULT '+JSON.stringify({
  platform:conf.platform,testCase:conf.testCase,...output}));
 setTimeout(()=>app.quit(),200);
}
setTimeout(()=>end({phase:'TIMEOUT',urlReturned:false,audioStarted:false}),36000);
ipcMain.on('userApi_init',(_e,value)=>{
 if(!value?.status||!value?.data?.sources?.[conf.platform]?.actions?.includes('musicUrl'))
   return end({phase:'INIT_FAILED',urlReturned:false,audioStarted:false});
 setTimeout(()=>win.webContents.send('userApi_request',{
  requestKey:'comparison',data:{source:conf.platform,action:'musicUrl',
  info:{type:'128k',musicInfo:conf.musicInfo}}
 }),80);
});
ipcMain.on('userApi_response',async(_e,value)=>{
 if(finished)return;
 if(!value?.status){
  const err=String(value?.message||'');
  return end({phase:'URL_FAILED',urlReturned:false,audioStarted:false,
   reason:/\b404\b/.test(err)?'HTTP_404':/\b400\b/.test(err)?'HTTP_400':
    /\b403\b/.test(err)?'HTTP_403':/timeout/i.test(err)?'TIMEOUT':
    /服务器异常/.test(err)?'FLOWER_SERVER_ABNORMAL':
    /^(?:Error:\s*)?failed$/i.test(err)?'GENERIC_FAILED':
    /Cannot read|undefined|not a function|is not defined/.test(err)?'RUNTIME_EXCEPTION':
    /^\d{3}$/.test(err)?'HTTP_'+err:'OTHER',errorMessageLength:err.length});
 }
 const url=value?.data?.result?.data?.url;
 if(typeof url!=='string'||!/^https?:\/\//.test(url))
   return end({phase:'INVALID_URL',urlReturned:false,audioStarted:false});
 try{
  const js='(async()=>{let a=document.createElement("audio");a.muted=true;document.body.appendChild(a);a.src='+
   JSON.stringify(url)+';try{await Promise.race([a.play(),new Promise((_,reject)=>setTimeout(()=>reject(Error("timeout")),10000))]);}catch(e){}'+
   'await new Promise(r=>setTimeout(r,3300));const out={audioStarted:!a.paused&&a.readyState>=2&&a.currentTime>=0.5,'+
   'duration:Number.isFinite(a.duration)?Math.round(a.duration):null,progress:Math.round(a.currentTime*10)/10};a.pause();return out;})()';
  const out=await Promise.race([win.webContents.executeJavaScript(js),
    new Promise((_,reject)=>setTimeout(()=>reject(Error('timeout')),16000))]);
  end({phase:out.audioStarted?'AUDIO_PLAYED':'URL_ONLY',urlReturned:true,...out});
 }catch{
  end({phase:'MEDIA_CHECK_FAILED',urlReturned:true,audioStarted:false});
 }
});
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:true,width:620,height:340,
  webPreferences:{preload:process.env.LX_DIAG_PRELOAD,contextIsolation:true,
  sandbox:false,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.on('did-finish-load',()=>win.webContents.send('userApi_initEnv',{
  name:'野花🌷',version:'1',description:'',author:'',homepage:'',
  proxy:{host:'',port:''},
  script:readFileSync(process.env.LX_DIAG_FLOWER,'utf8')
 }));
 await win.loadURL('data:text/html;charset=utf-8,'+
  encodeURIComponent('<!doctype html><meta charset="utf-8"><title>Original LX User API</title>'));
}).catch(()=>end({phase:'ELECTRON_START_FAILED',urlReturned:false,audioStarted:false}));
