# MegaNova Account Creator

Bot buat daftarin akun MegaNova pakai **Sign up with Google**, satu-satu, pelan-pelan, biar nggak kelihatan kayak bot.

Dibikin pakai **Playwright + Chromium (JavaScript / Node.js)**. Jadi bukan sekadar script asal klik — tiap akun itu diperlakuin kayak orang beneran yang lagi daftar: profil beda, IP beda, ketiknya pelan, scroll dulu, baru signup.

> ⚠️ **Baca dulu sebelum jalanin:** ini bot otomasi pendaftaran. MegaNova sama Google bisa aja ngeblokir / minta verifikasi / nonaktifin akun kalau ketahuan pola bot. Script ini cuma ngurangin jejak yang paling gampang dikenali, bukan jaminan lolos 100%. Jangan gas 7 akun sekaligus dalam 1 jam.

---

## Kenapa dibikin?

Gue punya beberapa akun Gmail, dan pengen tiap Gmail itu punya akun MegaNova sendiri — soalnya kuota gratis MegaNova itu per akun, bukan per orang. Daftar manual satu-satu itu capek, apalagi kalau harus isi form Google berkali-kali. Makanya dibikin bot ini: tinggal isi daftar akun di satu file, jalanin sekali, dia yang ngerjain sisanya.

Tapi daftar manual itu juga ada alasannya: Google itu ketat banget soal login dari device baru. Jadi bot ini dibikin se-manusia mungkin, bukan asal `fill()` terus `click()` doang.

---

## Yang bisa dilakuin script ini

- **Daftar MegaNova via Google** — buka meganova.ai → klik Sign up → klik Continue with Google → login Google (email → Next → password → Next) → balik ke dashboard MegaNova.
- **1 akun = 1 browser context baru** — cookies, storage, sesi, semuanya fresh per akun. Abis 1 akun selesai, context ditutup, baru lanjut akun berikutnya.
- **Proxy rotasi, 1 proxy per akun** — akun ke-1 pakai proxy ke-1, akun ke-2 pakai proxy ke-2, dst. Jadi MegaNova nggak ngeliat 7 akun dari 1 IP yang sama.
- **Fingerprint beda per akun** — User-Agent, viewport, locale/timezone, CPU/RAM, canvas seed, audio seed, fonts, semuanya digenerate beda per akun. Detailnya ada di bawah.
- **Profil persistent** — 1 Gmail = 1 fingerprint tetap. Pertama kali digenerate, terus disimpan. Kalau akun itu gagal dan dicoba lagi besok, fingerprint yang dipakai tetap sama, bukan digenerate ulang.
- **Warm-up singkat** — sebelum signup, script scroll homepage dulu, gerak mouse, jeda sebentar (~8–20 detik). Nggak langsung gas klik Sign up dalam 2 detik.
- **Ketik & klik kayak manusia** — ngetiknya per karakter dengan jeda acak, kadang jeda lebih lama di tengah kata. Kliknya pakai gerakan mouse, hover dulu, baru klik.
- **Jeda acak antar akun** — 60–180 detik, biar nggak kelihatan kayak loop robot.
- **Resume otomatis** — akun yang udah sukses dicatat di `registered.txt`, kalau script dijalankan ulang, akun itu dilewati. Jadi kalau berhenti di tengah jalan, tinggal jalanin lagi dari akun berikutnya.
- **2FA / CAPTCHA? Berhenti dan nunggu lu** — kalau muncul verifikasi Google, script nunggu max 5 menit biar lu selesaikan manual di browser (pakai `--headed`), bukan dipaksa lewati.

---

## File-file di repo ini

| File | Buat apa |
| --- | --- |
| `register_meganova.mjs` | Script utamanya. Ini yang lu jalanin. |
| `stealth.mjs` | Modul stealth: generate profil fingerprint, human typing, human click, scroll, warm-up. |
| `accounts.env` | **Nggak ada di repo ini.** Ini file lu sendiri, isinya daftar akun. Lihat `accounts.env.example`. |
| `accounts.env.example` | Contoh format `accounts.env`. Salin jadi `accounts.env`, isi password aslinya. |
| `proxies.txt` | Daftar proxy, 1 baris `ip:port`. 1 proxy per akun, urutan = urutan akun. |
| `fetch_proxies.mjs` | Buat ambil proxy elite segar dari Proxifly, terus tulis ulang `proxies.txt`. |
| `profiles/` | **Nggak ada di repo ini.** Folder ini dibuat otomatis pas script jalan, isinya profil persistent + cookies tiap akun. Jangan di-push. |
| `registered.txt` / `results.json` | Hasil jalanin script (dibuat otomatis). Isinya email + status doang, nggak ada password. |
| `package.json` | Dependensi: `playwright` doang. |

---

## Cara pakai

### 1. Install dulu

```bash
cd meganova-account-creator
npm install
npx playwright install chromium
```

### 2. Isi `accounts.env`

Salin contohnya dulu:

```bash
cp accounts.env.example accounts.env
```

Terus edit `accounts.env`, ganti `CHANGE_ME` dengan password Gmail aslinya. Formatnya gini, 1 akun per baris:

```
email|password
```

Contoh:

```
rohandhikaa@gmail.com|PasswordAsliDiSini
rohandhika27@gmail.com|PasswordAsliDiSiniJuga
```

Atau kalau lu lebih suka gaya `.env` beneran, ini juga didukung:

```
ACCOUNT_1=rohandhikaa@gmail.com|PasswordAsliDiSini
ACCOUNT_1_EMAIL=rohandhikaa@gmail.com
ACCOUNT_1_PASSWORD=PasswordAsliDiSini
```

> ⚠️ **Penting banget:**
> - Password yang di-mask (`****`) itu **nggak bisa dipakai login**. Harus password lengkapnya.
> - `accounts.env` itu **password plaintext**. Jangan dikirim ke siapa pun, jangan di-commit, jangan di-push. File ini udah masuk `.gitignore`, tapi tetap — hapus setelah selesai, atau simpen di tempat aman.
> - Jangan isi akun yang password-nya lu lupa. Kalau Google minta ganti password di tengah jalan, script bakal berhenti.

### 3. Cek dulu tanpa buka browser (dry-run)

```bash
node register_meganova.mjs --dry-run
```

Ini cuma ngecek format `accounts.env` bener apa nggak, proxy tiap akun apa, dan profil fingerprint tiap akun kayak gimana. Nggak ada browser yang dibuka, nggak ada pendaftaran.

Contoh output-nya:

```
Akun di accounts.env: 2
Proxy di proxies.txt: 10
  OK format: rohandhikaa@gmail.com | password: **** (13 karakter) | proxy: 45.131.6.46:80 | profil: BARU
    profil: Mozilla/5.0 (X11; Linux x86_64) ... Chrome/130.0.0.0 ... | 1366x768 | en-GB/Europe/London
    fingerprint: canvas seed 716566 / audio seed 976901 | CPU 12 / RAM 4GB | fonts 9
```

Kalau di situ ada yang `dilewati`, berarti format baris itu salah — biasanya masih `CHANGE_ME` atau masih ada `*`.

### 4. Jalanin

```bash
# Headless (tanpa jendela browser):
node register_meganova.mjs

# Headed (buka jendela browser, biar lu bisa liat + selesaikan 2FA manual):
node register_meganova.mjs --headed

# Lanjut dari akun ke-3 (kalau berhenti di tengah):
node register_meganova.mjs --start 3
```

Tiap akun itu alurnya gini:

1. Buka `meganova.ai`, warm-up singkat (scroll + jeda ~8–20 detik)
2. Klik Sign up → klik Continue with Google
3. Login Google: isi email (diketik pelan) → Next → isi password (diketik pelan) → Next
4. Kalau muncul "Choose an account", klik akunnya
5. Kalau muncul 2FA / verifikasi HP / CAPTCHA, script nunggu lu max 5 menit
6. Tunggu redirect balik ke dashboard MegaNova
7. Catat `success` / `failed` ke `registered.txt` + `results.json`
8. Tutup browser context, simpan cookies-nya, jeda acak 60–180 detik, lanjut akun berikutnya

---

## Proxy — rotasi 1 per akun

Kenapa perlu proxy? Soalnya kalau 7 akun daftar dari 1 IP yang sama dalam waktu singkat, itu pola bot banget. Makanya tiap akun dikasih IP beda.

- Akun ke-N pakai proxy ke-N dari `proxies.txt`
- Proxy di sini diambil dari [proxifly/free-proxy-list](https://github.com/proxifly/free-proxy-list), yang HTTP elite doang
- Isi awal `proxies.txt`: 10 proxy elite

Kalau mau proxy yang lebih segar:

```bash
# Ambil 20 proxy elite terbaru:
node fetch_proxies.mjs 20

# Terus cek rotasinya:
node register_meganova.mjs --dry-run
```

> Jujur soal proxy gratis: banyak yang mati, lambat, atau IP-nya udah di-flag. Tes dari mesin gue kemarin, 40 proxy elite ke Google semuanya gagal. Proxy rotasi itu ngurangin jejak "1 IP = 7 akun", tapi bukan jaminan lolos. Kalau 1–2 akun gagal berturut-turut, berhenti dulu, ganti batch proxy, istirahatin sehari. Kalau mau serius, pakai proxy residensial / mobile (berbayar) — itu peningkatan paling besar, tapi ya bayar.

---

## Stealth — gimana caranya biar nggak kelihatan bot

Ini bagian yang paling banyak ditanyain, jadi gue jelasin detail.

### Yang udah ada di script

1. **User-Agent beda per akun** — Chrome 126–132, acak Windows / macOS / Linux. Dan `navigator.platform`-nya disamain sama UA-nya, jangan sampai UA Windows tapi platform-nya Mac.
2. **Viewport beda per akun** — 1920×1080, 1366×768, 1440×900, 1536×864, dst. Plus `deviceScaleFactor` 1 / 2.
3. **Screen konsisten sama viewport** — `window.screen` disamain sama viewport + tinggi chrome UI, biar nggak ada viewport 1920×1080 tapi screen-nya 800×600.
4. **Locale + timezone beda per akun** — en-US/New York, en-US/Los Angeles, en-GB/London, id-ID/Jakarta, dst.
5. **Hardware beda per akun** — CPU 4/8/12/16, RAM 4/8/16 GB.
6. **Fingerprint beda per akun** — tiap akun punya seed unik:
   - **Canvas:** `getImageData` ditambah noise ±1 piksel per seed, jadi hash canvas tiap akun beda.
   - **Audio:** `getChannelData` ditambah noise ±0.0001 per seed, jadi hash audio tiap akun beda.
   - **Fonts:** subset font acak 6–10 dari font umum, biar enumerasi font tiap akun nggak identik.
   - **WebGL:** vendor/renderer-nya ngikutin OS — macOS = Apple GPU, Windows = Intel / NVIDIA, Linux = Mesa Intel. Bukan "Intel Iris" generik buat semua akun.
7. **`navigator.webdriver` disembunyiin** — plus `chrome.runtime`, plugins, dan WebGL generik biar nggak bocor "HeadlessChrome".
8. **Launch args anti-otomasi** — `--disable-blink-features=AutomationControlled`, `--disable-infobars`, dll.
9. **Ketik kayak manusia** — per karakter, jeda acak, kadang jeda lebih lama di tengah kata. Bukan `fill()` instan.
10. **Klik pakai gerakan mouse** — mouse bergerak bertahap ke tombol, hover sebentar, baru klik.
11. **Scroll acak + jeda acak** antar langkah.
12. **Profil persistent** — 1 Gmail = 1 fingerprint tetap (lihat di bawah).
13. **Warm-up singkat** — scroll + hover ~8–20 detik sebelum signup.

### Profil persistent — kenapa ini penting?

Bayangin lu daftar akun A hari ini, fingerprint-nya Linux Chrome 130, 1366×768, London. Besok akun A gagal, lu coba lagi, tapi fingerprint-nya tiba-tiba jadi Windows Chrome 127, 1920×1080, Jakarta. Google bakal mikir: "ini Gmail yang sama, kok device-nya beda total dalam semalam?"

Makanya profil itu **disimpan**, bukan digenerate ulang tiap run:

- Pertama kali: digenerate acak, disimpan di `profiles/<email>/profile.json`
- Run berikutnya: profil yang sama dipakai ulang
- Cookies/sesi juga disimpan di `profiles/<email>/storage.json`, jadi login berikutnya nggak mulai dari nol

Seed-nya juga sama di semua halaman dalam 1 sesi akun itu — fingerprint harus konsisten selama 1 pendaftaran, kalau berubah-ubah di tengah jalan tracker justru curiga.

### Yang belum ada (dan kenapa)

- **Proxy residensial** — paling ngaruh, tapi berbayar. Kalau mau, tinggal ganti isi `proxies.txt` dengan proxy residensial lu.
- **Camoufox / antidetect browser** — fingerprint-nya di-inject dari browser-nya langsung, bukan ditambal lewat JavaScript. Lebih stealth, tapi berat di RAM, susah di Termux, dan di mesin gue malah lebih mentok jaringannya. Buat v1 ini, Playwright udah cukup. Kalau nanti Google terus ngeblokir karena deteksi fingerprint, baru pikirin migrasi ke Camoufox sebagai v2.
- **Headed, bukan headless** — headless Chromium itu lebih gampang dikenali. Kalau di perangkat yang ada layar, jalanin `--headed`.
- **Sebar waktu** — 7 akun dalam 1 jam dari 1 perangkat itu pola, walaupun jeda 60–180 detik. Paling aman: 1 akun/hari, jam beda-beda.

> Intinya: nggak ada stealth yang 100% lolos. Google sama MegaNova ngeliat kombinasi IP + fingerprint + perilaku + riwayat. Script ini cuma ngurangin jejak yang paling gampang dikenali.

---

## Hasilnya di mana?

Setelah jalanin, cek 2 file ini:

- **`registered.txt`** — 1 baris per akun yang udah dicoba:
  ```
  rohandhikaa@gmail.com|success|2026-11-18T02:30:00.000Z|https://meganova.ai/dashboard
  rohandhika27@gmail.com|failed|2026-11-18T02:35:00.000Z|verifikasi Google tidak selesai dalam 5 menit
  ```
- **`results.json`** — sama, tapi format JSON, lebih gampang dibaca script lain.

Isinya cuma email + status + catatan, **nggak ada password**.

Terus, setelah akun berhasil dibuat, **API key-nya nggak diambil otomatis**. Buka dashboard MegaNova akun itu, masuk ke bagian API Keys, klik Create New Key, simpan sendiri. Script ini cuma sampai pendaftaran + login berhasil.

---

## Kalau gagal, gimana?

| Gejala | Kemungkinan penyebab | Yang dilakuin |
| --- | --- | --- |
| Tombol Google nggak ketemu | Halaman MegaNova berubah / belum ke-load | Cek screenshot / isi halaman di log, update selector di script |
| `SEC_ERROR_UNKNOWN_ISSUER` / tunnel gagal | Jaringan mesin itu nge-intercept TLS (kayak di mesin Muse gue) | Jalanin di HP / laptop lain yang jaringannya bebas, jangan di mesin itu |
| Camoufox / browser nggak bisa start pakai proxy | `other_tcp` di Muse masih Deny | Ubah di Settings → Permissions → Direct network protocols → Ask, atau jalanin tanpa proxy dulu buat tes |
| Verifikasi Google / 2FA / CAPTCHA | Google curiga login dari device baru | Selesaikan manual di browser headed, max 5 menit. Kalau nggak selesai, akun itu dicatat failed, lanjut akun berikutnya |
| 2 akun gagal berturut-turut | IP / device udah di-flag | **Berhenti.** Ganti batch proxy (`node fetch_proxies.mjs 20`), istirahatin sehari, baru coba lagi |
| Akun udah ada di `registered.txt` tapi mau coba lagi | Script nge-skip akun yang udah dicatat | Hapus baris akun itu dari `registered.txt`, atau hapus `profiles/<email>/` kalau mau fingerprint baru |

---

## Peringatan — baca dulu, serius

1. **Password di `accounts.env` itu plaintext.** Jangan kirim file itu ke siapa pun, jangan commit, jangan push. Hapus setelah selesai.
2. **Jangan jalanin script ini di mesin yang jaringannya diblokir** (kayak mesin Muse gue). Browser lokal di sana nggak bisa buka `accounts.google.com` — udah dites, gagal terus. Jalanin di HP (Termux) / laptop lain.
3. **Jangan gas 7 akun sekaligus.** Ini maraton, bukan sprint. Kalau mau aman, 1 akun/hari.
4. **Akun bisa aja di-disable MegaNova / Google** kalau ketahuan pola bot. Itu risiko yang lu ambil sendiri pas pakai bot ini. Gue nggak bisa jamin akunnya aman selamanya.
5. **API key MegaNova itu sensitif.** Sama kayak password — jangan di-share sembarangan, jangan di-commit ke repo publik.

---

## FAQ

**Q: `.mjs` itu bahasa apa?**
A: JavaScript, Jun. `.mjs` itu singkatan dari ECMAScript Module — JavaScript modern yang pakai `import` / `export`, jalan di Node.js. Bukan bahasa baru, cuma ekstensi biar Node tahu file itu pakai sistem module ES.

**Q: Kenapa daftarnya via Google, bukan via email?**
A: Soalnya MegaNova itu ada tombol "Continue with Google", dan lu udah punya akun Gmail-nya. Jadi bot ini login Google dulu, terus MegaNova-nya tinggal nerima OAuth-nya. Lebih cepat daripada isi form email + verifikasi email manual.

**Q: Kenapa nggak pakai Camoufox aja?**
A: Camoufox memang lebih stealth secara teori, tapi script-nya harus ditulis ulang ke Python, berat di RAM, susah di Termux, dan di mesin gue malah lebih mentok jaringannya. Buat v1 ini, Playwright udah cukup. Kalau nanti mentok di deteksi fingerprint, baru pikirin v2 pakai Camoufox.

**Q: Proxy-nya harus dari Proxifly?**
A: Nggak harus. `proxies.txt` itu cuma daftar `ip:port`, lu bisa isi dari mana aja — proxy residensial, proxy berbayar, atau proxy lu sendiri. Yang penting 1 proxy per akun, jangan dipakai ulang.

**Q: Profil di `profiles/` itu aman di-push?**
A: **Nggak.** Isinya fingerprint + cookies sesi akun lu. Udah masuk `.gitignore`, jangan di-push, jangan di-share.

**Q: Bisa nggak script ini dipakai buat provider lain, bukan cuma MegaNova?**
A: Prinsipnya bisa — ganti URL + tombol Google-nya doang. Tapi tiap provider itu beda halaman signup-nya, jadi selector-nya harus disesuaikan lagi. Jangan asal ganti URL terus berharap jalan.

---

## Lisensi

Buat pemakaian pribadi aja. Jangan dipakai buat spam, jual akun massal, atau hal-hal yang jelas-jelas ngelanggar ToS provider-nya. Kalau akun lu kena blokir, itu tanggung jawab lu sendiri.

Dibikin santai, buat kebutuhan sendiri, bukan buat dijual. ✌️
