// Native tests for firmware logic (no board needed): npm run test:firmware
#include <cstring>
#include "tastequest.h"

SerialStub Serial;
static int pinLevel = LOW, lastMode = -1, lastModePin = -1;
int digitalRead(uint8_t) { return pinLevel; }
void pinMode(uint8_t pin, uint8_t mode) { lastModePin = pin, lastMode = mode; }

static int failures = 0;
static void check(bool ok, const char *what) {
  printf("%s %s\n", ok ? "PASS" : "FAIL", what);
  if (!ok) failures++;
}

// Runs the touch FSM in 10 ms steps; level(t) gives the TTP223 output at time t.
static void run(uint32_t from, uint32_t to, int (*level)(uint32_t), int &shorts, int &longs) {
  for (uint32_t t = from; t <= to; t += 10) {
    pinLevel = level(t);
    Press p = inputPoll(t);
    shorts += p == Press::Short;
    longs += p == Press::Long;
  }
}

int main() {
  char err[64];
  check(validatePins(err, sizeof err), "pin config in config.h is valid");

  inputBegin();
  check(lastModePin == PIN_TTP223_TOUCH, "touch pin is configured");
  check(PIN_TTP223_TOUCH != 16 || lastMode == INPUT_PULLDOWN_16, "GPIO16 touch uses the internal pull-down (no floating input)");

  int s = 0, l = 0;
  run(0, 5000, [](uint32_t) { return HIGH; }, s, l);
  check(s == 0 && l == 0, "touch stuck HIGH from power-on is ignored");
  run(5010, 6000, [](uint32_t) { return LOW; }, s, l);
  check(s == 0 && l == 0, "releasing a stuck touch fires nothing");

  s = l = 0;
  run(6010, 8000, [](uint32_t t) { return (t >= 7000 && t < 7200) ? HIGH : LOW; }, s, l);
  check(s == 1 && l == 0, "200 ms tap = one short press");

  s = l = 0;
  run(8010, 11000, [](uint32_t t) { return (t >= 9000 && t < 10500) ? HIGH : LOW; }, s, l);
  check(s == 0 && l == 1, "1.5 s hold = one long press, no short on release");

  s = l = 0;
  run(11010, 12000, [](uint32_t t) { return (t >= 11500 && t < 11530) ? HIGH : LOW; }, s, l);
  check(s == 0 && l == 0, "30 ms bounce is ignored");

  printf(failures ? "\n%d test(s) FAILED\n" : "\nall firmware tests passed\n", failures);
  return failures ? 1 : 0;
}
