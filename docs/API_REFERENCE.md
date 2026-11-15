# Referensi API

Base URL: `http://<laptop>:3000` (same-origin dengan dashboard). Semua body JSON, batas 16 KB. Validasi memakai skema Zod di `packages/shared/src/schemas.ts`. Error dikembalikan sebagai `{ "error": "…", "issues"?: [...] }`.

Parameter `?source=DEMO|LIVE` pada endpoint baca. Jika dihilangkan, server memakai mode tampilan aktif.

## Publik (read-only)

| Method | Path | Isi |
|---|---|---|
| GET | `/api/health` | `{ ok, uptimeS }` |
| GET | `/api/settings` | `displayMode, activeProductId, roundDurationMs, targetsCm[3], feedbackCooldownMs, resetSeq` |
| GET | `/api/products` | `[{ id, name, enabled }]` |
| GET | `/api/overview?source=` | total sesi, total feedback, skor tertinggi, % positif, aktivitas per 15 menit, 8 event terakhir |
| GET | `/api/leaderboard?source=&limit=10` | urut skor ↓, durasi ↑, waktu selesai ↑ (deterministik) |
| GET | `/api/games?source=&limit=20` | sesi selesai terbaru |
| GET | `/api/feedback/stats?source=` | `total, counts{1,2,3}, positivePct, byProduct[], timeline[], recent[]` |
| GET | `/api/devices?source=` | status perangkat, sensor, RSSI, heartbeat terakhir, pembacaan live/terakhir |
| GET | `/api/live?source=` | telemetri live hanya dari perangkat **online** (kosong jika offline) |
| GET | `/api/events?source=&limit=&deviceId=` | riwayat event |

`positivePct` = jumlah **Sangat Puas** ÷ total respons × 100 (1 desimal), atau `null` jika belum ada data.

## Operator

Login membuat cookie `tq_session` (httpOnly, SameSite=Strict, TTL `SESSION_TTL_HOURS`). Token disimpan di SQLite sebagai hash SHA-256.

| Method | Path | Body / catatan |
|---|---|---|
| POST | `/api/auth/login` | `{ password }`, dibatasi 10 percobaan/menit/IP |
| POST | `/api/auth/logout` | |
| GET | `/api/auth/me` | `{ operator: boolean }` |
| POST | `/api/products` | `{ name, enabled? }`; 409 jika nama sudah ada |
| PATCH | `/api/products/:id` | `{ name?, enabled? }`; menonaktifkan produk aktif = kembali ke "Umum" |
| PUT | `/api/settings` | sebagian dari settings; produk aktif harus ada dan aktif |
| PATCH | `/api/sessions/:id` | `{ nickname: string \| null }` (maks. 24) |
| POST | `/api/operator/reset-game` | membatalkan sesi aktif, menaikkan `resetSeq` |
| POST | `/api/operator/clear-demo` | menghapus **hanya** baris `source = 'DEMO'` |
| GET | `/api/operator/status` | path DB, ukuran, host/port, jumlah data |
| GET | `/api/export/feedback.csv` | CSV (UTF-8 BOM, aman dari formula injection) |
| GET | `/api/export/games.csv` | CSV |
| GET | `/api/export/backup.db` | snapshot SQLite konsisten (`db.backup`) |

## Perangkat (ESP8266)

Header wajib: `Authorization: Bearer <DEVICE_TOKEN>` (dibandingkan timing-safe). Rate limit 1200 request/menit/IP.

| Method | Path | Respons |
|---|---|---|
| POST | `/api/device/heartbeat` | `200` + config `{ activeProductId, roundDurationMs, targetsCm, feedbackCooldownMs, resetSeq }` |
| GET | `/api/device/config` | config yang sama |
| POST | `/api/device/telemetry` | `204` |
| POST | `/api/device/events` | `201` baru, `200` duplikat (idempoten), `4xx` ditolak permanen, `5xx` coba lagi |

`/api/demo/*` memiliki endpoint yang sama untuk simulator browser. Endpoint ini butuh sesi operator dan semua data dari sana **selalu** ditandai `DEMO`.

### Heartbeat

```json
{ "deviceId": "TQ-ESP8266-01", "demo": false, "firmware": "1.0.0", "rssi": -61, "phase": "IDLE",
  "uptimeMs": 120000, "freeHeap": 31000, "queueSize": 0,
  "sensors": { "ultrasonic": "ok", "dht11": "ok", "oled": "ok", "touch": "ok", "buzzer": "ok" },
  "lastError": null }
```
`sensors.*` ∈ `ok | error | unconfigured | simulated`. `demo: true` (firmware `-e sim`) menandai semua data sebagai DEMO.

### Telemetri (live, hanya memori; suhu/kelembapan disimpan maks. 1×/60 dtk)

```json
{ "deviceId": "TQ-ESP8266-01", "demo": false, "temperatureC": 29.4, "humidityPct": 71, "distanceCm": 19.8,
  "touch": false, "buzzer": false,
  "game": { "phase": "ROUND_ACTIVE", "round": 1, "targetCm": 20, "remainingMs": 6400,
            "rounds": [], "totalScore": 0, "menu": 0, "option": -1, "playerCode": "PLAYER-007" } }
```

### Event

Amplop: `{ id, deviceId, type, ageMs, demo }`. `id` (6–64 karakter `[A-Za-z0-9_-]`) stabil selama retry dan menjadi kunci idempoten (`UNIQUE`). ESP8266 tidak punya RTC, jadi waktu event = waktu diterima − `ageMs`.

| `type` | Field tambahan |
|---|---|
| `game_started` | `sessionId` → respons `{ playerCode }` |
| `round_completed` | `sessionId, round (1–3), targetCm, measuredCm \| null` |
| `game_completed` | `sessionId, durationMs, rounds[3]` → respons `{ playerCode, totalScore, isHighScore }` |
| `feedback_submitted` | `level (1–3), productId \| null` → 422 jika produk tidak ada |
| `device_error` | `message` |

Skor **selalu dihitung ulang di server**: `clamp(round(100 − |terukur − target| × 10), 0, 100)`, 0 bila `measuredCm` null. Sesi yang sama dengan event ID berbeda tidak dihitung dua kali.

## Socket.IO (server → klien, read-only)

`device:status`, `telemetry`, `game:started`, `round:completed`, `game:completed` (`{ source, playerCode, totalScore, isHighScore }`), `leaderboard:updated`, `feedback:submitted` (`{ source, level, productId, productName }`), `product:changed`, `settings:changed`, `data:cleared`.
