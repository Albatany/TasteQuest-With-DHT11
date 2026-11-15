# Setup Lokal & Jaringan Acara

## Prasyarat (sekali, butuh internet)

- Node.js ≥ 22 (diuji dengan 24.22) dan npm
- Python 3 + PlatformIO Core (untuk firmware)
- Git (opsional)

```bash
npm install          # unduh dependensi (sekali)
npm run setup        # buat .env + firmware/include/secrets.h dengan secret acak
npm run build        # build dashboard ke apps/web/dist
pio pkg install -d firmware   # unduh platform & library ESP8266 (sekali)
```

Setelah tiga langkah di atas, **internet tidak dibutuhkan lagi**. Font, ikon, dan semua JavaScript dibundel lokal (smoke test memastikan tidak ada request ke luar).

## Menjalankan

```bash
npm start            # produksi: http://localhost:3000
npm run dev          # pengembangan: hot reload, tetap satu port
```

Konsol menampilkan URL lokal, URL LAN (`http://192.168.x.x:3000`), dan path database.

## Jaringan di FST Market Day

**Cara paling stabil: hotspot dari ESP8266** (`WIFI_USE_ESP_HOTSPOT 1` di `secrets.h`). Sambungkan laptop ke Wi-Fi `TasteQuest-HMIF`, lalu `npm start`. ESP menemukan laptop sendiri, tanpa mengisi IP. HP/monitor yang ingin melihat dashboard juga harus tersambung ke hotspot itu (maksimal 8 perangkat; laptop tidak mendapat internet).

**Cara lain: hotspot HP/router** (`WIFI_USE_ESP_HOTSPOT 0`):

1. Nyalakan hotspot HP atau router. Laptop **dan** ESP8266 tersambung ke jaringan yang sama (ESP8266 hanya mendukung 2,4 GHz).
2. Jalankan `npm start` di laptop dan catat URL LAN yang tercetak.
3. Isi `BACKEND_URL` di `firmware/include/secrets.h` dengan URL itu, lalu flash ulang. IP laptop bisa berubah jika berganti jaringan, jadi cek ulang di hari acara. Sebaiknya atur DHCP reservation/IP statis di router.
4. Perangkat lain (HP, laptop kedua, monitor kiosk) cukup membuka `http://<IP-laptop>:3000` atau `/kiosk`.

### Firewall

Port TCP `PORT` (default 3000) harus diizinkan masuk dari jaringan lokal:

- **Windows**: saat prompt Windows Defender Firewall muncul untuk Node.js, centang *Private networks*. Jika terlewat: Windows Security → Firewall → Allow an app → Node.js.
- **Linux (ufw)**: `sudo ufw allow 3000/tcp`
- **macOS**: System Settings → Network → Firewall → izinkan `node`.

Beberapa hotspot HP dan Wi-Fi kampus memakai *client isolation* yang memblokir antar-perangkat. Jika HP tidak bisa membuka dashboard padahal laptop bisa, ganti ke hotspot lain.

`HOST=0.0.0.0` (default) membuka server ke LAN. Untuk uji lokal saja, set `HOST=127.0.0.1`.

## Konfigurasi `.env`

Lihat `.env.example`. Variabel penting: `PORT`, `HOST`, `DB_PATH`, `APP_MODE` (mode tampilan awal), `OPERATOR_PASSWORD`, `DEVICE_TOKEN` (harus sama dengan `DEVICE_API_TOKEN` di `secrets.h`), `DEVICE_OFFLINE_MS`. `VITE_API_URL`/`VITE_SOCKET_URL` dibiarkan kosong (same-origin) karena login operator memakai cookie same-origin.

## Database, backup, dan ekspor

- Lokasi: `data/tastequest.db` (+ file `-wal`/`-shm`), dapat diubah lewat `DB_PATH`.
- Migrasi berjalan otomatis saat server start.
- **Backup saat server berjalan:** Kontrol Operator → *Backup SQLite* (snapshot konsisten), atau `curl` ke `/api/export/backup.db` dengan cookie operator.
- **Backup manual:** hentikan server (Ctrl+C), lalu salin `data/tastequest.db*` ke flashdisk.
- **Ekspor CSV:** Kontrol Operator → *Feedback CSV* / *Game CSV*.
- **Hapus data DEMO** sebelum acara dimulai: Kontrol Operator → *Hapus data DEMO* (data LIVE tidak tersentuh).

## Catatan platform

- `better-sqlite3` memakai binary native. `npm install` mengunduh prebuilt untuk OS/Node Anda. Jika gagal (Node sangat baru/lama), pasang build tools (Windows: "Desktop development with C++"; Linux: `build-essential`, `python3`).
- Server berjalan dengan `tsx` (TypeScript langsung), tanpa langkah kompilasi backend.
