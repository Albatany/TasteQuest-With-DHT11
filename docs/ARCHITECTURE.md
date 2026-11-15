# Arsitektur TasteQuest

```
ESP8266 (firmware C++)                    Browser (dashboard / kiosk / HP)
  machine.cpp  ← TTP223, HC-SR04, DHT11      React + TanStack Query + Recharts
  net.cpp  ── HTTP JSON, Bearer token ──┐        ▲  REST (fetch)   ▲ Socket.IO push
                                        ▼        │                 │
                         Node.js + Express + Socket.IO (apps/server)
                           ingest.ts → validasi Zod → transaksi SQLite → emit
                                        │
                                  SQLite (data/tastequest.db, WAL)
```

Semuanya berjalan di laptop + satu Wi-Fi lokal (hotspot/router). Tidak ada cloud, API berbayar, atau AI eksternal. Server melayani API, WebSocket, **dan** dashboard dari satu origin dan satu port, baik saat produksi maupun saat dev (Vite berjalan sebagai middleware).

## Struktur

```
apps/server/       Express + Socket.IO + better-sqlite3
  migrations/      SQL bernomor; diterapkan otomatis saat start (PRAGMA user_version)
  src/config.ts    .env → konfigurasi tervalidasi (server menolak start tanpa secret)
  src/db.ts        buka SQLite, WAL, foreign keys, migrasi
  src/ingest.ts    jalur tunggal data perangkat (ESP8266 & simulator)
  src/store.ts     query leaderboard/statistik/CSV, pengaturan, hapus DEMO
  src/app.ts       route, auth, rate limit, Socket.IO
  test/            tes integrasi API + WebSocket + persistensi
apps/web/          React 19 + Vite + Tailwind v4
  src/theme.css    SATU-SATUNYA tempat token warna/font
  src/sim/         ESP8266 virtual (mode DEMO)
packages/shared/   logika & skema bersama (skor, state machine, Zod, tipe API)
firmware/          PlatformIO ESP8266 (env sim & hardware)
e2e/               smoke test Playwright
```

## Keputusan penting

**Satu jalur ingest.** `POST /api/device/*` (token perangkat) dan `POST /api/demo/*` (sesi operator) memakai router dan fungsi `ingest` yang sama. Bedanya hanya sumber data: `/api/demo` selalu `DEMO`, sedangkan perangkat bisa `LIVE` atau `DEMO` (firmware simulasi mengirim `demo: true`).

**Idempoten.** Setiap event membawa `id` stabil dari perangkat. `device_events.event_uid` UNIQUE + `INSERT OR IGNORE` dalam satu transaksi: retry jaringan tidak pernah menggandakan skor atau feedback. Sesi memakai `session_uid` UNIQUE, dan ronde memakai PK `(session_id, round)`.

**Server tidak memercayai skor perangkat.** Skor ronde dihitung ulang dari `measuredCm`/`targetCm` dengan fungsi bersama `scoreRound`.

**State machine bersama.** `packages/shared/src/game.ts` adalah fungsi murni `step(state, input, ctx)` yang diuji unit. Simulator web menjalankan kode itu. `firmware/src/machine.cpp` adalah cerminannya dalam C++ (state, waktu, dan aturan sama). Perubahan aturan harus dilakukan di keduanya.

**Live vs historis.** Telemetri (jarak ±2–3 Hz) hanya disimpan di memori dan di-broadcast. Suhu/kelembapan ditulis ke SQLite maksimal sekali per `TELEMETRY_PERSIST_MS` (60 dtk). Jarak ultrasonik tidak pernah ditulis per sampel.

**Offline tanpa data palsu.** Perangkat dianggap offline setelah `DEVICE_OFFLINE_MS` tanpa kontak. `/api/live` hanya mengembalikan perangkat online. UI menampilkan "DEVICE OFFLINE" dan "Terakhir tercatat …" dengan timestamp, bukan angka karangan.

**Waktu.** Disimpan sebagai ISO-8601 UTC. UI memformat ke `Asia/Jakarta` + "WIB". ESP8266 tidak punya jam, jadi waktu event = diterima − `ageMs`.

**Reset jarak jauh.** Operator menaikkan `resetSeq`. Perangkat membaca nilainya di respons heartbeat dan kembali ke IDLE (firmware maupun simulator).

## Skema SQLite

`devices`, `device_events` (UNIQUE event_uid), `telemetry`, `products`, `game_sessions` (UNIQUE session_uid, player_code), `game_rounds` (PK session+round, FK cascade), `feedback` (UNIQUE event_uid, FK product), `operator_sessions` (hash token), `settings` (key/value JSON). Indeks pada `(source, waktu)` dan urutan leaderboard. Lihat `apps/server/migrations/001_init.sql`.

Tidak ada tabel `players` terpisah. Pengunjung tidak punya identitas, jadi satu sesi = satu pemain dan `player_code` (`PLAYER-001`, demo: `DEMO-001`) disimpan di sesi.

## Keamanan

- Secret hanya di `.env` dan `firmware/include/secrets.h` (keduanya di-ignore git). Server menolak start bila secret kosong/pendek.
- Token perangkat dan password dibandingkan timing-safe (hash SHA-256 dulu).
- Sesi operator: token acak 256-bit dan hanya hash-nya yang disimpan. Cookie httpOnly + SameSite=Strict. Tidak memakai `Secure` karena LAN memakai HTTP biasa.
- Rate limit: login 10/menit, ingest 1200/menit per IP. Body maksimal 16 KB.
- Header `nosniff`, `X-Frame-Options: DENY`, CSP ketat untuk halaman produksi.
- Kiosk dan semua endpoint publik hanya-baca. Pin GPIO tidak bisa diubah dari browser.
- CSV ekspor menetralkan formula (`=`, `+`, `-`, `@`).
