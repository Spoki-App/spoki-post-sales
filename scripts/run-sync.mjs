import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env.local') });

const { runFullSync } = await import('../src/lib/hubspot/sync.ts');

console.log('Starting HubSpot sync...');
const syncResult = await runFullSync();
console.log('Sync result:', JSON.stringify(syncResult, null, 2));

process.exit(0);
