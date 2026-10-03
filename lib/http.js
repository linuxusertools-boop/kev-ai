import { createHash } from 'node:crypto'
import { ApiError, parseSessionId } from './core.js'

const ALLOW_HEADERS = 'Content-Type, Authorization, X-Session-Id'

function hashIp(req) {
  const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
  return createHash('sha256').update((process.env.IP_SALT || 'kev-ai') + ip).digest('hex').slice(0, 24)
}

function mergeInput(req) {
  const q = req.query && typeof req.query === 'object' ? req.query : {}
  let b = req.body
  if (typeof b === 'string') { try { b = JSON.parse(b) } catch { b = {} } }
  if (!b || typeof b !== 'object' || Array.isArray(b)) b = {}
  return { ...q, ...b }
}

// 'open'  : dipanggil dari mana saja memakai session-id (tanpa cookie -> aman dari CSRF).
// 'own'   : endpoint login Google; hanya asal sendiri / ALLOWED_ORIGINS.
function applyCors(req, res, mode, methods) {
  res.setHeader('Access-Control-Allow-Methods', [...methods, 'OPTIONS'].join(', '))
  res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS)
  res.setHeader('Access-Control-Max-Age', '600')
  if (mode === 'open') return res.setHeader('Access-Control-Allow-Origin', '*')
  const origin = req.headers.origin
  if (!origin) return
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  let sameHost = false
  try { sameHost = new URL(origin).host === req.headers.host } catch {}
  if (!sameHost && !allowed.includes(origin)) throw new ApiError(403, 'forbidden_origin', 'Asal request tidak diizinkan.')
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
}

export function wrap({ methods, cors = 'open' }, fn) {
  return async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    try {
      applyCors(req, res, cors, methods)
      if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
      if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '))
        throw new ApiError(405, 'method_not_allowed', 'Method tidak diizinkan.')
      }
      if (Number(req.headers['content-length'] || 0) > 65536) throw new ApiError(413, 'too_long', 'Request terlalu besar.')
      const ctx = { input: mergeInput(req), ipHash: hashIp(req), status: 200 }
      const out = await fn(req, ctx)
      res.statusCode = ctx.status
      return res.end(JSON.stringify({ status: true, creator: 'Kev', ...out }))
    } catch (e) {
      const known = e instanceof ApiError
      if (!known) console.error('[kev-ai]', e?.message || e)
      if (known && e.retryAfter) res.setHeader('Retry-After', String(e.retryAfter))
      res.statusCode = known ? e.status : 500
      return res.end(JSON.stringify({
        status: false,
        creator: 'Kev',
        code: known ? e.code : 'internal',
        error: known ? e.message : 'Terjadi kesalahan internal.',
      }))
    }
  }
}

export function readSessionId(req, input) {
  const auth = String(req.headers.authorization || '')
  const bearer = /^Bearer KEVAI/i.test(auth) ? auth.slice(7) : ''
  return parseSessionId(req.headers['x-session-id'] || bearer || input.session || input.sessionId)
}

export function readGoogleToken(req) {
  const m = /^Bearer\s+(\S+)$/.exec(String(req.headers.authorization || ''))
  return m && !/^KEVAI/i.test(m[1]) ? m[1] : ''
}
