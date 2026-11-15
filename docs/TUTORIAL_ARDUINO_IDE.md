# Tutorial: Upload Firmware TasteQuest dengan Arduino IDE

Sketch Arduino ada di **`firmware-arduino/TasteQuest/`**. Isinya sama persis dengan versi PlatformIO (`firmware/`). Bedanya hanya dua: mode simulasi/hardware dipilih di `config.h`, dan `setup()`/`loop()` ada di `TasteQuest.ino`.

> Firmware ini untuk **ESP8266** (NodeMCU, WeMos D1 mini/R2, dsb.), **bukan** Arduino UNO (ATmega328P). UNO tidak punya Wi-Fi dan RAM-nya terlalu kecil.

## 1. Pasang dukungan board ESP8266 (sekali)

Di laptop ini sudah terpasang (esp8266 **3.1.2**). Lewati langkah ini kecuali Anda memakai komputer lain.

1. **File → Preferences → Additional boards manager URLs**, isi:
   `https://arduino.esp8266.com/stable/package_esp8266com_index.json`
2. **Tools → Board → Boards Manager**, cari **esp8266** (by ESP8266 Community), lalu **Install** (versi teruji: 3.1.2).

## 2. Pasang library (sekali)

**Sketch → Include Library → Manage Libraries…**, lalu cari dan pasang:

| Library | Pembuat | Status di laptop ini |
|---|---|---|
| **ArduinoJson** (versi 7.x) | Benoit Blanchon | ❗ perlu dipasang |
| **U8g2** | oliver | ❗ perlu dipasang |
| DHT sensor library | Adafruit | ✅ sudah ada (1.4.7) |
| Adafruit Unified Sensor | Adafruit | ✅ sudah ada (1.1.15) |

Jika muncul dialog "install dependencies", pilih **Install All**. Library Adafruit SSD1306 yang sudah terpasang tidak dipakai; U8g2 sudah mendukung OLED SSD1306 maupun SH1106.

## 3. Buka sketch

**File → Open…**, lalu pilih `TasteQuest/firmware-arduino/TasteQuest/TasteQuest.ino`.
Semua file muncul sebagai tab: `TasteQuest.ino`, `config.h`, `secrets.h`, `net.cpp`, dan seterusnya.
Jangan memindahkan file keluar dari folder, dan nama folder harus tetap `TasteQuest` (aturan Arduino IDE).

## 4. Isi tab `secrets.h`

**Pilihan Wi-Fi (di `secrets.h`):**
- `WIFI_USE_ESP_HOTSPOT 1` (disarankan untuk acara, sudah aktif di laptop ini): ESP8266 membuat hotspot `TasteQuest-HMIF`, passwordnya ada di `ESP_HOTSPOT_PASSWORD`. Sambungkan **laptop** ke hotspot itu dan jalankan `npm start`; ESP mencari server sendiri, jadi `BACKEND_URL` tidak dipakai.
- `WIFI_USE_ESP_HOTSPOT 0`: ESP8266 ikut hotspot HP/router (`WIFI_SSID`, `WIFI_PASSWORD`), dan `BACKEND_URL` harus berisi IP laptop.

File ini sudah dibuat oleh `npm run setup` dan `DEVICE_API_TOKEN` sudah terisi. Yang perlu Anda isi:

```c
#define WIFI_SSID "nama-hotspot"              // Wi-Fi 2,4 GHz (ESP8266 tidak mendukung 5 GHz)
#define WIFI_PASSWORD "password-hotspot"
#define BACKEND_URL "http://192.168.1.8:3000" // alamat "LAN" yang dicetak `npm start`
```

`DEVICE_ID` boleh dibiarkan. Jika `secrets.h` tidak ada (misalnya setelah clone baru), jalankan `npm run setup` di folder proyek, atau salin `secrets.example.h` menjadi `secrets.h` dan isi `DEVICE_API_TOKEN` dengan nilai `DEVICE_TOKEN` dari file `.env`.

## 5. Pilih mode di tab `config.h`

```c
#define TQ_USE_SIMULATION 1   // 1 = SIMULASI (upload pertama), 0 = HARDWARE
```

Mode **simulasi** tidak menyentuh pin GPIO sama sekali. Jarak tangan dan suhu disimulasikan, dan sensor sentuh diganti perintah dari Serial Monitor. Mode ini aman diupload walau sensor belum dirakit.

## 6. Colokkan ESP8266 dan pilih board & port

1. Colokkan papan ke laptop dengan **kabel USB data**. Kabel yang hanya untuk mengisi daya tidak akan memunculkan port.
2. **Tools → Board → esp8266 →** pilih sesuai papan:

   | Papan Anda | Pilih di menu |
   |---|---|
   | WeMos/LOLIN D1 mini, D1 R2 (bentuk UNO) | `LOLIN(WEMOS) D1 R2 & mini` |
   | WeMos D1 R1 | `LOLIN(WeMos) D1 R1` |
   | NodeMCU v2/v3 (ESP-12E) | `NodeMCU 1.0 (ESP-12E Module)` |

3. **Tools → Port**, pilih `/dev/ttyUSB0` (Linux) atau `COM3`/`COMx` (Windows).
   Jika ragu, cabut papan, lihat daftar port, colok lagi, lalu pilih port yang baru muncul.
4. **Tools → Upload Speed**: biarkan `921600`. Jika upload gagal, turunkan ke `115200`.
5. Menu Tools lainnya biarkan default.

## 7. Upload

Klik **✓ Verify** dulu (kompilasi), lalu **→ Upload**. Upload berhasil jika di bawah muncul:

```
Writing at 0x0004c000... (100 %)
Hash of data verified.
Hard resetting via RTS pin...
```

## 8. Lihat Serial Monitor

**Tools → Serial Monitor**, atur baud ke **115200**. Tekan tombol RST di papan untuk melihat dari awal:

```
TasteQuest firmware 1.0.0 — mode SIMULASI, device TQ-ESP8266-01
[sim] ketik 'h' untuk perintah simulasi
[net] menghubungkan ke Wi-Fi "nama-hotspot", server http://192.168.1.8:3000
[oled] TASTEQUEST | HMIF UNJA |  | Sentuh utk mulai | Hotspot:1 Server:OK
```

Beberapa karakter acak tepat setelah reset itu normal: ROM ESP8266 berbicara di baud 74880.

Perintah simulasi diketik di kolom kirim Serial Monitor, lalu tekan Enter:

| Ketik | Arti |
|---|---|
| `s` | tap singkat sensor sentuh |
| `l` | tahan (konfirmasi / kunci jarak) |
| `+` / `-` | geser tangan simulasi 1 cm (berhenti dari mode sapuan otomatis) |
| `a` | kembali ke sapuan otomatis 10–35 cm |
| `e` | simulasikan error sensor |
| `r` | reset ke layar awal |
| `h` | bantuan |

Contoh main satu game: `s` (menu) → `l` (ProxiRush) → `l` (mulai) → tunggu hitung mundur → atur jarak dengan `+`/`-` → `l` untuk mengunci. Ulangi untuk ronde 2 dan 3.

## 9. Lihat di dashboard

1. Di laptop: `npm start`, lalu buka `http://localhost:3000/operator` dan login.
2. Pilih **DEMO MODE**. Firmware simulasi mengirim data bertanda DEMO, jadi tidak tercampur data asli.
3. **Monitor Perangkat** menampilkan `TQ-ESP8266-01` online. **Arena** dan **Kiosk** mengikuti game yang Anda mainkan lewat Serial Monitor.

## 10. Beralih ke sensor asli (mode hardware)

1. Baca dulu `docs/HARDWARE_WIRING.md`. **Echo HC-SR04 wajib lewat pembagi tegangan.**
2. Di tab `config.h`, isi semua `PIN_...` dengan nomor GPIO (bukan label D1/D2; tabelnya ada di komentar `config.h` dan `docs/PIN_CONFIGURATION.md`), atur jenis OLED/buzzer, lalu ubah `#define TQ_USE_SIMULATION 0`.
3. Upload ulang. Serial Monitor harus menampilkan `[pins] konfigurasi GPIO valid`.
   Jika ada pin yang salah, setiap masalah dicetak (`[pins] PIN_BUZZER = -1: belum diatur …`), sensor **tidak** dinyalakan, dan dashboard menampilkan error-nya di Monitor Perangkat.
4. Di dashboard pilih **LIVE MODE**.

## Masalah umum

| Gejala | Penyebab & solusi |
|---|---|
| `ArduinoJson.h: No such file or directory` | Pasang library ArduinoJson (langkah 2). Sama untuk `U8g2lib.h` (U8g2) dan `DHT.h` (DHT sensor library) |
| Menu board esp8266 tidak ada | Langkah 1 belum dilakukan |
| Warning `secrets.h tidak ada` | Buat `secrets.h` (langkah 4). Tanpa itu firmware memakai Wi-Fi/token contoh |
| Port tidak muncul / abu-abu | Ganti kabel data. Di Windows pasang driver **CH340** (papan WeMos/NodeMCU v3) atau **CP210x** (NodeMCU v2) |
| `Permission denied: '/dev/ttyUSB0'` (Linux) | Akun harus di grup `dialout`. Akun Anda sudah; jika masih terjadi, logout/login lalu colok ulang |
| `Failed to connect to ESP8266: Timed out waiting for packet header` | Tahan tombol **FLASH/BOOT** saat tulisan `Connecting...` muncul, turunkan Upload Speed ke 115200, atau lepas modul yang tersambung ke GPIO0/2/15 |
| `port is busy` / `could not open port` | Tutup Serial Monitor lain (misalnya PlatformIO) yang sedang memakai port |
| Serial: `heartbeat gagal (HTTP 401)` | `DEVICE_API_TOKEN` ≠ `DEVICE_TOKEN` di `.env` |
| Serial: `heartbeat gagal (HTTP -1)` | `BACKEND_URL` salah, IP laptop berubah, firewall, atau Wi-Fi berbeda (lihat `docs/LOCAL_SETUP.md`) |
| Serial: `Wi-Fi belum terhubung: …` terus | Baca alasannya di pesan (hotspot tidak ditemukan / password salah / sinyal hilang). Atau pakai `WIFI_USE_ESP_HOTSPOT 1` |
| OLED: `Server:--` | Server belum jalan (`npm start`), atau laptop belum tersambung ke hotspot `TasteQuest-HMIF` |
| Buzzer berbunyi terus | Tahan tombol **RST**: kalau tetap bunyi, kaki + tersambung ke 3V3/5V. Pindahkan **+ ke D8 (GPIO15), − ke GND**. Firmware hanya membunyikan buzzer sebentar saat ada kejadian |

## Menjaga dua versi tetap sama

File `.cpp` dan `.h` di sketch ini adalah salinan persis dari `firmware/src` dan `firmware/include`. Jika Anda mengubah logika di satu versi, salin juga ke versi lain. Pengecekan cepat (Linux), tanpa output berarti sama:

```bash
for f in pins sensors input buzzer display machine net; do cmp firmware/src/$f.cpp firmware-arduino/TasteQuest/$f.cpp; done
cmp firmware/include/tastequest.h firmware-arduino/TasteQuest/tastequest.h
```

Pengaturan pin (`config.h`) memang diisi di versi yang Anda pakai saja.
