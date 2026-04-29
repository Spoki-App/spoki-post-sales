export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.DISABLE_SYNC_CRON === '1') {
      console.log('[sync-cron] Disabled via DISABLE_SYNC_CRON=1');
      return;
    }

    // Avoid that uncaught errors from async HubSpot/DB tasks crash the dev server.
    if (process.env.NODE_ENV !== 'production') {
      process.on('uncaughtException', (err) => {
        console.error('[sync-cron] uncaughtException swallowed in dev:', err);
      });
      process.on('unhandledRejection', (reason) => {
        console.error('[sync-cron] unhandledRejection swallowed in dev:', reason);
      });
    }

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

    if (process.env.NAR_REFRESH_DEV_CRON === '1') {
      const NAR_INTERVAL_MS = 6 * 60 * 60 * 1000;
      async function runNarRefresh() {
        try {
          const res = await fetch(`${baseUrl}/api/v1/nar/dataset/refresh?secret=${secret}`, { method: 'POST' });
          const data = await res.json() as { data?: { rowCount?: number; accountCount?: number } };
          console.log(
            `[nar-refresh] ${res.ok ? 'OK' : 'FAIL'} rows=${data.data?.rowCount ?? 0} accounts=${data.data?.accountCount ?? 0}`
          );
        } catch {
          console.log('[nar-refresh] server not ready, skipping');
        }
      }
      setTimeout(runNarRefresh, 30_000);
      setInterval(runNarRefresh, NAR_INTERVAL_MS);
      console.log(`[nar-refresh] Dev cron enabled: first run in 30s, then every ${NAR_INTERVAL_MS / 3_600_000}h`);
    }
  }
}
