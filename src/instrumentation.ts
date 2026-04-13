export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const INTERVAL_MS = 2 * 60 * 60 * 1000;
    const SYNC_STEPS = ['companies', 'contacts', 'tickets', 'engagements', 'scores'];

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const secret = process.env.CRON_SECRET || '';

    async function runSync() {
      console.log(`[sync-cron] Starting sync at ${new Date().toLocaleString('it-IT')}`);
      for (const step of SYNC_STEPS) {
        try {
          const res = await fetch(`${baseUrl}/api/v1/hubspot/sync?secret=${secret}&type=${step}`);
          const data = await res.json() as { count?: number };
          console.log(`[sync-cron] ${step}: ${res.ok ? 'OK' : 'FAIL'} ${data.count ?? ''}`);
        } catch {
          console.log(`[sync-cron] ${step}: server not ready, skipping`);
          return;
        }
      }
      console.log(`[sync-cron] Sync completed at ${new Date().toLocaleString('it-IT')}`);
    }

    setTimeout(runSync, 15_000);
    setInterval(runSync, INTERVAL_MS);
    console.log(`[sync-cron] Scheduled: first sync in 15s, then every ${INTERVAL_MS / 3_600_000}h`);
  }
}
