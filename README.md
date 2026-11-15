# TasteQuest — PLAY. TASTE. RATE.

**HMIF UNJA × FST Market Day 2026** · Dikembangkan oleh **Muhammad Aziz Syah Dani** · © Muhammad Aziz Syah Dani 2026

TasteQuest adalah proyek pameran IoT Himpunan Mahasiswa Informatika Universitas Jambi untuk FST Market Day, acara yang menggabungkan stan makanan mahasiswa dan pameran proyek akademik. Satu perangkat ESP8266 menjalankan dua pengalaman:

- **ProxiRush**: game ketepatan. Pemain menempatkan tangan pada jarak target yang diukur sensor ultrasonik, lalu menahan sensor sentuh untuk mengunci. Tiga ronde, maksimal 300 poin.
- **TastePulse**: pembeli menilai makanan (Kurang / Cukup / Sangat Puas) dengan satu sensor sentuh.
- **Dashboard TasteQuest**: monitoring real-time, leaderboard, analitik feedback, kontrol operator, dan mode kiosk bergaya pixel art.

Semuanya **lokal**: tidak ada cloud, API berbayar, atau AI eksternal. Data disimpan di SQLite di laptop.

## Arsitektur

```
ESP8266 ──Wi-Fi lokal / HTTP──▶ Node.js + Express ──▶ SQLite
                                       │
                                   Socket.IO ──▶ Dashboard React (laptop, HP, monitor kiosk)
```

Detail di [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Struktur: `apps/server` (API), `apps/web` (dashboard), `packages/shared` (skor, state machine, skema), `firmware` (PlatformIO), `e2e` (smoke test), `docs`.

## Kebutuhan

- Node.js ≥ 22 (diuji 24.22) + npm
- PlatformIO Core (untuk firmware), Python 3
- Browser modern. Internet hanya dibutuhkan untuk instalasi awal.

## Instalasi

```bash
npm install
npm run setup      # membuat .env (password operator + token perangkat acak) dan firmware/include/secrets.h
npm run build
```

`npm run setup` mencetak password operator sekali. Password juga tersimpan di `.env` (`OPERATOR_PASSWORD`).

## Menjalankan

| Perintah | Fungsi |
|---|---|
| `npm start` | mode produksi lokal (setelah `npm run build`) |
| `npm run serve` | build + start dalam satu perintah |
| `npm run dev` | pengembangan dengan hot reload (satu port yang sama) |
| `npm run typecheck` | cek tipe semua workspace |
| `npm test` | unit + integrasi + komponen (Vitest) |
| `npm run test:e2e` | smoke test browser (butuh `npx playwright install chromium` sekali) |
| `npm run test:firmware` | tes logika firmware di laptop (butuh `g++`) |
| `npm run firmware:sim` / `npm run firmware:hardware` | kompilasi firmware |

### URL dashboard

| Halaman | URL |
|---|---|
| Overview | `http://localhost:3000/` |
| ProxiRush Arena | `/arena` |
| Leaderboard | `/leaderboard` |
| Feedback Pelanggan | `/feedback` |
| Monitor Perangkat | `/device` |
| Kontrol Operator | `/operator` |
| Mode Kiosk (layar pengunjung) | `/kiosk` |
| Tentang | `/about` |

Dari HP/laptop lain di Wi-Fi yang sama, ganti `localhost` dengan IP LAN yang dicetak server. Firewall dan hotspot dibahas di [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md).

## Mode Simulasi (DEMO) — tanpa ESP8266

1. `npm start`, buka `http://localhost:3000/operator`, lalu login.
2. Pastikan **DEMO MODE** aktif (Mode Tampilan Dashboard).
3. Buka **ProxiRush Arena** → *Nyalakan* pada panel *Perangkat Simulasi*.
4. Tombol **SENTUH (TTP223)**: klik singkat = tap, tahan ≥ 1,2 detik = konfirmasi (Spasi/Enter juga bisa). Geser slider untuk mengatur jarak tangan.
5. Alur: tap (menu) → tahan (ProxiRush) → tahan (mulai) → atur jarak → tahan untuk mengunci, ulangi 3 ronde.
6. Feedback: dari layar awal, tap → tap (TastePulse) → tahan → tap sampai pilihan benar → tahan.
7. *Putuskan Wi-Fi* menyimulasikan putus jaringan: game tetap jalan, event diantrekan, dan perangkat tampil **DEVICE OFFLINE** setelah 15 detik.

Simulator memakai endpoint, validasi, dan tabel SQLite yang sama dengan perangkat asli. Semua datanya bertanda **DEMO** dan tidak pernah tampil di **LIVE MODE**.

## Penggunaan operator

Di `/operator`: pilih produk yang sedang dinilai, kelola produk, atur durasi ronde / target jarak / jeda feedback, ganti mode DEMO/LIVE (berlaku juga di kiosk), lihat log event, ekspor CSV, backup SQLite, reset sesi game, dan hapus data DEMO (dengan konfirmasi; data LIVE aman). Nickname pemain dapat diedit di Leaderboard saat login.

## Penyimpanan SQLite

Default `data/tastequest.db` (ubah lewat `DB_PATH`). Migrasi berjalan otomatis. Data bertahan setelah server restart. Backup dan ekspor dijelaskan di [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md#database-backup-dan-ekspor).

## Firmware ESP8266

Tersedia dua versi berisi kode yang sama. Pilih salah satu:

| Versi | Folder | Tutorial upload |
|---|---|---|
| **Arduino IDE** | `firmware-arduino/TasteQuest/` (buka `TasteQuest.ino`; mode di `config.h`: `TQ_USE_SIMULATION`) | [docs/TUTORIAL_ARDUINO_IDE.md](docs/TUTORIAL_ARDUINO_IDE.md) |
| **PlatformIO** | `firmware/` (environment `sim` / `hardware`) | [docs/TUTORIAL_PLATFORMIO.md](docs/TUTORIAL_PLATFORMIO.md) |

Ringkas versi PlatformIO:

```bash
cd firmware
pio run -e sim -t upload && pio device monitor     # tanpa sensor; ketik 'h' di Serial Monitor
pio run -e hardware -t upload                       # setelah pin diisi & wiring diverifikasi
```

- **Pin GPIO**: sudah diisi di `config.h` kedua versi (TTP223 = GPIO16, buzzer + = GPIO15). Mode hardware tetap menolak menginisialisasi sensor jika pin tidak valid. Lihat [docs/PIN_CONFIGURATION.md](docs/PIN_CONFIGURATION.md).
- **Wi-Fi & server**: `firmware/include/secrets.h` (`WIFI_SSID`, `WIFI_PASSWORD`, `BACKEND_URL` = URL LAN laptop, `DEVICE_API_TOKEN` = `DEVICE_TOKEN` di `.env`, `DEVICE_ID`). File ini tidak di-commit.
- `board = d1_mini` di `platformio.ini` hanya contoh target pengembangan. Sesuaikan dengan papan Anda.
- **Keselamatan listrik** (Echo HC-SR04 5 V → pembagi tegangan, dll.): [docs/HARDWARE_WIRING.md](docs/HARDWARE_WIRING.md).

## Setup offline untuk acara

Setelah `npm install`, `npm run build`, dan `pio pkg install -d firmware`, semuanya berjalan tanpa internet: font, ikon, dan skrip dibundel lokal (diverifikasi smoke test). Bawa laptop + hotspot/router, jalankan `npm start`, sambungkan ESP8266 ke Wi-Fi yang sama, lalu buka `/kiosk` di monitor. Panduan presentasi 3 menit: [docs/EVENT_DEMO_GUIDE.md](docs/EVENT_DEMO_GUIDE.md).

## Troubleshooting

| Gejala | Solusi |
|---|---|
| `Konfigurasi .env tidak valid` saat start | Jalankan `npm run setup` atau isi `OPERATOR_PASSWORD` (≥ 8) dan `DEVICE_TOKEN` (≥ 16) |
| `Port 3000 sudah dipakai` | Ubah `PORT` di `.env` |
| Halaman kosong / "Frontend belum dibangun" | `npm run build` lalu `npm start` |
| HP tidak bisa membuka dashboard | Firewall laptop, Wi-Fi sama, atau hotspot dengan client isolation (lihat LOCAL_SETUP) |
| ESP8266 "heartbeat gagal (HTTP 401)" di Serial | `DEVICE_API_TOKEN` ≠ `DEVICE_TOKEN` |
| ESP8266 "HTTP -1" | `BACKEND_URL` salah/IP laptop berubah, atau firewall |
| Monitor Perangkat: "Pin belum diatur" | Isi pin di `config.h` lalu flash ulang `-e hardware` |
| `npm install` gagal di better-sqlite3 | Pasang build tools (lihat LOCAL_SETUP → Catatan platform) |
| Simulator: "Login operator diperlukan" | Login di `/operator` (sesi berakhir setelah 12 jam) |

## Dokumentasi

[TUTORIAL_ARDUINO_IDE](docs/TUTORIAL_ARDUINO_IDE.md) · [TUTORIAL_PLATFORMIO](docs/TUTORIAL_PLATFORMIO.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) · [BRAND_ANALYSIS](docs/BRAND_ANALYSIS.md) · [PIN_CONFIGURATION](docs/PIN_CONFIGURATION.md) · [HARDWARE_WIRING](docs/HARDWARE_WIRING.md) · [API_REFERENCE](docs/API_REFERENCE.md) · [LOCAL_SETUP](docs/LOCAL_SETUP.md) · [EVENT_DEMO_GUIDE](docs/EVENT_DEMO_GUIDE.md) · [TEST_REPORT](docs/TEST_REPORT.md) · [IMPLEMENTATION_PROGRESS](docs/IMPLEMENTATION_PROGRESS.md)

---

TasteQuest — HMIF UNJA
© Muhammad Aziz Syah Dani 2026
