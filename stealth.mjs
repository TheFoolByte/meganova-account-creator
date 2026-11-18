// stealth.mjs — profil fingerprint acak per akun + humanisasi dasar.
// Bukan anti-deteksi sempurna. Google / MegaNova tetap bisa mendeteksi
// otomasi dari pola perilaku, IP proxy gratis, dan headless Chromium.
// Modul ini hanya mengurangi jejak yang paling gampang dikenali:
// UA statis, viewport statis, locale/timezone statis, navigator.webdriver,
// ketikan instan, dan klik tanpa hover / jeda.

const CHROME_VERSIONS = [126, 127, 128, 129, 130, 131, 132];
const OS_PROFILES = [
  { os: 'Windows NT 10.0; Win64; x64', platform: 'Win32', vendor: 'Google Inc.' },
  { os: 'Macintosh; Intel Mac OS X 10_15_7', platform: 'MacIntel', vendor: 'Google Inc.' },
  { os: 'X11; Linux x86_64', platform: 'Linux x86_64', vendor: 'Google Inc.' },
];
const VIEWPORTS = [
  { width: 1920, height: 1080 }, { width: 1366, height: 768 },
  { width: 1440, height: 900 }, { width: 1536, height: 864 },
  { width: 1280, height: 800 }, { width: 1600, height: 900 },
  { width: 1512, height: 982 }, { width: 1280, height: 720 },
];
const LOCALE_TZ = [
  { locale: 'en-US', timezone: 'America/New_York' },
  { locale: 'en-US', timezone: 'America/Los_Angeles' },
  { locale: 'en-US', timezone: 'America/Chicago' },
  { locale: 'en-GB', timezone: 'Europe/London' },
  { locale: 'en-US', timezone: 'Asia/Singapore' },
  { locale: 'id-ID', timezone: 'Asia/Jakarta' },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
export const jitter = (min, max) => min + Math.random() * (max - min);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Profil lengkap 1 akun: UA + viewport + locale + timezone + deviceScaleFactor
// + hardware + canvas/audio seed. Setiap panggilan = fingerprint beda.
// UA dan OS harus konsisten: UA Windows jangan dipasangkan dengan platform MacIntel.
// Viewport dan screen juga harus konsisten: screen = viewport + chrome UI (~100px).
export function randomProfile() {
  const os = pick(OS_PROFILES);
  const ver = pick(CHROME_VERSIONS);
  const vp = pick(VIEWPORTS);
  const lt = pick(LOCALE_TZ);
  const userAgent = `Mozilla/5.0 (${os.os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36`;
  // WebGL renderer harus cocok sama OS — jangan kasih "Apple GPU" ke Windows,
  // atau "Intel Iris" ke macOS. Ini detail yang gampang dicek tracker.
  const webgl = os.platform === 'MacIntel'
    ? { vendor: 'Apple Inc.', renderer: 'Apple M1' }
    : os.platform === 'Win32'
      ? pick([{ vendor: 'Intel Inc.', renderer: 'Intel(R) UHD Graphics 620' }, { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650)' }])
      : { vendor: 'Intel Inc.', renderer: 'Mesa Intel(R) UHD Graphics 620' };
  return {
    userAgent,
    platform: os.platform,
    webgl,
    viewport: vp,
    // Screen yang konsisten dengan viewport (browser window, bukan fullscreen)
    screen: { width: vp.width, height: vp.height + pick([80, 88, 100, 120]) },
    locale: lt.locale,
    timezoneId: lt.timezone,
    deviceScaleFactor: Math.random() < 0.3 ? 2 : 1,
    colorScheme: 'light',
    // Hardware yang masuk akal untuk laptop/desktop 2024-2026
    hardwareConcurrency: pick([4, 8, 8, 12, 16]),
    deviceMemory: pick([4, 8, 8, 16]),
    // Seed unik per akun untuk canvas + audio fingerprint.
    // Seed yang sama = hash canvas/audio yang sama di semua halaman
    // dalam 1 sesi akun itu; seed beda = fingerprint beda.
    canvasSeed: randInt(1, 999999),
    audioSeed: randInt(1, 999999),
    // Font yang "terinstall" — subset acak dari font umum, biar
    // enumerasi font tiap akun tidak identik.
    fonts: shuffle(['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'Palatino', 'Tahoma', 'Trebuchet MS', 'Segoe UI', 'Calibri', 'Consolas']).slice(0, randInt(6, 10)),
  };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Noise canvas + audio per seed. Dipasang lewat addInitScript di registerOne.
// Cara kerja: getImageData / toDataURL / getChannelData ditambah noise
// super kecil (±1 nilai piksel / sampel) — tidak terlihat mata, tapi
// hash canvas/audio yang dibaca tracker jadi beda per akun.
// Peringatan: noise ini juga bisa membuat reCAPTCHA curiga kalau
// terlalu besar — di sini sengaja dibuat sangat kecil (±1).
export function fingerprintNoiseScript(seed) {
  return `
(() => {
  const SEED = ${seed};
  const rnd = () => {
    const x = Math.sin(SEED * 999 + (rnd.n = (rnd.n || 0) + 1) * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  try {
    // Canvas 2D: tambah noise ±1 ke piksel saat dibaca
    const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (x, y, w, h) {
      const img = origGetImageData.call(this, x, y, w, h);
      for (let i = 0; i < img.data.length; i += 97) {
        img.data[i] = Math.max(0, Math.min(255, img.data[i] + (rnd() < 0.5 ? -1 : 1)));
      }
      return img;
    };
    // AudioContext: tambah noise ±0.0001 ke sampel saat dibaca
    const origGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function (ch) {
      const data = origGetChannelData.call(this, ch);
      for (let i = 0; i < data.length; i += 113) {
        data[i] += (rnd() - 0.5) * 0.0002;
      }
      return data;
    };
  } catch (e) {}
})();
`;
}

// Script yang dijalankan di setiap halaman baru, sebelum JS halaman jalan.
// Menyembunyikan jejak otomasi yang paling umum:
// navigator.webdriver, chrome.runtime, plugins kosong, dsb.
export const STEALTH_INIT_SCRIPT = `
(() => {
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5].map(() => ({ name: 'Chrome PDF Plugin' })),
    });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    if (window.chrome) {
      window.chrome.runtime = window.chrome.runtime || {};
    }
    // WebGL di-override di tempat lain (webglScript) supaya vendor/renderer
    // cocok sama OS di profil akun itu, bukan generik untuk semua akun.
  } catch (e) {}
})();
`;

// WebGL vendor/renderer per profil — harus cocok sama OS.
// Dipasang terpisah dari STEALTH_INIT_SCRIPT supaya nilainya dari profil.
export function webglScript(profile) {
  const vendor = (profile.webgl && profile.webgl.vendor) || 'Intel Inc.';
  const renderer = (profile.webgl && profile.webgl.renderer) || 'Intel(R) UHD Graphics 620';
  return `
(() => {
  try {
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (p) {
      if (p === 37445) return ${JSON.stringify(vendor)};
      if (p === 37446) return ${JSON.stringify(renderer)};
      return getParameter.call(this, p);
    };
  } catch (e) {}
})();
`;
}

// Warm-up SINGKAT (total ~8-20 detik, sesuai permintaan Jun: jangan terlalu lama).
// Orang beneran tidak langsung klik Sign up dalam 2 detik — mereka scroll
// homepage sebentar dulu. Ini cuma: scroll 2-3x, gerak mouse, jeda sebentar,
// lalu lanjut signup. Bukan 1 menit, bukan browsing keliling situs.
export async function warmUp(page) {
  console.log('  Warm-up singkat (scroll + jeda, ~8-20 detik)...');
  await humanScroll(page);
  await page.mouse.move(400 + Math.random() * 400, 200 + Math.random() * 300, { steps: 8 }).catch(() => {});
  await sleep(jitter(3000, 7000));
  await humanScroll(page);
  await sleep(jitter(3000, 7000));
  // Kadang hover ke link nav (Pricing / Models) kalau ada, tanpa klik.
  const nav = page.getByRole('link', { name: /Pricing|Models|Docs/i }).first();
  if (await nav.isVisible({ timeout: 2000 }).catch(() => false)) {
    await nav.hover().catch(() => {});
    await sleep(jitter(1000, 3000));
  }
}

// Argumen launch Chromium yang mengurangi jejak headless / otomasi.
export const STEALTH_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-infobars',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--disable-web-security',
  '--disable-features=WebRtcHideLocalIpsWithMdns',
];

// Ketik seperti manusia: per karakter dengan jeda acak, kadang jeda lebih lama.
// locator harus sudah terlihat sebelum dipanggil.
export async function humanType(locator, text, wpm = 90) {
  const msPerChar = Math.max(30, Math.round(60000 / (wpm * 5)));
  await locator.click({ timeout: 10000 });
  await sleep(jitter(200, 700));
  for (const ch of text) {
    await locator.pressSequentially(ch, { delay: msPerChar * jitter(0.6, 1.6) });
    // Kadang "berpikir" sebentar di tengah kata
    if (Math.random() < 0.08) await sleep(jitter(300, 900));
  }
  await sleep(jitter(300, 800));
}

// Gerakan mouse acak (kurva kasar) ke sebuah elemen, lalu klik.
export async function humanClick(page, locator) {
  const box = await locator.boundingBox({ timeout: 10000 }).catch(() => null);
  if (box) {
    const x = box.x + box.width / 2 + jitter(-5, 5);
    const y = box.y + box.height / 2 + jitter(-3, 3);
    await page.mouse.move(x + jitter(-120, 120), y + jitter(-80, 80), { steps: randInt(5, 12) });
    await sleep(jitter(150, 500));
    await page.mouse.move(x, y, { steps: randInt(3, 8) });
    await sleep(jitter(100, 400));
  }
  await locator.click({ timeout: 10000 });
  await sleep(jitter(400, 1200));
}

// Scroll acak sedikit, seperti orang membaca halaman.
export async function humanScroll(page) {
  const y = randInt(100, 500);
  await page.mouse.wheel(0, y);
  await sleep(jitter(400, 1200));
  if (Math.random() < 0.5) {
    await page.mouse.wheel(0, -Math.floor(y / 2));
    await sleep(jitter(300, 800));
  }
}
