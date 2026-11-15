// Minimal Arduino stand-in so firmware logic can be tested on a laptop (g++).
#pragma once
#include <cmath>
#include <cstdarg>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#define HIGH 1
#define LOW 0
#define INPUT 0x00
#define OUTPUT 0x01
#define INPUT_PULLUP 0x02
#define INPUT_PULLDOWN_16 0x04
#define F(s) (s)
int digitalRead(uint8_t pin);
void pinMode(uint8_t pin, uint8_t mode);
struct SerialStub {
  int available() { return 0; }
  int read() { return -1; }
  void print(const char *s) { fputs(s, stdout); }
  void println(const char *s) { puts(s); }
  void printf(const char *f, ...) { va_list a; va_start(a, f); vprintf(f, a); va_end(a); }
};
extern SerialStub Serial;
