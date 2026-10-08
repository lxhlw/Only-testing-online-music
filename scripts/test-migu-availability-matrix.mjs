import assert from 'node:assert/strict'
import fs from 'node:fs'
import { chromium } from 'playwright'
import { endpointLabel, summarizeResolver, classifyPlayback } from './migu-availability-classifier.mjs'

// Reports signal whether the player actually progressed, not whether a track
// is legally entitled to stream. The player must not bypass access controls.
const sourceType = process.env.MIGU_SOURCE || 'huibq'
assert.ok(['huibq','flower'].includes(sourceType))
const base = process.env.TEST_BASE_URL || 'https://only-testing-online-music.pages.dev'
const queries = (process.env.MIGU_TEST_QUERIES || '成都,稻香').split(',').map(x => x.trim()).filter(Boolean).slice(0, 3)
const tracksPerQuery = Math.max(1, Math.min(3, Number(process.env.MIGU_TRACKS_PER_QUERY || 2)))
const timeout = Math.max(5000, Math.min(25000, Number(process.env.MIGU_TRACK_TIMEOUT_MS || 13000)))
const reportFile = process.env.MIGU_REPORT_FILE || 'migu-availability-' + sourceType + '.json'
const report = { schema: 1, source: sourceType, testedBase: new URL(base).hostname,
  executedAt: new Date().toISOString(), queries, tracksPerQuery,
  tracks: [], searches: [], diagnosticNotice: 'No playback does not prove copyright restrictions; upsteam status codes may have other causes.' }
const observations = []
const pageErrors = []
let currentAttempt = 'setup'
let emptyIdRequests = 0
const browser = await chromium.launch({headless:true, args:['--autoplay-policy=no-user-gesture-required']})
const page = await browser.newPage({viewport:{width:1280,height:900}})
page.on('pageerror',e => pageErrors.push(String(e).slice(0,160)))

page.on('response',async response => {
  if (!response.url().includes('/api/proxy?url=')) return
  let target
  try { target = new URL(response.url()).searchParams.get('url') }
  catch { return }
  if (!target) return
  try { if (/\/url\/mg\/\//.test(new URL(target).pathname)) emptyIdRequests++ } catch {}
  const label = endpointLabel(target)
  const status = response.status(), contentType = response.headers()['content-type'] || ''
  // Only read relevant resolver responses, not whole search result datasets.
  if (label === 'migu-search' || !['migu-official','huibq-resolver','gd-clock','gd-resolver','flower-resolver'].includes(label)) return
  let body = ''
  const size = Number(response.headers()['content-length'] || 0)
  if (!size || size < 64000) {
    try { body = (await response.text()).slice(0, 50000) } catch {}
  }
  const summary = summarizeResolver(status, contentType, body, target)
  observations.push({ attempt:currentAttempt, ...summary })
})

async function snapshot() {
  return page.evaluate(() => {
    const audio = document.querySelector('#audio')
    return {
      status: (document.querySelector('#status')?.textContent || '').slice(0, 210),
      currentTime: Number(audio?.currentTime || 0),
      readyState: Number(audio?.readyState || 0),
      paused: Boolean(audio?.paused), ended: Boolean(audio?.ended),
      duration: Number(audio?.duration || 0),
      errorCode: Number(audio?.error?.code || 0)
    }
  })
}
try {
  await page.goto(base + '/', {waitUntil:'domcontentloaded',timeout:30000})
  await page.locator('.nav-item[data-view="settings"]').click()
  if (sourceType === 'huibq') {
    await page.locator('#verified-install-btn').click()
  } else {
    await page.locator('#source-url').fill('https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js')
    await page.locator('#install-btn').click()
  }
  await page.waitForFunction(() => {
    const active = window.LXSourceManager?.getActive?.()
    return Boolean(active?.inited && active?.sources?.mg?.actions?.includes('musicUrl'))
  }, null, {timeout:45000})
  await page.locator('.nav-item[data-view="search"]').click()
  await page.locator('#channel-list button[title="MG"]').click()

  for (const query of queries) {
    currentAttempt = 'search'
    await page.locator('#global-search-input').fill(query)
    await page.locator('#global-search-btn').click()
    try {
      await page.waitForFunction(() =>
        document.querySelectorAll('#search-results .search-row').length > 0 ||
        /搜索失败|没有返回结果/.test(document.querySelector('#status')?.textContent || ''),
      null,{timeout:45000})
    } catch { report.searches.push({query,found:0,signal:'search_timeout'});continue }
    const items = await page.evaluate(() => (window.__LXLastSearchResults || []).slice(0, 3).map(x => ({
      title: String(x.name || '').slice(0,70), channel:String(x.source || ''),
      hasCopyrightId:Boolean(x.copyrightId || x.copyright_id || x.raw?.copyrightId),
      hasContentId:Boolean(x.contentId || x.raw?.contentId),
      hasId:Boolean(x.id)
    })))
    report.searches.push({query,found:items.length,signal:items.length?'search_results':'empty_results'})
    for (const [index, item] of items.slice(0, tracksPerQuery).entries()) {
      assert.equal(item.channel,'mg','Migu search must not silently substitute a different platform')
      const marker = query + ':' + String(index + 1)
      // No stale stream or timestamp may count toward this probe.
      await page.evaluate(() => {
        const a = document.querySelector('#audio')
        if (!a) return
        a.pause();a.removeAttribute('src');a.load()
      })
      currentAttempt = marker
      const startCount = observations.length
      await page.locator('#search-results .search-row').nth(index)
        .getByRole('button',{name:'解析并播放'}).click()
      const end = Date.now() + timeout
      let state
      while (Date.now() < end) {
        state = await snapshot()
        if (state.currentTime >= 1.2 && !state.paused && state.readyState >= 2) break
        if (/暂无可用的播放地址|无法提供可用地址|备用解析失败/.test(state.status)) break
        await page.waitForTimeout(350)
      }
      await page.waitForTimeout(250)
      state = await snapshot()
      const outcomes = observations.slice(startCount).filter(x => x.attempt === marker)
      const classification = classifyPlayback({...state,outcomes})
      report.tracks.push({
        query, candidate:index+1, title:item.title, metadata:{
          hasId:item.hasId, hasCopyrightId:item.hasCopyrightId, hasContentId:item.hasContentId
        },
        playback:classification, confirmedPlayback:classification==='confirmed_audio_progress',
        audioProgressSeconds:Math.round(state.currentTime*10)/10,
        audioDurationSeconds:Number.isFinite(state.duration)?Math.round(state.duration):null,
        audioErrorCode:state.errorCode,
        upstream:[...new Map(outcomes.map(o=>[o.endpoint+':'+o.signal+':'+(o.businessCode||''),o])).values()].slice(0,14)
      })
      console.log('MIGU TRACK:',JSON.stringify({source:sourceType,query,candidate:index+1,title:item.title,
        playback:classification,upstream:report.tracks.at(-1).upstream.map(({endpoint,signal,businessCode,restrictionMetadataPresent}) =>
        ({endpoint,signal,businessCode,restrictionMetadataPresent}))}))
    }
  }
} finally {
  await browser.close()
  report.summary = {
    probed:report.tracks.length,confirmed:report.tracks.filter(x=>x.confirmedPlayback).length,
    notConfirmed:report.tracks.filter(x=>!x.confirmedPlayback).length,
    emptyIdRequests, pageErrorCount:pageErrors.length,
    byClassification:report.tracks.reduce((out,x)=>(out[x.playback]=(out[x.playback]||0)+1,out),{})
  }
  fs.writeFileSync(reportFile, JSON.stringify(report,null,2) + '\n')
  console.log('MIGU MATRIX SUMMARY:',JSON.stringify(report.summary))
  console.log('MIGU MATRIX REPORT:',reportFile)
}
assert.ok(report.tracks.length>0, 'No Migu search candidates were available; diagnostic is inconclusive')
assert.equal(emptyIdRequests,0,'Migu resolver must not be called with empty track ID')
assert.equal(pageErrors.length,0,'Browser raised unhandled errors')
console.log('PASS: multi-song diagnostic completed; availability is recorded, not assumed')
