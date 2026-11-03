#!/usr/bin/env node
// Phase44: assemble and attest a runtime-only RELEASE CANDIDATE off main.
// This file never deploys, merges, bumps versions, or contacts third-party music.
import assert from 'node:assert/strict';
import {
  existsSync,readFileSync,readdirSync,rmSync,mkdirSync,copyFileSync,writeFileSync
} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join,dirname,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';

const mainSha='c9a496ab580fb54775721b93a3944800bcaefc44';
const candidate=process.env.FYMUSIC_RELEASE_CANDIDATE_DIR;
if(!candidate)throw Error('FYMUSIC_RELEASE_CANDIDATE_DIR is required');
const destination=resolve(candidate);
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(git('rev-parse','origin/main'),mainSha,
  'main SHA drifted; re-review the production baseline before building');
assert.equal(git('merge-base',mainSha,'HEAD'),mainSha,
  'candidate branch is not based on the audited production main');
const head=git('rev-parse','HEAD');
assert.notEqual(head,mainSha,'must run from the isolated development branch');
assert.ok(destination.length>10&&!destination.includes('/.git/'));

const runtime=[
  'functions/api/proxy.js',
  'index.html',
  'modern.css',
  'styles.css',
  'src/app.js',
  'src/mobile-shell.css',
  'src/mobile-shell.js',
  'src/modern-ui.js',
  'src/music-lyrics.js',
  'src/now-playing-experience.js',
  'src/player-controls.js',
  'src/source-manager.js',
  'src/fymusic-cross-platform-match.js',
  'src/fymusic-playback-verifier.js',
  'src/fymusic-playback-core.js',
  'src/fymusic-chain-report.js',
  'src/fymusic-diagnostic-classifier.js'
];
const allowed=new Set(runtime);
const explicitlyExcluded=new Set(['src/fymusic-media-evidence.js']);
const changed=git('diff','--name-only',mainSha+'...HEAD').split('\n').filter(Boolean);
const runtimeLike=/^(?:src\/|functions\/|index\.html$|styles\.css$|modern\.css$|version\.json$|package(?:-lock)?\.json$|settings\.html$)/;
const qaOnly=/^functions\/api\/fymusic-(?:codec|range|throttle)-selftest\.js$/;
const unreviewed=changed.filter(path=>runtimeLike.test(path)&&
  !allowed.has(path)&&!explicitlyExcluded.has(path)&&!qaOnly.test(path));
assert.deepEqual(unreviewed,[],
  'Unexpected runtime changes missing from the manually reviewed allowlist');
for(const path of runtime){
 assert.ok(existsSync(path),'missing source '+path);
 const full=join(destination,path);
 mkdirSync(dirname(full),{recursive:true});
 copyFileSync(path,full);
}
for(const path of ['.github','docs','scripts','qa-fixtures']){
 rmSync(join(destination,path),{recursive:true,force:true});
}
const allowedFixturePath=join(destination,'functions','api');
const residualQA=readdirSync(allowedFixturePath)
 .filter(name=>/^fymusic-(codec|range|throttle)-selftest\.js$/.test(name));
assert.deepEqual(residualQA,[],'QA endpoints in release candidate');
assert.ok(!existsSync(join(destination,'src/fymusic-media-evidence.js')),
 'diagnostic test-only module should not ship');
assert.ok(!existsSync(join(destination,'.github')),
 'release candidate may not include GitHub workflow code');
assert.ok(!existsSync(join(destination,'qa-fixtures')),
 'release candidate may not include generated audio fixture files');

// Verify the runtime's referenced local scripts and module import graph.
const html=readFileSync(join(destination,'index.html'),'utf8');
const paths=[...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)]
 .map(match=>match[1].split('?')[0])
 .filter(path=>path.startsWith('src/')||path==='styles.css'||path==='modern.css');
for(const path of paths)assert.ok(existsSync(join(destination,path)),
 'HTML references missing runtime asset '+path);
const sourcePaths=new Set(['src/fymusic-playback-verifier.js']);
const visit=(path)=>{
 if(!sourcePaths.has(path))sourcePaths.add(path);
 const body=readFileSync(join(destination,path),'utf8');
 for(const match of body.matchAll(/(?:import|export)\s+(?:[^'"]*?from\s*)?['"](\.[^'"]+)['"]/g)){
  const dep=relative(destination,resolve(dirname(join(destination,path)),match[1]));
  assert.ok(!dep.startsWith('..')&&existsSync(join(destination,dep)),
   'missing or unsafe module import '+dep);
  if(!sourcePaths.has(dep)){sourcePaths.add(dep);visit(dep)}
 }
};
visit('src/fymusic-playback-verifier.js');
const mediaCount=(html.match(/<audio\b/g)||[]).length;
assert.equal(mediaCount,1,'only one HTML audio element may be present');
const version=JSON.parse(readFileSync(join(destination,'version.json'),'utf8')).version;
const baseVersion=JSON.parse(readFileSync('version.json','utf8')).version;
assert.equal(version,baseVersion,'candidate version drifted; a release bump is a separate operation');
const entries=runtime.map(path=>{
 const bytes=readFileSync(join(destination,path));
 return {path,sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length};
});
const manifest={phase:44,baselineMainSha:mainSha,devHeadSha:head,
  kind:'local-only-runtime-candidate-not-a-release',
  candidateVersion:version,runtimeFileCount:runtime.length,
  changedFileCount:changed.length,excludedQaApis:3,
  excludedTestWorkflows:true,excludedQaFixtures:true,
  releaseApprovalGranted:false,entries};
const manifestLocation=process.env.FYMUSIC_RELEASE_MANIFEST||
 join(dirname(destination),'fymusic-phase44-manifest.json');
writeFileSync(manifestLocation,JSON.stringify(manifest,null,2)+'\n');
console.log('FYMUSIC_PHASE44_STAGED_ALLOWLIST_PASS '+JSON.stringify({
 baselineMainSha:mainSha,devHeadSha:head,candidateVersion:version,
 selectedRuntimeFiles:runtime.length,allChanges:changed.length,
 bundledAudioElements:mediaCount,hasQaEndpoints:false,
 hasTestWorkflows:false,manifestLocation
}));
