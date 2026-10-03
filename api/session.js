import { wrap, readGoogleToken } from '../lib/http.js'
import { ApiError, createUserSession, enforceRate, parseSessionId, LIMITS } from '../lib/core.js'
import { getStore } from '../lib/store.js'
import { verifyGoogleToken } from '../lib/firebase.js'

const view = s => ({ id: s.id, createdAt: s.createdAt || 0, updatedAt: s.updatedAt || 0, messageCount: s.messageCount || 0 })

export default wrap({ methods: ['GET', 'POST', 'DELETE'], cors: 'own' }, async (req, ctx) => {
  const store = getStore()
  await enforceRate(store, ctx.ipHash, null)
  const { uid } = await verifyGoogleToken(readGoogleToken(req))

  if (req.method === 'GET') return { limit: LIMITS.sessionsPerUser, sessions: (await store.listUserSessions(uid)).map(view) }

  if (req.method === 'POST') {
    const id = await createUserSession(store, uid)
    ctx.status = 201
    return { sessionId: id }
  }

  const id = parseSessionId(ctx.input.id || ctx.input.session)
  const s = await store.getSession(id)
  if (!s || s.ownerUid !== uid) throw new ApiError(404, 'not_found', 'Session tidak ditemukan.')
  await store.deleteSession(id, uid)
  return { deleted: id }
})
