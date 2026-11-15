# Analisis Brand — HMIF UNJA → TasteQuest

Sumber yang diperiksa pada 15 November 2026: `https://hmifunja.my.id` (redirect 308 ke `https://www.hmifunja.my.id/`).
Metode: mengunduh HTML dan stylesheet produksi (`/assets/index-DTD7Qmg6.css`), lalu menghitung nilai warna, kelas utilitas, dan `font-family` yang dipakai. Tidak ada warna yang ditebak.

## Warna terverifikasi

Situs memakai Tailwind dengan palet kustom bernama `ink`, `gold`, `teal`, dan `paper`. Nilainya diambil langsung dari aturan CSS (mis. `.bg-ink-950{background-color:rgb(20 13 8/…)}`).

| Token situs | Nilai | Bukti di CSS | Peran di situs |
|---|---|---|---|
| `ink-950` | `#140D08` | `.bg-ink-950`, juga `<meta name="theme-color" content="#140D08">` | latar paling gelap / theme color |
| `ink-900` | `#22150D` | `.bg-ink-900`, `body{color:rgb(34 21 13)}` | panel gelap, teks body (mode terang) |
| `ink-800` | `#342116` | `.text-ink-800` | |
| `ink-700` | `#4A2F20` | `.text-ink-700` | |
| `ink-600` | `#64402B` | `.text-ink-600` | |
| `ink-500` | `#8B5E3C` | `.text-ink-500` | |
| `ink-400` | `#A97752` | `.text-ink-400` | |
| `ink-300` | `#C69A74` | `.text-ink-300`, `.border-ink-300` | |
| `ink-200` | `#E2C6A8` | `.text-ink-200`, `.border-ink-200` | |
| `ink-100` | `#F3E7D7` | `.bg-ink-100` | |
| `ink-50` | `#FAF7F2` | `.bg-ink-50` | |
| `gold-400` | `#DCC4A8` | `.text-gold-400` (paling sering dipakai: 13×) | aksen krem |
| `gold-500` | `#D4A657` | `.bg-gold-500`, `.text-gold-500` | aksen emas utama |
| `gold-600` | `#B4863C` | `.text-gold-600` | |
| `gold-700` | `#8C6830` | `.text-gold-700` | |
| `paper` | `#EEF1F5` | `.bg-paper`, `body{background-color:rgb(238 241 245)}` | latar halaman mode terang |
| (hex lepas) | `#2FBFA3` | muncul sekali di CSS | aksen hijau-teal |

Catatan: kelas `teal-*` di situs ternyata berisi warna cokelat-krem (mis. `teal-500 = #8B7F6C`), bukan teal. TasteQuest tidak memakainya.

## Tipografi terverifikasi

Dari tag `<link>` Google Fonts di HTML dan `font-family` di CSS:

- **Plus Jakarta Sans** (400–800): font body (`body{font-family:Plus Jakarta Sans,sans-serif}`)
- **Space Grotesk** (400–700): judul/aksen
- **JetBrains Mono** (400–600): teks monospace

## Kepribadian dan pola visual

- Judul OG: "Logo HMIF Universitas Jambi dengan tagline *Merangkai Ide, Membangun Solusi* di latar cokelat gelap". Nuansanya hangat, cokelat tua dan emas, serius tapi ramah.
- Bayangan halus berwarna (`--tw-shadow-color:#140d0840`), sudut tidak terlalu bulat, ring tipis 1px.
- Logo resmi tersedia di `https://www.hmifunja.my.id/logo-hmif.png` (576×369 PNG).

## Keputusan desain untuk TasteQuest

1. **Latar gelap `ink-950`, panel `ink-900`, garis `ink-700/800`.** Langsung dari palet HMIF dan cocok untuk layar pameran.
2. **Aksen utama `gold-500`** untuk tombol utama, skor, dan judul arcade. **`gold-400`** untuk judul panel. Kontras `gold-500` di atas `ink-950` sekitar 8,7:1.
3. **Teks `ink-50` / `ink-100` / `ink-200`** di atas latar gelap. Teks sekunder `ink-300` (≈7,6:1). `ink-500` ke bawah hanya untuk dekorasi.
4. **Body font Plus Jakarta Sans**, sama dengan HMIF, agar tabel dan angka tetap mudah dibaca.
5. **Font pixel untuk identitas game.** *Pixelify Sans* untuk judul panel/label dan *Press Start 2P* untuk angka skor dan wordmark. Keduanya dipilih dari evaluasi prompt dan rekomendasi UI/UX Pro Max ("Pixel Art", Press Start 2P). Space Grotesk tidak dipakai agar hanya ada tiga keluarga font.
6. **Semua font di-host lokal** lewat paket `@fontsource/*` sehingga tidak ada request ke Google Fonts saat acara.

## Adaptasi (bukan warna resmi HMIF)

Ditandai jelas di `apps/web/src/theme.css`:

| Token | Nilai | Alasan |
|---|---|---|
| `ok` | `#2FBFA3` | status online/sukses dan "Sangat Puas". Nilai ini ada di CSS HMIF tetapi perannya di sana tidak terverifikasi |
| `warn` | `#E8B04B` | peringatan dan "Cukup Puas" |
| `bad` | `#E5654F` | offline/error dan "Kurang Puas" |

Warna status selalu didampingi teks/ikon (wajah pixel), tidak hanya warna.

## Logo

Izin pemakaian logo HMIF tidak dapat diverifikasi dari situs, jadi logo **tidak** disertakan. Komponen `HmifMark` memuat `apps/web/public/brand/hmif-logo.png` bila file itu ada. Bila tidak ada, ditampilkan lencana teks "HMIF". Untuk memakai logo resmi, letakkan file PNG di lokasi tersebut (dengan izin HMIF) tanpa perlu mengubah kode.

Wordmark TasteQuest (mangkuk pixel + tulisan Press Start 2P) dan semua sprite pixel adalah karya orisinal proyek ini.

## Yang tidak dapat diverifikasi

- Peran semantik `#2FBFA3` di situs HMIF.
- Pedoman brand resmi (brand book) HMIF. Yang diperiksa hanya situs web.
- Izin penggunaan logo.

## Mengganti token

Semua warna dan font didefinisikan **hanya** di blok `@theme` dalam `apps/web/src/theme.css`. Ubah nilai di sana, jalankan `npm run build`, dan seluruh dashboard ikut berubah tanpa refactor.
