#include "tastequest.h"

namespace {
struct PinDef {
  const char *name;
  int gpio;
  bool i2c;
};

const PinDef PINS[] = {
    {"PIN_HCSR04_TRIG", PIN_HCSR04_TRIG, false}, {"PIN_HCSR04_ECHO", PIN_HCSR04_ECHO, false}, {"PIN_DHT11_DATA", PIN_DHT11_DATA, false},
    {"PIN_TTP223_TOUCH", PIN_TTP223_TOUCH, false}, {"PIN_BUZZER", PIN_BUZZER, false}, {"PIN_OLED_SDA", PIN_OLED_SDA, true},
    {"PIN_OLED_SCL", PIN_OLED_SCL, true},
};

// Returns nullptr when usable, otherwise why not.
const char *problem(const PinDef &p) {
  if (p.gpio == PIN_UNASSIGNED) return "belum diatur (PIN_UNASSIGNED)";
  if (p.gpio < 0 || p.gpio > 16) return "bukan GPIO ESP8266 yang valid (0-16)";
  if (p.gpio >= 6 && p.gpio <= 11) return "GPIO6-11 terhubung ke flash, tidak boleh dipakai";
  if (p.gpio == 1 || p.gpio == 3) return "GPIO1/3 dipakai Serial (TX/RX)";
  if (!ALLOW_BOOT_STRAP_PINS && (p.gpio == 0 || p.gpio == 2 || p.gpio == 15))
    return "pin boot-strapping (GPIO0/2/15); set ALLOW_BOOT_STRAP_PINS=1 hanya setelah dicek";
  if (p.i2c && p.gpio == 16) return "GPIO16 tidak mendukung I2C";
  return nullptr;
}
} // namespace

bool validatePins(char *error, size_t len) {
  bool ok = true;
  error[0] = '\0';
  const size_t n = sizeof(PINS) / sizeof(PINS[0]);
  for (size_t i = 0; i < n; i++) {
    const char *why = problem(PINS[i]);
    for (size_t j = 0; !why && j < i; j++)
      if (PINS[j].gpio == PINS[i].gpio) why = "dipakai ganda dengan pin lain";
    if (!why) continue;
    Serial.printf("[pins] %s = %d: %s\n", PINS[i].name, PINS[i].gpio, why);
    if (ok) snprintf(error, len, "PIN %s: %s", PINS[i].name + 4, why);
    ok = false;
  }
  if (ok) Serial.println("[pins] konfigurasi GPIO valid");
  return ok;
}
