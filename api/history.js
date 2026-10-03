import { wrap, readSessionId } from '../lib/http.js'
import { enforceRate, loadSession } from '../lib/core.js'
import { getStore } from '../lib/store.js'

export default wrap({ methods: ['GET', 'DELETE'] }, async (req, ctx) => {
  const store = getStore()
  await enforceRate(store, ctx.ipHash, null)
  const sessionId = readSessionId(req, ctx.input)
  await enforceRate(store, ctx.ipHash, sessionId)
  await loadSession(store, sessionId)
  if (req.method === 'DELETE') {
    await store.clearMessages(sessionId)
    return { sessionId, cleared: true }
  }
  const n = Math.min(100, Math.max(1, parseInt(ctx.input.limit, 10) || 50))
  return { sessionId, messages: await store.getMessages(sessionId, n) }
})
