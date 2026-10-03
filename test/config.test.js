import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { publicFirebaseConfig, settings } from '../lib/config.js'

const walk = d => readdirSync(d).flatMap(f => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))

test('config publik tidak membawa serviceAccount / secret', () => {
  const pub = JSON.stringify(publicFirebaseConfig())
  assert.ok(!/service|private_key|client_email|ipSalt/i.test(pub))
  assert.equal(publicFirebaseConfig().projectId, 'kev-ai-a422b')
  assert.match(settings.databaseURL, /^https:\/\/.+firebasedatabase\.app$/)
})

test('tanpa environment variable di kode server maupun browser', () => {
  for (const f of [...walk('lib'), ...walk('api'), ...walk('public')].filter(f => f.endsWith('.js')))
    assert.ok(!/process\.env/.test(readFileSync(f, 'utf8')), f)
})

test('html/css/js terpisah: tanpa style/script/handler inline', () => {
  for (const f of walk('public').filter(f => f.endsWith('.html'))) {
    const s = readFileSync(f, 'utf8')
    assert.ok(!/<style|style=|\son[a-z]+=/i.test(s), f + ' punya style/handler inline')
    assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(s), f + ' punya script inline')
  }
  for (const f of walk('public').filter(f => f.endsWith('.css'))) assert.ok(!/<[a-z]/i.test(readFileSync(f, 'utf8')), f)
  for (const f of walk('public').filter(f => f.endsWith('.js'))) assert.ok(!/<(div|span|button|ul|li)[ >]/i.test(readFileSync(f, 'utf8')), f + ' berisi markup HTML')
})

test('config.json tidak berada di public/ (tidak bisa diunduh)', () => {
  assert.ok(!walk('public').some(f => f.endsWith('config.json')))
})
