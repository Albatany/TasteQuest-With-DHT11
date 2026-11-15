// Creates .env and the firmware secrets.h files (PlatformIO + Arduino IDE) with
// freshly generated local secrets. Existing files are never overwritten.
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const envPath = root + '.env'

let token
if (existsSync(envPath)) {
  console.log('.env sudah ada — tidak diubah.')
  token = /^DEVICE_TOKEN=(.*)$/m.exec(readFileSync(envPath, 'utf8'))?.[1]
} else {
  const password = randomBytes(9).toString('base64url')
  token = randomBytes(24).toString('base64url')
  const env = readFileSync(root + '.env.example', 'utf8')
    .replace(/^OPERATOR_PASSWORD=.*$/m, `OPERATOR_PASSWORD=${password}`)
    .replace(/^DEVICE_TOKEN=.*$/m, `DEVICE_TOKEN=${token}`)
  writeFileSync(envPath, env, { mode: 0o600 })
  console.log('.env dibuat dengan secret acak.')
  console.log(`Password operator: ${password}  (simpan; juga tersimpan di .env)`)
}

// Same secrets for the PlatformIO project and the Arduino IDE sketch.
const readable = 'abcdefghjkmnpqrstuvwxyz23456789' // easy to type when joining the ESP hotspot
const hotspotPassword = 'tq-' + Array.from(randomBytes(10), (b) => readable[b % readable.length]).join('')
let createdSecrets = false
for (const dir of ['firmware/include/', 'firmware-arduino/TasteQuest/']) {
  const secretsPath = root + dir + 'secrets.h'
  if (existsSync(secretsPath)) {
    console.log(`${dir}secrets.h sudah ada — tidak diubah.`)
    continue
  }
  let secrets = readFileSync(root + dir + 'secrets.example.h', 'utf8').replace('"change-me-hotspot"', `"${hotspotPassword}"`)
  if (token) secrets = secrets.replace('"change-me-device-token"', `"${token}"`)
  writeFileSync(secretsPath, secrets)
  createdSecrets = true
  console.log(`${dir}secrets.h dibuat. Isi Wi-Fi (atau pakai WIFI_USE_ESP_HOTSPOT 1) sebelum upload.`)
}
if (createdSecrets) console.log(`Password hotspot ESP8266 (jika WIFI_USE_ESP_HOTSPOT 1): ${hotspotPassword}`)
