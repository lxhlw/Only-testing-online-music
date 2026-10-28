/* Native modern-browser source loader. No Babel, ES5 transforms or polyfill CDN. */
(function(global){
  'use strict';
  global.LXSourceTranspiler={
    version:'modern-native',
    isLoaded:function(){return true;},
    urls:[],
    prepare:function(code,filename,callback){
      try {
        new Function(String(code||''));
        queueMicrotask(function(){callback(null,String(code||''),false)});
      } catch(error){
        queueMicrotask(function(){callback(new Error('音源脚本无法在现代浏览器执行：'+error.message),null,false)});
      }
    }
  };
})(window);
