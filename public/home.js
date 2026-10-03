import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js'

// Konfigurasi web Firebase memang publik. Keamanan data ada di database.rules.json (tolak semua akses klien)
// dan di verifikasi token di server. Batasi juga API key di Google Cloud Console (HTTP referrer).
const app = initializeApp({
  apiKey: 'AIzaSyDvYFih8bG_uf2t4Jhx49OqodHTLRAXDV0',
  authDomain: 'kev-ai-a422b.firebaseapp.com',
  databaseURL: 'https://kev-ai-a422b-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'kev-ai-a422b',
  storageBucket: 'kev-ai-a422b.firebasestorage.app',
  messagingSenderId: '508810992683',
  appId: '1:508810992683:web:3abf72ae374c60d76cde6e',
})
const auth = getAuth(app)
const $ = id => document.getElementById(id)
const state = { sessions: [], id: '', knowledge: [] }

function say(el, text, ok = false) { el.textContent = text || ''; el.classList.toggle('ok', ok) }

async function api(path, { method = 'GET', body, google = false } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (google) headers.authorization = 'Bearer ' + (await auth.currentUser.getIdToken())
  else headers['x-session-id'] = state.id
  let r
  try { r = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined }) }
  catch { throw new Error('Tidak bisa terhubung ke server.') }
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.status === false) throw new Error(j.error || 'Terjadi kesalahan.')
  return j
}

// ---------- login ----------
$('login').addEventListener('click', async () => {
  say($('gateMsg'), '')
  try { await signInWithPopup(auth, new GoogleAuthProvider()) }
  catch (e) { say($('gateMsg'), e?.code === 'auth/popup-blocked' ? 'Popup diblokir browser. Izinkan popup lalu coba lagi.' : 'Login dibatalkan atau gagal. Coba lagi.') }
})
$('logout').addEventListener('click', () => signOut(auth))

onAuthStateChanged(auth, async user => {
  $('gate').hidden = !!user
  $('app').hidden = !user
  $('who').hidden = !user
  if (!user) { state.sessions = []; state.id = ''; $('log').replaceChildren(); return }
  $('email').textContent = user.email || ''
  if (user.photoURL && /^https:\/\//.test(user.photoURL)) $('avatar').src = user.photoURL
  try { await loadSessions() } catch (e) { say($('sMsg'), e.message) }
})

// ---------- session ----------
function renderSessions() {
  const pick = $('pick')
  pick.replaceChildren(...state.sessions.map(s => Object.assign(document.createElement('option'), { value: s.id, textContent: s.id })))
  pick.value = state.id
  $('key').textContent = state.id || '-'
  $('del').disabled = !state.id
  $('rotate').disabled = !state.id
  $('add').disabled = state.sessions.length >= 3
}

async function loadSessions(preferId) {
  let { sessions } = await api('/api/session', { google: true })
  if (!sessions.length) { await api('/api/session', { method: 'POST', google: true }); ({ sessions } = await api('/api/session', { google: true })) }
  state.sessions = sessions
  state.id = sessions.some(s => s.id === preferId) ? preferId : sessions[0].id
  renderSessions()
  await Promise.all([loadHistory(), loadConfig()])
  renderApi()
}

$('pick').addEventListener('change', async e => {
  state.id = e.target.value
  $('key').textContent = state.id
  say($('sMsg'), '')
  try { await Promise.all([loadHistory(), loadConfig()]); renderApi() } catch (err) { say($('sMsg'), err.message) }
})

$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(state.id); say($('sMsg'), 'Key disalin.', true) }
  catch { say($('sMsg'), 'Gagal menyalin. Blok dan salin key secara manual.') }
})

$('add').addEventListener('click', async () => {
  say($('sMsg'), '')
  try { const r = await api('/api/session', { method: 'POST', google: true }); await loadSessions(r.sessionId) }
  catch (e) { say($('sMsg'), e.message) }
})

async function removeCurrent() {
  const old = state.id
  await api('/api/session?id=' + encodeURIComponent(old), { method: 'DELETE', google: true })
  return old
}

$('del').addEventListener('click', async () => {
  if (!confirm('Hapus session ini beserta memori dan latihannya? Key tidak bisa dipakai lagi.')) return
  say($('sMsg'), '')
  try { await removeCurrent(); await loadSessions() } catch (e) { say($('sMsg'), e.message) }
})

$('rotate').addEventListener('click', async () => {
  if (state.sessions.length >= 3) return say($('sMsg'), 'Sudah 3 session. Hapus satu dulu sebelum mengganti key.')
  if (!confirm('Buat key baru? Key lama langsung mati. Prompt dan latihan dipindahkan, memori percakapan dimulai dari awal.')) return
  say($('sMsg'), '')
  const old = state.id
  try {
    const cfg = await api('/api/config')
    const { sessionId } = await api('/api/session', { method: 'POST', google: true })
    state.id = sessionId
    await api('/api/config', { method: 'PUT', body: { systemPrompt: cfg.systemPrompt, knowledge: cfg.knowledge } })
    state.id = old
    await removeCurrent()
    await loadSessions(sessionId)
    say($('sMsg'), 'Key baru aktif. Key lama sudah mati.', true)
  } catch (e) {
    say($('sMsg'), e.message)
    try { await loadSessions(old) } catch {}
  }
})

// ---------- tab ----------
const tabs = ['try', 'train', 'api']
tabs.forEach(t => $('t-' + t).addEventListener('click', () => {
  tabs.forEach(x => { $('t-' + x).setAttribute('aria-selected', String(x === t)); $('p-' + x).hidden = x !== t })
}))

// ---------- coba AI ----------
function bubble(role, text) {
  const d = document.createElement('div')
  d.className = 'b ' + (role === 'model' ? 'model' : 'user')
  d.textContent = text // selalu textContent: aman dari XSS
  $('log').appendChild(d)
  $('log').scrollTop = $('log').scrollHeight
}

async function loadHistory() {
  $('log').replaceChildren()
  const { messages } = await api('/api/history?limit=50')
  messages.forEach(m => bubble(m.role, m.text))
}

async function send() {
  const text = $('text').value.trim()
  if (!text || $('go').disabled) return
  say($('cMsg'), '')
  $('go').disabled = true
  bubble('user', text)
  $('text').value = ''
  try { bubble('model', (await api('/api/ai', { method: 'POST', body: { text } })).result) }
  catch (e) { say($('cMsg'), e.message); $('text').value = text }
  finally { $('go').disabled = false }
}
$('go').addEventListener('click', send)
$('text').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } })

$('wipe').addEventListener('click', async () => {
  if (!confirm('Hapus seluruh memori percakapan session ini? Prompt dan latihan tetap ada.')) return
  try { await api('/api/history', { method: 'DELETE' }); $('log').replaceChildren(); say($('cMsg'), 'Memori dihapus.', true) }
  catch (e) { say($('cMsg'), e.message) }
})

// ---------- latih AI ----------
function renderKn() {
  $('kn').replaceChildren(...state.knowledge.map((k, i) => {
    const li = document.createElement('li')
    const s = document.createElement('span'); s.textContent = k
    const b = document.createElement('button'); b.className = 'ghost'; b.textContent = 'Hapus'
    b.addEventListener('click', () => { state.knowledge.splice(i, 1); renderKn() })
    li.append(s, b)
    return li
  }))
  $('knAdd').disabled = state.knowledge.length >= 20
}

async function loadConfig() {
  const c = await api('/api/config')
  $('sys').value = c.systemPrompt
  $('sys').placeholder = c.defaultSystemPrompt
  $('sysN').textContent = String($('sys').value.length)
  state.knowledge = c.knowledge
  renderKn()
}
$('sys').addEventListener('input', () => { $('sysN').textContent = String($('sys').value.length) })

function addKn() {
  const v = $('knNew').value.trim()
  if (!v || state.knowledge.length >= 20) return
  state.knowledge.push(v)
  $('knNew').value = ''
  renderKn()
}
$('knAdd').addEventListener('click', addKn)
$('knNew').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addKn() } })

$('save').addEventListener('click', async () => {
  say($('tMsg'), '')
  try {
    await api('/api/config', { method: 'PUT', body: { systemPrompt: $('sys').value, knowledge: state.knowledge } })
    say($('tMsg'), 'Latihan tersimpan. Berlaku di pesan berikutnya.', true)
  } catch (e) { say($('tMsg'), e.message) }
})

// ---------- contoh API ----------
function renderApi() {
  const o = location.origin
  $('ex1').textContent = `curl -X POST ${o}/ai \\\n  -H "x-session-id: ${state.id}" \\\n  -H "content-type: application/json" \\\n  -d '{"text":"Halo, kamu siapa?"}'`
  $('ex2').textContent = `# Uji cepat lewat URL (key ikut tercatat di log, jangan dipakai di produksi)\ncurl "${o}/ai/${state.id}?text=Halo"`
  $('ex3').textContent = `# Respons\n{ "status": true, "creator": "Kev", "result": "...", "sessionId": "${state.id}" }\n\n# Endpoint lain (header x-session-id sama)\nGET|PUT ${o}/config      prompt default + latihan\nGET|DELETE ${o}/history  riwayat memori`
}
