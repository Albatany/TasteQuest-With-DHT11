# Panduan Presentasi (±3 menit)

**Persiapan (sebelum pengunjung datang)**
- `npm start` di laptop. Buka `/kiosk` di monitor besar (tombol layar penuh di kanan atas) dan dashboard di laptop.
- Kontrol Operator: login, pilih produk yang sedang dijual, pastikan mode **LIVE** jika ESP8266 asli siap (atau **DEMO** bila memakai simulator), lalu *Hapus data DEMO* setelah latihan.
- Cek header: "Perangkat online" dan "Server terhubung".

| Waktu | Yang dilakukan | Yang diucapkan |
|---|---|---|
| 0:00–0:20 | Tunjuk kiosk | "Ini **TasteQuest** dari HMIF UNJA: *Play, Taste, Rate*. Satu alat untuk game dan penilaian makanan stan kami." |
| 0:20–0:45 | Tunjuk ESP8266 + sensor | "Otaknya ESP8266. Sensor ultrasonik HC-SR04 mengukur jarak tangan, satu sensor sentuh TTP223 dipakai untuk semua input: tap untuk memilih, tahan untuk konfirmasi." |
| 0:45–1:40 | Pengunjung main **ProxiRush** | "Pilih ProxiRush, tahan untuk mulai. Targetnya 20 cm, gerakkan tangan, lalu tahan sensor untuk mengunci. Skornya 100 dikurangi 10 per sentimeter selisih, tiga ronde, maksimal 300." |
| 1:40–2:00 | Tunjuk leaderboard di kiosk | "Begitu selesai, skor langsung masuk papan peringkat tanpa refresh, karena dikirim lewat WebSocket." |
| 2:00–2:25 | Pembeli makanan pakai **TastePulse** | "Untuk yang sudah jajan: pilih TastePulse, tap untuk memilih Kurang/Cukup/Sangat Puas, tahan untuk kirim. Buzzer berbunyi dan layar mengucapkan terima kasih." |
| 2:25–2:45 | Tunjuk halaman Feedback | "Grafik kepuasan per produk ikut diperbarui. 'Positif' artinya persentase Sangat Puas dari yang menilai, bukan klaim seluruh pembeli." |
| 2:45–3:00 | Tunjuk laptop | "Semua lokal: ESP8266 kirim data lewat Wi-Fi ke server Node.js di laptop ini, disimpan di SQLite, tanpa internet dan tanpa cloud. Proyek ini dikembangkan oleh **Muhammad Aziz Syah Dani** untuk HMIF UNJA." |

**Jika ditanya**
- *Bagaimana kalau Wi-Fi putus?* Game tetap jalan di ESP8266. Hasil masuk antrean RAM dan dikirim ulang saat tersambung; ID event mencegah data ganda. (Antrean hilang jika perangkat mati.)
- *Datanya asli?* Mode LIVE hanya menampilkan data ESP8266. Data simulator selalu ditandai DEMO dan terpisah.
- *Kenapa skor bisa 0?* Ronde yang tidak dikunci sampai waktu habis bernilai 0.

**Masalah cepat**
- Kiosk "DEVICE OFFLINE": cek Wi-Fi ESP8266, `BACKEND_URL`, dan firewall laptop (lihat LOCAL_SETUP.md). Sementara itu, ganti ke DEMO dan jalankan simulator di halaman Arena.
- Tampilan macet: refresh browser. Data aman di SQLite.
