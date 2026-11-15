// OLED screens (same texts as the web simulator's oledLines()).
// Assumes a 128x64 SSD1306 or SH1106 over I2C — confirm your module first.
#include "tastequest.h"

#if HARDWARE_MODE
#include <U8g2lib.h>
#include <Wire.h>
static U8G2 *oled = nullptr; // constructed only after pin validation
static bool oledPresent = false;
#endif

static const char *LEVELS[] = {"Kurang Puas", "Cukup Puas", "Sangat Puas"};
static uint32_t nextFrame = 0;
static char lines[6][24];
static uint8_t lineCount = 0;

static void line(const char *fmt, ...) {
  if (lineCount >= 6) return;
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(lines[lineCount++], sizeof(lines[0]), fmt, ap);
  va_end(ap);
}

static void compose(uint32_t now) {
  lineCount = 0;
  int32_t rem = remainingMs(now);
  int secs = rem < 0 ? 0 : (rem + 999) / 1000;
  float d = distanceCm();
  char dist[12];
  if (isnan(d)) snprintf(dist, sizeof(dist), "--");
  else snprintf(dist, sizeof(dist), "%.1f", d);
  const RoundResult *last = M.roundCount ? &M.rounds[M.roundCount - 1] : nullptr;

  switch (M.phase) {
    case Phase::IDLE:
      line("TASTEQUEST");
      line("HMIF UNJA");
      line("");
      line("Sentuh utk mulai");
      line("%s", netStatus());
      break;
    case Phase::MODE_SELECTION:
      line("PILIH MODE");
      line("%c ProxiRush", M.menu == 0 ? '>' : ' ');
      line("%c TastePulse", M.menu == 1 ? '>' : ' ');
      line("");
      line("Tap=ganti Tahan=OK");
      break;
    case Phase::GAME_READY:
      line("PROXIRUSH");
      line("Posisikan tangan");
      line("sesuai jarak target");
      line("");
      line("Tahan = MULAI");
      break;
    case Phase::COUNTDOWN:
      line("RONDE %u/3", M.round + 1);
      line("Target: %u cm", M.targets[M.round]);
      line("");
      line("Mulai dlm %d...", secs);
      break;
    case Phase::ROUND_ACTIVE:
      line("R%u  TARGET %ucm", M.round + 1, M.targets[M.round]);
      line("Jarak: %s cm", dist);
      line("Sisa: %d dtk", secs);
      line("");
      line("Tahan = KUNCI");
      break;
    case Phase::ROUND_RESULT:
      line("RONDE %u", last ? last->round : 0);
      if (last && !isnan(last->measuredCm)) line("Terukur %.1fcm", last->measuredCm);
      else line("Tidak terkunci");
      line("Skor: %u", last ? last->score : 0);
      line("Total: %u", totalScore());
      break;
    case Phase::GAME_RESULT:
      line("HASIL AKHIR");
      line("%u / 300", totalScore());
      line("%u + %u + %u", M.rounds[0].score, M.rounds[1].score, M.rounds[2].score);
      break;
    case Phase::RESULT_SUBMISSION:
      line("MENGIRIM SKOR...");
      line("%u / 300", totalScore());
      break;
    case Phase::GAME_COMPLETE:
      line("SELESAI!");
      line("%s", playerCode()[0] ? playerCode() : "PLAYER ?");
      line("Skor: %u", totalScore());
      line(queuedEvents() ? "Antre (offline)" : "Tersimpan");
      break;
    case Phase::FEEDBACK_SELECT:
      line("NILAI MAKANAN");
      for (int i = 0; i < 3; i++) line("%c %s", M.option == i ? '>' : ' ', LEVELS[i]);
      line(M.option < 0 ? "Tap utk memilih" : "Tahan = KIRIM");
      break;
    case Phase::FEEDBACK_THANKS:
      line("TERIMA KASIH!");
      line("Penilaian Anda");
      line("sudah tercatat.");
      break;
    case Phase::ERR:
      line("! ERROR SENSOR");
      line("%s", M.error);
      line("");
      line("Tahan = kembali");
      break;
  }
}

void displayBegin() {
#if HARDWARE_MODE
#if OLED_CONTROLLER_SH1106
  oled = new U8G2_SH1106_128X64_NONAME_F_HW_I2C(U8G2_R0, U8X8_PIN_NONE, PIN_OLED_SCL, PIN_OLED_SDA);
#else
  oled = new U8G2_SSD1306_128X64_NONAME_F_HW_I2C(U8G2_R0, U8X8_PIN_NONE, PIN_OLED_SCL, PIN_OLED_SDA);
#endif
  oled->setI2CAddress(OLED_I2C_ADDRESS << 1); // U8g2 expects the 8-bit address
  oled->begin();
  Wire.beginTransmission(OLED_I2C_ADDRESS);
  oledPresent = Wire.endTransmission() == 0;
  Serial.printf("[oled] %s di 0x%02X\n", oledPresent ? "terdeteksi" : "TIDAK terdeteksi", OLED_I2C_ADDRESS);
  oled->setFont(u8g2_font_6x10_tf);
#endif
}

void displayLoop(uint32_t now) {
  if ((int32_t)(now - nextFrame) < 0) return;
  nextFrame = now + 150;
  compose(now);
#if HARDWARE_MODE
  if (!oledPresent) return;
  oled->clearBuffer();
  for (uint8_t i = 0; i < lineCount; i++) oled->drawStr(0, 10 + i * 11, lines[i]);
  oled->sendBuffer();
#else
  // Simulation: mirror the screen to Serial only when it changes.
  static uint32_t lastHash = 0;
  uint32_t h = 5381;
  for (uint8_t i = 0; i < lineCount; i++)
    for (const char *c = lines[i]; *c; c++) h = h * 33 + *c;
  if (h == lastHash) return;
  lastHash = h;
  Serial.print(F("[oled] "));
  for (uint8_t i = 0; i < lineCount; i++) {
    Serial.print(lines[i]);
    Serial.print(i + 1 < lineCount ? " | " : "\n");
  }
#endif
}

const char *oledHealth() {
#if HARDWARE_MODE
  return oledPresent ? "ok" : "error";
#else
  return "simulated";
#endif
}
