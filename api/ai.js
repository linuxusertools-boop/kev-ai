import axios from 'axios'

const clean = value => String(value ?? '').replace(/\r/g, '').trim()

// Memory cache untuk Vercel Function (Catatan: State bisa ter-reset saat cold start)
const sessions = new Map()

async function geminiScraper(input = {}) {
  const payload = typeof input === 'string' ? { message: input } : input || {}
  const { message, instruction = '', sessionId = null } = payload
  if (!message) throw new Error('Message is required.')

  let resumeArray = null
  let cookie = null
  let savedInstruction = instruction

  if (sessionId) {
    try {
      const sessionData = JSON.parse(Buffer.from(sessionId, 'base64').toString('utf-8'))
      resumeArray = sessionData.resumeArray
      cookie = sessionData.cookie
      savedInstruction = instruction || sessionData.instruction || ''
    } catch {}
  }

  if (!cookie) {
    const { headers } = await axios.post(
      'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=maGuAc&source-path=%2F&bl=boq_assistant-bard-web-server_20250814.06_p1&f.sid=-7816331052118000090&hl=en-US&_reqid=173780&rt=c',
      'f.req=%5B%5B%5B%22maGuAc%22%2C%22%5B0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&',
      { headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' } }
    )
    cookie = headers['set-cookie']?.[0]?.split('; ')[0] || ''
  }

  const requestBody = [
    [message, 0, null, null, null, null, 0],
    ['en-US'],
    resumeArray || ['', '', '', null, null, null, null, null, null, ''],
    null, null, null, [1], 1, null, null, 1, 0, null, null, null, null, null,
    [[0]], 1, null, null, null, null, null,
    ['', '', savedInstruction, null, null, null, null, null, 0, null, 1, null, null, null, []],
    null, null, 1, null, null, null, null, null, null, null,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    1, null, null, null, null, [1]
  ]

  const { data } = await axios.post(
    'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=boq_assistant-bard-web-server_20250729.06_p0&f.sid=4206607810970164620&hl=en-US&_reqid=2813378&rt=c',
    new URLSearchParams({ 'f.req': JSON.stringify([null, JSON.stringify(requestBody)]) }).toString(),
    {
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'x-goog-ext-525001261-jspb': '[1,null,null,null,"9ec249fc9ad08861",null,null,null,[4]]',
        cookie
      }
    }
  )

  const match = Array.from(data.matchAll(/^\d+\n(.+?)\n/gm)).reverse()
  let parse1 = null
  for (const item of match) {
    try {
      const realArray = JSON.parse(item[1])
      const candidate = realArray?.[0]?.[2]
      if (!candidate) continue
      const parsed = JSON.parse(candidate)
      if (parsed?.[4]?.[0]?.[1]?.[0]) {
        parse1 = parsed
        break
      }
    } catch {}
  }

  if (!parse1) throw new Error('Gagal mem-parsing response Gemini.')

  const newResumeArray = [...parse1[1], parse1[4][0][0]]
  const text = parse1[4][0][1][0]
  const newSessionId = Buffer.from(
    JSON.stringify({ resumeArray: newResumeArray, cookie, instruction: savedInstruction })
  ).toString('base64')

  return { text, sessionId: newSessionId }
}

const systemPrompt = `Kamu adalah asisten AI yang cerdas dan canggih (Gemini). Gunakan format markdown rapi dan terstruktur.`

export default async function handler(req, res) {
  // Support CORS
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  )

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  const { text, prompt, sessionId, system } = { ...req.query, ...req.body }
  const messageInput = clean(text || prompt)
  const currentSessionId = sessionId || null
  const customSystem = system || systemPrompt

  if (!messageInput) {
    return res.status(400).json({
      status: false,
      creator: 'Kev',
      error: 'Parameter "text" atau "prompt" wajib diisi.',
      usage: '/api/ai?text=Halo+Gemini'
    })
  }

  try {
    const result = await geminiScraper({
      message: messageInput,
      instruction: customSystem,
      sessionId: currentSessionId
    })

    return res.status(200).json({
      status: true,
      creator: 'Kev',
      result: clean(result.text),
      sessionId: result.sessionId
    })
  } catch (error) {
    return res.status(500).json({
      status: false,
      creator: 'Kev',
      error: clean(error?.message) || 'Terjadi kesalahan pada internal server.'
    })
  }
}
