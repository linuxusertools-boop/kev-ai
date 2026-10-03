import config from '../config.json' with { type: 'json' }

// Satu-satunya sumber setelan server. Tidak ada environment variable.
export const settings = {
  databaseURL: config.firebase.databaseURL,
  serviceAccount: config.serviceAccount,
  allowedOrigins: Array.isArray(config.allowedOrigins) ? config.allowedOrigins.filter(o => typeof o === 'string') : [],
  ipSalt: typeof config.ipSalt === 'string' ? config.ipSalt : 'kev-ai',
}

// Hanya bagian yang aman untuk dikirim ke browser. serviceAccount TIDAK PERNAH ikut.
export const publicFirebaseConfig = () => ({ ...config.firebase })
