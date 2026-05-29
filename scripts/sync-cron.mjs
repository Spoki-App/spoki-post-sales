import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const secret = envContent.match(/CRON_SECRET=(.+)/)?.[1]?.trim() || '';
const baseUrl = envContent.match(/NEXT_PUBLIC_APP_URL=(.+)/)?.[1]?.trim() || 'http://localhost:3000';

const INTERVAL_MS = 2 * 60 * 60 * 1000;
const SYNC_STEPS = ['companies', 'contacts', 'tickets', 'engagements', 'scores'];

async function runSync() {
  const now = new Date().toLocaleString('it-IT');
  console.log(`[${now}] Sync started`);

  for (const step of SYNC_STEPS) {
    try {
      const res = await fetch(`${baseUrl}/api/v1/hubspot/sync?secret=${secret}&type=${step}`);
      const data = await res.json();
      console.log(`  ${step}: ${res.ok ? 'OK' : 'FAIL'} ${data.count ?? ''}`);
    } catch (err) {
      console.error(`  ${step}: ERROR ${err.message}`);
    }
  }

  console.log(`[${new Date().toLocaleString('it-IT')}] Sync completed\n`);
}

console.log(`Sync cron started. Running every ${INTERVAL_MS / 3600000}h.`);
console.log(`Server: ${baseUrl}\n`);

runSync();
setInterval(runSync, INTERVAL_MS);
