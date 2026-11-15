# Wiring Perangkat Keras — Panduan Keselamatan

> **Belum ada wiring yang diverifikasi.** Dokumen ini menjelaskan apa yang harus diperiksa, bukan diagram final. Susunan di breadboard (ESP8266 di atas, OLED di tengah, HC-SR04 di depan, DHT11 kanan atas, TTP223 kanan bawah, buzzer di kiri) hanyalah tata letak fisik awal, bukan bukti sambungan listrik yang benar. Tidak ada uji perangkat keras yang dilakukan saat pengembangan software ini.

## Inventaris

| Komponen | Jumlah | Yang harus dikonfirmasi |
|---|---|---|
| ESP8266 dev board | 1 | varian (NodeMCU v2/v3, Wemos D1 mini, …), pinout, regulator 3,3 V, ada/tidaknya pin 5V/VIN |
| HC-SR04 | 1 | versi 5 V (umum) atau 3,3 V (HC-SR04P/RCWL) |
| DHT11 | 1 | modul 3 pin (dengan pull-up) atau sensor 4 pin polos |
| OLED kecil | 1 | controller SSD1306/SH1106, ukuran 128×64, I2C vs SPI, urutan pin (GND-VCC-SCL-SDA atau VCC-GND-…) |
| TTP223 | 1 | posisi jumper A/B (momentary + aktif-HIGH) |
| Buzzer | 1 | aktif atau pasif, tegangan kerja, arus |
| Breadboard + jumper | — | buzzer memakai jumper male-to-female, modul lain male-to-male |

## Aturan listrik

1. **Logika ESP8266 adalah 3,3 V.** Pin GPIO tidak toleran 5 V.
2. **Echo HC-SR04 versi 5 V mengeluarkan 5 V.** Jangan sambungkan langsung ke GPIO. Pakai pembagi tegangan, misalnya Echo → 1 kΩ → GPIO, dan GPIO → 2 kΩ → GND (≈3,3 V), atau gunakan level shifter. Trig cukup diberi 3,3 V dari ESP8266 (umumnya terbaca HIGH oleh HC-SR04, tetapi tetap verifikasi).
3. **Periksa tegangan suplai tiap modul.** HC-SR04 klasik butuh 5 V. DHT11, TTP223, dan OLED umumnya 3,3–5 V; cek datasheet/modul.
4. **Rail 5 V ≠ 3,3 V.** Pin VIN/5V di papan (dari USB) tidak boleh dianggap sama dengan output 3V3. Jangan menyuplai modul 3,3 V dari 5 V.
5. **Ground bersama.** Semua modul harus berbagi GND dengan ESP8266.
6. **Buzzer.** Buzzer dua kaki (+ dan −) tidak punya pin sinyal terpisah: kaki **+ ke GPIO** (`PIN_BUZZER`), kaki **− ke GND**. GPIO itulah yang memberi 3,3 V saat berbunyi. Jangan sambungkan + ke 3V3, karena buzzer akan berbunyi terus. Cara cek jenisnya: tempelkan + ke 3V3 dan − ke GND sebentar. Bunyi terus = aktif (`BUZZER_ACTIVE 1`); hanya "klik" = pasif (`BUZZER_ACTIVE 0`). **Jika buzzer berbunyi terus saat alat menyala**, tahan tombol RST: tetap bunyi berarti kaki + tersambung ke 3V3/5V (salah sambung), berhenti berarti dikendalikan ESP. Serial Monitor juga mencetak pesan `[buzzer]` saat start. GPIO ESP8266 hanya aman untuk arus kecil (±12 mA). Jika buzzer menarik arus lebih besar, pakai transistor NPN (mis. 2N2222/S8050) dengan resistor basis ±1 kΩ, serta dioda flyback untuk buzzer magnetik. Tentukan aktif/pasif lalu set `BUZZER_ACTIVE`.
7. **DHT11** butuh pull-up 4,7–10 kΩ pada data; modul 3 pin biasanya sudah punya.
8. **OLED.** Pastikan controller, alamat I2C, dan urutan pin modul. Urutan VCC/GND bisa berbeda antar-penjual, dan memasang terbalik bisa merusak modul.
9. **Pin boot-strapping** (GPIO0/2/15): lihat [PIN_CONFIGURATION.md](PIN_CONFIGURATION.md).
10. Cabut USB saat memindahkan kabel. Ukur tegangan dengan multimeter sebelum menyambungkan modul ke GPIO.

## Langkah integrasi bertahap (disarankan)

1. Flash `pio run -e sim -t upload`, buka Serial Monitor 115200, lalu pastikan Wi-Fi dan dashboard (mode **DEMO**) menerima heartbeat. Ketik `h` untuk perintah simulasi.
2. Isi pin di `config.h`, flash `-e hardware` **tanpa modul tersambung**, dan pastikan `[pins] konfigurasi GPIO valid`.
3. Sambungkan modul satu per satu (TTP223 → buzzer → OLED → DHT11 → HC-SR04 dengan pembagi tegangan), cek Serial dan halaman *Monitor Perangkat* setiap langkah.
4. Kalibrasi HC-SR04 dengan penggaris pada 10, 20, dan 30 cm. Sesuaikan target di *Kontrol Operator* agar berada dalam rentang yang akurat.
5. Uji 10 permainan dan 10 feedback penuh sebelum acara.

**Mode Hardware baru dianggap tervalidasi setelah papan asli, pemetaan pin, adaptasi tegangan, sensor, dan catu daya diuji secara fisik.**
