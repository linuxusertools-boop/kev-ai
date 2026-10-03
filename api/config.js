import { wrap, readSessionId } from '../lib/http.js'
import { DEFAULT_SYSTEM, enforceRate, loadSession, parseConfigInput, LIMITS } from '../lib/core.js'
import { getStore } from '../lib/store.js'

export default wrap({ methods: ['GET', 'PUT', 'POST'] }, async (req, ctx) => {
  const store = getStore()
  await enforceRate(store, ctx.ipHash, null)
  const sessionId = readSessionId(req, ctx.input)
  await enforceRate(store, ctx.ipHash, sessionId)
  let s = await loadSession(store, sessionId)
  if (req.method !== 'GET') {
    await store.updateSession(sessionId, parseConfigInput(ctx.input))
    s = await loadSession(store, sessionId)
  }
  return {
    sessionId,
    systemPrompt: s.systemPrompt,
    defaultSystemPrompt: DEFAULT_SYSTEM,
    knowledge: s.knowledge,
    messageCount: s.messageCount,
    limits: { system: LIMITS.system, knowledgeItems: LIMITS.knowledgeItems, knowledgeLen: LIMITS.knowledgeLen },
  }
})
