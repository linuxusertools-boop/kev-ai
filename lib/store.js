import { randomBytes } from 'node:crypto'
import { getDb } from './firebase.js'

// Semua akses database lewat server (Admin SDK). Rules database menolak semua akses klien.
export function createStore(db = getDb()) {
  const ref = p => db.ref(p)
  return {
    async getSession(id) {
      const s = await ref(`sessions/${id}`).get()
      return s.exists() ? s.val() : null
    },

    async createSession(id, data) {
      const r = await ref(`sessions/${id}`).transaction(cur => (cur === null ? data : undefined))
      if (!r.committed) return false
      await ref(`users/${data.ownerUid}/sessions/${id}`).set(true)
      return true
    },

    async updateSession(id, patch) {
      const p = { updatedAt: Date.now() }
      for (const [k, v] of Object.entries(patch)) p[k] = Array.isArray(v) && !v.length ? null : v === '' ? null : v
      await ref(`sessions/${id}`).update(p)
    },

    async deleteSession(id, uid) {
      await db.ref().update({
        [`sessions/${id}`]: null,
        [`messages/${id}`]: null,
        [`locks/${id}`]: null,
        [`users/${uid}/sessions/${id}`]: null,
      })
    },

    async listUserSessions(uid) {
      const snap = await ref(`users/${uid}/sessions`).get()
      const ids = snap.exists() ? Object.keys(snap.val()) : []
      const rows = await Promise.all(ids.map(async id => [id, await this.getSession(id)]))
      const out = []
      for (const [id, s] of rows) {
        if (s && s.ownerUid === uid) out.push({ id, ...s })
        else await ref(`users/${uid}/sessions/${id}`).remove().catch(() => {})
      }
      return out
    },

    async getMessages(id, limit) {
      const snap = await ref(`messages/${id}`).orderByKey().limitToLast(limit).get()
      const out = []
      snap.forEach(c => {
        const v = c.val()
        if (v && typeof v.text === 'string' && (v.role === 'user' || v.role === 'model')) out.push({ role: v.role, text: v.text, ts: v.ts || 0 })
      })
      return out
    },

    async appendMessages(id, msgs, max) {
      const upd = {}
      for (const m of msgs) upd[ref(`messages/${id}`).push().key] = m
      const base = `messages/${id}/`
      await db.ref().update(Object.fromEntries(Object.entries(upd).map(([k, v]) => [base + k, v])))
      const c = await ref(`sessions/${id}/messageCount`).transaction(n => (n || 0) + msgs.length)
      const count = c.snapshot.val() || 0
      if (count > max) {
        const old = await ref(`messages/${id}`).orderByKey().limitToFirst(count - max).get()
        const del = {}
        old.forEach(x => { del[base + x.key] = null })
        await db.ref().update(del)
        await ref(`sessions/${id}/messageCount`).set(max)
      }
      await ref(`sessions/${id}/updatedAt`).set(Date.now())
    },

    async clearMessages(id) {
      await db.ref().update({ [`messages/${id}`]: null, [`sessions/${id}/messageCount`]: 0 })
    },

    async hit(key, limit, windowSec) {
      const now = Date.now()
      const w = windowSec * 1000
      const bucket = Math.floor(now / w)
      const r = await ref(`rate/${key}/${bucket}`).transaction(n => (n || 0) + 1)
      ref(`rate/${key}/${bucket - 1}`).remove().catch(() => {})
      const ok = (r.snapshot.val() || 0) <= limit
      return { ok, retryAfter: Math.max(1, Math.ceil(((bucket + 1) * w - now) / 1000)) }
    },

    async lock(id, ttlMs) {
      const token = randomBytes(8).toString('hex')
      const now = Date.now()
      const r = await ref(`locks/${id}`).transaction(cur => (!cur || cur.exp < now ? { t: token, exp: now + ttlMs } : undefined))
      return r.committed ? token : null
    },

    async unlock(id, token) {
      await ref(`locks/${id}`).transaction(cur => (cur && cur.t === token ? null : undefined))
    },
  }
}

let shared
export const getStore = () => (shared ||= createStore())
