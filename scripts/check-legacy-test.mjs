import fs from 'node:fs'
import vm from 'node:vm'

const file = 'legacy-test.html'
const html = fs.readFileSync(file, 'utf8')
const matches = [...html.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)]

if (!matches.length) {
  throw new Error('No inline script block found in ' + file)
}

for (let i = 0; i < matches.length; i += 1) {
  const source = matches[i][1]
  new vm.Script(source, {
    filename: file + '#script-' + (i + 1),
  })
}

console.log('PASS:', file, 'inline script syntax is valid')
