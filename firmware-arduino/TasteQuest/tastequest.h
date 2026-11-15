#pragma once
// Module interfaces. Each .cpp in src/ implements one section.
#include <Arduino.h>
#include "config.h"

// ---- pins.cpp: GPIO validation (runs before any sensor init) ----------------
bool validatePins(char *error, size_t len); // prints every problem to Serial

// ---- sensors.cpp: HC-SR04 (median filtered) + DHT11 -------------------------
void sensorsBegin();
void sensorsLoop(uint32_t now);
float distanceCm();   // NAN when there is no valid, stable reading
float temperatureC(); // NAN when unknown
float humidityPct();  // NAN when unknown
const char *ultrasonicHealth();
const char *dhtHealth();

// ---- input.cpp: single TTP223 -> short / long press -------------------------
enum class Press : uint8_t { None, Short, Long };
void inputBegin();
Press inputPoll(uint32_t now);
bool touchHeld();
bool simCommandSensorError(); // simulation: 'e' typed on Serial
bool simCommandReset();       // simulation: 'r' typed on Serial

// ---- buzzer.cpp: short non-blocking patterns --------------------------------
enum class Beep : uint8_t { Confirm, Countdown, Success, Miss, Complete, Feedback, Error, HighScore };
void buzzerBegin();
void buzzerPlay(Beep b);
void buzzerLoop(uint32_t now);
bool buzzerOn();

// ---- display.cpp: OLED screens (Serial mirror in simulation) ----------------
void displayBegin();
void displayLoop(uint32_t now);
const char *oledHealth();

// ---- machine.cpp: ProxiRush + TastePulse state machine ----------------------
// Mirrors packages/shared/src/game.ts (the web simulator runs that version).
enum class Phase : uint8_t {
  IDLE, MODE_SELECTION, GAME_READY, COUNTDOWN, ROUND_ACTIVE, ROUND_RESULT,
  GAME_RESULT, RESULT_SUBMISSION, GAME_COMPLETE, FEEDBACK_SELECT, FEEDBACK_THANKS, ERR
};
enum class Input : uint8_t { Short, Long, Tick, Submitted, SensorError, Reset };

struct RoundResult {
  uint8_t round;
  float targetCm;
  float measuredCm; // NAN = not locked
  uint8_t score;
};
struct MachineConfig {
  uint8_t targetsCm[3];
  uint32_t roundDurationMs;
  uint32_t feedbackCooldownMs;
  int32_t activeProductId; // -1 = general stall rating
};
struct Machine {
  Phase phase;
  uint32_t since, lastInput, startedAt;
  uint8_t menu;  // 0 ProxiRush, 1 TastePulse
  int8_t option; // -1 nothing selected, 0..2
  uint8_t round, roundCount;
  RoundResult rounds[3];
  uint8_t targets[3];
  char sessionId[64];
  char error[48];
};
extern Machine M;
extern MachineConfig CFG;

void machineBegin(uint32_t now);
void machineStep(Input in, uint32_t now, const char *message = nullptr);
uint8_t scoreRound(float measuredCm, float targetCm);
int32_t remainingMs(uint32_t now); // -1 for untimed phases
uint16_t totalScore();
const char *phaseName(Phase p);

// ---- net.cpp: Wi-Fi, HTTP, bounded offline event queue ----------------------
void netBegin();
void netLoop(uint32_t now);
bool wifiUp();
const char *netStatus(); // short "WiFi:OK Server:OK" line for the OLED
uint8_t queuedEvents();
const char *playerCode();
void newId(char *out, size_t len);
void queueGameStarted(const char *sessionId);
void queueRoundCompleted(const char *sessionId, const RoundResult &r);
void queueGameCompleted(const char *sessionId, uint32_t durationMs);
void queueFeedback(uint8_t level, int32_t productId);
extern char lastError[64];
extern bool hardwareReady; // false in hardware mode until pins validate
