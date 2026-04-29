'use client';

import type { NarSignal } from '@/types/nar';
import { cn } from '@/lib/utils/cn';
import styles from './nar.module.css';

const SIGNAL_CLASS: Record<NarSignal['type'], string> = {
  critical: styles.signalCritical,
  warning: styles.signalWarning,
  positive: styles.signalPositive,
  info: styles.signalInfo,
};

interface Props {
  signals: NarSignal[];
}

export function NarSignalList({ signals }: Props) {
  if (signals.length === 0) return null;
  return (
    <div>
      {signals.map((s, i) => (
        <div key={i} className={cn(styles.signal, SIGNAL_CLASS[s.type])}>
          <span className={styles.signalDot} />
          <span>{s.text}</span>
        </div>
      ))}
    </div>
  );
}
