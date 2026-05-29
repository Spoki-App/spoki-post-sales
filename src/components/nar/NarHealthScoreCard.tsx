'use client';

import type { NarInsights } from '@/types/nar';
import styles from './nar.module.css';

interface Props {
  insights: NarInsights;
}

export function NarHealthScoreCard({ insights }: Props) {
  const metrics = [
    { label: 'NAR Diretto (no ES)', value: `${insights.mainNar.toFixed(1)}%`,
      color: insights.mainNar > 25 ? '#10b981' : insights.mainNar > 15 ? '#f59e0b' : '#ef4444' },
    { label: 'Churn Rate', value: `${insights.churnRate.toFixed(1)}%`,
      color: insights.churnRate < 25 ? '#10b981' : insights.churnRate < 40 ? '#f59e0b' : '#ef4444' },
    { label: 'Inattivi', value: `${insights.neverUsedPct.toFixed(1)}%`,
      color: insights.neverUsedPct < 15 ? '#10b981' : insights.neverUsedPct < 30 ? '#f59e0b' : '#ef4444' },
    { label: 'Ancora Attivi', value: `${insights.stillActivePct.toFixed(1)}%`,
      color: insights.stillActivePct > 40 ? '#10b981' : insights.stillActivePct > 20 ? '#f59e0b' : '#ef4444' },
  ];

  return (
    <div className={styles.healthCard} style={{ borderColor: insights.healthColor }}>
      <div className={styles.healthScore} style={{ background: insights.healthColor }}>
        <span className={styles.healthNumber}>{insights.healthScore}</span>
        <span className={styles.healthLabel}>{insights.healthLabel}</span>
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-slate-900">Health Score Piattaforma</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {metrics.map(m => (
            <div key={m.label} className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">{m.label}</div>
              <div className="text-lg font-semibold tabular-nums" style={{ color: m.color }}>
                {m.value}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.healthBar}>
          <div
            className={styles.healthBarFill}
            style={{ width: `${insights.healthScore}%`, background: insights.healthColor }}
          />
        </div>
      </div>
    </div>
  );
}
