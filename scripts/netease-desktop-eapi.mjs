// Exact desktop LX Music NetEase EAPI search encoding, for a read-only parity
// diagnostic. The desktop implementation lives in:
// src/renderer/utils/musicSdk/wy/{musicSearch.js,utils/crypto.js}.
// Never print encrypted params, cookies, user headers or raw API responses.
import {createHash,createCipheriv,createDecipheriv} from 'node:crypto';

export const DESKTOP_SEARCH_PATH='/api/search/song/list/page';
export const EAPI_BATCH='http://interface.music.163.com/eapi/batch';
const EAPI_KEY=Buffer.from('e82ckenh8dichen8','utf8');
const DELIMITER='-36cd479b6b5-';

export function desktopSearchBody(keyword,offset=0,limit=30) {
  return {
    keyword:String(keyword),
    needCorrect:'1',channel:'typing',
    offset:Number(offset),scene:'normal',
    total:Number(offset)===0,
    limit:Number(limit)
  };
}

export function encodeDesktopEapi(path,body){
  const text=JSON.stringify(body);
  const digest=createHash('md5').update(
    'nobody'+path+'use'+text+'md5forencrypt','utf8').digest('hex');
  const clear=path+DELIMITER+text+DELIMITER+digest;
  const cipher=createCipheriv('aes-128-ecb',EAPI_KEY,null);
  const params=Buffer.concat([cipher.update(clear,'utf8'),cipher.final()])
    .toString('hex').toUpperCase();
  return new URLSearchParams({params}).toString();
}

export function decodeDiagnosticOnly(encoded){
  const params=new URLSearchParams(encoded).get('params');
  const decipher=createDecipheriv('aes-128-ecb',EAPI_KEY,null);
  return Buffer.concat([
    decipher.update(Buffer.from(params,'hex')),decipher.final()
  ]).toString('utf8');
}

export function pickSong(list,title,artist) {
  const arr=Array.isArray(list)?list:[];
  const item=arr.find(x=>{
    const song=x?.baseInfo?.simpleSongData||x;
    const singers=song?.ar||song?.artists||[];
    return song?.name===title && Array.isArray(singers) &&
      singers.some(a=>a?.name===artist);
  });
  if(!item)return null;
  const song=item?.baseInfo?.simpleSongData||item;
  return {id:String(song.id||''),seconds:Math.round(Number(song.dt||song.duration||0)/1000),
    album:String((song.al||song.album)?.name||'')};
}
