import { existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import { CREATOR } from '@tastequest/shared'
import { createApp } from './app.ts'
import { loadConfig, ROOT } from './config.ts'
import { openDb } from './db.ts'

let config
try {
  config = loadConfig()
} catch (err) {
  console.error(String((err as Error).message))
  process.exit(1)
}

const db = openDb(config.dbPath)
const { app, httpServer, close } = createApp({ db, config })
const webRoot = join(ROOT, 'apps/web')
const dev = process.argv.includes('--dev')

if (dev) {
  // One origin in dev too: Vite runs as middleware on the same server as the API and Socket.IO.
  const { createServer } = await import('vite')
  const vite = await createServer({ root: webRoot, configFile: join(webRoot, 'vite.config.ts'), server: { middlewareMode: true, hmr: { server: httpServer } }, appType: 'spa' })
  app.use(vite.middlewares)
} else {
  const dist = join(webRoot, 'dist')
  if (!existsSync(join(dist, 'index.html'))) console.warn('⚠ Frontend belum dibangun. Jalankan `npm run build` lalu `npm start`.')
  app.use(express.static(dist, { index: false, maxAge: '7d', immutable: true }))
  app.use((req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next()
    res.set({
      'Cache-Control': 'no-cache',
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    })
    res.sendFile(join(dist, 'index.html'), (err) => err && next())
  })
}

httpServer.on('error', (err: NodeJS.ErrnoException) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${config.PORT} sudah dipakai. Ubah PORT di .env.` : err)
  process.exit(1)
})

httpServer.listen(config.PORT, config.HOST, () => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `  http://${i!.address}:${config.PORT}`)
  console.log(`\nTasteQuest${dev ? ' (dev)' : ''} — ${CREATOR.copyright}`)
  console.log(`Mode tampilan awal: ${config.APP_MODE} | Database: ${config.dbPath}`)
  console.log(`Lokal:  http://localhost:${config.PORT}`)
  if (lan.length && (config.HOST === '0.0.0.0' || config.HOST === '::')) console.log(`LAN (perangkat lain / ESP8266):\n${lan.join('\n')}`)
  console.log(`Kiosk:  http://localhost:${config.PORT}/kiosk\n`)
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await close()
    db.close()
    process.exit(0)
  })
}
