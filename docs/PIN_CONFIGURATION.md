# Konfigurasi Pin GPIO (ESP8266)

**Status: pin sudah diisi pemilik perangkat** dan lolos `validatePins()`. Wiring fisik belum diverifikasi oleh software ini.

| Fungsi | GPIO | Label NodeMCU / D1 mini | Label WeMos D1 (bentuk UNO) |
|---|---|---|---|
| HC-SR04 TRIG | 12 | D6 | D6 / D12 |
| HC-SR04 ECHO (lewat pembagi tegangan) | 14 | D5 | D5 / D13 |
| DHT11 DATA | 13 | D7 | D7 / D11 |
| OLED SDA | 5 | D1 | D3 / D15 |
| OLED SCL | 4 | D2 | D4 / D14 |
| TTP223 OUT | 16 | D0 | D2 |
| Buzzer **+** (kaki − ke GND) | 15 | D8 | D10 |

Catatan:
- **TTP223 tidak boleh di GPIO0.** Output TTP223 LOW saat tidak disentuh, sehingga ESP8266 boot ke mode upload dan program tidak jalan.
- **Buzzer di GPIO15** memakai `ALLOW_BOOT_STRAP_PINS 1`. GPIO15 harus LOW saat boot, dan buzzer yang tersambung ke GND menjaganya tetap LOW.
- **SDA=5 / SCL=4 kebalikan dari label SDA/SCL bawaan papan** (bawaan: SDA=GPIO4, SCL=GPIO5). Jika Serial menampilkan `[oled] TIDAK terdeteksi`, tukar dua angka itu atau tukar kabelnya.

Checklist di bawah tetap berlaku jika pin diubah lagi.

File yang diedit: **`firmware/include/config.h`** (PlatformIO) atau **`firmware-arduino/TasteQuest/config.h`** (Arduino IDE), bagian `GPIO PINS — EDIT ME`. Isi kedua file sama. Wi-Fi/token ada terpisah di `secrets.h` di folder yang sama.

## Cara kerja pengaman

| Build | Perilaku |
|---|---|
| `pio run -e sim` | Tidak memanggil `pinMode`/`digitalRead`/I2C sama sekali. Sensor disimulasikan dan input datang dari Serial. Bisa dikompilasi tanpa pin. |
| `pio run -e hardware` | Bisa dikompilasi dengan pin kosong, tetapi saat boot `validatePins()` berjalan **sebelum** sensor apa pun diinisialisasi. Jika ada pin yang tidak valid, tidak ada GPIO yang disentuh. Error dicetak ke Serial dan dikirim ke dashboard lewat heartbeat (Monitor Perangkat → "Pin belum diatur"). |

`validatePins()` (`firmware/src/pins.cpp`) menolak:

- pin `PIN_UNASSIGNED`
- nilai di luar 0–16
- GPIO6–11 (terhubung ke chip flash)
- GPIO1/GPIO3 (TX/RX Serial untuk log)
- GPIO0, GPIO2, GPIO15 (boot-strapping), kecuali `ALLOW_BOOT_STRAP_PINS 1`
- GPIO16 untuk OLED SDA/SCL (tidak mendukung I2C)
- pin yang dipakai ganda

## Label papan ≠ nomor GPIO

`config.h` memakai **nomor GPIO mentah**. Label "D1", "D2", … tercetak di papan pengembangan dan berbeda antar-papan. Pemetaan umum NodeMCU / Wemos D1 mini (**cocokkan dengan pinout papan Anda**):

| Label | GPIO | Catatan |
|---|---|---|
| D0 | 16 | tanpa interrupt/PWM/I2C, tidak boleh untuk OLED |
| D1 | 5 | aman, umum untuk I2C SCL |
| D2 | 4 | aman, umum untuk I2C SDA |
| D3 | 0 | **boot-strap**: harus HIGH saat boot |
| D4 | 2 | **boot-strap**: harus HIGH saat boot (LED biru onboard) |
| D5 | 14 | aman |
| D6 | 12 | aman |
| D7 | 13 | aman |
| D8 | 15 | **boot-strap**: harus LOW saat boot |
| RX | 3 | Serial, ditolak |
| TX | 1 | Serial, ditolak |

### Mengapa pin boot-strapping berbahaya

Saat reset, ESP8266 membaca GPIO0, GPIO2, dan GPIO15 untuk memilih mode boot. Normal boot memerlukan GPIO0=HIGH, GPIO2=HIGH, GPIO15=LOW. Modul yang menarik pin tersebut ke level lain saat daya masuk (misalnya buzzer aktif-LOW, TTP223 yang output-nya HIGH, atau sensor dengan pull-down) bisa membuat papan gagal boot atau tidak bisa di-flash. Gunakan pin ini hanya setelah memeriksa level idle modul, lalu set `ALLOW_BOOT_STRAP_PINS 1`.

## Checklist perencanaan pin

Isi tabel ini di kertas setelah papan dan modul dikonfirmasi:

| Fungsi | Konstanta | Arah | Butuh | GPIO rencana | Dicek |
|---|---|---|---|---|---|
| HC-SR04 Trig | `PIN_HCSR04_TRIG` | output | pin digital biasa | | ☐ |
| HC-SR04 Echo | `PIN_HCSR04_ECHO` | input | **pembagi tegangan / level shifter 5V→3,3V** | | ☐ |
| DHT11 Data | `PIN_DHT11_DATA` | I/O | pull-up 4,7–10 kΩ (cek apakah sudah ada di breakout) | | ☐ |
| TTP223 OUT | `PIN_TTP223_TOUCH` | input | mode momentary, aktif-HIGH (`TOUCH_ACTIVE_HIGH`) | | ☐ |
| Buzzer | `PIN_BUZZER` | output | transistor jika arus > ~12 mA; tentukan aktif/pasif | | ☐ |
| OLED SDA | `PIN_OLED_SDA` | I2C | bukan GPIO16 | | ☐ |
| OLED SCL | `PIN_OLED_SCL` | I2C | bukan GPIO16 | | ☐ |

Sebelum flash `-e hardware`, pastikan:

1. ☐ Varian papan ESP8266 diketahui. Ubah `board =` di `firmware/platformio.ini` (contoh `d1_mini` hanyalah target pengembangan).
2. ☐ Setiap label papan sudah diterjemahkan ke nomor GPIO dari pinout papan **Anda**.
3. ☐ Tidak ada pin yang dipakai dua kali.
4. ☐ Pin boot-strap dihindari, atau sudah diperiksa.
5. ☐ Controller OLED (SSD1306 vs SH1106) → `OLED_CONTROLLER_SH1106`.
6. ☐ Alamat I2C OLED (0x3C/0x3D) → `OLED_I2C_ADDRESS` (pakai sketch I2C scanner).
7. ☐ Jenis buzzer (aktif/pasif, aktif-LOW?) → `BUZZER_ACTIVE`, `BUZZER_ACTIVE_LOW`.
8. ☐ Jumper TTP223 di mode momentary + aktif-HIGH (default pabrik: A dan B terbuka).
9. ☐ Echo HC-SR04 sudah lewat pembagi tegangan. Lihat [HARDWARE_WIRING.md](HARDWARE_WIRING.md).
10. ☐ Serial Monitor (115200) menampilkan `[pins] konfigurasi GPIO valid`.

## Parameter lain di `config.h`

| Parameter | Default | Keterangan |
|---|---|---|
| `DEVICE_ID` | di `secrets.h` | huruf/angka/`-`/`_`, maks. 32 |
| `OLED_WIDTH` / `OLED_HEIGHT` | 128 / 64 | |
| `OLED_I2C_ADDRESS` | 0x3C | alamat 7-bit |
| `TOUCH_DEBOUNCE_MS` | 50 | |
| `TOUCH_LONG_PRESS_MS` | 1200 | ambang tekan lama |
| `GAME_ROUND_DURATION_MS` | 10000 | default; operator bisa mengubah dari dashboard |
| `SENSOR_SAMPLE_INTERVAL_MS` | 60 | jeda minimum ping HC-SR04 |
| `DISTANCE_MIN_CM` / `DISTANCE_MAX_CM` | 2 / 60 | di luar rentang = pembacaan tidak valid |
| `ULTRASONIC_TIMEOUT_US` | 6000 | ±100 cm; tanpa echo = tidak ada pembacaan |
| `EVENT_QUEUE_SIZE` | 16 | antrean RAM; **hilang saat mati daya/reset** |

`SIMULATION_MODE` / `HARDWARE_MODE` dipilih lewat environment PlatformIO (`-e sim` / `-e hardware`), bukan diedit manual.
