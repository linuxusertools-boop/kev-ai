import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ApiError, LIMITS, SESSION_RE, newSessionId, parseSessionId, cleanText, buildSystem, trimHistory,
  parseConfigInput, createUserSession, chat, enforceRate, normalizeSession, DEFAULT_SYSTEM,
} from '../lib/core.js'
import { fakeStore } from './fake-store.js'

const rejects = (p, status, code) => assert.rejects(p, e => e instanceof ApiError && e.status === status && (!code || e.code === code))
const recorder = reply => { const calls = []; return { calls, async generate(a) { calls.push(structuredClone(a)); return typeof reply === 'function' ? reply(a) : reply } } }

test('session id: format KEVAI + 8 char acak, unik', () => {
  const seen = new Set()
  for (let i = 0; i < 5000; i++) { const id = newSessionId(); assert.match(id, SESSION_RE); seen.add(id) }
  assert.equal(seen.size, 5000)
})

test('session id: input jahat ditolak 401', () => {
  for (const bad of [undefined, null, 5, {}, [], '', 'KEVAI', 'KEVAI1234', 'KEVAI123456789', 'KEVAIILLLOOOUU', '../etc', 'KEVAI1234567/', 'sessions/KEVAI12345678', "KEVAI1234567'"])
    assert.throws(() => parseSessionId(bad), e => e.status === 401)
  assert.equal(parseSessionId(' kevai0123abcd '), 'KEVAI0123ABCD')
})

test('cleanText: validasi tipe, panjang, karakter kontrol', () => {
  assert.equal(cleanText('  hai\r\n\u0000dunia ', 50), 'hai\ndunia')
  assert.throws(() => cleanText(undefined, 5, { required: true }), e => e.status === 400)
  assert.throws(() => cleanText('   ', 5, { required: true }), e => e.status === 400)
  assert.throws(() => cleanText(['a'], 5), e => e.status === 400)
  assert.throws(() => cleanText({ a: 1 }, 5), e => e.status === 400)
  assert.throws(() => cleanText('x'.repeat(6), 5), e => e.status === 413)
})

test('prompt default + pengetahuan selalu utuh di system', () => {
  const s = normalizeSession({ ownerUid: 'u', systemPrompt: 'Kamu Kevin.', knowledge: ['Nama bot KevAI', 'Selalu pakai bahasa Indonesia'] })
  const sys = buildSystem(s)
  assert.ok(sys.startsWith('Kamu Kevin.'))
  assert.ok(sys.includes('1. Nama bot KevAI') && sys.includes('2. Selalu pakai bahasa Indonesia'))
  assert.equal(buildSystem(normalizeSession({ ownerUid: 'u' })), DEFAULT_SYSTEM)
  assert.deepEqual(normalizeSession({ ownerUid: 'u', knowledge: { 0: 'a', 1: 'b' } }).knowledge, ['a', 'b'])
})

test('trimHistory: memangkas riwayat lama, mulai dari user', () => {
  const m = Array.from({ length: 100 }, (_, i) => ({ role: i % 2 ? 'model' : 'user', text: 'x'.repeat(10) }))
  const t = trimHistory(m, 30, 100000)
  assert.ok(t.length <= 30 && t[0].role === 'user')
  assert.ok(trimHistory(m, 100, 55).length <= 5)
})

test('config: validasi', () => {
  assert.throws(() => parseConfigInput({}), e => e.status === 400)
  assert.throws(() => parseConfigInput({ knowledge: 'x' }), e => e.status === 400)
  assert.throws(() => parseConfigInput({ knowledge: Array(21).fill('a') }), e => e.status === 413)
  assert.throws(() => parseConfigInput({ systemPrompt: 'x'.repeat(LIMITS.system + 1) }), e => e.status === 413)
  assert.deepEqual(parseConfigInput({ knowledge: [' a ', '', 'b'] }), { knowledge: ['a', 'b'] })
})

test('sesi: maksimal per akun, kepemilikan terpisah', async () => {
  const st = fakeStore()
  for (let i = 0; i < LIMITS.sessionsPerUser; i++) await createUserSession(st, 'u1')
  await rejects(createUserSession(st, 'u1'), 409, 'session_limit')
  await createUserSession(st, 'u2')
  assert.equal((await st.listUserSessions('u2')).length, 1)
})

test('chat: memori tersimpan & dikirim di request berikutnya, prompt tetap utuh', async () => {
  const st = fakeStore()
  const id = await createUserSession(st, 'u1')
  await st.updateSession(id, { systemPrompt: 'Kamu Kevin.', knowledge: ['Ingat: kode rahasia 42'] })
  const p = recorder(a => `jawab:${a.message}`)
  await chat({ store: st, provider: p, sessionId: id, text: 'halo' })
  for (let i = 0; i < 60; i++) await chat({ store: st, provider: p, sessionId: id, text: 'pesan ' + i })
  const last = p.calls.at(-1)
  assert.ok(last.system.includes('Kamu Kevin.') && last.system.includes('kode rahasia 42'))
  assert.equal(last.history.at(-1).text, 'jawab:pesan 58')
  assert.ok(last.history.length <= LIMITS.contextMsgs && last.history[0].role === 'user')
  assert.ok(st.msgs.get(id).length <= LIMITS.storedMsgs)
})

test('chat: session tak dikenal -> 401; provider gagal -> memori tidak berubah; lock dilepas', async () => {
  const st = fakeStore()
  await rejects(chat({ store: st, provider: recorder('x'), sessionId: 'KEVAI00000000', text: 'a' }), 401)
  const id = await createUserSession(st, 'u1')
  const bad = { async generate() { throw new ApiError(502, 'upstream_error', 'x') } }
  await rejects(chat({ store: st, provider: bad, sessionId: id, text: 'a' }), 502)
  assert.equal((st.msgs.get(id) || []).length, 0)
  await chat({ store: st, provider: recorder('ok'), sessionId: id, text: 'a' })
  await rejects(chat({ store: st, provider: recorder('   '), sessionId: id, text: 'a' }), 502, 'empty_reply')
})

test('chat: request paralel pada session sama -> 409 busy', async () => {
  const st = fakeStore()
  const id = await createUserSession(st, 'u1')
  let release; const gate = new Promise(r => (release = r))
  const slow = { async generate() { await gate; return 'ok' } }
  const first = chat({ store: st, provider: slow, sessionId: id, text: 'a' })
  await new Promise(r => setTimeout(r, 10))
  await rejects(chat({ store: st, provider: recorder('x'), sessionId: id, text: 'b' }), 409, 'busy')
  release(); await first
})

test('rate limit: per IP dan per session', async () => {
  const st = fakeStore()
  for (let i = 0; i < LIMITS.perSessionPerMin; i++) await enforceRate(st, 'ip1', 'KEVAIAAAAAAAA')
  await rejects(enforceRate(st, 'ip1', 'KEVAIAAAAAAAA'), 429, 'rate_limited')
  const st2 = fakeStore()
  for (let i = 0; i < LIMITS.perIpPerMin; i++) await enforceRate(st2, 'ipX', null)
  await rejects(enforceRate(st2, 'ipX', null), 429)
})
