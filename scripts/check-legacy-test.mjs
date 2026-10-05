import fs from 'node:fs'
import vm from 'node:vm'

const file = 'legacy-test.html'
const html = fs.readFileSync(file, 'utf8')

const scripts = []
let cursor = 0
while (true) {
  const start = html.indexOf('<script', cursor)
  if (start === -1) break

  const openEnd = html.indexOf('>', start)
  if (openEnd === -1) throw new Error('Unclosed <script> tag in ' + file)

  const close = html.indexOf('</script>', openEnd + 1)
  if (close === -1) throw new Error('Unclosed <script> block in ' + file)

  scripts.push(html.slice(openEnd + 1, close))
  cursor = close + '</script>'.length
}

if (!scripts.length) {
  throw new Error('No inline script block found in ' + file)
}

for (let i = 0; i < scripts.length; i += 1) {
  new vm.Script(scripts[i], {
    filename: file + '#script-' + (i + 1),
  })
}

console.log('PASS:', file, 'inline script syntax is valid')
