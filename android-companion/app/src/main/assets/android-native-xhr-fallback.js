/* ES5 / Android KitKat WebView fallback for native HTTPS handshake failures.
   Reuses the browser's independently verified HTTPS transport, not HTML5 Audio.
   Native code authorizes each generation and only accepts bounded audio bytes. */
(function (root) {
 'use strict';
 function fail(g, message) {
   try { root.LXNativeAudio.failXhr(g, String(message || 'XHR failed').slice(0,120)); } catch (ignored) {}
 }
 function allowed(url) {
   var origin=root.location.protocol+'//'+root.location.host;
   var preview=(root.location.protocol==='http:' &&
     /^(127[.]0[.]0[.]1|localhost)$/.test(root.location.hostname));
   if(origin!=='https://only-testing-online-music.pages.dev' && !preview)return false;
   var target=String(url||'');
   return target.indexOf(origin+'/api/legacy-audio?')===0 ||
          target.indexOf(origin+'/api/proxy?')===0;
 }
 function fetchBytes(g,url) {
   if(!root.LXNativeAudio || typeof root.LXNativeAudio.beginXhr!=='function' || !allowed(url)){
     fail(g,'no trusted page/bridge');return;
   }
   var xhr=new XMLHttpRequest(),finished=false;
   try{
     xhr.open('GET',url,true);
     xhr.responseType='arraybuffer';
     xhr.timeout=45000;
   }catch(e){fail(g,'XHR unsupported: '+e.message);return;}
   xhr.onreadystatechange=function(){
     if(xhr.readyState!==4||finished)return;
     finished=true;
     if(xhr.status!==200 && xhr.status!==206){fail(g,'HTTP '+xhr.status);return;}
     try{
       var buffer=xhr.response;
       if(!buffer || !buffer.byteLength)throw new Error('empty response');
       var bytes=new Uint8Array(buffer),n=bytes.length;
       if(n<1024||n>30*1024*1024)throw new Error('invalid audio size: '+n);
       var type=String(xhr.getResponseHeader('Content-Type')||'').toLowerCase();
       if(type.indexOf('audio/')!==0 && type.indexOf('application/octet-stream')!==0)
         throw new Error('not audio Content-Type: '+type.slice(0,45));
       var announced=xhr.getResponseHeader('Content-Length');
       if(announced && (+announced!==n))throw new Error('Content-Length mismatch');
       if(xhr.status===206){
         var range=String(xhr.getResponseHeader('Content-Range')||'');
         var m=/^bytes ([0-9]+)-([0-9]+)\/([0-9]+)$/i.exec(range);
         if(!m||+m[1]!==0||+m[2]+1!==n||+m[3]!==n)
           throw new Error('partial 206 body');
       }
       if(typeof xhr.responseURL==='string'&&xhr.responseURL &&
          !allowed(xhr.responseURL))throw new Error('cross-origin redirect');
       if(!root.LXNativeAudio.beginXhr(g,n))throw new Error('native begin refused');
       var offset=0;
       var sendChunk = function(){
         try {
           var groups=0;
           while(offset<n && groups<8){
             var end=Math.min(offset+4096,n),chars=[];
             for(var i=offset;i<end;i++)chars.push(String.fromCharCode(bytes[i]));
             if(!root.LXNativeAudio.appendXhr(g,root.btoa(chars.join(''))))
               throw new Error('native append refused at '+offset);
             offset=end;groups++;
           }
           if(offset<n){root.setTimeout(sendChunk,0);return;}
           if(!root.LXNativeAudio.finishXhr(g))throw new Error('native finish refused');
         }catch(error){fail(g,'transfer '+String(error.message||error));}
       }
       sendChunk();
     }catch(error){fail(g,String(error.message||error));}
   };
   xhr.onerror=function(){if(!finished){finished=true;fail(g,'browser network error');}};
   xhr.ontimeout=function(){if(!finished){finished=true;fail(g,'browser XHR timeout');}};
   try{xhr.send(null);}catch(error){fail(g,String(error.message||error));}
 }
 root.LXNativeXhrFallback={fetchBytes:fetchBytes};
})(window);
