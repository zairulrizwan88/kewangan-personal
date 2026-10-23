# Kewangan Peribadi — aplikasi web

Aplikasi statik untuk bil bulanan, tabung, hutang, login email/kata laluan dan backup/restore JSON. GitHub Pages hanya menghoskan fail aplikasi; rekod kewangan disimpan dalam Supabase.

## Penting
- Projek ini **belum dideploy** dan belum disambungkan kepada akaun Supabase/GitHub pengguna.
- Jangan letakkan Supabase `service_role` key di dalam `app-config.js`. Gunakan anon/publishable key sahaja.
- Perlindungan data bergantung pada RLS dalam `supabase/schema.sql` dan tetapan projek Supabase.
- Gunakan HTTPS. GitHub Pages menyediakan HTTPS.
- Backup JSON mengandungi maklumat kewangan peribadi. Simpan di tempat selamat.
- Restore **menambah** rekod dan tidak memadam rekod sedia ada. Elakkan import fail sama dua kali.

## 1. Sediakan Supabase
1. Buat projek baharu di https://supabase.com.
2. Buka **SQL Editor**, tampal semua kandungan `supabase/schema.sql`, dan jalankan.
3. Dalam **Authentication → URL Configuration**, masukkan URL GitHub Pages selepas deployment dalam Site URL dan Redirect URLs.
4. Dalam **Authentication → Providers → Email**, aktifkan Email provider. Untuk akaun peribadi, disyorkan kekalkan pengesahan email.
5. Dari **Project Settings → API** (atau Connect), salin Project URL dan anon/publishable key.

## 2. Konfigurasi aplikasi
Buka `app-config.js`, ganti:
- `PASTE_SUPABASE_PROJECT_URL_HERE`
- `PASTE_SUPABASE_ANON_OR_PUBLISHABLE_KEY_HERE`

Gunakan key public/anon sahaja. Jangan gunakan `service_role` atau secret key.

## 3. Deploy GitHub Pages
1. Buat repository GitHub baharu. Jika mahu public repo untuk GitHub Pages percuma, fahami bahawa kod aplikasi dan public anon key boleh dilihat orang; data tetap perlu dilindungi oleh Supabase Auth + RLS.
2. Muat naik semua fail dan folder projek ke root repository (bukan ZIP sahaja).
3. GitHub → **Settings → Pages** → Deploy from a branch → pilih `main` dan `/ (root)` → Save.
4. Tunggu URL Pages muncul, contohnya `https://username.github.io/repository-name/`.
5. Masukkan URL tersebut di Supabase Authentication URL Configuration. Jika projek berada di subpath, gunakan URL penuh yang berakhir dengan `/repository-name/`.
6. Buka URL di telefon, daftar akaun, sahkan email jika diminta, kemudian log masuk.

## 4. Gunakan
- Bil bulanan: pilih bulan, kategori, tambah/edit, tanda sudah bayar.
- Tabung: sasaran, tarikh sasaran, simpanan, pengeluaran, sejarah.
- Hutang: pilih sama ada “Saya perlu bayar” atau “Orang berhutang dengan saya”; rekod transaksi dan baki.
- Backup data: muat turun fail JSON.
- Restore data: pilih fail backup. Restore menambah data dan memetakan semula ID parent bagi tabung/hutang.

## Batasan versi awal
- Aplikasi ini tidak menjalankan pembayaran bank atau debit automatik.
- Tiada fungsi berulang automatik untuk menjana bil bulan baharu; bil direkodkan mengikut bulan.
- Edit jumlah simpanan/hutang secara manual hanya mengubah jumlah semasa; gunakan butang transaksi untuk sejarah yang paling tepat.
- Semak data selepas restore dan buat backup berkala.
