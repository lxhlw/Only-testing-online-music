(function(global) {
 'use strict';
 // Conservative catalog gate for explicitly user-approved KG -> KW retries.
 // Catalog metadata is not an audio fingerprint: keep confirmation mandatory.
 function normalize(value) {
  return String(value == null ? '' : value).normalize('NFKC').toLowerCase()
   .replace(/[\s\u00b7·._'"‘’“”–—,，:：!?！？()（）\[\]【】]+/g,'');
 }
 function durationSeconds(track) {
  if(!track || typeof track!=='object') return null;
  var source=track._interval!=null && track._interval!==''?track._interval:
   track.interval!=null && track.interval!==''?track.interval:track.duration;
  if(typeof source==='number')
   return Number.isFinite(source)&&source>=30&&source<=7200?Math.round(source):null;
  var text=String(source==null?'':source).trim();
  if(/^\d{1,4}$/.test(text)){
   var n=Number(text);
   return n>=30&&n<=7200?n:null;
  }
  var chunks=text.split(':');
  if((chunks.length!==2&&chunks.length!==3)||
     !chunks.every(function(x){return /^\d{1,2}$/.test(x);}))return null;
  var seconds=0;
  for(var i=0;i<chunks.length;i++){
   var value=Number(chunks[i]);
   if(i>0&&value>59)return null;
   seconds=seconds*60+value;
  }
  return seconds>=30&&seconds<=7200?seconds:null;
 }
 function inspect(original,candidate) {
  if(!original||!candidate||String(original.source||'kg').toLowerCase()!=='kg'||
     String(candidate.source||'').toLowerCase()!=='kw')
   return {accepted:false,reason:'wrong_platform'};
  var name=normalize(original.name),otherName=normalize(candidate.name);
  if(!name||!otherName||name!==otherName)
   return {accepted:false,reason:'title_mismatch'};
  var singer=normalize(original.singer),otherSinger=normalize(candidate.singer);
  if(!singer||!otherSinger||singer!==otherSinger)
   return {accepted:false,reason:'artist_mismatch'};
  var left=durationSeconds(original),right=durationSeconds(candidate);
  if(left===null||right===null)return {accepted:false,reason:'duration_missing'};
  var diff=Math.abs(left-right);
  if(diff>3)return {accepted:false,reason:'duration_mismatch',durationDiff:diff};
  // A known conflicting album makes an otherwise similar recording unsafe.
  var album=normalize(original.albumName||original.album);
  var otherAlbum=normalize(candidate.albumName||candidate.album);
  if(album&&otherAlbum&&album!==otherAlbum)
   return {accepted:false,reason:'album_mismatch'};
  return {accepted:true,reason:'metadata_match_only',durationDiff:diff,
   titleMatched:true,artistMatched:true,
   albumChecked:!!(album&&otherAlbum)};
 }
 function choices(original,list,limit) {
  var result=[];
  var count=Math.min(Array.isArray(list)?list.length:0,50);
  var max=Math.min(3,Math.max(1,Number(limit)||3));
  var used=Object.create(null);
  for(var i=0;i<count;i++){
   var item=list[i],verdict=inspect(original,item);
   if(!verdict.accepted)continue;
   var key=String(item.id||item.songmid||'')+'|'+normalize(item.name)+'|'+normalize(item.singer);
   if(used[key])continue;
   used[key]=true;
   result.push({item:item,verdict:verdict});
   if(result.length>=max)break;
  }
  return result;
 }
 global.FyMusicCrossPlatformMatch=Object.freeze({
  inspect:inspect,choices:choices,durationSeconds:durationSeconds
 });
})(window);
