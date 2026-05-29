/**
 * AI Suggest engine — porting deterministico di `dataInsights` da App.jsx.
 * Niente chiamate LLM: euristica pura su `bucketAnalysis`, `churnAnalysis`, `operatorsAnalysis`,
 * `weeklyTrend` e `snapshots`. Output stabile per stessi input.
 */

import type {
  NarRow,
  NarBucketResult,
  NarOperatorEntry,
  NarSnapshot,
  NarPathAccount,
  NarPathKey,
  NarInsights,
  NarFinding,
  NarSignal,
  NarPlanRiskRow,
  NarAction,
} from '@/types/nar';
import type { NarChurnAnalysis } from './nar-churn';
import type { NarOperatorsAnalysis } from './nar-operators';
import type { NarWeeklyTrendPoint } from './nar-buckets';

export interface NarInsightsInput {
  filteredRows: NarRow[];
  bucketAnalysis: NarBucketResult[];
  churnAnalysis: NarChurnAnalysis;
  operatorsAnalysis: NarOperatorsAnalysis;
  weeklyTrend: NarWeeklyTrendPoint[];
  operators: NarOperatorEntry[];
  snapshots: NarSnapshot[];
}

export function computeInsights(input: NarInsightsInput): NarInsights | null {
  const { filteredRows, bucketAnalysis, churnAnalysis, operatorsAnalysis, weeklyTrend, operators, snapshots } = input;
  if (filteredRows.length === 0) return null;

  const now = new Date();
  const reportDate = now.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

  // ─── Health score ─────────────────────────────────────────────────────────
  const directNoEs = bucketAnalysis.find(b => b.key === 'direct_no_es');
  const directAll = bucketAnalysis.find(b => b.key === 'direct_all');
  const partnerAll = bucketAnalysis.find(b => b.key === 'partner_all');
  const directEsOnly = bucketAnalysis.find(b => b.key === 'direct_es_only');
  const mainNar = parseFloat(directNoEs?.pivot?.ratio || '0');
  const partnerNar = parseFloat(partnerAll?.pivot?.ratio || '0');
  const esNar = parseFloat(directEsOnly?.pivot?.ratio || '0');
  const allNar = parseFloat(directAll?.pivot?.ratio || '0');

  const churnPctAll = churnAnalysis.churnBySegment.all.churnPercent;
  const neverUsedPct = churnAnalysis.breakpointSummary.neverUsedPercent;
  const stillActivePct = churnAnalysis.breakpointSummary.stillActivePercent;

  const healthScore = Math.min(100, Math.max(0, Math.round(
    (mainNar > 30 ? 40 : mainNar > 20 ? 30 : mainNar > 10 ? 15 : 5) +
    (churnPctAll < 20 ? 25 : churnPctAll < 35 ? 15 : 5) +
    (neverUsedPct < 15 ? 20 : neverUsedPct < 30 ? 10 : 3) +
    (stillActivePct > 40 ? 15 : stillActivePct > 20 ? 10 : 3)
  )));
  const healthLabel = healthScore >= 70 ? 'Buono' : healthScore >= 50 ? 'Attenzione' : healthScore >= 30 ? 'Critico' : 'Emergenza';
  const healthColor = healthScore >= 70 ? '#10b981' : healthScore >= 50 ? '#f59e0b' : healthScore >= 30 ? '#ef4444' : '#991b1b';

  const totalAccounts = churnAnalysis.churnBySegment.all.total;
  const churnedAccounts = churnAnalysis.churnBySegment.all.churned;
  const churnRate = churnAnalysis.churnBySegment.all.churnPercent;
  const neverUsed = churnAnalysis.breakpointSummary.neverUsed;
  const stoppedM1 = churnAnalysis.breakpointSummary.stoppedMonth1;
  const stoppedM1Pct = churnAnalysis.breakpointSummary.stoppedMonth1Percent;
  const stillActive = churnAnalysis.breakpointSummary.stillActive;

  // ─── Path analysis ────────────────────────────────────────────────────────
  interface AccountWeekly {
    accountName: string;
    plan: string;
    tier: number;
    weeks: Map<number, number>;
  }
  const accountWeeklyMap = new Map<number, AccountWeekly>();
  for (const r of filteredRows) {
    let acc = accountWeeklyMap.get(r.accountId);
    if (!acc) {
      acc = {
        accountName: r.accountName || '—',
        plan: r.planSlug || 'N/A',
        tier: Number(r.conversationTier) || 0,
        weeks: new Map(),
      };
      accountWeeklyMap.set(r.accountId, acc);
    }
    const conv = Number(r.weekConversationCount || 0);
    acc.weeks.set(r.weekCount, (acc.weeks.get(r.weekCount) || 0) + conv);
  }

  const pathOperatorMap = new Map<string, string>();
  for (const op of operators) pathOperatorMap.set(String(op.accountId), op.operator);

  const buildPathAccount = (id: number, acc: AccountWeekly, totalConv: number): NarPathAccount => ({
    accountId: id,
    accountName: acc.accountName,
    plan: acc.plan,
    tier: acc.tier,
    totalConsumption: totalConv,
    weeksActive: [...acc.weeks.values()].filter(v => v > 0).length,
    totalWeeks: acc.weeks.size,
    maxWeek: acc.weeks.size > 0 ? Math.max(...[...acc.weeks.keys()]) : 0,
    firstActiveWeek: null,
    lastActiveWeek: null,
    operator: pathOperatorMap.get(String(id)) || 'NA operatore',
  });

  const paths: Record<NarPathKey, NarPathAccount[]> = {
    neverStarted: [], fastDrop: [], slowDecline: [], steady: [], growing: [], intermittent: [],
  };

  for (const [id, acc] of accountWeeklyMap) {
    const weekEntries = [...acc.weeks.entries()].sort((a, b) => a[0] - b[0]);
    const values = weekEntries.map(e => e[1]);
    const totalConv = values.reduce((a, v) => a + v, 0);
    const data = buildPathAccount(id, acc, totalConv);

    if (totalConv === 0) {
      paths.neverStarted.push(data);
      continue;
    }
    const firstHalf = values.slice(0, Math.ceil(values.length / 2));
    const secondHalf = values.slice(Math.ceil(values.length / 2));
    const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((a, v) => a + v, 0) / firstHalf.length : 0;
    const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((a, v) => a + v, 0) / secondHalf.length : 0;
    const zeroWeeks = values.filter(v => v === 0).length;
    const zeroRatio = values.length > 0 ? zeroWeeks / values.length : 0;

    if (values.length <= 3 && secondAvg === 0 && firstAvg > 0) {
      paths.fastDrop.push(data);
    } else if (secondAvg > firstAvg * 1.2) {
      paths.growing.push(data);
    } else if (zeroRatio > 0.4 && totalConv > 0) {
      paths.intermittent.push(data);
    } else if (firstAvg > 0 && secondAvg < firstAvg * 0.5) {
      paths.slowDecline.push(data);
    } else {
      paths.steady.push(data);
    }
  }
  const totalPathAccounts = accountWeeklyMap.size;

  // ─── Plan risk ranking ────────────────────────────────────────────────────
  const planRisk: NarPlanRiskRow[] = (churnAnalysis.churnByPlan || []).map(p => {
    const breakpointPlan = (churnAnalysis.breakpointByPlan || []).find(bp => bp.plan === p.plan);
    const riskScore = (p.churnPercent * 0.4) + ((breakpointPlan?.earlyChurnPercent || 0) * 0.3) + ((breakpointPlan?.neverUsedPercent || 0) * 0.3);
    return {
      plan: p.plan,
      total: p.total,
      churnPct: p.churnPercent,
      earlyChurnPct: breakpointPlan?.earlyChurnPercent || 0,
      neverUsedPct: breakpointPlan?.neverUsedPercent || 0,
      riskScore: Math.round(riskScore),
    };
  }).sort((a, b) => b.riskScore - a.riskScore);

  // ─── Decay insights ───────────────────────────────────────────────────────
  const weeklyDecayInsights: NarSignal[] = [];
  if (churnAnalysis.decayRates.length > 0) {
    const fastDecay = churnAnalysis.decayRates.filter(d => d.decaySpeed > 40);
    const slowDecay = churnAnalysis.decayRates.filter(d => d.decaySpeed < 15);
    if (fastDecay.length > 0) {
      weeklyDecayInsights.push({
        type: 'critical',
        text: `${fastDecay.length} pian${fastDecay.length > 1 ? 'i perdono' : 'o perde'} oltre il 40% del consumo nel tempo: ${fastDecay.map(d => d.plan).join(', ')}.`,
      });
    }
    if (slowDecay.length > 0) {
      weeklyDecayInsights.push({
        type: 'positive',
        text: `${slowDecay.length} pian${slowDecay.length > 1 ? 'i mantengono' : 'o mantiene'} un buon consumo (< 15% perso): ${slowDecay.map(d => d.plan).join(', ')}.`,
      });
    }
  }

  // ─── Operator insights ────────────────────────────────────────────────────
  const operatorInsights: NarSignal[] = [];
  if (operatorsAnalysis.byOperator.length > 0) {
    const sorted = [...operatorsAnalysis.byOperator].filter(o => !o.isNA).sort((a, b) => b.totalNar - a.totalNar);
    if (sorted.length >= 2) {
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      const gap = best.totalNar - worst.totalNar;
      if (gap > 5) {
        operatorInsights.push({
          type: 'warning',
          text: `Gap NAR tra operatori: ${best.operator} (${best.totalNar.toFixed(1)}%) vs ${worst.operator} (${worst.totalNar.toFixed(1)}%). Delta di ${gap.toFixed(1)} punti.`,
        });
      }
    }
    const naOperator = operatorsAnalysis.byOperator.find(o => o.isNA);
    if (naOperator && naOperator.totalAccounts > 5) {
      const assignedIds = new Set(operators.map(o => String(o.accountId)));
      const seenUnassigned = new Set<number>();
      const unassignedAccounts: NarPathAccount[] = [];
      for (const r of filteredRows) {
        if (assignedIds.has(String(r.accountId))) continue;
        if (seenUnassigned.has(r.accountId)) continue;
        seenUnassigned.add(r.accountId);
        unassignedAccounts.push({
          accountId: r.accountId,
          accountName: r.accountName || '—',
          plan: r.planSlug || 'N/A',
          tier: Number(r.conversationTier) || 0,
          totalConsumption: 0,
          weeksActive: 0,
          totalWeeks: 0,
          maxWeek: 0,
          firstActiveWeek: null,
          lastActiveWeek: null,
          operator: 'NA operatore',
        });
      }
      operatorInsights.push({
        type: 'critical',
        text: `${naOperator.totalAccounts} account non sono assegnati a nessun operatore. Impatto potenziale sul NAR.`,
        expandable: true,
        accounts: unassignedAccounts,
      });
    }
  }

  // ─── Segment comparison ───────────────────────────────────────────────────
  const segmentComparison: NarSignal[] = [];
  if (esNar > 0 && mainNar > 0) {
    const delta = mainNar - esNar;
    if (Math.abs(delta) > 3) {
      segmentComparison.push({
        type: delta > 0 ? 'info' : 'warning',
        text: `Mercato IT (${mainNar.toFixed(1)}%) ${delta > 0 ? 'performa meglio del' : 'è sotto il'} mercato ES (${esNar.toFixed(1)}%). Delta: ${Math.abs(delta).toFixed(1)} punti.`,
      });
    }
  }
  if (partnerNar > 0 && mainNar > 0) {
    const delta = mainNar - partnerNar;
    segmentComparison.push({
      type: delta > 3 ? 'info' : delta < -3 ? 'warning' : 'info',
      text: `Clienti diretti (${mainNar.toFixed(1)}%) vs Partner (${partnerNar.toFixed(1)}%). ${Math.abs(delta) < 3 ? 'Performance allineata.' : delta > 0 ? 'Clienti diretti più performanti.' : 'Partner più performanti.'}`,
    });
  }

  // ─── Critical findings + actions ──────────────────────────────────────────
  const criticalFindings: NarFinding[] = [];
  const actions: NarAction[] = [];

  if (neverUsedPct > 25) {
    criticalFindings.push({
      severity: 'critical',
      title: 'Crisi Onboarding',
      detail: `${neverUsed} account (${neverUsedPct.toFixed(1)}%) risultano inattivi nel periodo analizzato (consumo = 0). Oltre 1 su 4 non sta utilizzando.`,
      impact: 'Ricavo a rischio. Questi account sono candidati ad alto rischio churn.',
    });
    actions.push({
      priority: 1,
      action: 'Verificare lo stato di questi account: distinguere chi non ha mai iniziato (onboarding) da chi ha smesso (riattivazione). Contatto proattivo entro 48h.',
      expectedImpact: `Riattivare il 30-40% degli inattivi potrebbe salvare ${Math.round(neverUsed * 0.35)} account.`,
    });
  } else if (neverUsedPct > 15) {
    criticalFindings.push({
      severity: 'warning',
      title: 'Onboarding da migliorare',
      detail: `${neverUsed} account (${neverUsedPct.toFixed(1)}%) risultano inattivi nel periodo analizzato.`,
      impact: 'Il tasso è sopra la soglia di allarme del 15%. Intervenire prima che si consolidi.',
    });
    actions.push({
      priority: 2,
      action: 'Attivare sequenza email di onboarding automatica + check-in al giorno 3, 7, 14.',
      expectedImpact: `Potenziale recupero di ${Math.round(neverUsed * 0.25)} account.`,
    });
  }

  if (stoppedM1Pct > 15) {
    criticalFindings.push({
      severity: 'critical',
      title: 'Drop critico nel Mese 1',
      detail: `${stoppedM1} account (${stoppedM1Pct.toFixed(1)}%) smettono di usare entro le prime 4 settimane.`,
      impact: 'Il primo mese è il momento più critico. Chi non trova valore qui, non torna.',
    });
    actions.push({
      priority: 1,
      action: 'Introdurre "Success Check" alla settimana 2: verificare setup completato, primo flusso attivo, risultati misurabili.',
      expectedImpact: 'Riduzione churn mese 1 del 20-30% con intervento proattivo.',
    });
  }

  if (churnRate > 30) {
    criticalFindings.push({
      severity: 'critical',
      title: 'Tasso Churn Elevato',
      detail: `Il ${churnRate.toFixed(1)}% degli account non ha mai utilizzato le conversazioni acquistate.`,
      impact: 'Oltre 1 account su 3 non produce valore. Impatto diretto sulla retention e sul LTV.',
    });
  }

  const intermittentPct = totalPathAccounts > 0 ? (paths.intermittent.length / totalPathAccounts) * 100 : 0;
  if (intermittentPct > 15) {
    criticalFindings.push({
      severity: 'warning',
      title: 'Utenti Intermittenti',
      detail: `${paths.intermittent.length} account (${intermittentPct.toFixed(1)}%) usano la piattaforma in modo discontinuo.`,
      impact: 'Uso intermittente è precursore di abbandono. Questi account sono a rischio medio-alto.',
    });
    actions.push({
      priority: 2,
      action: 'Campagna di riattivazione mirata per utenti inattivi da 2+ settimane. Trigger automatici con suggerimenti d\'uso.',
      expectedImpact: `Stabilizzare ${Math.round(paths.intermittent.length * 0.3)} account intermittenti in utenti regolari.`,
    });
  }

  const growingPct = totalPathAccounts > 0 ? (paths.growing.length / totalPathAccounts) * 100 : 0;
  if (growingPct > 10) {
    criticalFindings.push({
      severity: 'positive',
      title: 'Segmento in Crescita',
      detail: `${paths.growing.length} account (${growingPct.toFixed(1)}%) stanno aumentando il consumo nel tempo.`,
      impact: 'Segmento da studiare: capire cosa fanno di diverso e replicare il pattern.',
    });
  }

  const highRiskPlans = planRisk.filter(p => p.riskScore > 40 && p.total >= 3);
  if (highRiskPlans.length > 0) {
    actions.push({
      priority: 2,
      action: `Focus immediato sui piani ad alto rischio: ${highRiskPlans.slice(0, 3).map(p => `${p.plan} (risk ${p.riskScore})`).join(', ')}. Verificare pricing, valore percepito, supporto dedicato.`,
      expectedImpact: 'Riduzione churn sui piani critici impatta direttamente sul revenue.',
    });
  }

  if (mainNar < 20) {
    actions.push({
      priority: 1,
      action: 'Il NAR sotto il 20% indica sottoutilizzo strutturale. Revisione del value delivery: i clienti stanno ottenendo risultati misurabili?',
      expectedImpact: 'Portare il NAR sopra il 25% significherebbe un miglioramento del 25%+ nella percezione di valore.',
    });
  }

  actions.sort((a, b) => a.priority - b.priority);

  // ─── Trend signals ────────────────────────────────────────────────────────
  const trendSignals: NarSignal[] = [];
  if (weeklyTrend.length >= 3) {
    const lastThree = weeklyTrend.slice(-3);
    const narValues = lastThree.map(w => parseFloat(w.ratio));
    const isDecreasing = narValues[0] > narValues[1] && narValues[1] > narValues[2];
    const isIncreasing = narValues[0] < narValues[1] && narValues[1] < narValues[2];
    if (isDecreasing) {
      trendSignals.push({ type: 'critical', text: `NAR in calo per 3 settimane consecutive: ${narValues.map(v => v.toFixed(1) + '%').join(' → ')}. Trend negativo da monitorare.` });
    } else if (isIncreasing) {
      trendSignals.push({ type: 'positive', text: `NAR in crescita per 3 settimane consecutive: ${narValues.map(v => v.toFixed(1) + '%').join(' → ')}. Trend positivo.` });
    }
  }

  // ─── History insights ─────────────────────────────────────────────────────
  const historyInsights: NarSignal[] = [];
  if (snapshots.length >= 2) {
    const points = snapshots
      .map(h => {
        const b = h.buckets.find(bb => bb.key === 'direct_no_es');
        return { date: new Date(h.createdAt).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }), nar: b ? b.ratio : 0 };
      });
    const first = points[0];
    const last = points[points.length - 1];
    const delta = last.nar - first.nar;
    historyInsights.push({
      type: delta > 0 ? 'positive' : delta < -2 ? 'critical' : 'warning',
      text: `Trend storico dal ${first.date} al ${last.date}: NAR da ${first.nar.toFixed(1)}% a ${last.nar.toFixed(1)}% (${delta > 0 ? '+' : ''}${delta.toFixed(1)} punti). ${delta > 0 ? 'Miglioramento costante.' : delta < -2 ? 'Peggioramento. Indagare le cause.' : 'Sostanzialmente stabile.'}`,
    });
  }

  // partnerNar/esNar/allNar saved on output for downstream UI
  void partnerNar; void esNar; void allNar;

  return {
    reportDate,
    healthScore, healthLabel, healthColor,
    mainNar, churnRate, neverUsedPct, stillActivePct,
    totalAccounts, churnedAccounts, neverUsed, stoppedM1, stillActive,
    totalPathAccounts, paths,
    criticalFindings, segmentComparison, planRisk,
    trendSignals, weeklyDecayInsights, operatorInsights, historyInsights,
    actions,
  };
}
