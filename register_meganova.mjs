// register_meganova.mjs — bot pendaftaran MegaNova via Google (Sign up with Google)
// Playwright (Chromium). 1 akun = 1 browser context baru, lalu context ditutup.
// Jalankan:  node register_meganova.mjs [--dry-run] [--start N] [--headed]
//
// File akun: accounts.env, 1 baris per akun, format:
//   email|password
// Contoh: rohandhikaa@gmail.com|PasswordAsliDiSini
// Bentuk .env lain yang didukung: ACCOUNT_1=email|password,
// atau ACCOUNT_1_EMAIL=email + ACCOUNT_1_PASSWORD=password.
// JANGAN commit accounts.env. File ini berisi password plaintext —
// simpan hanya di perangkat kamu sendiri, hapus setelah selesai.
//
// Proxy (rotate, 1 per akun): proxies.txt, 1 baris ip:port.
// Diambil dari proxifly/free-proxy-list (HTTP elite).
// Regenerasi: node fetch_proxies.mjs [jumlah]
// Akun ke-N memakai proxy ke-N. Kalau proxy mati di langkah goto,
// akun itu dicatat failed-proxy dan TIDAK otomatis dicoba ulang
// dengan proxy lain — ganti manual proxy-nya di proxies.txt lalu
// jalankan ulang (akun yang sukses dilewati otomatis).
//
// Stealth (stealth.mjs): per akun digenerate profil beda — User-Agent
// (Chrome 126-132, Windows/macOS/Linux), viewport, locale/timezone,
// CPU/RAM, deviceScaleFactor — plus init script yang menyembunyikan
// navigator.webdriver, launch args anti-AutomationControlled,
// ketikan per karakter (humanType) dan klik pakai gerakan mouse
// (humanClick), scroll acak, dan jeda acak antar langkah.
//
// Alur per akun:
//   1. Buka https://meganova.ai/ -> klik "Sign up" / "Sign Up" / "Get started"
//   2. Klik tombol "Continue with Google" / "Sign up with Google"
//   3. Login Google: isi email -> Next -> isi password -> Next
//      - Kalau muncul "Choose an account", klik akun yang cocok.
//      - Kalau muncul 2FA / verifikasi HP / CAPTCHA: script BERHENTI dan
//        menunggu kamu selesaikan manual di browser (headed) sampai 5 menit,
//        lalu lanjut. Jangan dipaksa lewati.
//   4. Tunggu redirect balik ke dashboard MegaNova.
//   5. Simpan hasil ke registered.txt + results.json (email + status saja,
//      TIDAK pernah menyimpan password ke file hasil).
//   6. Tutup context, jeda acak 60-180 detik, lanjut akun berikutnya.
//
// Catatan jujur:
// - Di mesin Muse ini script kemungkinan besar GAGAL di langkah Google:
//   browser lokal di sini tidak bisa buka accounts.google.com
//   (SEC_ERROR_UNKNOWN_ISSUER / tunnel gagal, sudah dites 2026-11-18).
//   Jalankan script ini di HP kamu (Termux) / laptop lain yang jaringannya bebas.
// - MegaNova bisa mendeteksi signup otomatis beruntun dari IP/device yang sama
//   dan memblokir / menonaktifkan akun. Jeda di script ini bukan jaminan lolos.
//   1 akun per sesi, jangan gas 7 akun dalam 10 menit.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  randomProfile, STEALTH_INIT_SCRIPT, STEALTH_LAUNCH_ARGS,
  fingerprintNoiseScript, webglScript, warmUp,
  humanType, humanClick, humanScroll, sleep, jitter,
} from './stealth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.env');
const PROXIES_FILE = path.join(__dirname, 'proxies.txt');
const REGISTERED_FILE = path.join(__dirname, 'registered.txt');
const RESULTS_FILE = path.join(__dirname, 'results.json');
const PROFILES_DIR = path.join(__dirname, 'profiles');

// Profil persistent per akun: 1 Gmail = 1 fingerprint tetap.
// Generate sekali, simpan di profiles/<email>.json, pakai ulang tiap
// kali akun itu dicoba lagi. Kalau fingerprint digenerate ulang acak
// tiap run, Google melihat Gmail yang sama login dari "device" yang
// beda total — itu justru mencurigakan.
// File ini juga menyimpan proxy akun itu, dan storageState (cookies)
// disimpan di profiles/<email>/storage.json setelah tiap run.
// profiles/ TIDAK BOLEH di-push ke GitHub (.gitignore) — isinya
// fingerprint + cookies sesi akun itu.
function profilePaths(email) {
  const safe = email.replace(/[^a-z0-9]/gi, '_');
  return {
    dir: path.join(PROFILES_DIR, safe),
    profileFile: path.join(PROFILES_DIR, safe, 'profile.json'),
    storageFile: path.join(PROFILES_DIR, safe, 'storage.json'),
  };
}

function loadOrCreateProfile(email, proxy) {
  const { dir, profileFile } = profilePaths(email);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(profileFile)) {
    try {
      const saved = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
      if (saved.profile && saved.profile.userAgent) {
        return { profile: saved.profile, proxy: saved.proxy || proxy, isNew: false };
      }
    } catch {}
  }
  const profile = randomProfile();
  fs.writeFileSync(profileFile, JSON.stringify({ email, proxy, profile, createdAt: ts() }, null, 2));
  return { profile, proxy, isNew: true };
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const HEADED = args.includes('--headed');
const startIdx = (() => {
  const i = args.indexOf('--start');
  return i >= 0 ? parseInt(args[i + 1] || '1', 10) - 1 : 0;
})();

const ts = () => new Date().toISOString();

function loadAccounts() {
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    console.error(`accounts.env tidak ditemukan di ${ACCOUNTS_FILE}`);
    console.error('Salin accounts.env.example jadi accounts.env, isi password aslinya.');
    process.exit(1);
  }
  const lines = fs.readFileSync(ACCOUNTS_FILE, 'utf8').split(/\r?\n/);
  const accounts = [];
  const pending = new Map(); // untuk bentuk EMAIL_n / PASSWORD_n
  const pushAccount = (email, password, where) => {
    if (!email || !password || password.includes('*') || password === 'CHANGE_ME') {
      console.warn(`${where} dilewati: format harus email|password-asli (tanpa * / CHANGE_ME): ${email || '(kosong)'}`);
      return;
    }
    accounts.push({ email, password });
  };
  for (const [n, raw] of lines.entries()) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    // Bentuk KEY=value (gaya .env)
    const eq = line.indexOf('=');
    if (eq > 0 && !line.includes('@') === false) { /* fallthrough ke bawah */ }
    if (eq > 0) {
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (value.includes('|')) { pushAccount(...value.split('|').map((s) => s.trim()), `Baris ${n + 1}`); continue; }
      const mEmail = key.match(/^(.+)_EMAIL$/i);
      const mPass = key.match(/^(.+)_PASSWORD$/i);
      if (mEmail) { pending.set(mEmail[1], { ...(pending.get(mEmail[1]) || {}), email: value }); continue; }
      if (mPass) { pending.set(mPass[1], { ...(pending.get(mPass[1]) || {}), password: value }); continue; }
      // KEY tanpa pipe dan tanpa _EMAIL/_PASSWORD: bukan akun, lewati
      continue;
    }
    // Bentuk polos: email|password
    const [email, password] = line.split('|').map((s) => (s || '').trim());
    pushAccount(email, password, `Baris ${n + 1}`);
  }
  for (const [key, v] of [...pending.entries()].sort()) {
    pushAccount(v.email, v.password, `Pasangan ${key}_EMAIL/_PASSWORD`);
  }
  return accounts;
}

function loadProxies() {
  if (!fs.existsSync(PROXIES_FILE)) {
    console.warn('proxies.txt tidak ditemukan — jalan tanpa proxy (1 IP untuk semua akun, rawan blokir).');
    return [];
  }
  return fs.readFileSync(PROXIES_FILE, 'utf8').split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && /^\d+\.\d+\.\d+\.\d+:\d+$/.test(l));
}

function loadDone() {
  if (!fs.existsSync(REGISTERED_FILE)) return new Set();
  return new Set(
    fs.readFileSync(REGISTERED_FILE, 'utf8').split(/\r?\n/).map((l) => l.split('|')[0].trim()).filter(Boolean)
  );
}

function saveResult(email, status, note = '') {
  fs.appendFileSync(REGISTERED_FILE, `${email}|${status}|${ts()}|${note}\n`);
  const results = fs.existsSync(RESULTS_FILE) ? JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')) : [];
  results.push({ email, status, note, at: ts() });
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
}

async function clickByText(page, texts, timeout = 10000) {
  for (const t of texts) {
    try {
      const el = page.getByRole('button', { name: t, exact: false }).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        await el.click();
        return t;
      }
    } catch {}
    try {
      const el = page.getByText(t, { exact: false }).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        await el.click();
        return t;
      }
    } catch {}
  }
  return null;
}

async function waitManual(page, label, maxMs = 5 * 60 * 1000) {
  console.log(`  [MANUAL] ${label} — selesaikan di browser, script menunggu max 5 menit...`);
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const url = page.url();
    if (url.includes('meganova.ai') && !url.includes('accounts.google.com')) return true;
    await sleep(5000);
  }
  return false;
}

async function registerOne(browser, account, proxy) {
  const { email, password } = account;
  // Stealth persistent: profil fingerprint akun ini diambil dari
  // profiles/<email>/profile.json kalau sudah ada, baru digenerate
  // kalau ini pertama kali. Jadi 1 Gmail = 1 device yang sama terus.
  const saved = loadOrCreateProfile(email, proxy);
  const profile = saved.profile;
  proxy = saved.proxy;
  console.log(`\n=== ${email} ===`);
  console.log(`  Profil: ${saved.isNew ? 'BARU (digenerate + disimpan)' : 'persistent (dipakai ulang)'}`);
  console.log(`  Proxy: ${proxy || '(tanpa proxy)'}`);
  console.log(`  UA: ${profile.userAgent}`);
  console.log(`  Viewport: ${profile.viewport.width}x${profile.viewport.height} | Screen: ${profile.screen.width}x${profile.screen.height} | ${profile.locale} / ${profile.timezoneId} | CPU ${profile.hardwareConcurrency} / RAM ${profile.deviceMemory}GB`);
  console.log(`  Fingerprint seed: canvas ${profile.canvasSeed} / audio ${profile.audioSeed} | fonts: ${profile.fonts.length}`);
  const { storageFile } = profilePaths(email);
  const context = await browser.newContext({
    viewport: profile.viewport,
    userAgent: profile.userAgent,
    locale: profile.locale,
    timezoneId: profile.timezoneId,
    deviceScaleFactor: profile.deviceScaleFactor,
    colorScheme: profile.colorScheme,
    ...(fs.existsSync(storageFile) ? { storageState: storageFile } : {}),
    ...(proxy ? { proxy: { server: `http://${proxy}` } } : {}),
  });
  // Sembunyikan navigator.webdriver dll, sebelum JS halaman jalan.
  await context.addInitScript(STEALTH_INIT_SCRIPT);
  await context.addInitScript(webglScript(profile));
  await context.addInitScript(({ platform, hardwareConcurrency, deviceMemory, screen }) => {
    try {
      Object.defineProperty(navigator, 'platform', { get: () => platform });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => hardwareConcurrency });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => deviceMemory });
      Object.defineProperty(window, 'screen', {
        get: () => ({ ...window.screen, width: screen.width, height: screen.height, availWidth: screen.width, availHeight: screen.height - 40 }),
      });
    } catch (e) {}
  }, profile);
  // Fingerprint beda per akun: noise canvas + audio dengan seed akun ini.
  // Seed sama di semua halaman dalam 1 sesi = fingerprint konsisten
  // selama pendaftaran akun itu (kalau berubah-ubah di tengah jalan,
  // tracker justru curiga).
  await context.addInitScript(fingerprintNoiseScript(profile.canvasSeed));
  const page = await context.newPage();
  try {
    await page.goto('https://meganova.ai/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Warm-up SINGKAT (~8-20 detik): scroll + hover, jangan langsung signup.
    await warmUp(page);

    // Sudah login? Langsung dashboard.
    if (page.url().includes('/dashboard') || page.url().includes('/console')) {
      saveResult(email, 'already_logged_in', page.url());
      console.log('  Sudah login / sudah di dashboard.');
      return;
    }

    const clickedSignup = await clickByText(page, ['Sign up', 'Sign Up', 'Get started', 'Get Started', 'Create account']);
    if (!clickedSignup) {
      // Mungkin langsung di halaman auth
      await page.goto('https://meganova.ai/signup', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    }
    await sleep(jitter(1500, 3000));

    const clickedGoogle = await clickByText(page, ['Continue with Google', 'Sign up with Google', 'Sign in with Google', 'Google']);
    if (!clickedGoogle) {
      const body = (await page.textContent('body').catch(() => '')) || '';
      saveResult(email, 'failed', 'tombol Google tidak ditemukan. Isi halaman: ' + body.slice(0, 300));
      console.log('  GAGAL: tombol Google tidak ditemukan.');
      return;
    }
    console.log(`  Klik: ${clickedGoogle}`);
    await sleep(jitter(2000, 4000));

    // --- Login Google ---
    // Pilih akun, kalau ada
    const accountBtn = page.getByText(email, { exact: false }).first();
    if (await accountBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await humanClick(page, accountBtn);
      console.log('  Pilih akun Google yang sudah tampil.');
    } else {
      const emailInput = page.locator('input[type="email"]').first();
      await emailInput.waitFor({ timeout: 20000 });
      // Ketik seperti manusia, bukan fill() instan (jejak bot).
      await humanType(emailInput, email);
      await clickByText(page, ['Next', 'Berikutnya']);
      await sleep(jitter(1500, 3000));

      const passInput = page.locator('input[type="password"]').first();
      await passInput.waitFor({ timeout: 20000 });
      await humanType(passInput, password);
      await clickByText(page, ['Next', 'Berikutnya']);
      await sleep(jitter(2000, 4000));
    }

    // 2FA / verifikasi / CAPTCHA -> tunggu manual
    let body = (await page.textContent('body').catch(() => '')) || '';
    if (/2-Step|verification|Verify|CAPTCHA|confirm it's you|phone/i.test(body) && page.url().includes('google.com')) {
      const ok = await waitManual(page, 'Verifikasi Google (2FA / HP / CAPTCHA)');
      if (!ok) {
        saveResult(email, 'failed', 'verifikasi Google tidak selesai dalam 5 menit');
        console.log('  GAGAL: verifikasi tidak selesai.');
        return;
      }
    }

    // Tunggu redirect balik ke MegaNova
    try {
      await page.waitForURL(/meganova\.ai/, { timeout: 120000 });
    } catch {
      body = (await page.textContent('body').catch(() => '')) || '';
      saveResult(email, 'failed', 'tidak kembali ke meganova.ai. URL: ' + page.url() + ' | ' + body.slice(0, 300));
      console.log('  GAGAL: tidak kembali ke MegaNova. URL sekarang: ' + page.url());
      return;
    }
    await sleep(jitter(2000, 4000));
    body = (await page.textContent('body').catch(() => '')) || '';
    console.log('  Berhasil kembali ke MegaNova. URL: ' + page.url());
    console.log('  Cuplikan halaman: ' + body.slice(0, 300).replace(/\s+/g, ' '));
    saveResult(email, 'success', page.url());
  } catch (e) {
    saveResult(email, 'failed', String(e.message || e).slice(0, 500));
    console.log('  GAGAL: ' + String(e.message || e).slice(0, 500));
  } finally {
    // Simpan cookies/sesi akun ini, biar run berikutnya login Google
    // tidak mulai dari nol lagi (sesi yang sudah dipercaya lebih aman).
    try {
      await context.storageState({ path: profilePaths(email).storageFile });
    } catch {}
    await context.close();
  }
}

async function main() {
  const accounts = loadAccounts();
  const proxies = loadProxies();
  console.log(`Akun di accounts.env: ${accounts.length}`);
  console.log(`Proxy di proxies.txt: ${proxies.length}`);
  if (DRY_RUN) {
    accounts.forEach((a, i) => {
      const proxy = proxies[i % proxies.length] || null;
      const saved = loadOrCreateProfile(a.email, proxy);
      const p = saved.profile;
      console.log(`  OK format: ${a.email} | password: **** (${a.password.length} karakter) | proxy: ${saved.proxy || '(tanpa proxy)'} | profil: ${saved.isNew ? 'BARU' : 'persistent'}`);
      console.log(`    profil: ${p.userAgent} | ${p.viewport.width}x${p.viewport.height} | ${p.locale}/${p.timezoneId}`);
      console.log(`    fingerprint: canvas seed ${p.canvasSeed} / audio seed ${p.audioSeed} | CPU ${p.hardwareConcurrency} / RAM ${p.deviceMemory}GB | fonts ${p.fonts.length}`);
    });
    console.log('Dry-run selesai. Tidak ada browser yang dibuka, tidak ada pendaftaran.');
    console.log('Profil persistent tersimpan di profiles/ — dry-run kedua akan menampilkan seed yang SAMA.');
    return;
  }
  if (accounts.length === 0) {
    console.error('Tidak ada akun valid. Isi accounts.env dengan format email|password-asli.');
    process.exit(1);
  }
  const done = loadDone();
  const queue = accounts.slice(startIdx).filter((a) => !done.has(a.email));
  console.log(`Antrean (lewati yang sudah di registered.txt): ${queue.length}`);
  if (proxies.length > 0 && queue.length > proxies.length) {
    console.warn(`PERINGATAN: akun (${queue.length}) lebih banyak dari proxy (${proxies.length}) — proxy akan dipakai ulang setelah habis. Tambah proxy dulu dengan: node fetch_proxies.mjs 20`);
  }

  const browser = await chromium.launch({ headless: !HEADED, args: STEALTH_LAUNCH_ARGS });
  try {
    for (let i = 0; i < queue.length; i++) {
      const proxy = proxies.length ? proxies[i % proxies.length] : null;
      await registerOne(browser, queue[i], proxy);
      if (i < queue.length - 1) {
        const waitMs = jitter(60_000, 180_000);
        console.log(`Jeda ${(waitMs / 1000).toFixed(0)} detik sebelum akun berikutnya...`);
        await sleep(waitMs);
      }
    }
  } finally {
    await browser.close();
  }
  console.log('\nSelesai. Hasil di registered.txt dan results.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
