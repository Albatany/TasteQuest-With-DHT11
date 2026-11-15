# Laporan Pengujian

Tanggal: 15 November 2026 · Linux (Debian, kernel 6.12) · Node.js 24.22.1 · PlatformIO Core 6.2.0
Semua hasil di bawah benar-benar dijalankan di mesin pengembangan. **Tidak ada pengujian pada perangkat keras fisik.**

## Ringkasan

| Pemeriksaan | Perintah | Hasil |
|---|---|---|
| Type check (shared, server, web; TypeScript 7.0) | `npm run typecheck` | ✅ 0 error |
| Unit + integrasi + komponen (Vitest 5) | `npm test` | ✅ 44/44 lulus, 3 file |
| Build produksi dashboard (Vite 8) | `npm run build` | ✅ sukses (JS ±270 KB gzip, font lokal) |
| Smoke test end-to-end (Playwright + Chromium) | `npm run test:e2e` | ✅ 1/1 lulus (±56 dtk) |
| Firmware simulasi | `pio run -d firmware -e sim` | ✅ sukses, 0 warning · RAM 46,9 % · Flash 30,1 % |
| Tes logika firmware di laptop (validasi pin, input TTP223: debounce, tap, tahan, sentuh macet saat boot, pull-down GPIO16) | `npm run test:firmware` | ✅ 8/8 lulus |
| Firmware hardware | `pio run -d firmware -e hardware` | ✅ sukses, 0 warning · RAM 48,4 % · Flash 30,9 % |
| Sketch Arduino IDE `firmware-arduino/TasteQuest` (sim & hardware @ d1_mini, sim @ nodemcuv2) | `pio ci` dengan core ESP8266 Arduino 3.1.2 yang sama dengan Arduino IDE di laptop ini | ✅ ketiganya sukses, 0 warning. Belum dikompilasi oleh Arduino IDE/arduino-cli itu sendiri |
| Perangkat keras fisik | — | ⛔ **tidak diuji** (tidak ada akses ke papan) |

## Unit (packages/shared — 19 tes)

- Rumus skor (tepat, ±0,4 cm, 10 cm meleset, pembulatan 99,5, NaN/null → 0)
- Klasifikasi tekan TTP223 (bounce < 50 ms, singkat, lama ≥ 1200 ms, ambang kustom)
- Persentase positif (hanya Sangat Puas, total 0 → null)
- State machine: game 3 ronde penuh termasuk ronde kedaluwarsa (skor 96 + 80 + 0), kunci saat pembacaan tidak valid diabaikan, input diabaikan saat countdown, feedback hanya terkirim setelah pilihan eksplisit, cooldown, timeout idle, RESET, pemulihan ERROR, sisa waktu
- Validasi skema: target di luar rentang ditolak, level feedback tidak valid ditolak, ID event terlalu pendek ditolak

## Integrasi server (apps/server — 15 tes, SQLite in-memory + file)

- Token perangkat salah/tidak ada → 401; payload tidak valid → 400
- Event diulang (ID sama) → satu baris, respons `duplicate`; sesi sama dengan ID baru → tidak dihitung dua kali
- Skor dihitung ulang server (300 untuk tepat sasaran)
- Urutan leaderboard: skor ↓, durasi ↑, waktu selesai ↑
- Pemisahan DEMO/LIVE (kode `DEMO-001` vs `PLAYER-001`)
- Feedback: penyimpanan, produk tidak dikenal → 422, statistik (66,7 % positif), per-produk, timeline
- Perangkat offline setelah sunyi; `/api/live` kosong saat offline; pembacaan terakhir tetap dengan timestamp
- Operator: mutasi tanpa login → 401, logout membatalkan sesi, brute force login → 429
- Produk: tambah, nama duplikat → 409, nonaktifkan produk aktif → kembali ke "Umum", target tidak valid → 400
- Simulator `/api/demo` memakai jalur yang sama; hapus DEMO tidak menyentuh LIVE
- CSV: butuh login, formula injection dinetralkan
- Persistensi: data tetap ada setelah DB ditutup lalu dibuka ulang
- Socket.IO: klien menerima `feedback:submitted`
- **Kompatibilitas firmware:** payload heartbeat/telemetri/event dengan bentuk persis seperti yang dibuat `firmware/src/net.cpp` diterima

## Komponen frontend (apps/web — 10 tes, jsdom)

- Copyright `© Muhammad Aziz Syah Dani 2026` terlihat di footer dashboard **dan** kiosk; About menampilkan "Developed by …"
- Kiosk tanpa navigasi/kontrol operator
- Navigasi memuat 8 rute
- Badge DEMO MODE / LIVE MODE / DEVICE OFFLINE
- Mode LIVE tidak menampilkan simulator; simulator terkunci tanpa login operator
- Empty state (overview, leaderboard)
- Render leaderboard (podium + tabel, nickname)
- Analitik feedback + definisi "positif" + konversi waktu ke WIB
- Sprite pixel persegi dan hanya memakai warna palet

## Smoke test end-to-end (`e2e/smoke.spec.ts`)

Server asli + SQLite file + Chromium headless, alur nyata lewat UI:

1. ✅ Buka dashboard, boot screen, copyright, badge DEMO MODE, empty state
2. ✅ Login operator, tambah produk "Mie Ayam", jadikan produk aktif
3. ✅ Nyalakan ESP8266 virtual → "Perangkat online"
4. ✅ Main 3 ronde dengan tap/tahan pada sensor sentuh virtual dan slider jarak
5. ✅ Skor tiap ronde di DB = rumus; total = jumlah ronde (≥ 290)
6. ✅ Leaderboard menampilkan `DEMO-001`
7. ✅ Feedback "Sangat Puas" via perangkat yang sama; tahan tanpa pilihan diabaikan; statistik "Mie Ayam: 1 respons, positif 100%"
8. ✅ Kiosk 1920×1080: copyright, tagline, top 3, tanpa link operator; POST tanpa login → 401
9. ✅ Tanpa scroll horizontal di lebar 375 px (5 halaman)
10. ✅ Putuskan Wi-Fi virtual → "DEVICE OFFLINE", `/api/live` kosong
11. ✅ Restart backend → leaderboard dan feedback tetap ada; DEMO tidak muncul di LIVE
12. ✅ **Offline readiness:** tidak ada satu pun request ke luar `localhost` selama tes; tidak ada error JavaScript di halaman

Screenshot tersimpan di `test-results/screens/` (diabaikan git).

## Tidak diuji / keterbatasan

- **Perangkat keras:** pin, pembagi tegangan Echo, OLED, DHT11, buzzer, TTP223, dan catu daya belum pernah dicoba. Firmware hanya dibuktikan **dapat dikompilasi**. Logika C++ (`machine.cpp`, `input.cpp`, median filter) tidak punya unit test native; kebenarannya bergantung pada kesamaan dengan versi TypeScript yang diuji.
- Firmware simulasi belum dijalankan di papan ESP8266 sungguhan (perlu papan + USB).
- Browser lain (Firefox/Safari) dan perangkat HP fisik belum diuji. Layout mobile diuji di Chromium 375 px.
- Uji beban (banyak klien kiosk bersamaan) belum dilakukan.
- Aksesibilitas diperiksa lewat kode (label, fokus, kontras token, reduced motion), belum dengan screen reader.
