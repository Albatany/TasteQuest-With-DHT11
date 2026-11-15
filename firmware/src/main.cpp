// TasteQuest ESP8266 firmware — ProxiRush + TastePulse.
// © Muhammad Aziz Syah Dani 2026 · HMIF UNJA × FST Market Day 2026
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
    Serial.println(F("[pins] sensor TIDAK diinisialisasi. Edit firmware/include/config.h lalu flash ulang."));
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
