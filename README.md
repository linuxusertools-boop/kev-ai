# Kev AI

API AI bersesi: tiap **session-id** (contoh `KEVAI7QX2M9TB`) = satu AI dengan memori percakapan, prompt default, dan
pengetahuan latihan sendiri. Session-id diambil di `/home` setelah login Google. Data disimpan di Firebase Realtime Database.

## Endpoint

| Endpoint | Method | Auth | Fungsi |
|---|---|---|---|
| `/home` | GET | - | Halaman: login Google, ambil key, coba AI, latih AI |
| `/ai` atau `/ai/KEVAI...` | GET, POST | session-id | Kirim pesan (`text`), balasan + memori tersimpan |
| `/config` | GET, PUT | session-id | Baca/ubah `systemPrompt` dan `knowledge[]` |
| `/history` | GET, DELETE | session-id | Lihat / hapus memori percakapan |
| `/session` | GET, POST, DELETE | token Google | Daftar / buat / hapus session (dipakai `/home`) |

Session-id dikirim lewat header `x-session-id` (disarankan), `Authorization: Bearer KEVAI...`, path `/ai/KEVAI...`, atau `?session=`.

```bash
curl -X POST https://DOMAIN/ai -H "x-session-id: KEVAI7QX2M9TB" -H "content-type: application/json" -d '{"text":"Halo"}'
```

Respons sukses `{ "status": true, "creator": "Kev", "result": "...", "sessionId": "KEVAI..." }`.
Respons gagal `{ "status": false, "creator": "Kev", "code": "rate_limited", "error": "..." }` (401 session salah, 409 sibuk/batas, 413 terlalu panjang, 429 rate limit, 502 AI gangguan).

## Deploy (Vercel)

1. Firebase Console: Authentication > Sign-in method > aktifkan **Google**; Authorized domains > tambahkan domain Vercel kamu.
2. Realtime Database > Rules > tempel isi `database.rules.json` lalu Publish (**menolak semua akses klien**; server memakai Admin SDK).
3. Project settings > Service accounts > Generate new private key. Isi env `FIREBASE_SERVICE_ACCOUNT` (JSON utuh atau base64-nya).
4. Isi env `GEMINI_API_KEY` (Google AI Studio). Tanpa itu server memakai scraper gemini.google.com yang rapuh.
5. Google Cloud Console > Credentials > batasi Browser API key Firebase ke domain kamu (HTTP referrer).
6. `vercel --prod`. Lihat `.env.example` untuk semua variabel.

## Keamanan yang diterapkan

- Session-id acak kriptografis (`KEVAI` + 8 karakter base32, 40 bit), divalidasi regex ketat; salah/tidak ada selalu `401` yang sama.
- Rate limit per IP (60/menit) dan per session (20/menit) lewat transaksi database; IP disimpan sebagai hash.
- Login Google diverifikasi di server (token Firebase, cek cabut, provider `google.com`); kepemilikan session dicek sebelum hapus.
- Database tertutup untuk klien; semua akses lewat server. Tidak ada cookie/credential di CORS.
- Input divalidasi (tipe, panjang, karakter kontrol); error internal tidak pernah membocorkan detail.
- UI hanya memakai `textContent` (tanpa `innerHTML`) dan CSP ketat + header keamanan di `vercel.json`.
- Lock per session mencegah memori tertimpa saat request paralel.

## Tes

`npm test` (logika inti, memori, rate limit, lapisan HTTP; memakai store palsu, tidak butuh Firebase).
