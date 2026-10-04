    if (channel === 'kw') assert.ok(results.every(item => item.songmid), 'KW results must contain a Kuwo songmid')
    if (channel === 'mg') assert.ok(results.every(item => item.id || item.copyrightId), 'MG results must contain a Migu identifier')

    const attempts = []
    const candidateCount = Math.min(3, results.length)
    for (let i = 0; i < candidateCount; i += 1) {
      await page.locator('#search-results .search-row').nth(i).getByRole('button', { name: '解析并播放' }).click()

      try {
        await page.waitForFunction(
          () => {
            const audio = document.getElementById('audio')
            return Number(audio?.currentTime || 0) >= 0.5 || Boolean(audio?.error)
          },
          null,
          { timeout: PLAYBACK_TIMEOUT_MS },
        )
      } catch {}

      const attempt = await page.evaluate(() => {
        const audio = document.getElementById('audio')
        return {
          status: document.getElementById('status')?.textContent || '',
          audioUrl: audio?.src || '',
          readyState: Number(audio?.readyState || 0),
          currentTime: Number(audio?.currentTime || 0),
          duration: Number(audio?.duration || 0),
          error: audio?.error ? {
            code: audio.error.code,
            message: audio.error.message || '',
          } : null,
        }
      })
      attempts.push({ index: i + 1, result: results[i], ...attempt })
      if (attempt.currentTime >= 0.5 && attempt.readyState >= 2 && !attempt.error) break
    }

    const success = attempts.find(item => item.currentTime >= 0.5 && item.readyState >= 2 && !item.error)
    assert.ok(
      success,
      channel.toUpperCase() + ' playback failed after ' + attempts.length + ' candidates: ' +
      JSON.stringify(attempts, null, 2)
    )
    assert.ok(
      String(success.audioUrl || '').indexOf('/api/proxy?url=') >= 0,
      channel.toUpperCase() + ' playback URL was not normalized through the same-origin media proxy: ' +
      JSON.stringify(success, null, 2)
    )

    const targetSeen = proxyTargets.some(item => {
      const target = item.target
      if (channel === 'kw') return /search\.kuwo\.cn\/r\.s/.test(target) || /flower\/v1\/url\/kw\//.test(target) || /lxmusicapi\.onrender\.com\/url\/kw\//.test(target) || /music-api\.gdstudio\.xyz\/api\.php/.test(target) || /music-dl\.sayqz\.com\/api\//.test(target)
      if (channel === 'kg') return /songsearch\.kugou\.com\/song_search_v2/.test(target) ||
        /mobilecdn\.kugou\.com\/api\/v3\/search\/song/.test(target) ||