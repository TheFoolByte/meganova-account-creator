// fetch_proxies.mjs — ambil proxy HTTP elite segar dari Proxifly, tulis ke proxies.txt
// Sumber: https://github.com/proxifly/free-proxy-list
//   data lokal: ~/workspace/free-proxy-list/proxies/protocols/http/data.json
//   kalau file lokal tidak ada, download dari raw GitHub.
// Filter: protocol http, anonymity elite, https=false.
// Keluar: proxies.txt (ip:port, 1 per baris). Default ambil 20 pertama.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'proxies.txt');
const LOCAL = '/home/hatch/workspace/free-proxy-list/proxies/protocols/http/data.json';
const REMOTE = 'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.json';
const WANT = parseInt(process.argv[2] || '20', 10);

let data;
if (fs.existsSync(LOCAL)) {
  data = JSON.parse(fs.readFileSync(LOCAL, 'utf8'));
  console.log(`Pakai data lokal: ${LOCAL} (${data.length} proxy)`);
} else {
  console.log(`Download dari ${REMOTE} ...`);
  const res = await fetch(REMOTE);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  data = await res.json();
}
const elite = data.filter((p) => p.protocol === 'http' && p.anonymity === 'elite' && p.https === false);
console.log(`Elite HTTP: ${elite.length}`);
const picked = elite.slice(0, WANT).map((p) => `${p.ip}:${p.port}`);
fs.writeFileSync(OUT, '# Proxies dari proxifly/free-proxy-list — HTTP elite\n# Format: ip:port — 1 proxy per akun\n' + picked.join('\n') + '\n');
console.log(`Ditulis ${picked.length} proxy ke proxies.txt`);
picked.forEach((p) => console.log('  ' + p));
