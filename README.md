# Kilas — Shorts Offline Pribadi

Aplikasi pemutar video pendek vertikal (*Shorts*) berbasis web & Android (Capacitor + PWA) yang bekerja secara offline menggunakan folder penyimpanan video pribadi langsung dari perangkat.

## Fitur Utama

- **Sumber Folder Pribadi**: Memindai berkas video lokal (`.mp4`, `.webm`, `.mov`, `.m4v`, `.ogg`, `.mkv`) langsung dari folder perangkat menggunakan *File System Access API*, pemilih direktori, maupun *drag-and-drop*.
- **Pemutar Shorts & Scroll Vertikal Halus**: Navigasi vertikal *scroll-snap*, pemutaran otomatis, ketuk dua kali untuk *like*, bilah *progress* geser, dan pintasan papan ketik (`↑`/`↓`, `J`/`K`, `M`).
- **Profil & Foto Kustom**: Ubah foto profil dari perangkat, nama tampilan, `@handle`, dan bio.
- **Studio Video & Efek**: Tambah video atau ubah efek secara langsung (preset warna, kecerahan, kontras, saturasi, vignette, overlay film/VHS/bokeh/glitch/butiran film, teks overlay, serta kecepatan putar).
- **Penyimpanan Offline Persisten**: Seluruh profil, *like*, simpanan, komentar, balasan, dan konfigurasi efek tersimpan di *IndexedDB* peramban.
- **Siap Android APK & GitHub Pages**: Dilengkapi alur kerja GitHub Actions otomatis untuk membangun file `.apk` dan menayangkan aplikasi langsung di GitHub Pages.

## Struktur Folder GitHub

```text
kilas-shorts-offline/
├── .github/
│   └── workflows/
│       ├── build-apk.yml     # Build otomatis file Android .apk via Capacitor & Gradle
│       └── deploy-pages.yml  # Deploy otomatis ke GitHub Pages
├── public/                   # Ikon PWA & aplikasi (SVG + PNG 180/192/512)
├── private-videos/           # Folder video pribadi lokal (diabaikan oleh .gitignore)
├── src/
│   ├── components/           # Komponen UI pemutar, komentar, efek, profil, pustaka, & PWA
│   ├── hooks/                # Hook instalasi PWA
│   ├── services/             # Integrasi IndexedDB & pemindai folder lokal
│   ├── types/                # Definisi tipe TypeScript
│   ├── utils/                # Helper filter CSS, format waktu, & avatar
│   ├── App.tsx               # Komponen utama & alur navigasi
│   ├── index.css             # Konfigurasi Tailwind CSS & animasi
│   └── main.tsx              # Entry point React
├── capacitor.config.ts       # Konfigurasi Android Capacitor (com.kilas.offlineshorts)
├── .env.example              # Contoh variabel lingkungan (tanpa rahasia)
├── .gitignore                # Daftar file/folder yang tidak diunggah ke GitHub
├── index.html                # Dokumen HTML utama & meta PWA
├── metadata.json             # Metadata aplikasi
├── package.json              # Daftar dependensi & skrip build
├── tsconfig.json             # Konfigurasi TypeScript
└── vite.config.ts            # Konfigurasi Vite + VitePWA
```

## Cara Mendapatkan File `.apk` Android di GitHub

Lingkungan web tidak menjalankan kompilator Java/Gradle secara langsung, sehingga repositori ini sudah dilengkapi workflow **`.github/workflows/build-apk.yml`** yang membangun APK secara otomatis di server GitHub:

1. Unggah (*push*) seluruh proyek ini ke repositori GitHub milikmu (branch `main` atau `master`).
2. Buka tab **Actions** di repositori GitHub tersebut.
3. Pilih workflow **Build Android APK** (berjalan otomatis setiap kali ada *push*, atau klik **Run workflow**).
4. Setelah selesai, buka bagian **Artifacts** di bagian bawah halaman run, lalu unduh **`Kilas-Shorts-Offline-APK`** yang berisi file `app-debug.apk`.
5. Pasang `app-debug.apk` di HP Android milikmu.

## Cara Menjalankan Langsung di GitHub (GitHub Pages)

1. Di repositori GitHub, buka **Settings → Pages**.
2. Pada bagian **Build and deployment → Source**, pilih **GitHub Actions**.
3. Workflow **Deploy to GitHub Pages** (`.github/workflows/deploy-pages.yml`) akan membangun aplikasi dan menerbitkannya di `https://<username>.github.io/<nama-repo>/`.
4. Kamu juga bisa menekan tombol **Pasang Aplikasi** di dalam aplikasi (atau *Add to Home Screen* di Android/iOS) untuk memasangnya sebagai aplikasi mandiri (*PWA*) offline.

## Menjalankan Secara Lokal

```bash
npm install
npm run dev
```

Untuk build proyek Capacitor Android secara lokal (jika sudah terpasang Android Studio & JDK 21):

```bash
npm run cap:android
cd android && ./gradlew assembleDebug
```
