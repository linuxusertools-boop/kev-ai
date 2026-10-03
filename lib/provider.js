import { ApiError } from './core.js'

const upstream = (msg = 'Layanan AI sedang gangguan, coba lagi.') => new ApiError(502, 'upstream_error', msg)

export const getProvider = () => webProvider()

let cookieCache = { v: '', exp: 0 }
export function webProvider() {
  const ctype = 'application/x-www-form-urlencoded;charset=UTF-8'
  async function getCookie() {
    if (cookieCache.v && cookieCache.exp > Date.now()) return cookieCache.v
    const r = await fetch(
      'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=maGuAc&source-path=%2F&bl=boq_assistant-bard-web-server_20250814.06_p1&f.sid=-7816331052118000090&hl=en-US&_reqid=173780&rt=c',
      { method: 'POST', headers: { 'content-type': ctype }, body: 'f.req=%5B%5B%5B%22maGuAc%22%2C%22%5B0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&', signal: AbortSignal.timeout(15000) }
    )
    const sc = r.headers.getSetCookie?.()[0] || r.headers.get('set-cookie') || ''
    const v = sc.split('; ')[0] || ''
    cookieCache = { v, exp: Date.now() + 10 * 60 * 1000 }
    return v
  }
  return {
    name: 'web',
    async generate({ system, history, message }) {
      const transcript = history.map(m => `${m.role === 'model' ? 'Asisten' : 'Pengguna'}: ${m.text}`).join('\n')
      const full = transcript ? `Riwayat percakapan sebelumnya:\n${transcript}\n\nPesan terbaru pengguna:\n${message}` : message
      try {
        const cookie = await getCookie()
        const reqBody = [
          [full, 0, null, null, null, null, 0], ['en-US'],
          ['', '', '', null, null, null, null, null, null, ''],
          null, null, null, [1], 1, null, null, 1, 0, null, null, null, null, null, [[0]], 1, null, null, null, null, null,
          ['', '', system, null, null, null, null, null, 0, null, 1, null, null, null, []],
          null, null, 1, null, null, null, null, null, null, null,
          [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 1, null, null, null, null, [1],
        ]
        const r = await fetch(
          'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=boq_assistant-bard-web-server_20250729.06_p0&f.sid=4206607810970164620&hl=en-US&_reqid=2813378&rt=c',
          {
            method: 'POST',
            headers: { 'content-type': ctype, 'x-goog-ext-525001261-jspb': '[1,null,null,null,"9ec249fc9ad08861",null,null,null,[4]]', cookie },
            body: new URLSearchParams({ 'f.req': JSON.stringify([null, JSON.stringify(reqBody)]) }).toString(),
            signal: AbortSignal.timeout(25000),
          }
        )
        if (!r.ok) { cookieCache.exp = 0; throw upstream() }
        const data = await r.text()
        for (const m of Array.from(data.matchAll(/^\d+\n(.+?)\n/gm)).reverse()) {
          try {
            const c = JSON.parse(m[1])?.[0]?.[2]
            if (!c) continue
            const p = JSON.parse(c)
            const t = p?.[4]?.[0]?.[1]?.[0]
            if (typeof t === 'string' && t.trim()) return t
          } catch {}
        }
        cookieCache.exp = 0
        throw upstream('Gagal membaca respons Gemini.')
      } catch (e) {
        if (e instanceof ApiError) throw e
        throw upstream()
      }
    },
  }
}
