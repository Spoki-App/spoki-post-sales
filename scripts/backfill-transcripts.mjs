// Backfills the call_transcripts archive on Supabase Storage by re-fetching transcripts from
// Fathom for engagements that already have an analysis but no archived transcript.
//
// Usage: node --env-file=.env.local scripts/backfill-transcripts.mjs [--type=activation|training] [--days=180] [--limit=20]
//
// Idempotent: skips engagements whose transcript is already archived.

import pg from 'pg';
import { gzipSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const TYPE = args.type ?? null; // 'activation' | 'training' | null (= both)
const DAYS = parseInt(args.days ?? '180', 10);
const LIMIT = parseInt(args.limit ?? '50', 10);
const DRY_RUN = Boolean(args['dry-run']);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_TRANSCRIPTS_BUCKET || 'call-transcripts';
const FATHOM_API_KEY = process.env.FATHOM_API_KEY;
const FATHOM_API_BASE_URL = (process.env.FATHOM_API_BASE_URL || 'https://api.fathom.ai').replace(/\/$/, '');

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set'); process.exit(1); }
if (!FATHOM_API_KEY) { console.error('FATHOM_API_KEY not set'); process.exit(1); }

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function fathomListMeetings({ createdAfter, recordedBy } = {}) {
  const all = [];
  let cursor;
  let page = 0;
  while (page < 40) {
    page++;
    const url = new URL(`${FATHOM_API_BASE_URL}/external/v1/meetings`);
    url.searchParams.set('include_transcript', 'true');
    if (createdAfter) url.searchParams.set('created_after', createdAfter);
    if (cursor) url.searchParams.set('cursor', cursor);
    if (recordedBy) for (const e of recordedBy) url.searchParams.append('recorded_by_email', e);

    const res = await fetch(url.toString(), {
      headers: { 'X-Api-Key': FATHOM_API_KEY, accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Fathom ${res.status}: ${await res.text()}`);
    const json = await res.json();
    all.push(...(json.items ?? []));
    cursor = json.next_cursor;
    if (!cursor) break;
  }
  return all;
}

function buildPath(type, occurredAt, hubspotId) {
  const ref = occurredAt ? new Date(occurredAt) : new Date();
  const year = ref.getUTCFullYear();
  const month = String(ref.getUTCMonth() + 1).padStart(2, '0');
  return `${type ?? 'unknown'}/${year}/${month}/${hubspotId}.json.gz`;
}

await db.connect();

const conditions = [
  `a.engagement_hubspot_id NOT IN (SELECT engagement_hubspot_id FROM call_transcripts)`,
  `a.occurred_at >= NOW() - ($1::int || ' days')::interval`,
];
const params = [DAYS];
if (TYPE) {
  conditions.push(`a.call_type = $${params.length + 1}`);
  params.push(TYPE);
}

const { rows: targets } = await db.query(
  `SELECT a.engagement_hubspot_id, a.call_type, a.owner_id, a.occurred_at, a.fathom_share_url,
          e.raw_properties::jsonb->>'hs_meeting_title' AS meeting_title
   FROM call_analyses a
   JOIN engagements e ON e.hubspot_id = a.engagement_hubspot_id
   WHERE ${conditions.join(' AND ')}
   ORDER BY a.occurred_at DESC
   LIMIT ${LIMIT}`,
  params,
);

console.log(`Backfill targets: ${targets.length} (type=${TYPE ?? 'all'}, days=${DAYS}, limit=${LIMIT})${DRY_RUN ? ' [DRY-RUN]' : ''}`);

if (targets.length === 0) { await db.end(); process.exit(0); }

const earliest = targets.reduce((min, t) => Math.min(min, new Date(t.occurred_at).getTime()), Infinity);
const searchAfter = new Date(earliest - 2 * 24 * 60 * 60 * 1000).toISOString();

console.log(`Fetching Fathom meetings since ${searchAfter} ...`);
const meetings = await fathomListMeetings({ createdAfter: searchAfter });
console.log(`  -> got ${meetings.length} Fathom meetings`);

let archived = 0;
let missed = 0;

for (const t of targets) {
  const match = t.fathom_share_url
    ? meetings.find(m => m.share_url === t.fathom_share_url)
    : meetings.find(m => (m.meeting_title || m.title) === t.meeting_title
        && new Date(m.created_at).toDateString() === new Date(t.occurred_at).toDateString());

  if (!match || !match.transcript || match.transcript.length === 0) {
    console.log(`  - SKIP ${t.engagement_hubspot_id} (${t.meeting_title}): no Fathom match`);
    missed++;
    continue;
  }

  const path = buildPath(t.call_type, t.occurred_at, t.engagement_hubspot_id);
  const gz = gzipSync(Buffer.from(JSON.stringify(match.transcript), 'utf8'));

  if (DRY_RUN) {
    console.log(`  - DRY ${t.engagement_hubspot_id}: would upload ${gz.byteLength}B to ${path}`);
    continue;
  }

  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, gz, {
    contentType: 'application/gzip', upsert: true,
  });
  if (upErr) { console.error(`  - UPLOAD ERROR ${t.engagement_hubspot_id}:`, upErr.message); continue; }

  await db.query(
    `INSERT INTO call_transcripts (
       engagement_hubspot_id, fathom_recording_id, call_type,
       storage_bucket, storage_path, bytes,
       title, share_url, source
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'fathom')
     ON CONFLICT (engagement_hubspot_id) DO UPDATE SET
       fathom_recording_id = EXCLUDED.fathom_recording_id,
       call_type = EXCLUDED.call_type,
       storage_bucket = EXCLUDED.storage_bucket,
       storage_path = EXCLUDED.storage_path,
       bytes = EXCLUDED.bytes,
       title = EXCLUDED.title,
       share_url = EXCLUDED.share_url`,
    [
      t.engagement_hubspot_id,
      String(match.recording_id),
      t.call_type,
      BUCKET,
      path,
      gz.byteLength,
      t.meeting_title,
      match.share_url || match.url || null,
    ],
  );

  console.log(`  - OK ${t.engagement_hubspot_id} -> ${path} (${gz.byteLength}B)`);
  archived++;
}

console.log(`\nDone. archived=${archived}, missed=${missed}, total=${targets.length}`);
await db.end();
