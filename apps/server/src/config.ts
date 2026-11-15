import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

const envSchema = z.object({
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DB_PATH: z.string().default('data/tastequest.db'),
  OPERATOR_PASSWORD: z.string().min(8, 'OPERATOR_PASSWORD wajib diisi (min. 8 karakter). Jalankan `npm run setup`.'),
  DEVICE_TOKEN: z.string().min(16, 'DEVICE_TOKEN wajib diisi (min. 16 karakter). Jalankan `npm run setup`.'),
  APP_MODE: z.enum(['DEMO', 'LIVE']).default('DEMO'),
  DEVICE_OFFLINE_MS: z.coerce.number().int().min(3000).default(15_000),
  TELEMETRY_PERSIST_MS: z.coerce.number().int().min(1000).default(60_000),
  SESSION_TTL_HOURS: z.coerce.number().min(1).max(72).default(12),
})

export type Config = Omit<z.infer<typeof envSchema>, 'DB_PATH'> & { dbPath: string }

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  try {
    process.loadEnvFile(join(ROOT, '.env'))
  } catch {
    // .env is optional when variables come from the shell
  }
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    throw new Error(`Konfigurasi .env tidak valid:\n${parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n')}`)
  }
  const { DB_PATH, ...rest } = parsed.data
  return { ...rest, dbPath: DB_PATH === ':memory:' || isAbsolute(DB_PATH) ? DB_PATH : join(ROOT, DB_PATH) }
}
