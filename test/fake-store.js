// Store in-memory dengan antarmuka yang sama dengan lib/store.js (untuk tes tanpa Firebase).
export function fakeStore() {
  const sessions = new Map(), msgs = new Map(), locks = new Map(), rate = new Map()
  let seq = 0
  return {
    sessions, msgs,
    async getSession(id) { return sessions.get(id) ? structuredClone(sessions.get(id)) : null },
    async createSession(id, d) { if (sessions.has(id)) return false; sessions.set(id, structuredClone(d)); return true },
    async updateSession(id, p) { Object.assign(sessions.get(id), p, { updatedAt: Date.now() }) },
    async deleteSession(id) { sessions.delete(id); msgs.delete(id); locks.delete(id) },
    async listUserSessions(uid) { return [...sessions].filter(([, s]) => s.ownerUid === uid).map(([id, s]) => ({ id, ...s })) },
    async getMessages(id, n) { return (msgs.get(id) || []).slice(-n).map(m => ({ ...m })) },
    async appendMessages(id, add, max) {
      const l = msgs.get(id) || []
      for (const m of add) l.push({ ...m, k: ++seq })
      while (l.length > max) l.shift()
      msgs.set(id, l); sessions.get(id).messageCount = l.length
    },
    async clearMessages(id) { msgs.delete(id); sessions.get(id).messageCount = 0 },
    async hit(key, limit) { const n = (rate.get(key) || 0) + 1; rate.set(key, n); return { ok: n <= limit, retryAfter: 30 } },
    async lock(id) { if (locks.has(id)) return null; locks.set(id, 't'); return 't' },
    async unlock(id) { locks.delete(id) },
  }
}
