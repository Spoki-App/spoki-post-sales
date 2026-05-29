'use client';

import type { NarPathKey } from '@/types/nar';
import { cn } from '@/lib/utils/cn';
import styles from './nar.module.css';

const PATH_LABELS: Record<NarPathKey, { label: string; accent: string }> = {
  neverStarted: { label: 'Inattivi nel Periodo', accent: styles.pathNever },
  fastDrop:     { label: 'Drop Rapido', accent: styles.pathFastDrop },
  slowDecline:  { label: 'Declino Graduale', accent: styles.pathDecline },
  intermittent: { label: 'Intermittenti', accent: styles.pathIntermittent },
  steady:       { label: 'Uso Costante', accent: styles.pathSteady },
  growing:      { label: 'In Crescita', accent: styles.pathGrowing },
};

interface Props {
  pathKey: NarPathKey;
  count: number;
  pct: number;
  selected?: boolean;
  onClick?: () => void;
}

export function NarPathCard({ pathKey, count, pct, selected, onClick }: Props) {
  const meta = PATH_LABELS[pathKey];
  return (
    <div
      onClick={onClick}
      className={cn(styles.pathCard, meta.accent, onClick && count > 0 && styles.pathCardClickable, selected && styles.pathCardSelected)}
    >
      <div className={styles.pathCount}>{count.toLocaleString('it-IT')}</div>
      <div className={styles.pathLabel}>{meta.label}</div>
      <div className={styles.pathPct}>{pct.toFixed(0)}%</div>
    </div>
  );
}
