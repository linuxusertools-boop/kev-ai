const $ = id => document.getElementById(id)
const id = (location.pathname.match(/^\/chat\/(KEVAI[0-9A-Za-z]{8})\/?$/) || [])[1]?.toUpperCase() || ''
const say = (t, ok = false) => { $('msg').textContent = t || ''; $('msg').classList.toggle('ok', ok) }

async function api(path, { method = 'GET', body } = {}) {
  let r
  try { r = await fetch(path, { method, headers: { 'content-type': 'application/json', 'x-session-id': id }, body: body ? JSON.stringify(body) : undefined }) }
  catch { throw new Error('Tidak bisa terhubung ke server.') }
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.status === false) throw new Error(j.error || 'Terjadi kesalahan.')
  return j
}

function bubble(role, text) {
  const d = document.createElement('div')
  d.className = 'b ' + (role === 'model' ? 'model' : 'user')
  d.textContent = text // selalu textContent: aman dari XSS
  $('log').appendChild(d)
  $('log').scrollTop = $('log').scrollHeight
}

async function send() {
  const text = $('text').value.trim()
  if (!text || $('go').disabled) return
  say('')
  $('go').disabled = true
  bubble('user', text)
  $('text').value = ''
  try { bubble('model', (await api('/api', { method: 'POST', body: { text } })).result) }
  catch (e) { say(e.message); $('text').value = text }
  finally { $('go').disabled = false }
}

if (!id) {
  say('ID chat tidak valid. Ambil ID di halaman Home.')
  $('go').disabled = true; $('wipe').disabled = true; $('text').disabled = true
} else {
  $('cid').textContent = id
  api('/api/history?limit=50').then(r => r.messages.forEach(m => bubble(m.role, m.text))).catch(e => say(e.message))
  $('go').addEventListener('click', send)
  $('text').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } })
  $('wipe').addEventListener('click', async () => {
    if (!confirm('Hapus seluruh memori percakapan chat ini?')) return
    try { await api('/api/history', { method: 'DELETE' }); $('log').replaceChildren(); say('Memori dihapus.', true) } catch (e) { say(e.message) }
  })
}
