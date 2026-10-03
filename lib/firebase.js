import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { getAuth } from 'firebase-admin/auth'
import { ApiError } from './core.js'

const DEFAULT_DB = 'https://kev-ai-a422b-default-rtdb.asia-southeast1.firebasedatabase.app'

function init() {
  if (getApps().length) return getApps()[0]
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim()
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT belum diatur')
  const sa = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'))
  if (typeof sa.private_key === 'string') sa.private_key = sa.private_key.replace(/\\n/g, '\n')
  return initializeApp({ credential: cert(sa), databaseURL: process.env.FIREBASE_DATABASE_URL || DEFAULT_DB })
}

export const getDb = () => getDatabase(init())

export async function verifyGoogleToken(token) {
  if (!token) throw new ApiError(401, 'unauthorized', 'Login Google diperlukan.')
  try {
    const d = await getAuth(init()).verifyIdToken(token, true)
    if (d.firebase?.sign_in_provider !== 'google.com' || d.email_verified === false)
      throw new ApiError(401, 'unauthorized', 'Hanya login Google yang diterima.')
    return { uid: d.uid, email: d.email || '' }
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError(401, 'unauthorized', 'Token login tidak valid atau kedaluwarsa. Login ulang.')
  }
}
