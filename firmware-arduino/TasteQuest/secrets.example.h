#pragma once
// Copy this file to secrets.h (or run `npm run setup` in the repo root, which
// fills DEVICE_API_TOKEN from .env). secrets.h is git-ignored: never commit it.
// Nothing in this file is ever printed to the Serial Monitor.

#define WIFI_SSID "nama-hotspot-atau-router"
#define WIFI_PASSWORD "password-wifi"

// LAN URL of the laptop running the TasteQuest server (printed by `npm start`
// under "LAN"). Use the laptop's current IP; no trailing slash.
#define BACKEND_URL "http://192.168.1.10:3000"

// Must equal DEVICE_TOKEN in the server's .env.
#define DEVICE_API_TOKEN "change-me-device-token"

// Letters, digits, '-' or '_' only (max 32 chars).
#define DEVICE_ID "TQ-ESP8266-01"

// ---- Cara konek Wi-Fi --------------------------------------------------------
// 0 = ESP8266 ikut hotspot HP / router di atas (WIFI_SSID, WIFI_PASSWORD, BACKEND_URL).
// 1 = ESP8266 membuat hotspot sendiri. Sambungkan LAPTOP ke hotspot ini; alamat
//     server dicari otomatis, jadi BACKEND_URL tidak dipakai. Paling stabil untuk acara.
#define WIFI_USE_ESP_HOTSPOT 0
#define ESP_HOTSPOT_SSID "TasteQuest-HMIF"
#define ESP_HOTSPOT_PASSWORD "change-me-hotspot" // 8-63 karakter
