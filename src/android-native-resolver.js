/* Android 4.4 APK-only resolver transport. Request is always to the
 * existing same-origin Cloudflare proxy and native Java permits just three
 * built-in provider hosts. No change to ordinary desktop/mobile browsers. */
(function (root) {
  'use strict';
  var pending={},sequence=0;
  var nativeApi=root.LXNativeAudio;
  var enabled=!!(nativeApi && typeof nativeApi.fetchResolver==='function');
  function request(url,method,body,packedHeaders,callback) {
    if(!enabled)return null;
    var origin=root.location.protocol+'//'+root.location.host;
    var relative=String(url||'');
    if(relative.indexOf(origin+'/api/proxy?url=')!==0)return null;
    relative=relative.substring(origin.length);
    var done=false,id=++sequence;
    if(sequence>100000000)sequence=1;
    id=sequence;
    var timer=root.setTimeout(function(){
      receive(id,0,'{"error":"Native resolver timeout"}');
    },22000);
    pending[id]=function(status,text) {
      if(done)return;
      done=true;root.clearTimeout(timer);
      delete pending[id];
      callback(Number(status)||0,String(text||''));
    };
    try{nativeApi.fetchResolver(id,relative,String(method||'GET').toUpperCase(),
      String(body||''),String(packedHeaders||'{}'));}
    catch(err){receive(id,0,'{"error":"Native bridge call failed"}');}
    return function(){
      if(done)return;
      done=true;root.clearTimeout(timer);delete pending[id];
    };
  }
  function receive(id,status,text) {
    if(Object.prototype.hasOwnProperty.call(pending,id))pending[id](status,text);
  }
  root.LXNativeResolverTransport={enabled:enabled,request:request,receive:receive};
})(window);
