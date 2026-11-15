#include "tastequest.h"

#if HARDWARE_MODE
#include <DHT.h>
static DHT *dht = nullptr; // created only after pin validation
#endif

static float samples[DISTANCE_MEDIAN_SAMPLES];
static uint8_t sampleIdx = 0;
static float distance = NAN, tempC = NAN, humidity = NAN;
static uint32_t nextPing = 0, nextDht = 0;
static uint8_t dhtFailures = 0, pingFailures = 0;

#if SIMULATION_MODE
// Serial commands: '+'/'-' move the simulated hand 1 cm, 'a' returns to auto sweep.
float simFixedDistance = NAN;
#endif

// Median of the valid samples; needs a majority to count as a stable reading.
static float medianDistance() {
  float v[DISTANCE_MEDIAN_SAMPLES];
  uint8_t n = 0;
  for (float s : samples)
    if (!isnan(s)) v[n++] = s;
  if (n * 2 <= DISTANCE_MEDIAN_SAMPLES) return NAN;
  for (uint8_t i = 1; i < n; i++)
    for (uint8_t j = i; j > 0 && v[j - 1] > v[j]; j--) std::swap(v[j - 1], v[j]);
  return v[n / 2];
}

static float readUltrasonicCm(uint32_t now) {
#if HARDWARE_MODE
  digitalWrite(PIN_HCSR04_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_HCSR04_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_HCSR04_TRIG, LOW);
  unsigned long us = pulseIn(PIN_HCSR04_ECHO, HIGH, ULTRASONIC_TIMEOUT_US); // 0 = timeout
  (void)now;
  return us ? us / 58.0f : NAN;
#else
  if (!isnan(simFixedDistance)) return simFixedDistance + (random(-2, 3) / 10.0f);
  return 10.0f + 25.0f * (0.5f + 0.5f * sinf(now / 2000.0f)); // slow hand sweep 10-35 cm
#endif
}

void sensorsBegin() {
  for (float &s : samples) s = NAN;
#if HARDWARE_MODE
  pinMode(PIN_HCSR04_TRIG, OUTPUT);
  digitalWrite(PIN_HCSR04_TRIG, LOW);
  pinMode(PIN_HCSR04_ECHO, INPUT);
  dht = new DHT(PIN_DHT11_DATA, DHT11);
  dht->begin();
#endif
}

void sensorsLoop(uint32_t now) {
  if ((int32_t)(now - nextPing) >= 0) {
    nextPing = now + SENSOR_SAMPLE_INTERVAL_MS;
    float cm = readUltrasonicCm(now);
    bool valid = !isnan(cm) && cm >= DISTANCE_MIN_CM && cm <= DISTANCE_MAX_CM;
    samples[sampleIdx] = valid ? cm : NAN;
    sampleIdx = (sampleIdx + 1) % DISTANCE_MEDIAN_SAMPLES;
    pingFailures = valid ? 0 : (pingFailures < 255 ? pingFailures + 1 : 255);
    float m = medianDistance();
    distance = isnan(m) ? NAN : roundf(m * 10) / 10; // 0.1 cm resolution
  }
  if ((int32_t)(now - nextDht) >= 0) {
    nextDht = now + DHT_SAMPLE_INTERVAL_MS;
#if HARDWARE_MODE
    float t = dht->readTemperature(), h = dht->readHumidity();
#else
    float t = 29.0f + 1.5f * sinf(now / 60000.0f), h = 70.0f + 5.0f * sinf(now / 45000.0f);
#endif
    if (isnan(t) || isnan(h)) {
      if (dhtFailures < 255) dhtFailures++;
      if (dhtFailures >= 3) tempC = humidity = NAN; // stale values are never reported as live
    } else {
      dhtFailures = 0;
      tempC = roundf(t * 10) / 10;
      humidity = roundf(h);
    }
  }
}

float distanceCm() { return distance; }
float temperatureC() { return tempC; }
float humidityPct() { return humidity; }

// An empty reading can simply mean "no hand in range", so HC-SR04 is only
// flagged after a long silence; DHT11 after three failed reads.
const char *ultrasonicHealth() { return SIMULATION_MODE ? "simulated" : pingFailures >= 250 ? "error" : "ok"; }
const char *dhtHealth() { return SIMULATION_MODE ? "simulated" : dhtFailures >= 3 ? "error" : "ok"; }
