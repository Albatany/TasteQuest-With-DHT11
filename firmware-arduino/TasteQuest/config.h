#pragma once
// =============================================================================
//  TasteQuest firmware configuration  —  the ONE file to edit for hardware.
//  Wi-Fi, backend URL, token and device ID live in secrets.h (separate, ignored).
//  © Muhammad Aziz Syah Dani 2026
// =============================================================================

#if __has_include("secrets.h")
#include "secrets.h"
#else
// Lets the simulation build compile on a fresh checkout. Run `npm run setup`.
#warning "secrets.h tidak ada: memakai secrets.example.h (Wi-Fi/token contoh)."
#include "secrets.example.h"
#endif

// Wi-Fi mode defaults for secrets.h files made before the hotspot option existed.
#ifndef WIFI_USE_ESP_HOTSPOT
#define WIFI_USE_ESP_HOTSPOT 0
#endif
#ifndef ESP_HOTSPOT_SSID
#define ESP_HOTSPOT_SSID "TasteQuest-HMIF"
#endif
#ifndef ESP_HOTSPOT_PASSWORD
#define ESP_HOTSPOT_PASSWORD "change-me-hotspot"
#endif
#ifndef BACKEND_PORT
#define BACKEND_PORT 3000 // hotspot mode: port of `npm start` on the laptop
#endif
static_assert(sizeof(ESP_HOTSPOT_PASSWORD) - 1 >= 8 && sizeof(ESP_HOTSPOT_PASSWORD) - 1 <= 63, "ESP_HOTSPOT_PASSWORD harus 8-63 karakter (aturan WPA2)");

// =============================================================================
//  PILIH MODE (Arduino IDE)  —  EDIT ME
//  1 = SIMULASI: tidak menyentuh GPIO sama sekali; jarak & suhu disimulasikan,
//      input dari Serial Monitor (ketik h). Aman untuk upload pertama.
//  0 = HARDWARE: sensor asli. Isi semua pin di bagian GPIO di bawah lebih dulu.
// =============================================================================
#define TQ_USE_SIMULATION 0

#if TQ_USE_SIMULATION
#define TQ_SIMULATION_MODE 1
#else
#define TQ_HARDWARE_MODE 1
#endif

// ---- Build mode (from TQ_USE_SIMULATION above) ------------------------------
#if defined(TQ_SIMULATION_MODE) && defined(TQ_HARDWARE_MODE)
#error "Pilih salah satu: TQ_SIMULATION_MODE atau TQ_HARDWARE_MODE"
#endif
#ifdef TQ_HARDWARE_MODE
#define HARDWARE_MODE 1
#define SIMULATION_MODE 0
#else
#define HARDWARE_MODE 0
#define SIMULATION_MODE 1 // default: safe, touches no GPIO
#endif

#define FIRMWARE_VERSION "1.0.0"

// =============================================================================
//  GPIO PINS  —  EDIT ME (hardware mode only)
//
//  Use RAW GPIO NUMBERS, not the "D" labels printed on the board.
//  On NodeMCU / Wemos D1 mini style boards the labels usually map like this
//  (verify against YOUR board's pinout before trusting it):
//
//    D0=GPIO16  D1=GPIO5  D2=GPIO4  D3=GPIO0*  D4=GPIO2*
//    D5=GPIO14  D6=GPIO12 D7=GPIO13 D8=GPIO15*  RX=GPIO3  TX=GPIO1
//
//  * Boot-strapping pins: GPIO0 and GPIO2 must be HIGH at power-up, GPIO15 must
//    be LOW. A module that pulls them the other way stops the board from booting
//    or flashing. They are rejected unless ALLOW_BOOT_STRAP_PINS is 1.
//  GPIO6–11 are wired to the flash chip and are always rejected.
//  GPIO1/GPIO3 are the USB serial port used for logs and are rejected.
//  GPIO16 cannot do I2C, so it is rejected for the OLED.
//
//  All pins start as PIN_UNASSIGNED. Hardware mode refuses to initialise any
//  sensor until every pin below is set, valid, and unique.
//  See docs/PIN_CONFIGURATION.md for the planning checklist.
// =============================================================================
#define PIN_UNASSIGNED -1

#define PIN_HCSR04_TRIG 12  // output
#define PIN_HCSR04_ECHO 14  // input. 5 V Echo -> resistor divider / level shifter REQUIRED
#define PIN_DHT11_DATA 13   // data line; needs a pull-up (often already on the breakout)
#define PIN_TTP223_TOUCH 16 // input; TTP223 set to momentary, active-HIGH (GPIO16 = D0 on NodeMCU/D1 mini)
#define PIN_BUZZER 15       // output; buzzer + to this pin, - to GND (GPIO15 = D8 on NodeMCU/D1 mini)
#define PIN_OLED_SDA 5     // I2C data
#define PIN_OLED_SCL 4     // I2C clock

// Set to 1 only after checking that the module on GPIO0/2/15 keeps the
// required boot level (see above). Leave 0 if unsure.
#define ALLOW_BOOT_STRAP_PINS 1 // needed for the buzzer on GPIO15: a buzzer to GND keeps it LOW at boot, which is safe

// ---- Module options (confirm against your actual modules) -------------------
#define OLED_CONTROLLER_SH1106 0 // 0 = SSD1306 (common 0.96"), 1 = SH1106 (common 1.3")
#define OLED_WIDTH 128
#define OLED_HEIGHT 64
#define OLED_I2C_ADDRESS 0x3C // 7-bit address: usually 0x3C or 0x3D (use an I2C scanner)

#define BUZZER_ACTIVE 1       // 1 = active buzzer (beeps on DC), 0 = passive (needs a tone)
#define BUZZER_ACTIVE_LOW 0   // 1 if your module beeps when the pin is LOW
#define BUZZER_TONE_HZ 2400   // passive buzzer only
#define TOUCH_ACTIVE_HIGH 1   // TTP223 default output: HIGH while touched

// ---- Timing & calibration ---------------------------------------------------
#define TOUCH_DEBOUNCE_MS 50
#define TOUCH_LONG_PRESS_MS 1200
#define GAME_ROUND_DURATION_MS 10000   // default until the server sends its setting
#define FEEDBACK_COOLDOWN_MS 3000      // default until the server sends its setting
#define IDLE_TIMEOUT_MS 30000
#define SENSOR_SAMPLE_INTERVAL_MS 60   // HC-SR04 needs >= 60 ms between pings
#define DHT_SAMPLE_INTERVAL_MS 2500    // DHT11 is limited to ~1 reading/second
#define DISTANCE_MIN_CM 2.0            // readings outside this range are invalid
#define DISTANCE_MAX_CM 60.0
#define DISTANCE_MEDIAN_SAMPLES 5
#define ULTRASONIC_TIMEOUT_US 6000     // ~100 cm round trip; no echo = no reading

// ---- Networking --------------------------------------------------------------
#define HEARTBEAT_INTERVAL_MS 5000
#define TELEMETRY_IDLE_MS 2000
#define TELEMETRY_ACTIVE_MS 500
#define WIFI_RETRY_MS 10000
#define HTTP_TIMEOUT_MS 1500
#define BACKOFF_MAX_MS 30000
#define EVENT_QUEUE_SIZE 16 // RAM only: queued events are LOST on power loss/reset
