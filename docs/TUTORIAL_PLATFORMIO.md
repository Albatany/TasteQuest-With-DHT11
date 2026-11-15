# Tutorial: Build & Upload Firmware TasteQuest dengan PlatformIO

Proyek PlatformIO ada di **`firmware/`** (file `platformio.ini` ada di folder itu). Ada dua environment:

| Environment | Isi | Kapan dipakai |
|---|---|---|
| `sim` | tanpa GPIO, sensor disimulasikan, input dari Serial Monitor | upload pertama, uji Wi-Fi & dashboard |
| `hardware` | sensor asli, menolak jalan sebelum pin valid | setelah pin diisi dan wiring dicek |

Anda bisa memakai PlatformIO lewat **VS Code** (klik tombol) atau **terminal (CLI)**. Hasilnya sama.

## 0. Persiapan (sekali)

- **VS Code:** Extensions → cari **PlatformIO IDE** → Install, lalu tunggu sampai ikon semut (alien) muncul di sidebar kiri.
- **CLI:** PlatformIO Core 6.2 sudah terpasang di laptop ini, tetapi belum masuk PATH. Jalankan di setiap terminal baru:
  ```bash
  export PATH="$PATH:$HOME/.platformio/penv/bin"
  ```
  Agar permanen, tambahkan baris itu ke `~/.bashrc`.
- Platform ESP8266 dan library sudah terunduh di laptop ini. Di komputer baru, build pertama butuh internet untuk mengunduhnya otomatis.

## 1. Isi `firmware/include/secrets.h`

**Pilihan Wi-Fi (di `secrets.h`):**
- `WIFI_USE_ESP_HOTSPOT 1` (disarankan untuk acara, sudah aktif di laptop ini): ESP8266 membuat hotspot `TasteQuest-HMIF`, passwordnya ada di `ESP_HOTSPOT_PASSWORD`. Sambungkan **laptop** ke hotspot itu dan jalankan `npm start`; ESP mencari server sendiri, jadi `BACKEND_URL` tidak dipakai.
- `WIFI_USE_ESP_HOTSPOT 0`: ESP8266 ikut hotspot HP/router (`WIFI_SSID`, `WIFI_PASSWORD`), dan `BACKEND_URL` harus berisi IP laptop.

Sudah dibuat oleh `npm run setup`, dan token sudah terisi. Lengkapi bagian ini:

```c
#define WIFI_SSID "nama-hotspot"              // 2,4 GHz
#define WIFI_PASSWORD "password-hotspot"
#define BACKEND_URL "http://192.168.1.8:3000" // alamat "LAN" dari `npm start`
```

## 2. Cocokkan board

`platformio.ini` memakai `board = d1_mini` (WeMos/LOLIN D1 mini & D1 R2). Jika papan Anda berbeda, ubah baris itu:

| Papan | Nilai `board` |
|---|---|
| WeMos D1 mini / D1 R2 | `d1_mini` (default) |
| WeMos D1 R1 | `d1` |
| NodeMCU v2/v3 (ESP-12E) | `nodemcuv2` |

## 3. Colokkan ESP8266 dan cek port

Colokkan dengan kabel USB **data**, lalu:

- **VS Code:** PlatformIO Home (ikon rumah di status bar bawah) → **Devices**.
- **CLI:**
  ```bash
  pio device list
  ```
  Cari baris `/dev/ttyUSB0` (Linux) atau `COMx` (Windows) dengan keterangan `CP2102` / `CH340` / `USB-Serial`. Port `/dev/ttyS0…S3` adalah port bawaan laptop, bukan ESP8266.

PlatformIO memilih port secara otomatis jika hanya ada satu papan.

## 4. Upload — lewat VS Code

1. **File → Open Folder…**, lalu pilih folder **`TasteQuest/firmware`**, bukan folder utama `TasteQuest`. PlatformIO hanya mengenali proyek jika `platformio.ini` ada di folder yang dibuka.
2. Klik ikon semut di sidebar. Di **PROJECT TASKS** muncul `sim` dan `hardware`.
3. Buka **sim → General**, lalu klik:
   - **Build**: kompilasi saja
   - **Upload**: kompilasi + flash ke ESP8266
   - **Monitor**: buka Serial Monitor (115200 sudah diatur di `platformio.ini`)
   - **Upload and Monitor**: keduanya sekaligus (paling praktis)
4. Status bar bawah juga punya tombol ✓ (build), → (upload), dan 🔌 (monitor). Pastikan environment yang aktif di status bar adalah `env:sim`.

## 5. Upload — lewat terminal

```bash
cd ~/Downloads/TasteQuest/firmware
pio run -e sim -t upload          # build + upload
pio device monitor                # Serial Monitor 115200; keluar dengan Ctrl+C
```

Atau sekaligus:

```bash
pio run -e sim -t upload -t monitor
```

Jika ada lebih dari satu papan, sebut port-nya:

```bash
pio run -e sim -t upload --upload-port /dev/ttyUSB0
pio device monitor -p /dev/ttyUSB0
```

Upload berhasil jika muncul:

```
Writing at 0x0004c000... (100 %)
Hash of data verified.
Hard resetting via RTS pin...
========== [SUCCESS] ==========
```

`npm run firmware:sim` dan `npm run firmware:hardware` di folder utama hanya **build** (tanpa upload) dan memerlukan `pio` di PATH.

## 6. Mencoba firmware simulasi

Di `pio device monitor`, ketik huruf langsung (tanpa Enter):

| Tombol | Arti |
|---|---|
| `s` | tap sensor sentuh |
| `l` | tahan (konfirmasi / kunci) |
| `+` / `-` | geser tangan 1 cm |
| `a` | sapuan jarak otomatis |
| `e` | error sensor |
| `r` | reset |
| `h` | bantuan |

Satu game: `s` → `l` → `l` → tunggu hitung mundur → atur jarak → `l`, ulangi 3 ronde.

Di dashboard (`npm start` → `/operator` → **DEMO MODE**), perangkat `TQ-ESP8266-01` tampil online, dan Arena/Kiosk mengikuti permainan.

## 7. Upload mode hardware

1. Ikuti `docs/HARDWARE_WIRING.md`. **Echo HC-SR04 harus lewat pembagi tegangan.**
2. Isi semua pin di `firmware/include/config.h` (checklist di `docs/PIN_CONFIGURATION.md`).
3. Upload environment `hardware`:
   ```bash
   pio run -e hardware -t upload -t monitor
   ```
   (VS Code: **hardware → General → Upload and Monitor**)
4. Pastikan Serial menampilkan `[pins] konfigurasi GPIO valid`, lalu pilih **LIVE MODE** di dashboard.

## Masalah umum

| Gejala | Solusi |
|---|---|
| VS Code tidak menampilkan PROJECT TASKS | Folder yang dibuka harus `firmware/` (yang berisi `platformio.ini`) |
| `pio: command not found` | Jalankan perintah `export PATH=…` di langkah 0 |
| `Please specify upload_port` / port salah | Tambahkan `--upload-port /dev/ttyUSB0` |
| `could not open port … Permission denied` | Akun harus di grup `dialout` (akun Anda sudah); logout/login lalu colok ulang |
| `could not open port … busy` | Tutup Serial Monitor yang masih berjalan (terminal PlatformIO atau Arduino IDE) sebelum upload |
| `Failed to connect to ESP8266: Timed out…` | Tahan tombol **FLASH/BOOT** saat `Connecting...`, ganti kabel, lepas modul di GPIO0/2/15 |
| Build pertama lama / mengunduh | Normal di komputer baru: platform & library diunduh sekali (butuh internet) |
| Serial: `heartbeat gagal (HTTP 401)` | Token di `secrets.h` ≠ `DEVICE_TOKEN` di `.env` |
| Serial: `heartbeat gagal (HTTP -1)` | `BACKEND_URL`/IP laptop/firewall/Wi-Fi berbeda (lihat `docs/LOCAL_SETUP.md`) |

## Arduino IDE atau PlatformIO?

Keduanya mem-flash firmware yang sama. ESP8266 menjalankan apa pun yang terakhir di-upload. Lihat `docs/TUTORIAL_ARDUINO_IDE.md` untuk versi Arduino IDE (`firmware-arduino/TasteQuest/`).
