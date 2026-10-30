import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlaybackVerifier} from '../src/fymusic-playback-core.js';

function fixture() {
 let ms=0;
 const now=()=>ms;
 const verifier=createPlaybackVerifier({now,maxEvents:12});
 const tick=delta=>{ms+=delta};
 const evidence=(currentTime,opts={})=>({
  currentTime,readyState:3,duration:200,paused:false,seeking:false,...opts
 });
 return {verifier,tick,evidence};
}
test('returned URL and playing event are not counted as decoded playback',()=>{
 const {verifier:v,evidence}=fixture();
 v.begin({name:'开始懂了',singer:'孙燕姿',source:'wy'});
 v.resolved({source:'wy',quality:'flac24bit',provider:'lx-source'});
 assert.equal(v.snapshot().urlResolved,true);
 assert.equal(v.snapshot().progressConfirmed,false);
 v.media('loadedmetadata',evidence(0));
 v.media('canplay',evidence(0));
 v.media('playing',evidence(0));
 assert.equal(v.snapshot().progressConfirmed,false);
 assert.equal(v.snapshot().phase,'playing_unverified');
});
test('realistic multiple timeupdate events confirm natural decoded-media progress',()=>{
 const {verifier:v,tick,evidence}=fixture();
 v.begin({source:'tx'});
 v.resolved({source:'tx',quality:'320k'});
 v.media('playing',evidence(0));
 v.media('timeupdate',evidence(0));
 tick(250);
 v.media('timeupdate',evidence(.24));
 assert.equal(v.snapshot().progressConfirmed,false);
 tick(350);
 v.media('timeupdate',evidence(.57));
 assert.equal(v.snapshot().progressConfirmed,true);
 assert.equal(v.snapshot().phase,'playback_confirmed');
 v.media('ended',evidence(199.9,{paused:true}));
 assert.equal(v.snapshot().completed,true);
});
test('seek jumps, paused transport, and unsupported media cannot create false success',()=>{
 const {verifier:v,tick,evidence}=fixture();
 v.begin({source:'kg'});v.resolved({source:'kg',quality:'flac'});
 v.media('playing',evidence(0));
 v.media('timeupdate',evidence(0));
 v.media('seeking',evidence(0,{seeking:true}));
 tick(1200);v.media('seeked',evidence(100));
 v.media('timeupdate',evidence(100));
 tick(200);v.media('timeupdate',evidence(100.05));
 v.media('timeupdate',evidence(110,{paused:true}));
 assert.equal(v.snapshot().progressConfirmed,false);
 v.media('error',evidence(110,{paused:true,errorCode:4}));
 assert.equal(v.snapshot().failureCode,'media_error');
 assert.equal(v.snapshot().mediaErrorCode,4);
 assert.equal(v.snapshot().progressConfirmed,false);
});
test('new track and quality fallback reset previous playback evidence',()=>{
 const {verifier:v,tick,evidence}=fixture();
 v.begin({name:'A',source:'wy'});v.resolved({quality:'flac'});
 v.media('playing',evidence(0));v.media('timeupdate',evidence(0));
 tick(800);v.media('timeupdate',evidence(.7));
 assert.equal(v.snapshot().progressConfirmed,true);
 v.resolverError('resolver_request_failed');
 v.resolved({quality:'320k'});
 assert.equal(v.snapshot().progressConfirmed,false);
 assert.equal(v.snapshot().quality,'320k');
 v.begin({name:'B',source:'tx'});
 assert.equal(v.snapshot().urlResolved,false);
 assert.equal(v.snapshot().title,'B');
 assert.equal(v.snapshot().progressConfirmed,false);
});
test('diagnostic snapshots are bounded, sanitized, and contain no raw media URLs',()=>{
 const {verifier:v}=fixture();
 v.begin({source:'https://secret.example/token=abc'});
 v.resolved({quality:'128k',provider:'source&sig=sensitive'});
 for(let i=0;i<30;i++)v.resolverError('retry');
 const snapshot=v.snapshot();
 assert.equal(snapshot.events.length,12);
 assert.equal(snapshot.urlResolved,true);
 assert.ok(!JSON.stringify(snapshot).includes('https://'));
 assert.ok(!JSON.stringify(snapshot).includes('secret.example'));
 assert.ok(!JSON.stringify(snapshot).includes('sensitive'));
});
