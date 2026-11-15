#include "tastequest.h"

// Patterns alternate ON/OFF durations (ms), starting with ON. Kept short and quiet:
// no tone longer than 400 ms, no continuous sound.
static const uint16_t P_CONFIRM[] = {60};
static const uint16_t P_COUNTDOWN[] = {80, 920, 80, 920, 80, 920, 250};
static const uint16_t P_SUCCESS[] = {70, 60, 70};
static const uint16_t P_MISS[] = {250};
static const uint16_t P_COMPLETE[] = {80, 60, 80, 60, 200};
static const uint16_t P_FEEDBACK[] = {120, 80, 120};
static const uint16_t P_ERROR[] = {400};
static const uint16_t P_HIGHSCORE[] = {60, 40, 60, 40, 60, 40, 300};

struct Pattern {
  const uint16_t *steps;
  uint8_t len;
};
#define PAT(a) {a, sizeof(a) / sizeof(a[0])}
static const Pattern PATTERNS[] = {PAT(P_CONFIRM), PAT(P_COUNTDOWN), PAT(P_SUCCESS), PAT(P_MISS), PAT(P_COMPLETE), PAT(P_FEEDBACK), PAT(P_ERROR), PAT(P_HIGHSCORE)};
static const char *NAMES[] = {"confirm", "countdown", "success", "miss", "complete", "feedback", "error", "highscore"};

static const Pattern *current = nullptr;
static uint8_t stepIdx = 0;
static uint32_t stepEnds = 0;
static bool on = false;

static void output(bool level) {
  on = level;
#if HARDWARE_MODE
#if BUZZER_ACTIVE
  digitalWrite(PIN_BUZZER, (level != (bool)BUZZER_ACTIVE_LOW) ? HIGH : LOW);
#else
  if (level) tone(PIN_BUZZER, BUZZER_TONE_HZ);
  else noTone(PIN_BUZZER);
#endif
#endif
}

void buzzerBegin() {
#if HARDWARE_MODE
  pinMode(PIN_BUZZER, OUTPUT);
#endif
  output(false);
#if HARDWARE_MODE
  // Firmware only drives the buzzer during short patterns; constant sound now means wiring.
  Serial.printf("[buzzer] GPIO%d diam. Jika buzzer tetap berbunyi terus: kaki + jangan ke 3V3/5V; + ke GPIO%d, - ke GND.\n", PIN_BUZZER, PIN_BUZZER);
#endif
}

void buzzerPlay(Beep b) {
  current = &PATTERNS[(uint8_t)b];
  stepIdx = 0;
  stepEnds = millis() + current->steps[0];
  output(true);
#if SIMULATION_MODE
  Serial.printf("[buzzer] %s\n", NAMES[(uint8_t)b]);
#else
  (void)NAMES;
#endif
}

void buzzerLoop(uint32_t now) {
  if (!current || (int32_t)(now - stepEnds) < 0) return;
  if (++stepIdx >= current->len) {
    current = nullptr;
    output(false);
    return;
  }
  stepEnds = now + current->steps[stepIdx];
  output(stepIdx % 2 == 0);
}

bool buzzerOn() { return on; }
