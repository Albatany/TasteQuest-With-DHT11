import { BRAND, CREATOR } from '@tastequest/shared'
import { Panel, Sprite } from '../components/ui.tsx'

const HARDWARE = [
  ['ESP8266', 'Mikrokontroler Wi-Fi yang menjalankan game dan mengirim data ke laptop.'],
  ['HC-SR04', 'Sensor ultrasonik pengukur jarak tangan (cm) untuk ProxiRush.'],
  ['TTP223', 'Sensor sentuh tunggal: tap = ganti pilihan, tahan = konfirmasi.'],
  ['DHT11', 'Suhu dan kelembapan stan.'],
  ['OLED', 'Layar kecil untuk instruksi dan skor di perangkat.'],
  ['Buzzer', 'Bunyi singkat untuk konfirmasi, hitung mundur, dan skor.'],
]

const STACK = ['React + TypeScript + Vite', 'Tailwind CSS', 'Recharts', 'TanStack Query', 'Node.js + Express', 'Socket.IO', 'SQLite (better-sqlite3)', 'Zod', 'PlatformIO + Arduino (ESP8266)']

export function About() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center gap-4">
        <Sprite name="bowl" px={5} />
        <div>
          <h1 className="font-arcade text-xl text-gold-500 sm:text-2xl">TENTANG TASTEQUEST</h1>
          <p className="font-pixel tracking-widest text-ink-200">{BRAND.tagline}</p>
        </div>
      </div>
      <Panel title="Tujuan">
        <p className="text-ink-100">
          TasteQuest adalah proyek pameran {BRAND.orgFull} ({BRAND.org}) untuk {BRAND.event} Fakultas Sains dan Teknologi Universitas Jambi. Di acara ini stan makanan mahasiswa dan pameran proyek akademik berjalan
          bersamaan. TasteQuest memperlihatkan integrasi sistem tertanam, sensor, jaringan lokal, web, database, dan pemrosesan data real-time dalam satu pengalaman yang bisa langsung dicoba pengunjung.
        </p>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="ProxiRush">
          <p className="text-sm text-ink-200">
            Tiga ronde, masing-masing ±10 detik. Pemain menempatkan tangan sedekat mungkin dengan jarak target yang diukur HC-SR04, lalu menahan TTP223 untuk mengunci. Skor ronde = 100 − |terukur − target| × 10
            (0–100), total maksimal 300. Ronde tanpa kuncian yang valid bernilai 0. Pembacaan disaring dengan median agar stabil.
          </p>
        </Panel>
        <Panel title="TastePulse">
          <p className="text-sm text-ink-200">
            Pembeli memilih Kurang Puas, Cukup Puas, atau Sangat Puas dengan tap, lalu menahan sensor untuk mengirim. Buzzer berbunyi, OLED menampilkan terima kasih, dan dashboard langsung diperbarui. Setiap event punya ID
            unik sehingga pengiriman ulang tidak menggandakan data.
          </p>
        </Panel>
      </div>
      <Panel title="Komponen Perangkat">
        <ul className="grid gap-3 sm:grid-cols-2">
          {HARDWARE.map(([name, desc]) => (
            <li key={name}>
              <span className="font-pixel text-gold-400">{name}</span>
              <p className="text-sm text-ink-200">{desc}</p>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Arsitektur Lokal (tanpa internet)">
        <pre className="overflow-x-auto bg-ink-950 p-4 font-pixel text-sm leading-relaxed text-ink-100">
          {'ESP8266 ──Wi-Fi lokal / HTTP──▶ Node.js + Express\n                                   │\n                                 SQLite\n                                   │\n                              Socket.IO ──▶ Dashboard React'}
        </pre>
        <p className="mt-3 text-sm text-ink-200">Laptop menjadi server dan menyimpan database. ESP8266 dan laptop cukup berada di hotspot/router yang sama; tidak ada layanan cloud, API berbayar, atau AI eksternal.</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {STACK.map((s) => (
            <li key={s} className="bg-ink-800 px-2 py-1 text-xs">
              {s}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Pembuat" frame="var(--color-gold-700)">
        <p className="font-pixel text-xl text-ink-50">Developed by {CREATOR.name}</p>
        <p className="mt-1 font-semibold text-ink-100">{CREATOR.copyright}</p>
        <p className="mt-2 text-sm text-ink-300">Dipersembahkan bersama {BRAND.org} sebagai organisasi dan perwakilan acara.</p>
      </Panel>
    </div>
  )
}
