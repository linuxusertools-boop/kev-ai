import test from 'node:test'
import assert from 'node:assert/strict'
import { wrap, readSessionId, readGoogleToken } from '../lib/http.js'
import { ApiError } from '../lib/core.js'

function mock({ method = 'GET', headers = {}, query = {}, body } = {}) {
  const res = { headers: {}, statusCode: 200, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v }, end(b = '') { this.body = b; return this } }
  return { req: { method, headers: { host: 'app.test', ...headers }, query, body, socket: { remoteAddress: '1.2.3.4' } }, res }
}
const json = r => JSON.parse(r.body)

test('wrap: sukses, header keamanan, tanpa credentials CORS', async () => {
  const h = wrap({ methods: ['GET'] }, async () => ({ result: 'ok' }))
  const { req, res } = mock()
  await h(req, res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(json(res), { status: true, creator: 'Kev', result: 'ok' })
  assert.equal(res.headers['access-control-allow-origin'], '*')
  assert.equal(res.headers['access-control-allow-credentials'], undefined)
  assert.equal(res.headers['cache-control'], 'no-store')
})

test('wrap: method salah 405, preflight 204, error tak dikenal tidak bocor', async () => {
  const h = wrap({ methods: ['POST'] }, async () => { throw new Error('rahasia: /etc/passwd firebase key') })
  let m = mock({ method: 'GET' }); await h(m.req, m.res)
  assert.equal(m.res.statusCode, 405)
  m = mock({ method: 'OPTIONS' }); await h(m.req, m.res)
  assert.equal(m.res.statusCode, 204)
  m = mock({ method: 'POST', body: '{"a":1}' }); await h(m.req, m.res)
  assert.equal(m.res.statusCode, 500)
  assert.ok(!m.res.body.includes('rahasia') && !m.res.body.includes('passwd'))
})

test('wrap: ApiError diteruskan dengan Retry-After; body bukan objek diabaikan', async () => {
  const h = wrap({ methods: ['POST'] }, async (_r, c) => { assert.deepEqual(c.input, { q: '1' }); throw new ApiError(429, 'rate_limited', 'x', { retryAfter: 9 }) })
  const m = mock({ method: 'POST', query: { q: '1' }, body: '[1,2]' }); await h(m.req, m.res)
  assert.equal(m.res.statusCode, 429); assert.equal(m.res.headers['retry-after'], '9')
})

test("wrap cors 'own': asal asing ditolak, asal sendiri diizinkan", async () => {
  const h = wrap({ methods: ['GET'], cors: 'own' }, async () => ({}))
  let m = mock({ headers: { origin: 'https://evil.example' } }); await h(m.req, m.res)
  assert.equal(m.res.statusCode, 403)
  m = mock({ headers: { origin: 'https://app.test' } }); await h(m.req, m.res)
  assert.equal(m.res.statusCode, 200); assert.equal(m.res.headers['access-control-allow-origin'], 'https://app.test')
})

test('wrap: request terlalu besar 413', async () => {
  const h = wrap({ methods: ['POST'] }, async () => ({}))
  const m = mock({ method: 'POST', headers: { 'content-length': '999999' } }); await h(m.req, m.res)
  assert.equal(m.res.statusCode, 413)
})

test('session-id: header > bearer > query/body; token Google dipisah dari session-id', () => {
  assert.equal(readSessionId({ headers: { 'x-session-id': 'KEVAI0123ABCD' } }, {}), 'KEVAI0123ABCD')
  assert.equal(readSessionId({ headers: { authorization: 'Bearer KEVAI0123ABCD' } }, {}), 'KEVAI0123ABCD')
  assert.equal(readSessionId({ headers: {} }, { session: 'kevai0123abcd' }), 'KEVAI0123ABCD')
  assert.throws(() => readSessionId({ headers: {} }, {}), e => e.status === 401)
  assert.equal(readGoogleToken({ headers: { authorization: 'Bearer KEVAI0123ABCD' } }), '')
  assert.equal(readGoogleToken({ headers: { authorization: 'Bearer abc.def.ghi' } }), 'abc.def.ghi')
})
