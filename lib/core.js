import { randomInt } from 'node:crypto'

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message)
    this.status = status
    this.code = code
    Object.assign(this, extra)
  }
}

export const LIMITS = {
  text: 4000,
  system: 4000,
  knowledgeItems: 20,
  knowledgeLen: 500,
  contextMsgs: 30,
  contextChars: 12000,
  storedMsgs: 200,
  sessionsPerUser: 20,
  reply: 20000,
  perSessionPerMin: 20,
  perIpPerMin: 60,
}

export const DEFAULT_SYSTEM =
  'Kamu adalah asisten AI yang cerdas dan canggih. Gunakan format markdown rapi dan terstruktur. Jawab dalam bahasa yang dipakai pengguna.'

// Crockford base32 tanpa I, L, O, U -> 32 simbol, 8 karakter = 40 bit acak (kripto).
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const SESSION_RE = /^KEVAI[0-9A-HJKMNP-TV-Z]{8}$/

export function newSessionId() {
  let s = 'KEVAI'
  for (let i = 0; i < 8; i++) s += ALPHA[randomInt(ALPHA.length)]
  return s
}

export function parseSessionId(v) {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : ''
  if (!SESSION_RE.test(s)) throw new ApiError(401, 'invalid_session', 'Session-id tidak valid.')
  return s
}

export function cleanText(v, max, { required = false, name = 'text' } = {}) {
  if (v === undefined || v === null) {
    if (required) throw new ApiError(400, 'bad_request', `Parameter "${name}" wajib diisi.`)
    return ''
  }
  if (typeof v !== 'string') throw new ApiError(400, 'bad_request', `"${name}" harus berupa teks.`)
  const s = v.replace(/\r/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
  if (required && !s) throw new ApiError(400, 'bad_request', `Parameter "${name}" wajib diisi.`)
  if (s.length > max) throw new ApiError(413, 'too_long', `"${name}" maksimal ${max} karakter.`)
  return s
}

export const asArray = x => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : [])

export function normalizeSession(s) {
  return {
    ownerUid: s.ownerUid,
    createdAt: s.createdAt || 0,
    updatedAt: s.updatedAt || 0,
    messageCount: s.messageCount || 0,
    systemPrompt: typeof s.systemPrompt === 'string' ? s.systemPrompt : '',
    knowledge: asArray(s.knowledge).filter(k => typeof k === 'string'),
  }
}

// Prompt default + pengetahuan latihan SELALU dikirim utuh di setiap request (tidak pernah dipotong).
export function buildSystem(session) {
  const base = session.systemPrompt || DEFAULT_SYSTEM
  if (!session.knowledge.length) return base
  const list = session.knowledge.map((k, i) => `${i + 1}. ${k}`).join('\n')
  return `${base}\n\nAturan dan pengetahuan tetap (WAJIB selalu diingat dan dipatuhi di setiap jawaban):\n${list}`
}

// Hanya riwayat yang dipangkas (dari yang paling lama); selalu mulai dari pesan 'user'.
export function trimHistory(msgs, maxMsgs = LIMITS.contextMsgs, maxChars = LIMITS.contextChars) {
  const out = []
  let chars = 0
  for (let i = msgs.length - 1; i >= 0 && out.length < maxMsgs; i--) {
    chars += msgs[i].text.length
    if (chars > maxChars) break
    out.unshift(msgs[i])
  }
  while (out.length && out[0].role !== 'user') out.shift()
  return out
}

export function parseConfigInput(input) {
  const patch = {}
  if ('systemPrompt' in input) patch.systemPrompt = cleanText(input.systemPrompt, LIMITS.system, { name: 'systemPrompt' })
  if ('knowledge' in input) {
    if (!Array.isArray(input.knowledge)) throw new ApiError(400, 'bad_request', '"knowledge" harus berupa array teks.')
    const items = input.knowledge.map(k => cleanText(k, LIMITS.knowledgeLen, { name: 'knowledge' })).filter(Boolean)
    if (items.length > LIMITS.knowledgeItems) throw new ApiError(413, 'too_long', `Maksimal ${LIMITS.knowledgeItems} item pengetahuan.`)
    patch.knowledge = items
  }
  if (!Object.keys(patch).length) throw new ApiError(400, 'bad_request', 'Isi "systemPrompt" dan/atau "knowledge".')
  return patch
}

export async function createUserSession(store, uid) {
  if ((await store.listUserSessions(uid)).length >= LIMITS.sessionsPerUser)
    throw new ApiError(409, 'session_limit', `Maksimal ${LIMITS.sessionsPerUser} chat per akun. Hapus salah satu dulu.`)
  const now = Date.now()
  for (let i = 0; i < 10; i++) {
    const id = newSessionId()
    if (await store.createSession(id, { ownerUid: uid, createdAt: now, updatedAt: now, messageCount: 0 })) {
      // Penjaga race: dua request paralel tidak boleh melewati batas.
      if ((await store.listUserSessions(uid)).length > LIMITS.sessionsPerUser) {
        await store.deleteSession(id, uid)
        throw new ApiError(409, 'session_limit', `Maksimal ${LIMITS.sessionsPerUser} chat per akun.`)
      }
      return id
    }
  }
  throw new ApiError(500, 'internal', 'Gagal membuat session, coba lagi.')
}

export async function loadSession(store, id) {
  const s = await store.getSession(id)
  if (!s) throw new ApiError(401, 'invalid_session', 'Session-id tidak valid.')
  return normalizeSession(s)
}

export async function enforceRate(store, ipHash, sessionId) {
  const a = await store.hit(`ip_${ipHash}`, LIMITS.perIpPerMin, 60)
  if (!a.ok) throw new ApiError(429, 'rate_limited', 'Terlalu banyak request, coba lagi sebentar.', { retryAfter: a.retryAfter })
  if (sessionId) {
    const b = await store.hit(`s_${sessionId}`, LIMITS.perSessionPerMin, 60)
    if (!b.ok) throw new ApiError(429, 'rate_limited', 'Terlalu banyak request untuk session ini.', { retryAfter: b.retryAfter })
  }
}

export async function chat({ store, provider, sessionId, text }) {
  const session = await loadSession(store, sessionId)
  const token = await store.lock(sessionId, 45000)
  if (!token) throw new ApiError(409, 'busy', 'Session sedang memproses pesan lain, coba lagi sebentar.')
  try {
    const history = trimHistory(await store.getMessages(sessionId, LIMITS.contextMsgs * 2))
    const raw = await provider.generate({ system: buildSystem(session), history, message: text })
    const reply = String(raw ?? '').replace(/\r/g, '').trim().slice(0, LIMITS.reply)
    if (!reply) throw new ApiError(502, 'empty_reply', 'AI tidak menghasilkan jawaban.')
    const ts = Date.now()
    await store.appendMessages(sessionId, [
      { role: 'user', text, ts },
      { role: 'model', text: reply, ts: ts + 1 },
    ], LIMITS.storedMsgs)
    return { reply, sessionId }
  } finally {
    await store.unlock(sessionId, token).catch(() => {})
  }
}
