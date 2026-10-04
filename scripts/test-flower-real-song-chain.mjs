      requests.push({
        url,
        method: options?.method || 'get',
        headers: options?.headers || {},
      })

      if (url.includes('flower-source-info/latest')) {
        const packageBody = {
          vinfo: {
            '1': {
              s: 'kw|128k,320k,flac&kg|128k,320k,flac&tx|128k,320k,flac&wy|128k,320k,flac&mg|128k,320k,flac',
              m: null,
              lv: 1,
              lu: '',
              lh: '',
            },
          },
        }
        const response = {
          statusCode: 200,
          statusMessage: 'OK',
          headers: {},
          bytes: JSON.stringify(packageBody).length,
          raw: JSON.stringify(packageBody),
          body: packageBody,
        }
        callback(null, response, packageBody)
        return () => {}
      }

      const fakeResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {},
        bytes: 2,
        raw: '{}',
        body: { code: 0, data: 'https://example.invalid/audio.mp3' },
      }
      callback(null, fakeResponse, fakeResponse.body)
      return () => {}
    },
  }

  const factory = new Function('globalThis', 'console', 'setTimeout', 'clearTimeout', flowerSource + '\n')
  factory({ lx }, { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout)