import { wrap } from '../lib/http.js'
import { publicFirebaseConfig } from '../lib/config.js'

// Konfigurasi web Firebase (publik) untuk browser. Dibaca dari config.json.
export default wrap({ methods: ['GET'], cors: 'own' }, async () => ({ firebase: publicFirebaseConfig() }))
