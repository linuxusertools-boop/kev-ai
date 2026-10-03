# Kev AI

API AI bersesi: tiap **session-id** (contoh `KEVAI7QX2M9TB`) = satu AI dengan memori percakapan, prompt default, dan
pengetahuan latihan sendiri. Session-id diambil di `/home` setelah login Google. Data disimpan di Firebase Realtime Database.

## Rute

| Path | Method | Auth | Fungsi |
|---|---|---|---|
| `/home` | GET | - | Login Google, ambil ID chat, coba AI, latih AI |
| `/chat/ID` | GET | - | Halaman chat satu ID |
| `/docs` | GET | - | Dokumentasi |
| `/api` atau `/api/ID` | GET, POST | ID chat | Kirim pesan (`text`), memori tersimpan |
| `/api/config` | GET, PUT | ID chat | `systemPrompt` + `knowledge[]` |
| `/api/history` | GET, DELETE | ID chat | Lihat / hapus memori |
| `/api/session` | GET, POST, DELETE | token Google | Daftar / buat / hapus chat (dipakai `/home`) |

ID chat (session-id) = id percakapan, contoh `KEVAI7QX2M9T`. **Tanpa API key**: dikirim lewat header `x-session-id`, `Authorization: Bearer ID`, path `/api/ID`, atau `?session=`. Alias lama `/ai` tetap jalan.

```bash
curl -X POST https://DOMAIN/api -H "x-session-id: KEVAI7QX2M9T" -H "content-type: application/json" -d '{"text":"Halo"}'
```

Respons sukses `{ "status": true, "creator": "Kev", "result": "...", "sessionId": "KEVAI..." }`.
Gagal `{ "status": false, "creator": "Kev", "code": "rate_limited", "error": "..." }`.

## Konfigurasi: hanya `config.json` (tanpa environment variable)

| Kunci | Isi |
|---|---|
| `firebase` | Config web Firebase (publik; dikirim ke browser lewat `/api/firebase`) |
| `serviceAccount` | Kredensial server Firebase Admin. **Rahasia** |
| `allowedOrigins` | Asal tambahan yang boleh memanggil `/api/session` (opsional) |
| `ipSalt` | Teks acak panjang untuk hash IP di rate limit |

`config.json` ada di root proyek, bukan di `public/`, jadi tidak bisa diunduh lewat web. Hanya bagian `firebase` yang dikirim ke browser.

## Deploy (Vercel)

1. Firebase Console: Authentication > Sign-in method > aktifkan **Google**; Authorized domains > tambahkan domain Vercel kamu.
2. Realtime Database > Rules > tempel isi `database.rules.json` lalu Publish (**menolak semua akses klien**).
3. Project settings > Service accounts > Generate new private key. Salin isi file itu ke blok `serviceAccount` di `config.json`.
4. Isi `ipSalt` dengan teks acak panjang.
5. Google Cloud Console > Credentials > batasi Browser API key ke domain kamu (HTTP referrer).
6. `vercel --prod`.

**Peringatan:** `serviceAccount.private_key` memberi akses penuh ke database. Jangan commit `config.json` yang sudah terisi ke repo publik (Google biasanya mencabut key yang bocor di GitHub). Pakai repo private, atau deploy langsung dengan `vercel --prod` dari komputer.

## Struktur front-end (dipisah penuh)

`public/*.html` (hanya markup), `public/css/` (`base` bersama + satu file per halaman), `public/js/` (satu file per halaman). Tanpa `<style>`, `<script>` inline, atau handler `onclick`; ada tesnya.

AI memakai jalur gemini.google.com tanpa API key (seperti kode awal). Jalur ini tidak resmi dan bisa putus saat Google mengubah layanannya; kalau terjadi, API membalas `502`.

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
