'use client';

import { CallReportsPage } from '@/components/reports/CallReportsTable';
import { ACTIVATION_CHECKPOINT_LABELS } from '@/lib/services/prompt-defaults';

export default function TeamReportsPage() {
  return (
    <CallReportsPage
      type="activation"
      title="Attivazioni - Report"
      subtitle="Analisi chiamate di attivazione dal team"
      checkpointLabels={ACTIVATION_CHECKPOINT_LABELS}
      emptyMessage="Nessuna chiamata di attivazione trovata."
    />
  );
}
