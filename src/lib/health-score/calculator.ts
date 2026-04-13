/**
 * Health score calculator.
 * Scores each client 0–100 based on four dimensions (25 pts each).
 * Persists scores to health_scores and triggers alert evaluation.
 */

import { pgQuery } from '@/lib/db/postgres';
import { getLogger } from '@/lib/logger';

const logger = getLogger('health-score:calculator');

export interface ClientHealthInput {
  clientId: string;
  daysSinceLastContact: number | null;
  openTickets: number;
  openHighTickets: number;
  onboardingPct: number;
  daysToRenewal: number | null;
  mrr: number | null;
}

export interface HealthScoreResult {
  clientId: string;
  score: number;
  status: 'green' | 'yellow' | 'red';
  scoreLastContact: number;
  scoreTickets: number;
  scoreOnboarding: number;
  scoreRenewal: number;
  daysSinceLastContact: number | null;
  openTicketsCount: number;
  openHighTicketsCount: number;
  onboardingPct: number;
  daysToRenewal: number | null;
}

// ─── Scoring functions ────────────────────────────────────────────────────────

function scoreLastContact(days: number | null): number {
  if (days === null) return 0;
  if (days <= 7) return 25;
  if (days >= 90) return 0;
  // Linear decay between 7 and 90 days
  return Math.round(25 * (1 - (days - 7) / (90 - 7)));
}

function scoreTickets(openTickets: number, openHighTickets: number): number {
  const penalty = openHighTickets * 10 + (openTickets - openHighTickets) * 5;
  return Math.max(0, 25 - penalty);
}

function scoreOnboarding(pct: number): number {
  return Math.round((pct / 100) * 25);
}

function scoreRenewal(daysToRenewal: number | null, daysSinceLastContact: number | null): number {
  if (daysToRenewal === null) return 25;
  if (daysToRenewal < 0) return 25; // already renewed
  // If renewal in <= 30 days and no recent contact (> 14 days), penalize
  if (daysToRenewal <= 30 && (daysSinceLastContact === null || daysSinceLastContact > 14)) {
    return 5;
  }
  if (daysToRenewal <= 30) return 15;
  return 25;
}

export function computeScore(input: ClientHealthInput): HealthScoreResult {
  const sc = scoreLastContact(input.daysSinceLastContact);
  const st = scoreTickets(input.openTickets, input.openHighTickets);
  const so = scoreOnboarding(input.onboardingPct);
  const sr = scoreRenewal(input.daysToRenewal, input.daysSinceLastContact);

  const score = sc + st + so + sr;
  const status: 'green' | 'yellow' | 'red' = score >= 70 ? 'green' : score >= 40 ? 'yellow' : 'red';

  return {
    clientId: input.clientId,
    score,
    status,
    scoreLastContact: sc,
    scoreTickets: st,
    scoreOnboarding: so,
    scoreRenewal: sr,
    daysSinceLastContact: input.daysSinceLastContact,
    openTicketsCount: input.openTickets,
    openHighTicketsCount: input.openHighTickets,
    onboardingPct: input.onboardingPct,
    daysToRenewal: input.daysToRenewal,
  };
}

// ─── Load inputs from DB ──────────────────────────────────────────────────────

async function loadClientInputs(): Promise<ClientHealthInput[]> {
  const result = await pgQuery<{
    client_id: string;
    days_since_last_contact: number | null;
    open_tickets: number;
    open_high_tickets: number;
    onboarding_pct: number | null;
    days_to_renewal: number | null;
    mrr: number | null;
  }>(`
    SELECT
      c.id AS client_id,
      EXTRACT(DAY FROM NOW() - MAX(e.occurred_at))::INT AS days_since_last_contact,
      COUNT(DISTINCT t.id) FILTER (WHERE t.status NOT IN ('closed', '4') AND t.closed_at IS NULL) AS open_tickets,
      COUNT(DISTINCT t.id) FILTER (WHERE t.priority = 'HIGH' AND t.status NOT IN ('closed', '4') AND t.closed_at IS NULL) AS open_high_tickets,
      COALESCE(op.pct_complete, 0) AS onboarding_pct,
      CASE
        WHEN c.renewal_date IS NOT NULL
        THEN EXTRACT(DAY FROM c.renewal_date - NOW())::INT
        ELSE NULL
      END AS days_to_renewal,
      c.mrr
    FROM clients c
    LEFT JOIN engagements e ON e.client_id = c.id
    LEFT JOIN tickets t ON t.client_id = c.id
    LEFT JOIN onboarding_progress op ON op.client_id = c.id
    GROUP BY c.id, c.renewal_date, c.mrr, op.pct_complete
  `);

  return result.rows.map(r => ({
    clientId: r.client_id,
    daysSinceLastContact: r.days_since_last_contact,
    openTickets: Number(r.open_tickets) || 0,
    openHighTickets: Number(r.open_high_tickets) || 0,
    onboardingPct: Number(r.onboarding_pct) || 0,
    daysToRenewal: r.days_to_renewal,
    mrr: r.mrr,
  }));
}

// ─── Persist scores ───────────────────────────────────────────────────────────

async function saveScores(scores: HealthScoreResult[]): Promise<void> {
  for (const s of scores) {
    await pgQuery(
      `INSERT INTO health_scores (
        client_id, score, status,
        score_last_contact, score_tickets, score_onboarding, score_renewal,
        days_since_last_contact, open_tickets_count, open_high_tickets_count,
        onboarding_pct, days_to_renewal, calculated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
      [
        s.clientId, s.score, s.status,
        s.scoreLastContact, s.scoreTickets, s.scoreOnboarding, s.scoreRenewal,
        s.daysSinceLastContact, s.openTicketsCount, s.openHighTicketsCount,
        s.onboardingPct, s.daysToRenewal,
      ]
    );
  }
}

// ─── Evaluate alert rules post-score ─────────────────────────────────────────

async function evaluateAlerts(scores: HealthScoreResult[]): Promise<number> {
  const rulesRes = await pgQuery<{
    id: string; type: string; threshold: number | null; severity: string;
  }>('SELECT id, type, threshold, severity FROM alert_rules WHERE enabled = true');

  const rules = rulesRes.rows;
  let alertsCreated = 0;

  for (const score of scores) {
    for (const rule of rules) {
      let shouldAlert = false;
      let message = '';
      const meta: Record<string, unknown> = {};

      if (rule.type === 'no_contact' && rule.threshold !== null) {
        if (score.daysSinceLastContact !== null && score.daysSinceLastContact >= rule.threshold) {
          shouldAlert = true;
          message = `Nessun contatto da ${score.daysSinceLastContact} giorni (soglia: ${rule.threshold})`;
          meta.days = score.daysSinceLastContact;
        }
      } else if (rule.type === 'renewal_approaching' && rule.threshold !== null) {
        if (score.daysToRenewal !== null && score.daysToRenewal >= 0 && score.daysToRenewal <= rule.threshold) {
          shouldAlert = true;
          message = `Rinnovo tra ${score.daysToRenewal} giorni`;
          meta.daysToRenewal = score.daysToRenewal;
        }
      } else if (rule.type === 'high_ticket_opened') {
        if (score.openHighTicketsCount > 0) {
          shouldAlert = true;
          message = `${score.openHighTicketsCount} ticket ad alta priorità aperti`;
          meta.count = score.openHighTicketsCount;
        }
      } else if (rule.type === 'health_score_drop' && rule.threshold !== null) {
        if (score.score < rule.threshold) {
          shouldAlert = true;
          message = `Health score critico: ${score.score}/100`;
          meta.score = score.score;
        }
      } else if (rule.type === 'onboarding_stalled' && rule.threshold !== null) {
        // Onboarding started but not complete after threshold days
        const stalledRes = await pgQuery<{ started: boolean }>(
          `SELECT op.started_at IS NOT NULL AND op.completed_at IS NULL
             AND EXTRACT(DAY FROM NOW() - op.started_at) >= $2 AS started
           FROM onboarding_progress op
           WHERE op.client_id = $1`,
          [score.clientId, rule.threshold]
        );
        if (stalledRes.rows[0]?.started) {
          shouldAlert = true;
          message = `Onboarding avviato ma non completato da oltre ${rule.threshold} giorni`;
        }
      }

      if (!shouldAlert) continue;

      // Avoid duplicate alerts triggered today for the same rule/client
      const existing = await pgQuery<{ id: string }>(
        `SELECT id FROM alerts
         WHERE client_id = $1 AND rule_id = $2 AND resolved = false
           AND DATE(triggered_at) = CURRENT_DATE`,
        [score.clientId, rule.id]
      );
      if (existing.rows.length > 0) continue;

      await pgQuery(
        `INSERT INTO alerts (client_id, rule_id, type, severity, message, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [score.clientId, rule.id, rule.type, rule.severity, message, JSON.stringify(meta)]
      );
      alertsCreated++;
    }
  }

  return alertsCreated;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function calculateAllHealthScores(): Promise<{
  calculated: number;
  alertsCreated: number;
  durationMs: number;
}> {
  const start = Date.now();
  logger.info('Calculating health scores for all clients');

  const inputs = await loadClientInputs();
  const scores = inputs.map(computeScore);
  await saveScores(scores);

  const alertsCreated = await evaluateAlerts(scores);

  const durationMs = Date.now() - start;
  logger.info('Health score calculation complete', { calculated: scores.length, alertsCreated, durationMs });

  return { calculated: scores.length, alertsCreated, durationMs };
}
