import Database from 'better-sqlite3'
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export type DB = Database.Database

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url))

/** Opens the SQLite file and applies pending migrations (tracked in PRAGMA user_version). */
export function openDb(file: string): DB {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  const current = db.pragma('user_version', { simple: true }) as number
  files.slice(current).forEach((f, i) => {
    db.transaction(() => {
      db.exec(readFileSync(MIGRATIONS_DIR + f, 'utf8'))
      db.pragma(`user_version = ${current + i + 1}`)
    })()
  })
  return db
}
