import {
  HUBSPOT_COMPANY_PROPS,
  PORTFOLIO_CONTACT_ROLE_MATCH,
  SYNC_RAW_PRIMARY_CONTACT_HUBSPOT_ID_KEY,
} from '@/lib/config/hubspot-props';

function safeHubspotPropertyKey(key: string): string | null {
  const t = key.trim();
  return /^[a-zA-Z0-9_]+$/.test(t) ? t : null;
}

/** HubSpot contact vid from company `raw_properties`: configured company property first, then sync-injected association primary. */
function sqlPrimaryContactHubspotIdExpr(rawPropertiesRef: string): string {
  const customKey = safeHubspotPropertyKey(HUBSPOT_COMPANY_PROPS.primaryContactHubspotId);
  const syncKey = safeHubspotPropertyKey(SYNC_RAW_PRIMARY_CONTACT_HUBSPOT_ID_KEY);
  const customExpr = customKey
    ? `NULLIF(BTRIM((${rawPropertiesRef})::jsonb->>'${customKey}'), '')`
    : null;
  const syncExpr = syncKey
    ? `NULLIF(BTRIM((${rawPropertiesRef})::jsonb->>'${syncKey}'), '')`
    : null;
  if (customExpr && syncExpr) return `COALESCE(${customExpr}, ${syncExpr})`;
  if (customExpr) return customExpr;
  if (syncExpr) return syncExpr;
  return 'NULL::text';
}

/** Builds a single-quoted SQL LIKE pattern `'%a%b%c%'` from a config label; rejects unexpected characters. */
function sqlLikePatternLiteralFromRoleLabel(label: string): string | null {
  const cleaned = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(' ');
  if (tokens.length === 0 || tokens.some(t => !/^[a-z0-9]+$/.test(t))) return null;
  const inner = tokens.join('%');
  const escaped = inner.replace(/'/g, "''");
  return `'%${escaped}%'`;
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
  const primaryIdExpr = sqlPrimaryContactHubspotIdExpr(rawPropertiesRef);

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

/**
 * Portfolio list: primary company contact ID, then Spoki Connection contact role, then same tiers as {@link sqlContactPersonPickOrder}.
 */
export function sqlContactPersonPickOrderPortfolio(rawPropertiesRef: string): string {
  const primaryIdExpr = sqlPrimaryContactHubspotIdExpr(rawPropertiesRef);

  const spokiLikeLiteral = sqlLikePatternLiteralFromRoleLabel(
    PORTFOLIO_CONTACT_ROLE_MATCH.spokiConnectionContact
  );
  const genericTier = spokiLikeLiteral ? 2 : 1;
  const elseTier = spokiLikeLiteral ? 3 : 2;

  const spokiWhen = spokiLikeLiteral
    ? `WHEN communication_roles IS NOT NULL AND lower(communication_roles) LIKE ${spokiLikeLiteral} THEN 1
      `
    : '';

  return `ORDER BY
    CASE
      WHEN (${primaryIdExpr}) IS NOT NULL AND hubspot_id = (${primaryIdExpr}) THEN 0
      ${spokiWhen}WHEN communication_roles IS NOT NULL AND (
        (';' || lower(communication_roles) || ';') LIKE '%;primary;%'
        OR (';' || lower(communication_roles) || ';') LIKE '%;primary contact;%'
        OR lower(communication_roles) LIKE '%point of contact%'
      ) THEN ${genericTier}
      ELSE ${elseTier}
    END,
    last_activity_at DESC NULLS LAST,
    last_name ASC NULLS LAST,
    first_name ASC NULLS LAST`;
}
