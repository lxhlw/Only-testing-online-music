/* Android API 19 companion APK only. No effect in ordinary browsers/Via.
 * XHR is known to fetch bytes on the tablet even though its HTML5 Audio
 * decoder returns MEDIA_ERR_SRC_NOT_SUPPORTED. Keep the byte transfer bounded.
 */
(function (root) {
 'use strict';
 var nativeBridge=root.LXNativeBridge;
 var available=!!(nativeBridge && typeof nativeBridge.begin==='function' &&
   typeof nativeBridge.append==='function' && typeof nativeBridge.finish==='function');
 var current=null;
 var listener=null;
 var MAX_BYTES=24*1024*1024;
 var CHUNK=8192;
 function emit(id,event,position,duration) {
   if(listener)listener(String(id),event,Number(position)||0,Number(duration)||0);
 }
 function stop() {
   if(current && current.xhr){try{current.xhr.abort();}catch(e){}}
   current=null;
   if(available)try{nativeBridge.stop();}catch(e){}
 }
 function load(url,id,onChange) {
   if(!available)return false;
   stop();
   if(!/^https:\/\//i.test(String(url||'')) && !/^\/api\//.test(String(url||''))) {
     if(onChange)onChange('error',0,0);
     return false;
   }
   listener=onChange?function(session,event,time,duration){
     if(session===String(id))onChange(event,time,duration);
   }:null;
   var state={id:String(id),xhr:null};
   current=state;
   var xhr=new XMLHttpRequest();
   state.xhr=xhr;
   xhr.open('GET',String(url),true);
   xhr.responseType='arraybuffer';
   xhr.timeout=45000;
   xhr.onreadystatechange=function(){
     if(xhr.readyState!==4 || current!==state)return;
     if(xhr.status!==200 && xhr.status!==206){emit(id,'error',0,0);return;}
     var response=xhr.response;
     if(!response){emit(id,'error',0,0);return;}
     var bytes=new Uint8Array(response),length=bytes.length;
     if(length<1024 || length>MAX_BYTES){emit(id,'error',0,0);return;}
     var mime=String(xhr.getResponseHeader('Content-Type')||'').toLowerCase();
     if(mime.indexOf('text/html')>=0 || mime.indexOf('application/json')>=0) {
       emit(id,'error',0,0);return;
     }
     if(!nativeBridge.begin(state.id,length)){emit(id,'error',0,0);return;}
     var offset=0;
     function transfer(){
       if(current!==state)return;
       var batches=0;
       try{
         while(offset<length && batches<8){
           var limit=Math.min(offset+CHUNK,length),parts=[];
           for(var i=offset;i<limit;i++)parts.push(String.fromCharCode(bytes[i]));
           if(!nativeBridge.append(state.id,root.btoa(parts.join(''))))
              throw new Error('native append failed');
           offset=limit;batches++;
         }
         if(offset<length){root.setTimeout(transfer,0);return;}
         if(!nativeBridge.finish(state.id))throw new Error('native finish failed');
         emit(id,'transferred',length,0);
       }catch(error){try{nativeBridge.stop();}catch(e){} emit(id,'error',0,0);}
     }
     transfer();
   };
   xhr.onerror=function(){if(current===state)emit(id,'error',0,0);};
   xhr.ontimeout=function(){if(current===state)emit(id,'error',0,0);};
   try{xhr.send(null)}catch(error){emit(id,'error',0,0);}
   return true;
 }
 root.LXNativeAudioTransport={
   available:available,load:load,stop:stop,
   notify:function(id,event,position,duration){
     if(current && String(current.id)===String(id))emit(id,event,position,duration);
   }
 };
 if(available) {
   root.document.documentElement.className+=' lx-native-shell';
 }
})(window);
