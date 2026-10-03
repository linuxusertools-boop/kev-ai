import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { getAuth } from 'firebase-admin/auth'
import { ApiError } from './core.js'
import { settings } from './config.js'

function init() {
  if (getApps().length) return getApps()[0]
  const sa = { ...settings.serviceAccount }
  if (typeof sa.private_key !== 'string' || !sa.private_key.includes('BEGIN PRIVATE KEY'))
    throw new Error('config.json: serviceAccount belum diisi')
  sa.private_key = sa.private_key.replace(/\\n/g, '\n')
  return initializeApp({ credential: cert(sa), databaseURL: settings.databaseURL })
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
