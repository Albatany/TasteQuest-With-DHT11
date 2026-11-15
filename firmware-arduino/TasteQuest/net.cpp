// Wi-Fi + HTTP to the local TasteQuest server, with a bounded RAM event queue.
// Two Wi-Fi options (secrets.h): join a phone hotspot/router, or let the ESP8266
// be the hotspot and find the laptop by itself. Never prints passwords or the token.
#include <ArduinoJson.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WiFi.h>
#include "tastequest.h"
#if WIFI_USE_ESP_HOTSPOT
extern "C" {
#include <user_interface.h> // wifi_softap_get_station_info: IPs of connected clients
}
#endif

char lastError[64] = "";

namespace {
struct Queued {
  char body[400]; // JSON without ageMs; ageMs is appended at send time
  uint32_t createdAt;
};
Queued queue[EVENT_QUEUE_SIZE];
uint8_t head = 0, count = 0;

uint32_t bootId = 0, seq = 0;
int32_t lastResetSeq = -1;
uint32_t nextHeartbeat = 0, nextTelemetry = 0, nextWifiLog = 0, blockedUntil = 0, backoffMs = 0;
uint32_t lastOkAt = 0, downSince = 0;
#if WIFI_USE_ESP_HOTSPOT
uint32_t nextDiscovery = 0;
IPAddress serverIp; // the laptop running the server, found by probing hotspot clients
#else
uint8_t lastReason = 0;
WiFiEventHandler onDisconnect;
#endif
char player[17] = "";

bool due(uint32_t now, uint32_t at) { return (int32_t)(now - at) >= 0; }

void fail(uint32_t now, const char *what, int code) {
  backoffMs = backoffMs ? min<uint32_t>(backoffMs * 2, BACKOFF_MAX_MS) : 1000;
  blockedUntil = now + backoffMs;
  snprintf(lastError, sizeof(lastError), "%s gagal (HTTP %d)", what, code);
  const char *hint = code > 0 ? "" : WIFI_USE_ESP_HOTSPOT ? " - server di laptop mati?" : " - server mati / BACKEND_URL bukan IP laptop?";
  Serial.printf("[net] %s%s Coba lagi dalam %lu ms\n", lastError, hint, (unsigned long)backoffMs);
}

String serverBase() {
#if WIFI_USE_ESP_HOTSPOT
  return "http://" + serverIp.toString() + ":" + String(BACKEND_PORT);
#else
  return BACKEND_URL;
#endif
}

int post(const char *path, const char *body, String *response) {
  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, serverBase() + path)) return -1;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " DEVICE_API_TOKEN);
  int code = http.POST((uint8_t *)body, strlen(body));
  if (response && code > 0) *response = http.getString();
  http.end();
  if (code > 0) lastOkAt = millis();
#if WIFI_USE_ESP_HOTSPOT
  else serverIp = IPAddress(); // laptop left or got a new address: search again
#endif
  return code;
}

void push(JsonDocument &doc) {
  doc["deviceId"] = DEVICE_ID;
  doc["demo"] = (bool)SIMULATION_MODE;
  if (measureJson(doc) >= sizeof(queue[0].body)) { // never queue a truncated (invalid) event
    Serial.println(F("[net] event terlalu besar, dibuang"));
    return;
  }
  if (count == EVENT_QUEUE_SIZE) { // full: drop the oldest, keep the newest
    Serial.println(F("[net] antrean penuh, event tertua dibuang"));
    head = (head + 1) % EVENT_QUEUE_SIZE;
    count--;
  }
  Queued &q = queue[(head + count) % EVENT_QUEUE_SIZE];
  serializeJson(doc, q.body, sizeof(q.body));
  q.createdAt = millis();
  count++;
}

void envelope(JsonDocument &doc, const char *type) {
  char id[64];
  newId(id, sizeof(id));
  doc["id"] = id;
  doc["type"] = type;
}

void roundJson(JsonObject o, const RoundResult &r) {
  o["round"] = r.round;
  o["targetCm"] = r.targetCm;
  if (isnan(r.measuredCm)) o["measuredCm"] = nullptr;
  else o["measuredCm"] = r.measuredCm;
}

void applyConfig(const String &json) {
  JsonDocument cfg;
  if (deserializeJson(cfg, json)) return;
  // The device validates server values too before using them.
  JsonArrayConst t = cfg["targetsCm"].as<JsonArrayConst>();
  if (t.size() == 3) {
    bool ok = true;
    for (JsonVariantConst v : t) ok &= v.as<int>() >= 5 && v.as<int>() <= 40;
    if (ok)
      for (uint8_t i = 0; i < 3; i++) CFG.targetsCm[i] = t[i].as<uint8_t>();
  }
  uint32_t d = cfg["roundDurationMs"] | CFG.roundDurationMs;
  if (d >= 3000 && d <= 30000) CFG.roundDurationMs = d;
  uint32_t c = cfg["feedbackCooldownMs"] | CFG.feedbackCooldownMs;
  if (c <= 60000) CFG.feedbackCooldownMs = c;
  CFG.activeProductId = cfg["activeProductId"].isNull() ? -1 : cfg["activeProductId"].as<int32_t>();
  int32_t reset = cfg["resetSeq"] | 0;
  if (lastResetSeq >= 0 && reset != lastResetSeq) machineStep(Input::Reset, millis());
  lastResetSeq = reset;
}

void sendEvent(uint32_t now) {
  Queued &q = queue[head];
  char body[440];
  size_t n = strlen(q.body);
  snprintf(body, sizeof(body), "%.*s,\"ageMs\":%lu}", (int)(n - 1), q.body, (unsigned long)(now - q.createdAt));
  String res;
  int code = post("/api/device/events", body, &res);
  bool retry = code <= 0 || code >= 500 || code == 401 || code == 429;
  if (retry) return fail(now, "kirim event", code);
  if (code >= 400) Serial.printf("[net] event ditolak server (HTTP %d), dibuang: %s\n", code, res.c_str());
  else {
    backoffMs = 0;
    lastError[0] = '\0';
    JsonDocument r;
    if (!deserializeJson(r, res)) {
      const char *pc = r["playerCode"] | "";
      if (pc[0]) snprintf(player, sizeof(player), "%s", pc);
      if (strstr(q.body, "\"game_completed\"")) {
        if (r["isHighScore"] | false) buzzerPlay(Beep::HighScore);
        machineStep(Input::Submitted, now);
      }
    }
  }
  head = (head + 1) % EVENT_QUEUE_SIZE;
  count--;
}

void sendHeartbeat(uint32_t now) {
  JsonDocument doc;
  doc["deviceId"] = DEVICE_ID;
  doc["demo"] = (bool)SIMULATION_MODE;
  doc["firmware"] = FIRMWARE_VERSION;
  int rssi = WiFi.RSSI(); // +31 means "no signal info"
  if (rssi < 0) doc["rssi"] = rssi;
  else doc["rssi"] = nullptr;
  doc["phase"] = phaseName(M.phase);
  doc["uptimeMs"] = now;
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["queueSize"] = count;
  JsonObject s = doc["sensors"].to<JsonObject>();
  bool hw = HARDWARE_MODE && hardwareReady;
  s["ultrasonic"] = hw || SIMULATION_MODE ? ultrasonicHealth() : "unconfigured";
  s["dht11"] = hw || SIMULATION_MODE ? dhtHealth() : "unconfigured";
  s["oled"] = hw || SIMULATION_MODE ? oledHealth() : "unconfigured";
  s["touch"] = SIMULATION_MODE ? "simulated" : hw ? "ok" : "unconfigured";
  s["buzzer"] = SIMULATION_MODE ? "simulated" : hw ? "ok" : "unconfigured";
  if (lastError[0]) doc["lastError"] = lastError;
  else if (M.error[0]) doc["lastError"] = M.error;
  String body, res;
  serializeJson(doc, body);
  int code = post("/api/device/heartbeat", body.c_str(), &res);
  if (code != 200) return fail(now, "heartbeat", code);
  backoffMs = 0;
  applyConfig(res);
}

void sendTelemetry(uint32_t now) {
  JsonDocument doc;
  doc["deviceId"] = DEVICE_ID;
  doc["demo"] = (bool)SIMULATION_MODE;
  float t = temperatureC(), h = humidityPct(), d = distanceCm();
  if (isnan(t)) doc["temperatureC"] = nullptr;
  else doc["temperatureC"] = t;
  if (isnan(h)) doc["humidityPct"] = nullptr;
  else doc["humidityPct"] = h;
  if (isnan(d)) doc["distanceCm"] = nullptr;
  else doc["distanceCm"] = d;
  doc["touch"] = touchHeld();
  doc["buzzer"] = buzzerOn();
  JsonObject g = doc["game"].to<JsonObject>();
  g["phase"] = phaseName(M.phase);
  g["round"] = M.sessionId[0] ? M.round + 1 : 0;
  if (M.sessionId[0]) g["targetCm"] = M.targets[M.round];
  else g["targetCm"] = nullptr;
  int32_t rem = remainingMs(now);
  if (rem < 0) g["remainingMs"] = nullptr;
  else g["remainingMs"] = rem;
  JsonArray rounds = g["rounds"].to<JsonArray>();
  for (uint8_t i = 0; i < M.roundCount; i++) {
    JsonObject o = rounds.add<JsonObject>();
    roundJson(o, M.rounds[i]);
    o["score"] = M.rounds[i].score;
  }
  g["totalScore"] = totalScore();
  g["menu"] = M.menu;
  g["option"] = M.option;
  if (player[0]) g["playerCode"] = player;
  else g["playerCode"] = nullptr;
  String body;
  serializeJson(doc, body);
  int code = post("/api/device/telemetry", body.c_str(), nullptr);
  if (code != 204) fail(now, "telemetry", code);
}
#if WIFI_USE_ESP_HOTSPOT
// Asks every connected laptop/phone for /api/health; the one that answers runs the server.
void discover() {
  uint8_t clients = 0;
  station_info *list = wifi_softap_get_station_info();
  for (station_info *st = list; st && !serverIp.isSet(); st = STAILQ_NEXT(st, next)) {
    IPAddress ip(st->ip.addr);
    if (!ip.isSet()) continue; // still getting an address
    clients++;
    WiFiClient client;
    HTTPClient http;
    if (!http.begin(client, "http://" + ip.toString() + ":" + String(BACKEND_PORT) + "/api/health")) continue;
    http.setTimeout(800);
    if (http.GET() == 200 && http.getString().indexOf("\"ok\":true") >= 0) serverIp = ip;
    http.end();
  }
  wifi_softap_free_station_info();
  if (serverIp.isSet()) Serial.printf("[net] server TasteQuest ditemukan: %s:%d\n", serverIp.toString().c_str(), BACKEND_PORT);
  else Serial.printf("[net] mencari server di %u perangkat yang tersambung... sudah jalankan npm start di laptop?\n", clients);
}
#else
const char *reasonText(uint8_t r) {
  switch (r) {
    case WIFI_DISCONNECT_REASON_NO_AP_FOUND: return "hotspot tidak ditemukan (cek nama; harus 2,4 GHz)";
    case WIFI_DISCONNECT_REASON_AUTH_FAIL:
    case WIFI_DISCONNECT_REASON_HANDSHAKE_TIMEOUT:
    case WIFI_DISCONNECT_REASON_4WAY_HANDSHAKE_TIMEOUT: return "password Wi-Fi salah?";
    case WIFI_DISCONNECT_REASON_BEACON_TIMEOUT: return "sinyal hilang (terlalu jauh / hotspot mati)";
    case 0: return "sedang menghubungkan";
    default: return "terputus";
  }
}
#endif
} // namespace

void newId(char *out, size_t len) { snprintf(out, len, "%s-%08lx-%lu", DEVICE_ID, (unsigned long)bootId, (unsigned long)++seq); }
bool wifiUp() {
#if WIFI_USE_ESP_HOTSPOT
  return WiFi.softAPgetStationNum() > 0;
#else
  return WiFi.status() == WL_CONNECTED;
#endif
}

const char *netStatus() {
  static char s[24];
  const char *server = lastOkAt && millis() - lastOkAt < 15000 ? "OK" : "--";
#if WIFI_USE_ESP_HOTSPOT
  snprintf(s, sizeof(s), "Hotspot:%u Server:%s", WiFi.softAPgetStationNum(), server);
#else
  snprintf(s, sizeof(s), "WiFi:%s Server:%s", wifiUp() ? "OK" : "--", server);
#endif
  return s;
}
uint8_t queuedEvents() { return count; }
const char *playerCode() { return player; }

void queueGameStarted(const char *sessionId) {
  player[0] = '\0';
  JsonDocument doc;
  envelope(doc, "game_started");
  doc["sessionId"] = sessionId;
  push(doc);
}

void queueRoundCompleted(const char *sessionId, const RoundResult &r) {
  JsonDocument doc;
  envelope(doc, "round_completed");
  doc["sessionId"] = sessionId;
  roundJson(doc.as<JsonObject>(), r);
  push(doc);
}

void queueGameCompleted(const char *sessionId, uint32_t durationMs) {
  JsonDocument doc;
  envelope(doc, "game_completed");
  doc["sessionId"] = sessionId;
  doc["durationMs"] = durationMs;
  JsonArray rounds = doc["rounds"].to<JsonArray>();
  for (uint8_t i = 0; i < M.roundCount; i++) roundJson(rounds.add<JsonObject>(), M.rounds[i]);
  push(doc);
}

void queueFeedback(uint8_t level, int32_t productId) {
  JsonDocument doc;
  envelope(doc, "feedback_submitted");
  doc["level"] = level;
  if (productId < 0) doc["productId"] = nullptr;
  else doc["productId"] = productId;
  push(doc);
}

void netBegin() {
  bootId = ESP.random(); // hardware RNG: event IDs stay unique across reboots
  WiFi.persistent(false); // do not rewrite Wi-Fi settings to flash on every boot
#if WIFI_USE_ESP_HOTSPOT
  WiFi.mode(WIFI_AP);
  if (WiFi.softAP(ESP_HOTSPOT_SSID, ESP_HOTSPOT_PASSWORD, 1, false, 8))
    Serial.printf("[net] hotspot \"%s\" aktif (ESP %s). Sambungkan LAPTOP ke hotspot ini, lalu npm start.\n", ESP_HOTSPOT_SSID, WiFi.softAPIP().toString().c_str());
  else Serial.printf("[net] GAGAL membuat hotspot \"%s\": cek nama dan password (8-63 karakter)\n", ESP_HOTSPOT_SSID);
#else
  WiFi.mode(WIFI_STA);
  WiFi.setSleepMode(WIFI_NONE_SLEEP); // modem sleep makes links to phone hotspots drop
  WiFi.setAutoReconnect(true);
  onDisconnect = WiFi.onStationModeDisconnected([](const WiFiEventStationModeDisconnected &e) { lastReason = e.reason; });
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("[net] menghubungkan ke Wi-Fi \"%s\", server %s\n", WIFI_SSID, BACKEND_URL);
#endif
}

void netLoop(uint32_t now) {
  if (!wifiUp()) {
    if (!downSince) downSince = now;
    if (due(now, nextWifiLog)) {
      nextWifiLog = now + WIFI_RETRY_MS;
#if WIFI_USE_ESP_HOTSPOT
      Serial.printf("[net] belum ada laptop di hotspot \"%s\"; game tetap jalan\n", ESP_HOTSPOT_SSID);
#else
      Serial.printf("[net] Wi-Fi belum terhubung: %s (kode %u). Game tetap jalan, event disimpan di antrean RAM\n", reasonText(lastReason), lastReason);
      // Auto-reconnect handles short drops; restarting the attempt too often aborts slow connects.
      if (now - downSince > 3 * WIFI_RETRY_MS) {
        downSince = now;
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      }
#endif
    }
    return;
  }
  downSince = 0;
#if WIFI_USE_ESP_HOTSPOT
  if (!serverIp.isSet()) {
    if (due(now, nextDiscovery)) {
      nextDiscovery = now + 3000;
      discover();
    }
    return;
  }
#endif
  if (!due(now, blockedUntil)) return;
  // One request per loop keeps touch input responsive.
  if (count) return sendEvent(now);
  if (due(now, nextHeartbeat)) {
    nextHeartbeat = now + HEARTBEAT_INTERVAL_MS;
    return sendHeartbeat(now);
  }
  bool active = M.phase != Phase::IDLE && M.phase != Phase::GAME_COMPLETE && M.phase != Phase::FEEDBACK_THANKS;
  if (due(now, nextTelemetry)) {
    nextTelemetry = now + (active ? TELEMETRY_ACTIVE_MS : TELEMETRY_IDLE_MS);
    sendTelemetry(now);
  }
}
