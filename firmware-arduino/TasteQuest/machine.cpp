// ProxiRush + TastePulse state machine. Keep in sync with packages/shared/src/game.ts.
#include "tastequest.h"

Machine M;
MachineConfig CFG = {{20, 12, 28}, GAME_ROUND_DURATION_MS, FEEDBACK_COOLDOWN_MS, -1};

static const uint32_t COUNTDOWN_MS = 3000, ROUND_RESULT_MS = 2500, GAME_RESULT_MS = 3000, SUBMIT_TIMEOUT_MS = 5000, COMPLETE_MS = 6000, THANKS_MS = 2500,
                      ERROR_MS = 5000;

uint8_t scoreRound(float measuredCm, float targetCm) {
  if (isnan(measuredCm)) return 0;
  long s = lround(100.0 - fabs((double)measuredCm - targetCm) * 10.0);
  return s < 0 ? 0 : s > 100 ? 100 : (uint8_t)s;
}

uint16_t totalScore() {
  uint16_t t = 0;
  for (uint8_t i = 0; i < M.roundCount; i++) t += M.rounds[i].score;
  return t;
}

int32_t remainingMs(uint32_t now) {
  uint32_t total = M.phase == Phase::COUNTDOWN ? COUNTDOWN_MS : M.phase == Phase::ROUND_ACTIVE ? CFG.roundDurationMs : 0;
  if (!total) return -1;
  uint32_t used = now - M.since;
  return used >= total ? 0 : (int32_t)(total - used);
}

const char *phaseName(Phase p) {
  static const char *names[] = {"IDLE", "MODE_SELECTION", "GAME_READY", "COUNTDOWN", "ROUND_ACTIVE", "ROUND_RESULT", "GAME_RESULT", "RESULT_SUBMISSION", "GAME_COMPLETE", "FEEDBACK_SELECT", "FEEDBACK_THANKS", "ERROR"};
  return names[(uint8_t)p];
}

static void go(Phase p, uint32_t now) {
  M.phase = p;
  M.since = now;
  Serial.printf("[game] -> %s\n", phaseName(p));
}

void machineBegin(uint32_t now) {
  memset(&M, 0, sizeof(M));
  M.option = -1;
  M.lastInput = now;
  go(Phase::IDLE, now);
}

void machineStep(Input in, uint32_t now, const char *message) {
  const bool pressed = in == Input::Short || in == Input::Long;
  if (pressed) M.lastInput = now;
  const uint32_t elapsed = now - M.since;
  auto past = [&](uint32_t ms) { return in == Input::Tick && elapsed >= ms; };

  if (in == Input::Reset) {
    M.sessionId[0] = '\0';
    M.roundCount = M.round = 0;
    M.option = -1;
    return go(Phase::IDLE, now);
  }
  if (in == Input::SensorError) {
    snprintf(M.error, sizeof(M.error), "%s", message ? message : "sensor");
    buzzerPlay(Beep::Error);
    return go(Phase::ERR, now);
  }

  switch (M.phase) {
    case Phase::IDLE:
      if (pressed) {
        buzzerPlay(Beep::Confirm);
        M.menu = 0;
        return go(Phase::MODE_SELECTION, now);
      }
      break;
    case Phase::MODE_SELECTION:
      if (in == Input::Short) {
        M.menu ^= 1;
        return;
      }
      if (in == Input::Long) {
        buzzerPlay(Beep::Confirm);
        M.option = -1;
        return go(M.menu == 0 ? Phase::GAME_READY : Phase::FEEDBACK_SELECT, now);
      }
      break;
    case Phase::GAME_READY:
      if (in == Input::Short) return go(Phase::MODE_SELECTION, now);
      if (in == Input::Long) {
        newId(M.sessionId, sizeof(M.sessionId));
        memcpy(M.targets, CFG.targetsCm, sizeof(M.targets)); // snapshot for this game
        M.round = M.roundCount = 0;
        M.startedAt = now;
        queueGameStarted(M.sessionId);
        buzzerPlay(Beep::Countdown);
        return go(Phase::COUNTDOWN, now);
      }
      break;
    case Phase::COUNTDOWN:
      if (past(COUNTDOWN_MS)) return go(Phase::ROUND_ACTIVE, now);
      break;
    case Phase::ROUND_ACTIVE: {
      // A lock without a valid reading is ignored; the round runs until it expires.
      float d = distanceCm();
      bool locked = in == Input::Long && !isnan(d);
      if (locked || past(CFG.roundDurationMs)) {
        RoundResult &r = M.rounds[M.roundCount++];
        r.round = M.round + 1;
        r.targetCm = M.targets[M.round];
        r.measuredCm = locked ? d : NAN;
        r.score = scoreRound(r.measuredCm, r.targetCm);
        queueRoundCompleted(M.sessionId, r);
        buzzerPlay(r.score > 0 ? Beep::Success : Beep::Miss);
        return go(Phase::ROUND_RESULT, now);
      }
      break;
    }
    case Phase::ROUND_RESULT:
      if (past(ROUND_RESULT_MS)) {
        if (M.round + 1 < 3) {
          M.round++;
          buzzerPlay(Beep::Countdown);
          return go(Phase::COUNTDOWN, now);
        }
        return go(Phase::GAME_RESULT, now);
      }
      break;
    case Phase::GAME_RESULT:
      if (past(GAME_RESULT_MS)) {
        queueGameCompleted(M.sessionId, now - M.startedAt);
        return go(Phase::RESULT_SUBMISSION, now);
      }
      break;
    case Phase::RESULT_SUBMISSION:
      // Leaves on server ack or timeout; an unsent result stays queued either way.
      if (in == Input::Submitted || past(SUBMIT_TIMEOUT_MS)) {
        buzzerPlay(Beep::Complete);
        return go(Phase::GAME_COMPLETE, now);
      }
      break;
    case Phase::GAME_COMPLETE:
      if (pressed || past(COMPLETE_MS)) {
        M.sessionId[0] = '\0';
        return go(Phase::IDLE, now);
      }
      break;
    case Phase::FEEDBACK_SELECT:
      if (in == Input::Short) {
        M.option = (M.option + 1) % 3;
        return;
      }
      if (in == Input::Long && M.option >= 0) {
        queueFeedback(M.option + 1, CFG.activeProductId);
        buzzerPlay(Beep::Feedback);
        return go(Phase::FEEDBACK_THANKS, now);
      }
      break;
    case Phase::FEEDBACK_THANKS:
      // Touches are ignored during thanks + cooldown to prevent accidental duplicates.
      if (past(THANKS_MS + CFG.feedbackCooldownMs)) {
        M.option = -1;
        M.lastInput = now;
        return go(Phase::FEEDBACK_SELECT, now);
      }
      break;
    case Phase::ERR:
      if (in == Input::Long || past(ERROR_MS)) {
        M.error[0] = '\0';
        return go(Phase::IDLE, now);
      }
      break;
  }

  bool idleTimed = M.phase == Phase::MODE_SELECTION || M.phase == Phase::GAME_READY || M.phase == Phase::FEEDBACK_SELECT;
  if (in == Input::Tick && idleTimed && now - M.lastInput >= IDLE_TIMEOUT_MS) go(Phase::IDLE, now);
}
