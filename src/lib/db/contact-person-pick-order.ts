import { HUBSPOT_COMPANY_PROPS } from '@/lib/config/hubspot-props';

function safeHubspotPropertyKey(key: string): string | null {
  const t = key.trim();
  return /^[a-zA-Z0-9_]+$/.test(t) ? t : null;
}

/**
 * ORDER BY clause for selecting one HubSpot-synced contact per client:
 * 0) hubspot_id matches company raw_properties primary field (if configured)
 * 1) communication_roles suggests primary / point of contact
 * 2) fallback: last activity, then name
 *
 * @param rawPropertiesRef SQL expression for jsonb, e.g. `paged.raw_properties` or `c.raw_properties`
 */
export function sqlContactPersonPickOrder(rawPropertiesRef: string): string {
  const k = safeHubspotPropertyKey(HUBSPOT_COMPANY_PROPS.primaryContactHubspotId);
  const primaryIdExpr = k
    ? `NULLIF(BTRIM((${rawPropertiesRef})::jsonb->>'${k}'), '')`
    : 'NULL::text';

  return `ORDER BY
    CASE
      WHEN (${primaryIdExpr}) IS NOT NULL AND hubspot_id = (${primaryIdExpr}) THEN 0
      WHEN communication_roles IS NOT NULL AND (
        (';' || lower(communication_roles) || ';') LIKE '%;primary;%'
        OR (';' || lower(communication_roles) || ';') LIKE '%;primary contact;%'
        OR lower(communication_roles) LIKE '%point of contact%'
      ) THEN 1
      ELSE 2
    END,
    last_activity_at DESC NULLS LAST,
    last_name ASC NULLS LAST,
    first_name ASC NULLS LAST`;
}
