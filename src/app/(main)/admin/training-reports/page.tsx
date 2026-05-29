'use client';

import { CallReportsPage } from '@/components/reports/CallReportsTable';
import { TRAINING_CHECKPOINT_LABELS } from '@/lib/services/prompt-defaults';

export default function TrainingReportsPage() {
  return (
    <CallReportsPage
      type="training"
      title="Training - Report"
      subtitle="Analisi chiamate di training dal team"
      checkpointLabels={TRAINING_CHECKPOINT_LABELS}
      emptyMessage="Nessuna chiamata di training trovata."
    />
  );
}
