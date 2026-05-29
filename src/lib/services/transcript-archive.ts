import { gzipSync, gunzipSync } from 'zlib';
import { pgQuery } from '@/lib/db/postgres';
import { getSupabaseAdmin, getTranscriptsBucket, isSupabaseConfigured } from '@/lib/supabase/client';
import { getLogger } from '@/lib/logger';
import type { FathomMeeting } from '@/lib/services/fathom';
import type { CallType } from '@/lib/services/meeting-analysis';

const logger = getLogger('services:transcript-archive');

export type TranscriptPayload = NonNullable<FathomMeeting['transcript']>;

export interface ArchiveInput {
  hubspotId: string;
  type: CallType | null;
  recordingId: number | string | null;
  title: string | null;
  shareUrl: string | null;
  occurredAt: string | null;
  transcript: TranscriptPayload;
  durationSeconds?: number | null;
  participantsCount?: number | null;
}

export interface StoredTranscriptMeta {
  storageBucket: string;
  storagePath: string;
  bytes: number;
  fathomRecordingId: string | null;
}

function buildPath(type: CallType | null, occurredAt: string | null, hubspotId: string): string {
  const ref = occurredAt ? new Date(occurredAt) : new Date();
  const year = ref.getUTCFullYear();
  const month = String(ref.getUTCMonth() + 1).padStart(2, '0');
  const folder = type ?? 'unknown';
  return `${folder}/${year}/${month}/${hubspotId}.json.gz`;
}

export async function hasArchivedTranscript(hubspotId: string): Promise<boolean> {
  const r = await pgQuery<{ exists: boolean }>(
    `SELECT 1 AS exists FROM call_transcripts WHERE engagement_hubspot_id = $1 LIMIT 1`,
    [hubspotId],
  );
  return r.rows.length > 0;
}

export async function loadArchivedTranscript(hubspotId: string): Promise<TranscriptPayload | null> {
  if (!isSupabaseConfigured()) return null;

  const meta = await pgQuery<{ storage_bucket: string; storage_path: string }>(
    `SELECT storage_bucket, storage_path FROM call_transcripts WHERE engagement_hubspot_id = $1`,
    [hubspotId],
  );
  if (meta.rows.length === 0) return null;

  const { storage_bucket, storage_path } = meta.rows[0];
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.storage.from(storage_bucket).download(storage_path);
  if (error || !data) {
    logger.warn('Download archived transcript failed', { hubspotId, error: error?.message });
    return null;
  }

  try {
    const buf = Buffer.from(await data.arrayBuffer());
    const json = gunzipSync(buf).toString('utf8');
    return JSON.parse(json) as TranscriptPayload;
  } catch (e) {
    logger.warn('Decode archived transcript failed', { hubspotId, error: e });
    return null;
  }
}

export async function archiveTranscript(input: ArchiveInput): Promise<StoredTranscriptMeta | null> {
  if (!isSupabaseConfigured()) {
    logger.debug('Supabase not configured, skipping archive', { hubspotId: input.hubspotId });
    return null;
  }
  if (!input.transcript || input.transcript.length === 0) return null;

  const bucket = getTranscriptsBucket();
  const path = buildPath(input.type, input.occurredAt, input.hubspotId);
  const json = JSON.stringify(input.transcript);
  const gz = gzipSync(Buffer.from(json, 'utf8'));

  const sb = getSupabaseAdmin();
  const { error: upErr } = await sb.storage
    .from(bucket)
    .upload(path, gz, { contentType: 'application/gzip', upsert: true });

  if (upErr) {
    logger.error('Upload transcript failed', { hubspotId: input.hubspotId, error: upErr.message });
    return null;
  }

  await pgQuery(
    `INSERT INTO call_transcripts (
       engagement_hubspot_id, fathom_recording_id, call_type,
       storage_bucket, storage_path, bytes,
       duration_seconds, participants_count, title, share_url, source
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'fathom')
     ON CONFLICT (engagement_hubspot_id) DO UPDATE SET
       fathom_recording_id = EXCLUDED.fathom_recording_id,
       call_type           = EXCLUDED.call_type,
       storage_bucket      = EXCLUDED.storage_bucket,
       storage_path        = EXCLUDED.storage_path,
       bytes               = EXCLUDED.bytes,
       duration_seconds    = EXCLUDED.duration_seconds,
       participants_count  = EXCLUDED.participants_count,
       title               = EXCLUDED.title,
       share_url           = EXCLUDED.share_url`,
    [
      input.hubspotId,
      input.recordingId !== null ? String(input.recordingId) : null,
      input.type,
      bucket,
      path,
      gz.byteLength,
      input.durationSeconds ?? null,
      input.participantsCount ?? null,
      input.title,
      input.shareUrl,
    ],
  );

  return { storageBucket: bucket, storagePath: path, bytes: gz.byteLength, fathomRecordingId: input.recordingId !== null ? String(input.recordingId) : null };
}
