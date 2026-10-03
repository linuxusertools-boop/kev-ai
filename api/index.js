import { wrap, readSessionId } from '../lib/http.js'
import { chat, cleanText, enforceRate, LIMITS } from '../lib/core.js'
import { getStore } from '../lib/store.js'
import { getProvider } from '../lib/provider.js'

export default wrap({ methods: ['GET', 'POST'] }, async (req, ctx) => {
  const store = getStore()
  await enforceRate(store, ctx.ipHash, null)
  const sessionId = readSessionId(req, ctx.input)
  const text = cleanText(ctx.input.text ?? ctx.input.prompt, LIMITS.text, { required: true, name: 'text' })
  await enforceRate(store, ctx.ipHash, sessionId)
  const { reply } = await chat({ store, provider: getProvider(), sessionId, text })
  return { result: reply, sessionId }
})
