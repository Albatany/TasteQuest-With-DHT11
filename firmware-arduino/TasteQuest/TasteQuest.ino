// =============================================================================
//  TasteQuest — ProxiRush + TastePulse untuk ESP8266 (versi Arduino IDE)
//  © Muhammad Aziz Syah Dani 2026 · HMIF UNJA × FST Market Day 2026
//
//  Yang perlu diedit (lihat tab di atas):
//    config.h   -> TQ_USE_SIMULATION (1 = simulasi, 0 = hardware) dan pin GPIO
//    secrets.h  -> Wi-Fi, BACKEND_URL (IP laptop), DEVICE_API_TOKEN, DEVICE_ID
//
//  Board : Tools > Board > esp8266 > "LOLIN(WEMOS) D1 R2 & mini" atau
//          "NodeMCU 1.0 (ESP-12E Module)" (sesuai papan Anda)
//  Library (Library Manager): ArduinoJson, U8g2, DHT sensor library, Adafruit Unified Sensor
//  Serial Monitor: 115200 baud
//  Panduan lengkap: docs/TUTORIAL_ARDUINO_IDE.md
//
//  Tab lain berisi kode yang sama persis dengan firmware/ (versi PlatformIO).
// =============================================================================
#include "tastequest.h"

bool hardwareReady = SIMULATION_MODE; // simulation never touches GPIO

void setup() {
  Serial.begin(115200);
  Serial.printf("\n\nTasteQuest firmware %s — mode %s, device %s\n", FIRMWARE_VERSION, SIMULATION_MODE ? "SIMULASI" : "HARDWARE", DEVICE_ID);
  uint32_t now = millis();
  machineBegin(now);

#if HARDWARE_MODE
  // Pin validation MUST happen before any pinMode / sensor / I2C call.
  char error[sizeof(M.error)];
  hardwareReady = validatePins(error, sizeof(error));
  if (!hardwareReady) {
    snprintf(M.error, sizeof(M.error), "%s", error);
    M.phase = Phase::ERR; // machine stays stopped; heartbeat reports the error
    Serial.println(F("[pins] sensor TIDAK diinisialisasi. Edit config.h lalu upload ulang."));
  }
#endif

  if (hardwareReady) {
    sensorsBegin();
    inputBegin();
    buzzerBegin();
    displayBegin();
  }
  netBegin(); // Wi-Fi only: reports status (and any pin error) to the dashboard
}

void loop() {
  uint32_t now = millis();
  if (hardwareReady) {
    sensorsLoop(now);
    Press p = inputPoll(now);
    if (p == Press::Short) machineStep(Input::Short, now);
    if (p == Press::Long) machineStep(Input::Long, now);
    if (simCommandSensorError()) machineStep(Input::SensorError, now, "HC-SR04 (simulasi)");
    if (simCommandReset()) machineStep(Input::Reset, now);
    machineStep(Input::Tick, now);
    buzzerLoop(now);
    displayLoop(now);
  }
  netLoop(now);
}
