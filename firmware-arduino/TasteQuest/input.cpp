#include "tastequest.h"

// Debounced press FSM: a release before TOUCH_LONG_PRESS_MS is a short press;
// holding past it fires a long press immediately (no need to let go).
// Starts as "already held": a touch must be released once before it counts, so a
// sensor that is touched, stuck or floating at power-on cannot start anything.
static bool stable = HARDWARE_MODE;
#if HARDWARE_MODE
static bool rawLast = true, longFired = true;
static uint32_t changedAt = 0, pressedAt = 0;
#endif
static bool simError = false, simReset = false;

#if SIMULATION_MODE
extern float simFixedDistance;
static Press simPending = Press::None;

static void readSerialCommands() {
  while (Serial.available()) {
    char c = Serial.read();
    switch (c) {
      case 's': simPending = Press::Short; break;
      case 'l': simPending = Press::Long; break;
      case 'e': simError = true; break;
      case 'r': simReset = true; break;
      case '+': simFixedDistance = (isnan(simFixedDistance) ? 20 : simFixedDistance) + 1; break;
      case '-': simFixedDistance = (isnan(simFixedDistance) ? 20 : simFixedDistance) - 1; break;
      case 'a': simFixedDistance = NAN; break;
      case 'h': Serial.println(F("[sim] s=tap  l=tahan  +/-=jarak  a=auto  e=error sensor  r=reset")); break;
    }
  }
}
#endif

void inputBegin() {
#if HARDWARE_MODE
  // A loose TTP223 wire leaves the pin floating (random "touches"); pull it to "not touched".
  if (PIN_TTP223_TOUCH == 16) pinMode(PIN_TTP223_TOUCH, TOUCH_ACTIVE_HIGH ? INPUT_PULLDOWN_16 : INPUT);
  else pinMode(PIN_TTP223_TOUCH, TOUCH_ACTIVE_HIGH ? INPUT : INPUT_PULLUP);
#else
  Serial.println(F("[sim] ketik 'h' untuk perintah simulasi"));
#endif
}

Press inputPoll(uint32_t now) {
#if SIMULATION_MODE
  readSerialCommands();
  Press p = simPending;
  simPending = Press::None;
  (void)now;
  return p;
#else
  bool raw = digitalRead(PIN_TTP223_TOUCH) == (TOUCH_ACTIVE_HIGH ? HIGH : LOW);
  if (raw != rawLast) {
    rawLast = raw;
    changedAt = now;
  }
  if (now - changedAt >= TOUCH_DEBOUNCE_MS && raw != stable) {
    stable = raw;
    if (stable) {
      pressedAt = now;
      longFired = false;
    } else if (!longFired) {
      return Press::Short;
    }
  }
  if (stable && !longFired && now - pressedAt >= TOUCH_LONG_PRESS_MS) {
    longFired = true;
    return Press::Long;
  }
  return Press::None;
#endif
}

bool touchHeld() { return stable; }
bool simCommandSensorError() { return simError ? (simError = false, true) : false; }
bool simCommandReset() { return simReset ? (simReset = false, true) : false; }
