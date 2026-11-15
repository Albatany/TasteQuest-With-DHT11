# Progres Implementasi

Terakhir diperbarui: 15 November 2026.

## Fase A — Lingkungan & plugin ✅
- Node 24.22, npm 11.19, Python 3.13, PlatformIO 6.2 (platform espressif8266 dipasang), gcc 14.
- **UI/UX Pro Max:** terpasang. `SKILL.md` dibaca dan workflow-nya dijalankan: `--design-system` (hasil: gaya *Pixel Art*, Press Start 2P, kepadatan dashboard), pencarian domain `chart` (real-time streaming), `ux` (reduced motion, animasi berlebihan, durasi), dan `--stack react` (0 hasil; dicoba ulang → tetap kosong, jadi panduan React memakai aturan umum skill). Palet neon dari skill **tidak** dipakai karena brand HMIF terverifikasi lebih diutamakan.
- **Ponytail:** terpasang (skill `ponytail`, level *full*). Prinsipnya diterapkan: tanpa dependensi untuk hal kecil (rate limiter, cookie parser, CSV ditulis sendiri ±10 baris dan diuji), tanpa shadcn/Framer Motion (CSS + `<dialog>` native cukup), satu proses server untuk dev & prod, tabel `players` dihapus karena redundan.

## Fase B — Brand & arsitektur ✅
- Situs HMIF diperiksa; warna dan font diverifikasi dari CSS produksi → `docs/BRAND_ANALYSIS.md`.
- Token terpusat di `apps/web/src/theme.css`.
- Skema SQLite, kontrak API (Zod), dan struktur monorepo (npm workspaces).

## Fase C — Backend ✅
- Express 5 + Socket.IO 4 + better-sqlite3, migrasi SQL, WAL.
- Ingest idempoten, skor dihitung ulang server, deteksi offline, telemetri live vs historis.
- Auth operator (cookie httpOnly), token perangkat, rate limit, batas body, header keamanan.
- Ekspor CSV, backup SQLite, hapus DEMO, reset sesi.

## Fase D — Frontend ✅
- 8 rute: Overview, Arena, Leaderboard, Feedback, Monitor Perangkat, Kontrol Operator, Kiosk, Tentang.
- Loading/empty/error state seragam (`QueryState`), waktu WIB, teks Bahasa Indonesia.
- `AppCredits` + konstanta `CREATOR` di footer dashboard, kiosk, boot screen, hero, dan About.

## Fase E — Simulasi ✅
- ESP8266 virtual di browser: state machine bersama, tap/tahan (pointer & keyboard), slider jarak, sensor tidak valid, DHT acak-terbatas, Wi-Fi putus/sambung dengan antrean offline, error sensor, reset jarak jauh.
- Firmware `-e sim`: sensor simulasi + perintah Serial, tanpa GPIO.

## Fase F — UI/UX ✅
- Bingkai pixel bertakik, grid pixel statis, sprite pixel orisinal (mangkuk, target, piala, chip, 3 wajah), font pixel lokal.
- Animasi: boot, transisi halaman, count-up skor, countdown, konfeti skor tertinggi, overlay terima kasih kiosk, indikator koneksi. Semua menghormati `prefers-reduced-motion`.
- Review screenshot → perbaikan: urutan legenda, container query untuk panel simulator, kiosk diposisikan tengah, tabel leaderboard responsif tanpa scroll horizontal.

## Fase G — Firmware ✅ (kompilasi) / ⛔ (hardware)
- Modul: config, validasi pin, sensor (median, timeout), input FSM, buzzer non-blocking, OLED (U8g2, SSD1306/SH1106), state machine, jaringan + antrean RAM + backoff.
- Semua GPIO = `PIN_UNASSIGNED`. Validasi pin sebelum inisialisasi sensor.

## Fase H — Verifikasi ✅
Lihat `docs/TEST_REPORT.md`: typecheck 0 error, 44 tes Vitest, build, e2e Playwright, dua build firmware.

## Belum selesai / sebelum FST Market Day
- [ ] Konfirmasi varian papan, OLED, buzzer, dan isi pin di `firmware/include/config.h`
- [ ] Rakit pembagi tegangan Echo HC-SR04, lalu uji modul satu per satu (`docs/HARDWARE_WIRING.md`)
- [ ] Kalibrasi jarak dengan penggaris, lalu sesuaikan target di Kontrol Operator
- [ ] Isi `secrets.h` (Wi-Fi acara, IP laptop), flash `-e hardware`, uji 10 game + 10 feedback
- [ ] (Opsional, dengan izin) letakkan logo resmi di `apps/web/public/brand/hmif-logo.png`
- [ ] Hapus data DEMO, ganti ke mode LIVE, backup DB di akhir acara
- [ ] Prioritas 2 (belum dikerjakan, sengaja): efek arcade tambahan, achievement, analitik lanjutan
