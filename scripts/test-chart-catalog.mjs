import assert from 'node:assert/strict';
import {onRequestGet as netease} from '../functions/api/netease-toplist.js';
import {onRequestGet as qq} from '../functions/api/qq-catalog.js';
const req=path=>new Request('https://only-testing-online-music.pages.dev'+path);
const saved=globalThis.fetch;
try{
  assert.equal((await netease({request:req('/api/netease-toplist?id=../private')})).status,400);
  assert.equal((await qq({request:req('/api/qq-catalog?kind=playlist&id=http://127.0.0.1')})).status,400);
  let calls=[];
  globalThis.fetch=async u=>{
    const url=new URL(String(u));calls.push(url);
    assert.equal(url.hostname,'music.163.com','NetEase adapter must never fetch user-supplied hosts');
    if(url.pathname==='/api/toplist')return new Response(JSON.stringify({list:[{id:3778678,name:'热歌榜'}]}));
    if(url.pathname==='/api/v6/playlist/detail')return new Response(JSON.stringify({code:200,playlist:{
      id:3778678,name:'热歌榜',trackCount:100,tracks:[],trackIds:[{id:123},{id:456}]
    }}));
    if(url.pathname==='/api/song/detail')return new Response(JSON.stringify({songs:[
      {id:456,name:'第二首',ar:[{name:'歌手'}],al:{name:'专辑'}},
      {id:123,name:'第一首',ar:[{name:'歌手'}],al:{name:'专辑'}}
    ]}));
    throw Error('Unexpected '+url);
  };
  const chartList=await netease({request:req('/api/netease-toplist')});
  assert.equal((await chartList.json()).list[0].id,'3778678');
  const chart=await netease({request:req('/api/netease-toplist?id=3778678&limit=20')});
  assert.equal(chart.status,200);
  const tracks=(await chart.json()).songs;
  assert.deepEqual(tracks.map(x=>x.name),['第一首','第二首'],'Chart must reorder batch song details by trackIds');
  assert.equal(tracks[0].source,'wy');
  calls=[];
  const qqSearchRequests=[];
  globalThis.fetch=async (u,options={})=>{
    const url=new URL(String(u));calls.push(url);
    assert.ok(['c.y.qq.com','u.y.qq.com'].includes(url.hostname),
      'QQ adapter must never fetch user-supplied hosts');
    if(url.hostname==='u.y.qq.com'){
      assert.equal(url.pathname,'/cgi-bin/musicu.fcg');
      assert.equal(options.method,'POST');
      const query=JSON.parse(options.body)['music.search.SearchCgiService'];
      assert.equal(query.module,'music.search.SearchCgiService');
      assert.equal(query.method,'DoSearchForQQMusicDesktop');
      assert.equal(query.param.search_type,3);
      qqSearchRequests.push({term:query.param.query,page:query.param.page_num,limit:query.param.num_per_page});
      if(query.param.query==='民谣'){
        assert.equal(query.param.page_num,2,'QQ keyword pagination must request next page');
        return new Response(JSON.stringify({code:0,
          'music.search.SearchCgiService':{code:0,data:{body:{playlist:{
            totalnum:45,list:[{dissid:87654,dissname:'民谣精选',song_count:28,
            creator:{name:'听友'},imgurl:'https://example.com/cover.png'}]
          }}}}
        }));
      }
      // A valid QQ search response may have no top-level service code.
      if(query.param.query==='周杰伦')return new Response(JSON.stringify({
        'music.search.SearchCgiService':{code:0,data:{body:{playlist:{
          totalnum:1,list:[{dissid:9988,dissname:'周杰伦精选',song_count:12,creator:{name:'听友'}}]
        }}}}
      }));
      if(query.param.query==='服务错误')return new Response(JSON.stringify({code:0,
        'music.search.SearchCgiService':{code:1203,data:{body:{songlist:{list:[]}}}}}));
      if(query.param.query==='无结果')return new Response(JSON.stringify({code:0,
        'music.search.SearchCgiService':{code:0,data:{body:{playlist:{totalnum:0,list:[]}}}}
      }));
      if(query.param.query==='超时测试'){
        const error=new Error('simulated upstream timeout');error.name='AbortError';throw error;
      }
      throw Error('Unexpected QQ search term: '+query.param.query);
    }
    if(url.pathname.includes('fcg_myqq_toplist.fcg'))return new Response(JSON.stringify({data:{topList:[{id:26,topTitle:'QQ热歌榜'}]}}));
    if(url.pathname.includes('fcg_v8_toplist_cp.fcg'))return new Response(JSON.stringify({songlist:[{data:{songmid:'QQMid',songname:'QQ歌曲',singer:[{name:'艺人'}],album:{name:'专辑'}}}]}));
    if(url.pathname.includes('fcg_get_diss_by_tag.fcg'))return new Response(JSON.stringify({data:{list:[{dissid:1234,dissname:'QQ歌单',creator:{name:'听友'},song_count:12}]}}));
    if(url.pathname.includes('fcg_ucc_getcdinfo_byids_cp.fcg'))return new Response(JSON.stringify({cdlist:[{dissname:'QQ歌单',songnum:1,songlist:[{songmid:'QQMid',songname:'QQ歌曲',singer:[{name:'艺人'}]}]}]}));
    throw Error('Unexpected '+url);
  };
  const qList=await qq({request:req('/api/qq-catalog?kind=rank')});
  assert.equal((await qList.json()).list[0].name,'QQ热歌榜');
  const qChart=await qq({request:req('/api/qq-catalog?kind=rank&id=26')});
  assert.deepEqual((await qChart.json()).songs.map(x=>x.source),['tx']);
  const qPlaylist=await qq({request:req('/api/qq-catalog?kind=playlist')});
  assert.equal((await qPlaylist.json()).result.playlists[0].id,'1234');
  const beforeWhitespace=qqSearchRequests.length;
  const qWhitespace=await qq({request:req('/api/qq-catalog?kind=playlist&s=%20%20')});
  assert.equal((await qWhitespace.json()).result.playlists[0].id,'1234',
    'Whitespace-only keyword should behave like an empty keyword');
  assert.equal(qqSearchRequests.length,beforeWhitespace,'Whitespace-only query must not call search');
  const qDetail=await qq({request:req('/api/qq-catalog?kind=playlist&id=1234')});
  assert.equal((await qDetail.json()).songs[0].source,'tx');
  const qSearch=await qq({request:req('/api/qq-catalog?kind=playlist&s=%E6%B0%91%E8%B0%A3&offset=20&limit=20')});
  assert.equal(qSearch.status,200,'QQ keyword search must not return 422');
  const qSearchBody=await qSearch.json();
  assert.equal(qSearchBody.result.playlists[0].name,'民谣精选');
  assert.equal(qSearchBody.result.playlists[0].source,'tx');
  assert.equal(qSearchBody.result.playlistCount,45);
  const qOther=await qq({request:req('/api/qq-catalog?kind=playlist&s=%E5%91%A8%E6%9D%B0%E4%BC%A6&offset=0&limit=20')});
  assert.equal(qOther.status,200,'Other Chinese keywords must also work');
  assert.equal((await qOther.json()).result.playlists[0].name,'周杰伦精选');
  const qBadCode=await qq({request:req('/api/qq-catalog?kind=playlist&s=%E6%9C%8D%E5%8A%A1%E9%94%99%E8%AF%AF')});
  assert.equal(qBadCode.status,502,'Explicit QQ service errors must not be mistaken for empty search');
  assert.equal((await qBadCode.json()).diagnostic,'SEARCH_MODULE_CODE');
  const qNoResults=await qq({request:req('/api/qq-catalog?kind=playlist&s=%E6%97%A0%E7%BB%93%E6%9E%9C&offset=0&limit=20')});
  assert.equal(qNoResults.status,200,'An empty result is not an upstream failure');
  assert.deepEqual((await qNoResults.json()).result.playlists,[]);
  const qRepeat=await qq({request:req('/api/qq-catalog?kind=playlist&s=%E6%B0%91%E8%B0%A3&offset=20&limit=20')});
  assert.equal(qRepeat.status,200,'Repeated identical searches must remain safe');
  assert.equal(qqSearchRequests.filter(x=>x.term==='民谣'&&x.page===2).length,2);
  const qTimeout=await qq({request:req('/api/qq-catalog?kind=playlist&s=%E8%B6%85%E6%97%B6%E6%B5%8B%E8%AF%95')});
  assert.equal(qTimeout.status,502);
  assert.match((await qTimeout.json()).message,/请求超时/);
  assert.ok(calls.some(x=>x.hostname==='u.y.qq.com'),'Search requires the fixed, official QQ search host');
}finally{globalThis.fetch=saved}
console.log('PASS: NetEase chart full trackIds order, QQ catalog normalization, fixed hosts and validation');
