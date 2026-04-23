/**
 * Future: scheduled job to fetch and normalize casi d’uso / casi studio from spoki.com,
 * upsert into `marketing_content_items`, dedupe by `source_url`, bump `content_hash` on change.
 * Prefer a CMS feed or internal export over HTML scraping when available.
 */
export const MARKETING_CONTENT_SOURCE_BASE = 'https://spoki.com';
